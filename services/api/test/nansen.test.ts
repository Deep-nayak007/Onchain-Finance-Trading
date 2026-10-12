import { describe, expect, it } from "vitest";
import { Nansen, smartMoneyScore } from "../src/signals/nansen";
import { Store } from "../src/store/db";

const reply = (rows: unknown[]) => (async () => new Response(JSON.stringify({ data: rows }), { status: 200 })) as unknown as typeof fetch;
const row = (sym: string, f24: number) => ({ token_address: "0x0", token_symbol: sym, net_flow_1h_usd: 0, net_flow_24h_usd: f24, net_flow_7d_usd: 0, chain: "monad", trader_count: 3 });

describe("Nansen signal", () => {
  it("aggregates MON/WMON rows into a bounded score", async () => {
    const n = new Nansen(new Store(), { apiKey: "k", cacheSeconds: 900, fetchImpl: reply([row("WMON", 60_000), row("MON", 40_000), row("FOO", 9e9)]) });
    const s = await n.get();
    expect(s?.netflow24hUsd).toBe(100_000);
    expect(smartMoneyScore(s)).toBeCloseTo(0.76, 2);
  });

  it("caches empty answers too (no refetch storm) and respects the daily budget", async () => {
    let calls = 0;
    const f = (async () => {
      calls++;
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }) as unknown as typeof fetch;
    const store = new Store();
    const n = new Nansen(store, { apiKey: "k", cacheSeconds: 900, fetchImpl: f, dailyBudget: 1 });
    expect(await n.get()).toBeNull();
    expect(await n.get()).toBeNull();
    expect(calls).toBe(1);
    const n0 = new Nansen(new Store(), { apiKey: "k", cacheSeconds: 0, fetchImpl: f, dailyBudget: 0 });
    expect(await n0.get()).toBeNull();
    expect(calls).toBe(1);
  });

  it("no API key → null without calling", async () => {
    expect(await new Nansen(new Store(), { cacheSeconds: 900 }).get()).toBeNull();
  });
});
