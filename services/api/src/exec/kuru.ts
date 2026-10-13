// Kuru spot (Q3): MON/AUSD order book. Market params + cost estimate come from the official SDK (read-only,
// ethers v5 provider); calldata is encoded with the SDK's own OrderBook ABI and signed by the Privy wallet,
// so every tx still goes through sendTx. Units follow the SDK's IOC implementation exactly:
//   buy:  _quoteSize = parseUnits(quote, log10(pricePrecision)), _minOut = parseUnits(minBase, baseDecimals)
//   sell: _size      = parseUnits(base,  log10(sizePrecision)),  _minOut = parseUnits(minQuote, quoteDecimals)
//   value = amount in native units when the paid asset is native MON (address 0).
import { createRequire } from "node:module";
import { monadChain, prepareTxRequest, sendTxAndWait, type Intent, type PersonaId, type TxRequest } from "@leash/shared";
import { CostEstimator, OrderBook, ParamFetcher, type MarketParams } from "@kuru-labs/kuru-sdk";
import { ethers } from "ethers";
import { createWalletClient, encodeFunctionData, erc20Abi, http, parseUnits, zeroAddress, type Abi, type Address, type Hex, type PublicClient } from "viem";
import type { Wallets } from "../wallet/wallets";

const require = createRequire(import.meta.url);
export const KURU_ORDERBOOK_ABI = (require("@kuru-labs/kuru-sdk/abi/OrderBook.json") as { abi: Abi }).abi;

export interface SpotExecutor {
  swap(a: { user: Address; persona: PersonaId; intent: Intent }): Promise<Hex>;
}

export type Params = {
  pricePrecision: bigint;
  sizePrecision: bigint;
  baseAsset: Address;
  baseDecimals: number;
  quoteAsset: Address;
  quoteDecimals: number;
};

export function toParams(p: MarketParams): Params {
  return {
    pricePrecision: BigInt(p.pricePrecision.toString()),
    sizePrecision: BigInt(p.sizePrecision.toString()),
    baseAsset: p.baseAssetAddress as Address,
    baseDecimals: Number(p.baseAssetDecimals.toString()),
    quoteAsset: p.quoteAssetAddress as Address,
    quoteDecimals: Number(p.quoteAssetDecimals.toString()),
  };
}

const log10 = (x: bigint) => x.toString().length - 1;
/** Fixed-decimal string for parseUnits: at most 9 decimals (float-safe), rounded DOWN (never over-spend or over-ask). */
const fixed = (n: number, d: number) => {
  const k = Math.min(d, 9);
  const f = 10 ** k;
  return (Math.floor(n * f + 1e-6) / f).toFixed(k);
};

export type SwapLeg = { to: Address; data: Hex; value: bigint };

/** Pure: the approve (if any) + market order legs. `amount` is quote to spend (BUY) or base to sell (SELL). */
export function buildSwapLegs(market: Address, p: Params, side: "BUY" | "SELL", amount: number, minOut: number): SwapLeg[] {
  const legs: SwapLeg[] = [];
  if (side === "BUY") {
    const paid = parseUnits(fixed(amount, p.quoteDecimals), p.quoteDecimals);
    if (p.quoteAsset !== zeroAddress) legs.push({ to: p.quoteAsset, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [market, paid] }), value: 0n });
    legs.push({
      to: market,
      data: encodeFunctionData({
        abi: KURU_ORDERBOOK_ABI,
        functionName: "placeAndExecuteMarketBuy",
        args: [parseUnits(fixed(amount, log10(p.pricePrecision)), log10(p.pricePrecision)), parseUnits(fixed(minOut, p.baseDecimals), p.baseDecimals), false, false],
      }),
      value: p.quoteAsset === zeroAddress ? paid : 0n,
    });
  } else {
    const paid = parseUnits(fixed(amount, p.baseDecimals), p.baseDecimals);
    if (p.baseAsset !== zeroAddress) legs.push({ to: p.baseAsset, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [market, paid] }), value: 0n });
    legs.push({
      to: market,
      data: encodeFunctionData({
        abi: KURU_ORDERBOOK_ABI,
        functionName: "placeAndExecuteMarketSell",
        args: [parseUnits(fixed(amount, log10(p.sizePrecision)), log10(p.sizePrecision)), parseUnits(fixed(minOut, p.quoteDecimals), p.quoteDecimals), false, false],
      }),
      value: p.baseAsset === zeroAddress ? paid : 0n,
    });
  }
  return legs;
}

