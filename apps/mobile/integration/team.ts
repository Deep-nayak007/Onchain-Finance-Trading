import { createWalletClient, encodeFunctionData, erc20Abi, http } from 'viem';
import type { Address, Hex, LocalAccount } from 'viem';
import { z } from 'zod';
import { mandateRegistryAbi } from '@leash/shared/abis';
import { LEASH, PERPL, PERPL_TESTNET, PERSONAS } from '@leash/shared/addresses';
import { prepareTxRequest, sendTx as sharedSendTx } from '@leash/shared/sendTx';
import { config, isTestnet } from '../lib/config';
import { activeChain, publicClient } from '../lib/chain';
import { request } from '../lib/http';

import { recallPolicy, rememberPolicy } from '../lib/policyMemory';
import { queryEnvio } from '../lib/envioTransport';
import { bookSchema } from '../lib/gateway';
import {
  personaSchema,
  policySchema,
  txRequestSchema,
  type Book,
  type CompileResult,
  type IndexedReceipt,
  type Persona,
  type Policy,
  type SlackRequest,
  type TraderStats,
  type TxRequest,
} from '../lib/schemas';
// FACE adapter: live bindings over the team's real services (Brain API, Rails' gateway, Envio, Monad RPC), built only
// from @leash/shared (addresses, ABIs, sendTx) and the documented endpoints. Network = EXPO_PUBLIC_CHAIN_ID (143 or 10143).
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

const chainId = config.chainId as 143 | 10143;
const deployment = isTestnet ? LEASH.testnet : LEASH.mainnet;
const collateralToken = (isTestnet ? PERPL_TESTNET.collateralToken : PERPL.collateralToken) as Address;
const ack = z.unknown();

function registry(): Address {
  const a = deployment.mandateRegistry.address;
  if (!a) throw new Error(`MandateRegistry is not deployed on chain ${chainId} yet.`);
  return a as Address;
}

// USD decimal string → usd6 integer (ARCHITECTURE §6).
function usd6(v: string): bigint {
  const [i, f = ''] = String(v).split('.');
  return BigInt(i || '0') * 1_000_000n + BigInt((f + '000000').slice(0, 6));
}

/** Unsigned tx for the user to review and sign; gas = estimate + 10% (Monad charges the declared limit). */
const prepare = (from: Address, to: Address, data: Hex) => prepareTxRequest(publicClient, from, { to, data }, { chainId });

const personaByAgentId = (agentId: string): Persona['id'] =>
  ((Object.entries(PERSONAS) as [Persona['id'], { agentId: string | null }][]).find(([, p]) => p.agentId === agentId)?.[0] ?? 'falcon');

const unixToIso = (v: string | number) => new Date(Number(v) * 1000).toISOString();

// Rails' queries (packages/shared/queries.graphql).
const FEED = `query FeedByUser($user: String!, $limit: Int = 50) {
  Receipt(where: { user_id: { _eq: $user } }, order_by: { seq: desc }, limit: $limit) {
    id seq agentId status reasonHash signalHash blockTimestamp txHash
  }
}`;
const BY_HASH = `query ReceiptByReasonHash($reasonHash: String!) {
  Receipt(where: { reasonHash: { _eq: $reasonHash } }, limit: 1) {
    id user_id agentId seq status reasonHash signalHash blockTimestamp txHash
  }
}`;
const PAUSES = `query PausesByUser($user: String!, $limit: Int = 20) {
  PauseEvent(where: { user_id: { _eq: $user } }, order_by: { blockTimestamp: desc }, limit: $limit) {
    id by reason blockTimestamp txHash
  }
}`;
const receiptRow = z.object({
  id: z.string(),
  seq: z.union([z.string(), z.number()]),
  agentId: z.union([z.string(), z.number()]),
  status: z.enum(['EXECUTED', 'REJECTED', 'FAILED', 'SHADOW']),
  reasonHash: z.string(),
  signalHash: z.string(),
  blockTimestamp: z.union([z.string(), z.number()]),
});
const toIndexed = (r: z.infer<typeof receiptRow>): IndexedReceipt => ({
  id: r.id,
  seq: Number(r.seq),
  persona: personaByAgentId(String(r.agentId)),
  status: r.status,
  reasonHash: r.reasonHash,
  signalHash: r.signalHash,
  createdAt: unixToIso(r.blockTimestamp),
});

