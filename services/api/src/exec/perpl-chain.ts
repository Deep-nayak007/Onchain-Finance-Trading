// Live Perpl market data read straight from the Exchange contract (read-only), used when Rails' gateway isn't
// deployed yet. Gives the trader real testnet marks/funding instead of static mock JSON. Execution and
// account risk still go through the gateway (or its mock): this never signs anything.
import { PERPL, PERPL_TESTNET } from "@leash/shared";
import type { Address, PublicClient } from "viem";
import { type Market, MockGateway } from "./gateway";
import { perplExchangeViewsAbi } from "./perpl-abi";

export type PerplChainConfig = { exchange: Address; perpIds: Record<string, number> };

/** Testnet ids come from Perpl's public context; mainnet ids aren't sourced yet → null (use the gateway). */
export function perplChainConfig(chainId: number): PerplChainConfig | null {
  if (chainId === 10143) return { exchange: PERPL_TESTNET.exchange as Address, perpIds: PERPL_TESTNET.perpIds };
  void PERPL;
  return null;
}

const scale = (v: bigint, decimals: number) => {
  const s = v.toString().padStart(decimals + 1, "0");
  const int = s.slice(0, s.length - decimals);
  const frac = s.slice(s.length - decimals).replace(/0+$/, "");
  return frac ? `${int}.${frac}` : int;
};
/** Plain decimal string (no exponent), as the gateway spec uses. */
const decimal = (n: number) => (n === 0 ? "0" : n.toFixed(12).replace(/\.?0+$/, ""));
const tick = (decimals: number) => (decimals === 0 ? "1" : `0.${"0".repeat(decimals - 1)}1`);

export async function readPerplMarkets(client: PublicClient, cfg: PerplChainConfig): Promise<Market[]> {
  const entries = Object.entries(cfg.perpIds);
  const res = await client.multicall({
    contracts: entries.map(([, id]) => ({ address: cfg.exchange, abi: perplExchangeViewsAbi, functionName: "getPerpetualInfoV2" as const, args: [BigInt(id)] })),
    allowFailure: true,
  });
  const out: Market[] = [];
  res.forEach((r, i) => {
    if (r.status !== "success") return;
    const p = r.result as { priceDecimals: bigint; lotDecimals: bigint; markPNS: bigint; oraclePNS: bigint; fundingRatePct100k: number; status: number };
    const pd = Number(p.priceDecimals);
    out.push({
      market: entries[i]![0],
      perpId: entries[i]![1],
      mark: scale(p.markPNS, pd),
      index: scale(p.oraclePNS, pd),
      // fundingRatePct100k is a percent ×100k → fraction = v / 100_000 / 100
      fundingRate: decimal(Number(p.fundingRatePct100k) / 10_000_000),
      tickSize: tick(pd),
      lotSize: tick(Number(p.lotDecimals)),
    });
  });
  return out;
}

/** Mock gateway for account/execute, real onchain Perpl markets. */
export class ChainMarketsGateway extends MockGateway {
  override readonly kind = "mock" as const;
  readonly marketsSource = "perpl-onchain" as const;
  constructor(
    private readonly client: PublicClient,
    private readonly cfg: PerplChainConfig,
    opts: { maxOrderUsd: number },
  ) {
    super(opts);
  }
  override async markets(): Promise<Market[]> {
    const live = await readPerplMarkets(this.client, this.cfg);
    if (!live.length) throw new Error("perpl onchain markets unavailable");
    return live;
  }
}
