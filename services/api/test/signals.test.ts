import { describe, expect, it } from "vitest";
import type { PublicClient } from "viem";
import { readPerplMarkets } from "../src/exec/perpl-chain";
import { drip } from "../src/gas/drip";
import { MarkHistory } from "../src/signals/momentum";
import { Store } from "../src/store/db";
import { USER } from "./helpers";

describe("MarkHistory momentum", () => {
  it("needs ≥ 3 min of history, then reports % change vs the oldest sample", () => {
    const h = new MarkHistory();
    h.record("MON-PERP", 0.025, 0);
    expect(h.change("MON-PERP", 60_000)).toBeNull();
    h.record("MON-PERP", 0.02525, 240_000);
    expect(h.change("MON-PERP", 240_000)).toEqual({ pct: 1, minutes: 4 });
  });
  it("drops samples older than the 30 min window", () => {
    const h = new MarkHistory();
    h.record("M", 1, 0);
    h.record("M", 2, 20 * 60_000);
    h.record("M", 3, 40 * 60_000);
    expect(h.change("M", 40 * 60_000)).toEqual({ pct: 50, minutes: 20 });
  });
});

describe("readPerplMarkets (onchain Perpl views)", () => {
  it("scales PNS prices by priceDecimals and funding %×100k to a fraction", async () => {
    const client = {
      multicall: async () => [
        { status: "success", result: { priceDecimals: 5n, lotDecimals: 0n, markPNS: 2505n, oraclePNS: 2501n, fundingRatePct100k: 125, status: 0 } },
        { status: "failure", error: new Error("x") },
      ],
    } as unknown as PublicClient;
    const m = await readPerplMarkets(client, { exchange: "0x1964C32f0bE608E7D29302AFF5E61268E72080cc", perpIds: { "MON-PERP": 64, "BTC-PERP": 16 } });
    expect(m).toEqual([{ market: "MON-PERP", perpId: 64, mark: "0.02505", index: "0.02501", fundingRate: "0.0000125", tickSize: "0.00001", lotSize: "1" }]);
  });
});

describe("drip confirms by receipt", () => {
  it("a reverted drip throws and releases the claim (no false success)", async () => {
    const store = new Store();
    const publicClient = { getBalance: async () => 10n ** 19n, waitForTransactionReceipt: async () => ({ status: "reverted" }) } as unknown as PublicClient;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wallet = { account: { address: USER }, chain: undefined, sendTransaction: async () => `0x${"aa".repeat(32)}` } as any;
    await expect(drip({ store, wallet, publicClient, amountMon: "0.2", chainId: 10143 }, USER)).rejects.toThrow(/reverted/);
    expect(store.claimDrip(USER)).toBe(true); // claim was released
  });
});

describe("Envio URL pointer", () => {
  it("prefers a valid pointer URL, ignores junk, falls back to static ENVIO_URL", async () => {
    const { Envio } = await import("../src/signals/envio");
    const mk = (body: string, ok = true) => (async () => new Response(body, { status: ok ? 200 : 500 })) as unknown as typeof fetch;
    expect(await new Envio("https://static.example/v1/graphql", mk("https://new-tunnel.trycloudflare.com/v1/graphql\n"), "https://p").endpoint()).toBe(
      "https://new-tunnel.trycloudflare.com/v1/graphql",
    );
    expect(await new Envio("https://static.example/v1/graphql", mk("javascript:alert(1)"), "https://p").endpoint()).toBe("https://static.example/v1/graphql");
    expect(await new Envio("https://static.example/v1/graphql", mk("", false), "https://p").endpoint()).toBe("https://static.example/v1/graphql");
    expect(await new Envio("https://static.example/v1/graphql").endpoint()).toBe("https://static.example/v1/graphql");
  });
});

describe("dripValue", () => {
  it("full amount when healthy, smaller when low, zero when empty", async () => {
    const { dripValue } = await import("../src/gas/drip");
    const e = (x: string) => BigInt(Math.round(Number(x) * 1e6)) * 10n ** 12n;
    expect(dripValue(e("0.2"), e("10"))).toBe(e("0.2"));
    expect(dripValue(e("0.2"), e("0.51"))).toBe(e("0.1"));
    expect(dripValue(e("0.2"), e("0.05"))).toBe(0n);
  });
});
