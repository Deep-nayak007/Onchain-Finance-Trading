// Single-flight loops: one per active user (TICK_SECONDS ± jitter), one per shadow persona (SHADOW_TICK_SECONDS).
// Loop state is recoverable after restart: RUNNING users are reloaded from SQLite (history from Envio).
import type { PersonaId } from "@leash/shared";
import type { Address } from "viem";
import type { Store } from "../store/db";
import type { Engine, TickResult } from "./engine";

type Timer = ReturnType<typeof setTimeout>;

export class Scheduler {
  private readonly timers = new Map<string, Timer>();
  private readonly inFlight = new Set<string>();
  private stopped = false;

  constructor(
    private readonly engine: Engine,
    private readonly store: Store,
    private readonly opts: { tickSeconds: number; shadowTickSeconds: number; shadowPersonas: PersonaId[]; log?: (m: string) => void },
  ) {}

  private log(m: string) {
    (this.opts.log ?? console.log)(m);
  }

  start() {
    this.stopped = false;
    for (const u of this.store.usersInState("RUNNING")) this.startUser(u.account as Address);
    for (const p of this.opts.shadowPersonas) this.loop(`shadow:${p}`, this.opts.shadowTickSeconds, () => this.engine.tickShadow(p));
  }

  stop() {
    this.stopped = true;
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
  }

  startUser(account: Address) {
    this.loop(`user:${account.toLowerCase()}`, this.opts.tickSeconds, async () => {
      const r = await this.engine.tickUser(account);
      if (r.kind === "stopped") this.stopUser(account);
      return r;
    });
  }

  stopUser(account: Address) {
    const key = `user:${account.toLowerCase()}`;
    const t = this.timers.get(key);
    if (t) clearTimeout(t);
    this.timers.delete(key);
  }

  isRunning(account: string) {
    return this.timers.has(`user:${account.toLowerCase()}`);
  }

  private loop(key: string, seconds: number, fn: () => Promise<TickResult>) {
    if (this.timers.has(key) || this.stopped) return;
    const schedule = (first: boolean) => {
      const jitter = 0.8 + Math.random() * 0.4;
      const delay = first ? Math.random() * 3000 : seconds * 1000 * jitter;
      this.timers.set(
        key,
        setTimeout(async () => {
          if (!this.timers.has(key)) return;
          if (!this.inFlight.has(key)) {
            this.inFlight.add(key);
            try {
              const r = await fn();
              if (r.kind === "decided") this.log(`[${key}] ${r.status} ${r.detail.intent.action} ${r.detail.intent.market} $${r.detail.intent.sizeUsd} (${r.detail.decision.reasons.join(",")}) ${r.detail.reasonHash}`);
              else this.log(`[${key}] ${r.kind}${"reason" in r ? `: ${r.reason}` : ""}`);
            } catch (e) {
              this.log(`[${key}] tick error: ${(e as Error).message}`);
            } finally {
              this.inFlight.delete(key);
            }
          }
          if (this.timers.has(key) && !this.stopped) schedule(false);
        }, delay),
      );
    };
    schedule(true);
  }
}
