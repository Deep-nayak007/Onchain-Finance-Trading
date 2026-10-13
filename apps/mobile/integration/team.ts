import type { Address, Hex, LocalAccount } from 'viem';
import { liveBindings } from './live';
import type {
  Book,
  CompileResult,
  IndexedReceipt,
  Persona,
  Policy,
  SlackRequest,
  TraderStats,
  TxRequest,
} from '../lib/schemas';
// FACE-owned view adapter over the actual shared package and Brain/Rails services.
// Do not infer ABI exports, addresses, GraphQL fields, key enrollment, or Kuru routes.
export interface TeamBindings {
  sendTx: (account: LocalAccount, request: TxRequest) => Promise<Hex>; // must delegate to packages/shared/sendTx.ts
  prepareMandate: (
    account: Address,
    compiled: CompileResult,
    persona: Persona['id'],
  ) => Promise<TxRequest>;
  prepareSlack: (account: Address, request: SlackRequest) => Promise<TxRequest>;
  preparePause: (account: Address) => Promise<TxRequest>;
  prepareResume: (account: Address) => Promise<TxRequest>;
  activateAgent: (account: Address, persona: Persona['id'], txHash: Hex) => Promise<void>; // actual POST /agent/activate body supplied by Brain
  resumeAgent: (account: Address, txHash: Hex) => Promise<void>; // existing /agent/activate flow; restores the policy and exchange enrollment after kill
  readReceipts: (account: Address) => Promise<IndexedReceipt[]>; // actual shared queries.graphql + Envio
  readReceipt: (
    account: Address | null,
    hash: Hex,
    proofTxHash?: Hex,
  ) => Promise<IndexedReceipt | null>;
  readPnl: (account: Address) => Promise<number[]>;
  readTraderStats: () => Promise<TraderStats[]>;
  readPolicy: (account: Address) => Promise<Policy | null>;
  readBalanceUsd: (account: Address) => Promise<string>; // approved collateral token's real decimals
  prepareDeposit: (account: Address, amountUsd: string) => Promise<TxRequest[]>; // gateway /deposit/prepare
  prepareKeyEnrollment: (account: Address) => Promise<TxRequest[]>; // Rails Q1 resolution
  prepareManualOrder: (
    account: Address,
    market: string,
    side: 'LONG' | 'SHORT',
    amountUsd: string,
    leverage: number,
  ) => Promise<TxRequest>; // gateway /orders/prepare
  readSpotBook: () => Promise<Book>;
  quoteSwap: (
    account: Address,
    amount: string,
    direction: 'BUY' | 'SELL',
  ) => Promise<{ amountOut: string; minOut: string; expiresAt: number; transactions: TxRequest[] }>; // Brain's Kuru helper; amount is USD on both sides
}
export const teamBindings: TeamBindings = liveBindings;
export function requireBindings(): TeamBindings {
  return teamBindings;
}
