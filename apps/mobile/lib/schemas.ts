// Consumer validation of the exact types in ARCHITECTURE §7.2. No owner files are generated here.
import { z } from 'zod';
export const addressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
export const hashSchema = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
const decimal = z.string().regex(/^-?\d+(?:\.\d+)?$/);
const positiveDecimal = decimal.refine((v) => Number(v) >= 0 && Number.isFinite(Number(v)));
const iso = z.iso.datetime();
export const policySchema = z.object({
  version: z.literal(1),
  markets: z.array(z.string()).min(1),
  venues: z.array(z.enum(['PERPL', 'KURU'])).min(1),
  maxLeverage: z.number().finite().nonnegative(),
  maxNotionalUsd: positiveDecimal,
  maxTotalExposureUsd: positiveDecimal,
  maxWeeklyLossPct: z.number().finite().min(0).max(100),
  maxTradesPerHour: z.number().int().positive(),
  cooldownSec: z.number().int().nonnegative(),
  requireSmartMoneyAgreement: z.boolean(),
  minConfidence: z.number().min(0).max(1),
  sleeveUsd: positiveDecimal,
});
export const ruleCodeSchema = z.enum([
  'OK',
  'PAUSED',
  'MARKET_NOT_ALLOWED',
  'VENUE_NOT_ALLOWED',
  'LEVERAGE_EXCEEDS',
  'NOTIONAL_EXCEEDS',
  'EXPOSURE_EXCEEDS',
  'WEEKLY_LOSS_LIMIT',
  'RATE_LIMIT',
  'COOLDOWN',
  'LOW_CONFIDENCE',
  'NO_SMART_MONEY_AGREEMENT',
  'INVALID_INTENT',
  'CANNOT_WITHDRAW',
]);
export const personaSchema = z.object({
  id: z.enum(['falcon', 'otter', 'owl']),
  agentId: z.string(),
  name: z.string(),
  style: z.string(),
  mode: z.enum(['LIVE', 'SHADOW']),
  wallet: addressSchema.nullable(),
  defaultPolicy: policySchema,
});
export const traderResponseSchema = personaSchema.extend({
  stats: z
    .object({
      executedCount: z.number().int().nonnegative(),
      rejectedCount: z.number().int().nonnegative(),
      shadowCount: z.number().int().nonnegative(),
      volumeUsd: decimal,
      realizedPnlUsd: decimal,
      shadowPnlUsd: decimal,
      maxDrawdownPct: z.number().finite(),
    })
    .nullable()
    .optional(),
});
export const intentSchema = z.object({
  id: z.uuid(),
  ts: iso,
  persona: z.enum(['falcon', 'otter', 'owl']),
  action: z.enum(['OPEN', 'CLOSE', 'REDUCE', 'SWAP', 'HOLD']),
  venue: z.enum(['PERPL', 'KURU']),
  market: z.string(),
  side: z.enum(['LONG', 'SHORT', 'BUY', 'SELL']),
  sizeUsd: positiveDecimal,
  leverage: z.number().finite().nonnegative(),
  confidence: z.number().min(0).max(1),
  rationale: z.string().max(500),
  signals: z.array(
    z.object({ source: z.enum(['nansen', 'envio', 'perpl']), key: z.string(), value: z.string() }),
  ),
});
export const decisionSchema = z.object({
  intentId: z.uuid(),
  allowed: z.boolean(),
  reasons: z.array(ruleCodeSchema),
  usedSlack: z.boolean(),
  checkedAt: iso,
});
export const receiptDetailSchema = z
  .object({
    reasonHash: hashSchema,
    signalHash: hashSchema,
    intent: intentSchema,
    decision: decisionSchema,
    signalsSnapshot: z.record(z.string(), z.unknown()),
    model: z.string(),
    decidedAtMs: z.number().int().nonnegative(),
    confirmedAtMs: z.number().int().nonnegative().nullable(),
    execTxHash: hashSchema.nullable(),
  })
  .refine((v) => v.decision.intentId === v.intent.id, {
    message: 'Receipt decision references another intent.',
  });