export class Kuru implements SpotExecutor {
  private readonly provider: ethers.providers.JsonRpcProvider;
  private raw: MarketParams | null = null;

  constructor(
    private readonly o: {
      market: Address;
      rpcUrl: string;
      chainId: number;
      publicClient: PublicClient;
      wallets: Wallets | null;
      slippageBps?: number;
      /** MON price in USD, used to size SELL intents (USD → MON). */
      monPriceUsd: () => Promise<number>;
    },
  ) {
    this.provider = new ethers.providers.JsonRpcProvider(o.rpcUrl, o.chainId);
  }

  private async rawParams(): Promise<MarketParams> {
    this.raw ??= await ParamFetcher.getMarketParams(this.provider, this.o.market);
    return this.raw;
  }

  async marketParams(): Promise<Params> {
    return toParams(await this.rawParams());
  }

  /** Live L2 order book (formatted prices/sizes) for the spot screen. */
  async book(depth = 20): Promise<{ bids: [string, string][]; asks: [string, string][]; ts: string }> {
    const ob = await OrderBook.getFormattedL2OrderBook(this.provider, this.o.market, await this.rawParams());
    const fmt = (rows: number[][]) => rows.slice(0, depth).map(([p, s]) => [String(p), String(s)] as [string, string]);
    return { bids: fmt(ob.bids), asks: fmt(ob.asks), ts: new Date().toISOString() };
  }

  /** Quote + minOut with slippage. amount: quote (BUY) or base (SELL). */
  async quote(side: "BUY" | "SELL", amount: number): Promise<{ output: number; minOut: number; params: Params }> {
    const raw = await this.rawParams();
    const params = toParams(raw);
    const est = side === "BUY" ? await CostEstimator.estimateMarketBuy(this.provider, this.o.market, raw, amount) : await CostEstimator.estimateMarketSell(this.provider, this.o.market, raw, amount);
    // No liquidity → refuse rather than send an order with minOut 0 (unbounded slippage).
    if (!(est.output > 0)) throw new Error(`Kuru: no ${side === "BUY" ? "asks" : "bids"} to fill ${amount}`);
    const minOut = est.output * (1 - (this.o.slippageBps ?? 100) / 10_000);
    return { output: est.output, minOut, params };
  }

  /** Unsigned txs for Face's spot screen (user signs with Mera). sizeUsd: USD for BUY, USD worth of MON for SELL. */
  async prepare(from: Address, side: "BUY" | "SELL", sizeUsd: number): Promise<{ txs: TxRequest[]; estimatedOut: number; minOut: number }> {
    const amount = side === "BUY" ? sizeUsd : sizeUsd / (await this.o.monPriceUsd());
    const q = await this.quote(side, amount);
    const txs: TxRequest[] = [];
    for (const leg of buildSwapLegs(this.o.market, q.params, side, amount, q.minOut)) {
      // approve must land before the swap can be estimated; give the swap leg a fixed generous limit instead.
      const gas = leg.to === this.o.market && txs.length ? 400_000n : undefined;
      txs.push(await prepareTxRequest(this.o.publicClient, from, { ...leg, gas }, { chainId: this.o.chainId }));
    }
    return { txs, estimatedOut: q.output, minOut: q.minOut };
  }

  /** Owl's hedge sleeve: executes from the user×trader Privy wallet (policy allows only this market + approve). */
  async swap(a: { user: Address; persona: PersonaId; intent: Intent }): Promise<Hex> {
    if (!this.o.wallets) throw new Error("Privy wallets not configured");
    const side = a.intent.side === "BUY" ? "BUY" : "SELL";
    const usd = Number(a.intent.sizeUsd);
    const amount = side === "BUY" ? usd : usd / (await this.o.monPriceUsd());
    const q = await this.quote(side, amount);
    const row = await this.o.wallets.userWallet(a.user, a.persona);
    const client = createWalletClient({ account: this.o.wallets.account(row), chain: monadChain(this.o.chainId), transport: http(this.o.rpcUrl) });
    let last: Hex = "0x";
    for (const leg of buildSwapLegs(this.o.market, q.params, side, amount, q.minOut)) {
      last = (await sendTxAndWait(client, this.o.publicClient, leg, { chainId: this.o.chainId })).hash;
    }
    return last;
  }
}
