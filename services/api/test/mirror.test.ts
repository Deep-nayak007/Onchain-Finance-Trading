import { describe, expect, it } from "vitest";
import { Store } from "../src/store/db";
import { DurableMirror } from "../src/store/mirror";

/** In-memory stand-in for Postgres leash_rows, interpreting the three statements the mirror issues. */
function fakeSql(opts: { failTimes?: number } = {}) {
  const rows = new Map<string, { tbl: string; row: Record<string, unknown> }>();
  let fails = opts.failTimes ?? 0;
  return {
    rows,
    query: async (text: string, params: unknown[] = []) => {
      if (fails > 0) {
        fails--;
        throw new Error("neon unreachable");
      }
      if (text.startsWith("create table")) return [];
      if (text.startsWith("select tbl, row")) return [...rows.values()];
      const items = JSON.parse(String(params[0])) as { tbl: string; pk: string; row?: Record<string, unknown> }[];
      for (const it of items) {
        if (text.startsWith("insert")) rows.set(`${it.tbl}|${it.pk}`, { tbl: it.tbl, row: JSON.parse(JSON.stringify(it.row)) });
        else rows.delete(`${it.tbl}|${it.pk}`);
      }
      return [];
    },
  };
}

const ACC = "0x00000000000000000000000000000000000000aa";
const policy = { version: 1 } as never;

describe("DurableMirror", () => {
  it("mirrors writes and restores them into a fresh store (a redeploy loses nothing)", async () => {
    const sql = fakeSql();
    const a = new Store();
    const m = new DurableMirror(sql, a, () => {}, 0);
    m.attach();
    a.savePolicy("0xP", policy);
    a.upsertUser({ account: ACC, persona: "falcon", policy, policyHash: "0xP", state: "RUNNING" });
    a.recordTick(ACC, { allowed: true });
    a.saveWallet({ key: `${ACC}:falcon`, walletId: "w1", address: "0x1111111111111111111111111111111111111111", policyId: "p1" });
    a.claimDrip("0x2222222222222222222222222222222222222222");
    a.setKv(`compile:${ACC}`, { persona: "falcon", policyHash: "0xP" });
    await m.drain();

    const b = new Store();
    const n = await new DurableMirror(sql, b, () => {}, 0).restore();
    expect(n).toBe(5);
    expect(b.getUser(ACC)).toMatchObject({ state: "RUNNING", policyHash: "0xP", lastDecision: { allowed: true } });
    expect(b.usersInState("RUNNING").length).toBe(1);
    expect(b.getWallet(`${ACC}:falcon`)?.walletId).toBe("w1");
    expect(b.claimDrip("0x2222222222222222222222222222222222222222")).toBe(false); // one drip per address survives
    expect(b.getKv(`compile:${ACC}`, Number.MAX_SAFE_INTEGER)).toMatchObject({ policyHash: "0xP" });
  });

  it("propagates deletes (released drip claim)", async () => {
    const sql = fakeSql();
    const a = new Store();
    const m = new DurableMirror(sql, a, () => {}, 0);
    m.attach();
    a.claimDrip("0x3333333333333333333333333333333333333333");
    await m.drain();
    a.setDripTx("0x3333333333333333333333333333333333333333", null);
    await m.drain();
    expect(sql.rows.size).toBe(0);
  });

  it("retries failed flushes without dropping writes, and restore retries a cold database", async () => {
    const sql = fakeSql({ failTimes: 1 });
    const a = new Store();
    const m = new DurableMirror(sql, a, () => {}, 0);
    m.attach();
    a.savePolicy("0xQ", policy);
    await m.flush();
    expect(m.status.lastError).toMatch(/unreachable/);
    expect(m.status.pending).toBe(1);
    await m.drain(5000);
    expect(sql.rows.size).toBe(1);
    expect(m.status.pending).toBe(0);

    const cold = fakeSql({ failTimes: 1 });
    cold.rows.set("policies|x", { tbl: "policies", row: { policy_hash: "0xr", policy_json: "{}", created_at: 1 } });
    expect(await new DurableMirror(cold, new Store(), () => {}, 0).restore(3)).toBe(1);
  });
});
