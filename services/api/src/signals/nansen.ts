// Nansen smart-money netflows on Monad (Q7). Docs: https://docs.nansen.ai/api/smart-money/netflows
// POST https://api.nansen.ai/api/v1/smart-money/netflow, header `apikey`, chains: ["monad"].
// Free plan: one shared cache (NANSEN_CACHE_SECONDS) across all users/personas + a daily call budget.
import { z } from "zod";
import type { Store } from "../store/db";

export const NANSEN_URL = "https://api.nansen.ai/api/v1/smart-money/netflow";

const Row = z.object({
  token_address: z.string(),
  token_symbol: z.string(),
  net_flow_1h_usd: z.number().nullable().optional(),
  net_flow_24h_usd: z.number().nullable().optional(),
  net_flow_7d_usd: z.number().nullable().optional(),
  chain: z.string(),
  trader_count: z.number().nullable().optional(),
});
const Response = z.object({ data: z.array(Row) });

export type NansenSignal = {
  fetchedAt: string;
  token: string;
  netflow1hUsd: number;
  netflow24hUsd: number;
  netflow7dUsd: number;
  traderCount: number;
};

/** −1..1. tanh keeps it bounded; $100k of 24h net flow ≈ 0.76. */
export function smartMoneyScore(s: NansenSignal | null): number | null {
  if (!s) return null;
  const x = s.netflow24hUsd / 100_000 + s.netflow1hUsd / 25_000;
  return Math.round(Math.tanh(x) * 100) / 100;
}

const CACHE_KEY = "nansen:monad:netflow";
const BUDGET_KEY = () => `nansen:calls:${new Date().toISOString().slice(0, 10)}`;
const MON_SYMBOLS = new Set(["MON", "WMON"]);

export class Nansen {
  constructor(
    private readonly store: Store,
    private readonly opts: { apiKey?: string; cacheSeconds: number; dailyBudget?: number; fetchImpl?: typeof fetch },
  ) {}

  /** Cached signal; refetches at most once per cache window and never beyond the daily budget. */
  async get(): Promise<NansenSignal | null> {
    const cached = this.store.getKv<NansenSignal | null>(CACHE_KEY, this.opts.cacheSeconds * 1000);
    if (cached !== null) return cached;
    if (!this.opts.apiKey) return null;
    const budget = this.opts.dailyBudget ?? 24;
    const used = this.store.getKv<number>(BUDGET_KEY(), 86_400_000) ?? 0;
    if (used >= budget) return this.store.getKv<NansenSignal | null>(CACHE_KEY, 86_400_000);
    this.store.setKv(BUDGET_KEY(), used + 1);

    try {
      const res = await (this.opts.fetchImpl ?? fetch)(NANSEN_URL, {
        method: "POST",
        headers: { "content-type": "application/json", apikey: this.opts.apiKey },
        body: JSON.stringify({
          chains: ["monad"],
          filters: { include_native_tokens: true, include_stablecoins: false },
          pagination: { page: 1, per_page: 50 },
          order_by: [{ field: "net_flow_24h_usd", direction: "DESC" }],
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`nansen ${res.status}`);
      const rows = Response.parse(await res.json()).data.filter((r) => MON_SYMBOLS.has(r.token_symbol.toUpperCase()));
      const signal: NansenSignal | null = rows.length
        ? {
            fetchedAt: new Date().toISOString(),
            token: "MON",
            netflow1hUsd: sum(rows, "net_flow_1h_usd"),
            netflow24hUsd: sum(rows, "net_flow_24h_usd"),
            netflow7dUsd: sum(rows, "net_flow_7d_usd"),
            traderCount: sum(rows, "trader_count"),
          }
        : null;
      this.store.setKv(CACHE_KEY, signal);
      return signal;
    } catch {
      // Serve the last good value (up to a day old) rather than nothing.
      return this.store.getKv<NansenSignal | null>(CACHE_KEY, 86_400_000);
    }
  }
}

function sum(rows: z.infer<typeof Row>[], k: "net_flow_1h_usd" | "net_flow_24h_usd" | "net_flow_7d_usd" | "trader_count"): number {
  return Math.round(rows.reduce((a, r) => a + (r[k] ?? 0), 0));
}
