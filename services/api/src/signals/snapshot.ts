// Signals snapshot = everything the trader saw for one decision. Its canonical hash is signalHash.
import type { RiskSnapshot } from "@leash/shared";
import type { Gateway, Market } from "../exec/gateway";
import type { Envio } from "./envio";
import type { MarkHistory } from "./momentum";
import { smartMoneyScore, type Nansen, type NansenSignal } from "./nansen";

export type Snapshot = {
  ts: string;
  smartMoneyScore: number | null;
  nansen: NansenSignal | null;
  perpl: (Pick<Market, "market" | "mark" | "index" | "fundingRate"> & { markChangePct: number | null; changeWindowMin: number | null }) | null;
  risk: Pick<RiskSnapshot, "equityUsd" | "weeklyPnlPct" | "exposureByMarket"> & { positions: number } | null;
  envio: { recentReceipts: number } | null;
};

export type SignalSources = { gateway: Gateway; nansen: Nansen; envio: Envio; marks?: MarkHistory };

/** Never throws: each source that fails is recorded as null (and the checker treats unknown as "no"). */
export async function gatherSnapshot(src: SignalSources, opts: { account: string | null; market: string; now: number }): Promise<{ snapshot: Snapshot; risk: RiskSnapshot | null }> {
  const [nansen, markets, risk, receipts] = await Promise.all([
    src.nansen.get().catch(() => null),
    src.gateway.markets().catch(() => null),
    opts.account ? src.gateway.risk(opts.account).catch(() => null) : Promise.resolve(null),
    opts.account && src.envio.configured ? src.envio.recentReceipts(opts.account, 20).catch(() => null) : Promise.resolve(null),
  ]);
  const m = markets?.find((x) => x.market === opts.market) ?? null;
  if (m) src.marks?.record(m.market, Number(m.mark), opts.now);
  const mom = m ? (src.marks?.change(m.market, opts.now) ?? null) : null;
  return {
    risk,
    snapshot: {
      ts: new Date(opts.now).toISOString(),
      smartMoneyScore: smartMoneyScore(nansen),
      nansen,
      perpl: m ? { market: m.market, mark: m.mark, index: m.index, fundingRate: m.fundingRate, markChangePct: mom?.pct ?? null, changeWindowMin: mom?.minutes ?? null } : null,
      risk: risk ? { equityUsd: risk.equityUsd, weeklyPnlPct: risk.weeklyPnlPct, exposureByMarket: risk.exposureByMarket, positions: risk.positions.length } : null,
      envio: receipts ? { recentReceipts: receipts.length } : null,
    },
  };
}

/** "Changed meaningfully" → worth an LLM call: new Nansen data, mark moved > 0.5%, or positions changed. */
export function changedMeaningfully(prev: Snapshot | undefined, next: Snapshot): boolean {
  if (!prev) return true;
  if (prev.nansen?.fetchedAt !== next.nansen?.fetchedAt) return true;
  if ((prev.risk?.positions ?? -1) !== (next.risk?.positions ?? -1)) return true;
  const a = Number(prev.perpl?.mark ?? 0);
  const b = Number(next.perpl?.mark ?? 0);
  if (a === 0 || b === 0) return a !== b;
  return Math.abs(b - a) / a > 0.005;
}

/** Short "why" chips for the app and slack requests. */
export function whyChips(s: Snapshot): { text: string; source: string }[] {
  const out: { text: string; source: string }[] = [];
  if (s.nansen) {
    const v = s.nansen.netflow24hUsd;
    out.push({ text: `Smart money ${v >= 0 ? "bought" : "sold"} $${Math.abs(Math.round(v / 1000))}k of MON in 24h`, source: "nansen" });
  }
  if (s.perpl?.markChangePct != null) out.push({ text: `MON ${s.perpl.markChangePct >= 0 ? "up" : "down"} ${Math.abs(s.perpl.markChangePct)}% in ${s.perpl.changeWindowMin} min (Perpl mark $${s.perpl.mark})`, source: "perpl" });
  else if (s.perpl) out.push({ text: `MON mark $${s.perpl.mark}, funding ${(Number(s.perpl.fundingRate) * 100).toFixed(4)}%`, source: "perpl" });
  if (s.risk) out.push({ text: `Week P&L ${s.risk.weeklyPnlPct}%, ${s.risk.positions} open position(s)`, source: "perpl" });
  return out;
}