const traderRow = personaSchema.extend({
  stats: z
    .object({
      executedCount: z.number(),
      rejectedCount: z.number(),
      shadowCount: z.number(),
      maxDrawdownPct: z.number().nullable().optional(),
    })
    .nullable(),
});

export const teamBindings: TeamBindings | null = config.useMocks
  ? null
  : {
      sendTx: async (account, req) => {
        const wallet = createWalletClient({ account, chain: activeChain, transport: http(config.rpcUrl) });
        // Explicit gas from the reviewed request (already estimate + 10%).
        const { hash } = await sharedSendTx(wallet, publicClient, { to: req.to as Address, data: req.data as Hex, value: BigInt(req.value), gas: BigInt(req.gas) }, { chainId });
        return hash;
      },

      prepareMandate: async (account, compiled, persona) => {
        if (!compiled.agentWallet || !compiled.perplKey)
          throw new Error('Your trader wallet or trading key is not ready yet. Go back and compile your rules again in a minute.');
        const p = compiled.policy;
        rememberPolicy(account, p);
        const data = encodeFunctionData({
          abi: mandateRegistryAbi,
          functionName: 'setMandate',
          args: [
            {
              policyHash: compiled.policyHash as Hex,
              maxNotionalUsd6: usd6(p.maxNotionalUsd),
              maxLeverageX10: Math.round(p.maxLeverage * 10),
              maxWeeklyLossBps: Math.round(p.maxWeeklyLossPct * 100),
              agentId: BigInt(compiled.agentId ?? PERSONAS[persona].agentId ?? '0'),
              agentWallet: compiled.agentWallet as Address,
              perplKey: compiled.perplKey as Address,
              paused: false,
              updatedAt: 0n,
            },
          ],
        });
        return prepare(account, registry(), data);
      },

      prepareSlack: (account, req) =>
        prepare(
          account,
          registry(),
          encodeFunctionData({
            abi: mandateRegistryAbi,
            functionName: 'grantSlack',
            args: [
              {
                maxLeverageX10: Math.round(req.requested.maxLeverage * 10),
                maxNotionalUsd6: usd6(req.requested.maxNotionalUsd),
                extraRiskUsd6: usd6(req.requested.extraRiskUsd),
                expiresAt: BigInt(Math.floor(Date.now() / 1000) + req.requested.durationSec),
              },
            ],
          }),
        ),

      preparePause: (account) =>
        prepare(account, registry(), encodeFunctionData({ abi: mandateRegistryAbi, functionName: 'pause', args: [account, 'user'] })),

      prepareResume: (account) =>
        prepare(account, registry(), encodeFunctionData({ abi: mandateRegistryAbi, functionName: 'resume', args: [] })),

      // The policy rides along so a restarted Brain can recover it (accepted only if it matches the onchain hash).
      activateAgent: async (account, _persona, txHash) => {
        await request(config.apiUrl, '/agent/activate', ack, { account, txHash, policy: recallPolicy(account) });
      },
      resumeAgent: async (account, txHash) => {
        await request(config.apiUrl, '/agent/activate', ack, { account, txHash, policy: recallPolicy(account) });
      },

      readReceipts: async (account) => {
        const user = account.toLowerCase();
        const [feed, pauses] = await Promise.all([
          queryEnvio(FEED, z.object({ Receipt: z.array(receiptRow) }), { user, limit: 50 }),
          queryEnvio(
            PAUSES,
            z.object({ PauseEvent: z.array(z.object({ id: z.string(), by: z.string(), reason: z.string(), blockTimestamp: z.union([z.string(), z.number()]) })) }),
            { user, limit: 20 },
          ),
        ]);
        const pauseRows: IndexedReceipt[] = pauses.PauseEvent.map((p) => ({
          id: p.id,
          seq: 0,
          persona: 'falcon',
          status: 'PAUSED',
          reasonHash: null,
          signalHash: null,
          createdAt: unixToIso(p.blockTimestamp),
          pauseReason: p.reason,
        }));
        return [...feed.Receipt.map(toIndexed), ...pauseRows];
      },

      readReceipt: async (_account, hash) => {
        const r = await queryEnvio(BY_HASH, z.object({ Receipt: z.array(receiptRow) }), { reasonHash: hash.toLowerCase() });
        return r.Receipt[0] ? toIndexed(r.Receipt[0]) : null;
      },

      // PnL snapshots are not indexed yet (docs/LIMITATIONS.md): an empty series, never invented numbers.
      readPnl: async () => [],

      readTraderStats: async () => {
        const rows = await request(config.apiUrl, '/traders', z.array(traderRow));
        return rows.map(({ stats, ...persona }) => ({
          persona,
          sevenDayPct: null,
          receipts: stats ? stats.executedCount + stats.rejectedCount + stats.shadowCount : 0,
          maxDrawdownPct: stats?.maxDrawdownPct ?? null,
          identityUrl: persona.agentId !== '0' ? `${config.apiUrl.replace(/\/$/, '')}/agents/${persona.id}.json` : undefined,
        }));
      },

      readPolicy: async (account) => {
        const res = await fetch(`${config.apiUrl.replace(/\/$/, '')}/policy/${account}`);
        if (res.status === 404) return null;
        if (!res.ok) throw new Error(`The service returned ${res.status}. Refresh or try again shortly.`);
        return z.object({ policy: policySchema }).parse(await res.json()).policy;
      },

      readBalanceUsd: async (account) => {
        const raw = await publicClient.readContract({ address: collateralToken, abi: erc20Abi, functionName: 'balanceOf', args: [account] });
        const whole = raw / 1_000_000n;
        const frac = (raw % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '');
        return frac ? `${whole}.${frac}` : `${whole}`;
      },

      prepareDeposit: async (account, amountUsd) => {
        try {
          return await request(config.gatewayUrl, '/deposit/prepare', z.array(txRequestSchema), { account, amountUsd });
        } catch (e) {
          if (isTestnet)
            throw new Error('Perpl testnet deposits are not open yet (no test collateral exists). Skip this step: your trader runs in paper mode.');
          throw e;
        }
      },

      // The gateway creates the per-user trade-only key; the enrollment tx is null until Perpl's format (Q1) is
      // confirmed, so there is nothing to sign yet.
      prepareKeyEnrollment: async (account) => {
        const r = await request(
          config.gatewayUrl,
          '/keys/prepare',
          z.object({ keyAddress: z.string(), enrollment: txRequestSchema.nullable() }),
          { account },
        );
        return r.enrollment ? [r.enrollment] : [];
      },

      prepareManualOrder: async (account, market, side, amountUsd, leverage) => {
        const markets = await request(config.gatewayUrl, '/markets', z.array(z.object({ market: z.string(), mark: z.string() })));
        const mark = markets.find((m) => m.market === market)?.mark;
        if (!mark) throw new Error(`${market} is not listed on Perpl right now.`);
        return request(config.gatewayUrl, '/orders/prepare', txRequestSchema, {
          account,
          market,
          side,
          sizeUsd: amountUsd,
          price: mark,
          leverage,
        });
      },

      readSpotBook: () => request(config.apiUrl, '/spot/book', bookSchema),

      quoteSwap: async (account, amount, direction) => {
        const r = await request(
          config.apiUrl,
          '/spot/prepare',
          z.object({ txs: z.array(txRequestSchema), estimatedOut: z.number(), minOut: z.number() }),
          { account, side: direction, sizeUsd: Number(amount) },
        );
        return { amountOut: String(r.estimatedOut), expiresAt: Date.now() + 30000, transactions: r.txs };
      },
    };

export function requireBindings(): TeamBindings {
  if (!teamBindings)
    throw new Error(
      'Live services are not connected yet. Ask Prem and Yadnesh for the shared package and connect integration/team.ts.',
    );
  return teamBindings;
}
