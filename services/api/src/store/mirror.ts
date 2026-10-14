// Durable mirror of the SQLite store in Postgres (Neon free tier), so free-hosting restarts/redeploys lose nothing.
// SQLite stays the fast synchronous working copy; every write is queued here (coalesced per row), flushed in batches
// with retry, flushed again on shutdown, and restored into SQLite on boot BEFORE the scheduler starts.
import { neon } from "@neondatabase/serverless";
import { TABLE_PKS, type Store } from "./db";

type Sql = { query: (text: string, params?: unknown[]) => Promise<unknown> };
type Pending = { table: string; key: unknown[] };

export type MirrorStatus = { configured: boolean; restoredRows: number; pending: number; lastFlushAt: string | null; lastError: string | null };

const pkOf = (key: unknown[]) => JSON.stringify(key);

export class DurableMirror {
  private readonly pending = new Map<string, Pending>();
  private timer: NodeJS.Timeout | null = null;
  private flushing: Promise<void> | null = null;
  private failures = 0;
  readonly status: MirrorStatus = { configured: true, restoredRows: 0, pending: 0, lastFlushAt: null, lastError: null };

  constructor(
    private readonly sql: Sql,
    private readonly store: Store,
    private readonly log: (m: string) => void = console.log,
    private readonly debounceMs = 300,
  ) {}

  static fromUrl(url: string, store: Store, log?: (m: string) => void) {
    return new DurableMirror(neon(url) as unknown as Sql, store, log);
  }

  async ensureSchema() {
    await this.sql.query(
      "create table if not exists leash_rows (tbl text not null, pk text not null, row jsonb not null, updated_at timestamptz not null default now(), primary key (tbl, pk))",
    );
  }

  /** Boot: copy every mirrored row into SQLite. Retries (Neon computes cold-start); throws if it never succeeds. */
  async restore(attempts = 6): Promise<number> {
    for (let i = 1; ; i++) {
      try {
        await this.ensureSchema();
        const rows = (await this.sql.query("select tbl, row from leash_rows")) as { tbl: string; row: Record<string, unknown> }[];
        for (const r of rows) this.store.restoreRow(r.tbl, r.row);
        this.status.restoredRows = rows.length;
        return rows.length;
      } catch (e) {
        this.status.lastError = (e as Error).message.slice(0, 200);
        if (i >= attempts) throw e;
        await new Promise((res) => setTimeout(res, Math.min(1000 * 2 ** i, 15_000)));
      }
    }
  }

  /** Subscribe to store writes. */
  attach() {
    this.store.onWrite = (table, key) => this.capture(table, key);
  }

  capture(table: string, key: unknown[]) {
    if (!TABLE_PKS[table]) return;
    this.pending.set(`${table}|${pkOf(key)}`, { table, key });
    this.status.pending = this.pending.size;
    this.schedule(this.debounceMs);
  }

  private schedule(ms: number) {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, ms);
    this.timer.unref?.();
  }

  /** Writes all pending rows (current SQLite value; missing row → delete). Safe to call concurrently. */
  async flush(): Promise<void> {
    if (this.flushing) return this.flushing;
    if (!this.pending.size) return;
    this.flushing = (async () => {
      const batch = [...this.pending.entries()];
      this.pending.clear();
      const upserts: { tbl: string; pk: string; row: Record<string, unknown> }[] = [];
      const deletes: { tbl: string; pk: string }[] = [];
      for (const [, p] of batch) {
        const row = this.store.rowOf(p.table, p.key);
        if (row) upserts.push({ tbl: p.table, pk: pkOf(p.key), row });
        else deletes.push({ tbl: p.table, pk: pkOf(p.key) });
      }
      try {
        if (upserts.length)
          await this.sql.query(
            `insert into leash_rows (tbl, pk, row, updated_at)
             select x.tbl, x.pk, x.row, now() from jsonb_to_recordset($1::jsonb) as x(tbl text, pk text, row jsonb)
             on conflict (tbl, pk) do update set row = excluded.row, updated_at = now()`,
            [JSON.stringify(upserts)],
          );
        if (deletes.length)
          await this.sql.query(
            "delete from leash_rows where (tbl, pk) in (select x.tbl, x.pk from jsonb_to_recordset($1::jsonb) as x(tbl text, pk text))",
            [JSON.stringify(deletes)],
          );
        this.failures = 0;
        this.status.lastFlushAt = new Date().toISOString();
        this.status.lastError = null;
      } catch (e) {
        // Put them back (newer captures win) and retry with backoff; nothing is dropped.
        for (const [k, p] of batch) if (!this.pending.has(k)) this.pending.set(k, p);
        this.failures++;
        this.status.lastError = (e as Error).message.slice(0, 200);
        this.log(`[mirror] flush failed (${this.failures}): ${this.status.lastError}`);
        this.schedule(Math.min(1000 * 2 ** this.failures, 30_000));
      } finally {
        this.status.pending = this.pending.size;
        this.flushing = null;
      }
    })();
    return this.flushing;
  }

  /** Shutdown: flush until empty or the deadline passes. */
  async drain(deadlineMs = 8000) {
    const end = Date.now() + deadlineMs;
    while (this.pending.size && Date.now() < end) {
      await this.flush();
      if (this.pending.size) await new Promise((r) => setTimeout(r, 250));
    }
  }
}
