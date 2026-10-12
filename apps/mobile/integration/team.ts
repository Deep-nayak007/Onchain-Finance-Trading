import type { Address, Hex, LocalAccount } from 'viem';
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
// FACE-owned adapter: fill with imports from the actual shared package when Brain/Rails deliver it.
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
  readReceipt: (account: Address, hash: Hex) => Promise<IndexedReceipt | null>;
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
  ) => Promise<{ amountOut: string; expiresAt: number; transactions: TxRequest[] }>; // Brain's Kuru helper
}
// Intentionally absent until actual shared code exists. Live actions fail closed with useful messages.
export const teamBindings: TeamBindings | null = null;
export function requireBindings(): TeamBindings {
  if (!teamBindings)
    throw new Error(
      'Live services are not connected yet. Ask Prem and Yadnesh for the shared package and connect integration/team.ts.',
    );
  return teamBindings;
}