export const slackSchema = z.object({
  id: z.uuid(),
  account: addressSchema,
  persona: z.string(),
  intentId: z.uuid(),
  rule: ruleCodeSchema,
  requested: z.object({
    maxLeverage: z.number().positive(),
    maxNotionalUsd: positiveDecimal,
    extraRiskUsd: positiveDecimal,
    durationSec: z.number().int().min(1).max(86400),
  }),
  why: z.array(z.object({ text: z.string(), source: z.string() })),
  createdAt: iso,
  expiresAt: iso,
  status: z.enum(['PENDING', 'APPROVED', 'DENIED', 'EXPIRED']),
});
export const riskWireSchema = z.object({
  account: addressSchema,
  ts: z.number().int().nonnegative(),
  equityUsd: decimal,
  collateralUsd: decimal,
  marginUsedUsd: decimal,
  weeklyPnlPct: decimal.refine((v) => Number.isFinite(Number(v))),
  fundingPaidUsd: decimal,
  slackLeftUsd: positiveDecimal,
  positions: z.array(
    z.object({
      market: z.string(),
      side: z.enum(['LONG', 'SHORT']),
      sizeUsd: positiveDecimal,
      entryPrice: positiveDecimal,
      markPrice: positiveDecimal,
      liqPrice: positiveDecimal,
      liqDistancePct: decimal.refine((v) => Number.isFinite(Number(v))),
      unrealizedPnlUsd: decimal,
    }),
  ),
  exposureByMarket: z.record(z.string(), positiveDecimal),
});
// Normalize only the percentages used by the UI; retain the exact gateway wire contract above.
export const riskSchema = riskWireSchema.transform((risk) => ({
  ...risk,
  weeklyPnlPct: Number(risk.weeklyPnlPct),
  positions: risk.positions.map((position) => ({
    ...position,
    liqDistancePct: Number(position.liqDistancePct),
  })),
}));
export const txRequestSchema = z.object({
  to: addressSchema,
  data: z.string().regex(/^0x(?:[0-9a-fA-F]{2})*$/),
  value: z.string().regex(/^\d+$/),
  gas: z.string().regex(/^[1-9]\d*$/),
  chainId: z.union([z.literal(143), z.literal(10143)]),
});
export const compileSchema = z.object({
  policy: policySchema,
  policyHash: hashSchema,
  leashCard: z.array(z.string()),
  warnings: z.array(z.string()),
  agentId: z.string().regex(/^\d+$/),
  agentWallet: addressSchema.nullable(),
  perplKey: addressSchema.nullable(),
});
export const agentStatusSchema = z.object({
  state: z.string(),
  persona: z.string().nullable(),
  lastTick: z.string().nullable(),
  lastDecision: z.unknown().nullable(),
});
export type Policy = z.infer<typeof policySchema>;
export type Persona = z.infer<typeof personaSchema>;
export type Intent = z.infer<typeof intentSchema>;
export type Decision = z.infer<typeof decisionSchema>;
export type ReceiptDetail = z.infer<typeof receiptDetailSchema>;
export type SlackRequest = z.infer<typeof slackSchema>;
export type RiskSnapshot = z.infer<typeof riskSchema>;
export type TxRequest = z.infer<typeof txRequestSchema>;
export type CompileResult = z.infer<typeof compileSchema>;
// App view models mapped by Rails from their actual Envio entities, not a guessed GraphQL schema.
export type ReceiptStatus = 'EXECUTED' | 'REJECTED' | 'FAILED' | 'SHADOW' | 'PAUSED';
export type IndexedReceipt = {
  id: string;
  account?: string;
  proofTxHash?: string;
  anchorSource?: 'envio' | 'rpc';
  usedSlack?: boolean;
  execTxHash?: string | null;
  seq: number;
  persona: Persona['id'];
  status: ReceiptStatus;
  reasonHash: string | null;
  signalHash: string | null;
  createdAt: string;
  detail?: ReceiptDetail;
  pauseReason?: string;
};
export type TraderStats = {
  persona: Persona;
  sevenDayPct: number | null;
  receipts: number | null;
  maxDrawdownPct: number | null;
  identityUrl?: string;
};
export type Book = { bids: [string, string][]; asks: [string, string][]; ts: string };
export const apiHealthSchema = z.object({
  ok: z.boolean(),
  chainId: z.union([z.literal(143), z.literal(10143)]),
  live: z.boolean(),
  gateway: z.string(),
  contracts: z.boolean(),
});
export const apiConfigSchema = z.object({
  chainId: z.union([z.literal(143), z.literal(10143)]),
  addresses: z.object({ mandateRegistry: addressSchema, receiptLog: addressSchema }).nullable(),
  personas: z.array(personaSchema),
  live: z.boolean(),
});
export const spotPrepareSchema = z
  .object({
    txs: z.array(txRequestSchema).min(1),
    estimatedOut: z.number().finite().positive(),
    minOut: z.number().finite().positive(),
  })
  .refine((value) => value.minOut <= value.estimatedOut, {
    message: 'Minimum output exceeds the quote.',
  });
