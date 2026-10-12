// Shared zod schemas: ARCHITECTURE.md §7.2 (frozen at CP0, owner: Brain).
// Units (§6): USD and prices are decimal strings in JSON; leverage is a plain number (3 = 3.0x).
import { z } from "zod";

// ---------- primitives ----------
export const Address = z.string().regex(/^0x[0-9a-fA-F]{40}$/, "expected 0x-prefixed 20-byte address");
export const Hex = z.string().regex(/^0x([0-9a-fA-F]{2})*$/, "expected 0x-prefixed even-length hex");
export const Hash32 = z.string().regex(/^0x[0-9a-fA-F]{64}$/, "expected 0x-prefixed 32-byte hash");
export const Uuid = z.uuid();
export const IsoDateTime = z.iso.datetime({ offset: true });
/** USD decimal string, at most 6 decimals (usd6 onchain). May be negative (PnL). */
export const UsdString = z.string().regex(/^-?\d+(\.\d{1,6})?$/, "expected USD decimal string (≤ 6 decimals)");
/** Non-negative USD decimal string (sizes, limits). */
export const PositiveUsdString = z.string().regex(/^\d+(\.\d{1,6})?$/, "expected non-negative USD decimal string");
/** Price decimal string, at most 18 decimals (1e18 onchain). */
export const PriceString = z.string().regex(/^\d+(\.\d{1,18})?$/, "expected price decimal string (≤ 18 decimals)");
/** Unsigned integer as decimal string (wei, gas). */
export const UintString = z.string().regex(/^\d+$/, "expected unsigned integer string");

export const Venue = z.enum(["PERPL", "KURU"]);
export const Side = z.enum(["LONG", "SHORT", "BUY", "SELL"]);
export const PersonaId = z.enum(["falcon", "otter", "owl"]);
export const PersonaMode = z.enum(["LIVE", "SHADOW"]);
export const IntentAction = z.enum(["OPEN", "CLOSE", "REDUCE", "SWAP", "HOLD"]);
export const SignalSource = z.enum(["nansen", "envio", "perpl"]);

/** All rule codes, in checkIntent evaluation order (OK first). */
export const RULE_CODES = [
  "OK",
  "PAUSED",
  "INVALID_INTENT",
  "VENUE_NOT_ALLOWED",
  "MARKET_NOT_ALLOWED",
  "LOW_CONFIDENCE",
  "NO_SMART_MONEY_AGREEMENT",
  "LEVERAGE_EXCEEDS",
  "NOTIONAL_EXCEEDS",
  "EXPOSURE_EXCEEDS",
  "WEEKLY_LOSS_LIMIT",
  "RATE_LIMIT",
  "COOLDOWN",
  "CANNOT_WITHDRAW",
] as const;
export const RuleCode = z.enum(RULE_CODES);

// ---------- Policy / Persona ----------
export const Policy = z.object({
  version: z.literal(1),
  markets: z.array(z.string().min(1)).min(1),
  venues: z.array(Venue).min(1),
  maxLeverage: z.number().positive(),
  maxNotionalUsd: PositiveUsdString,
  maxTotalExposureUsd: PositiveUsdString,
  maxWeeklyLossPct: z.number().min(0).max(100),
  maxTradesPerHour: z.number().int().nonnegative(),
  cooldownSec: z.number().int().nonnegative(),
  requireSmartMoneyAgreement: z.boolean(),
  minConfidence: z.number().min(0).max(1),
  sleeveUsd: PositiveUsdString,
});

export const Persona = z.object({
  id: PersonaId,
  agentId: z.string().regex(/^\d+$/, "agentId is a uint256 decimal string"),
  name: z.string().min(1),
  style: z.string().min(1),
  mode: PersonaMode,
  wallet: Address,
  defaultPolicy: Policy,
});

// ---------- Intent / Decision ----------
export const Signal = z.object({
  source: SignalSource,
  key: z.string().min(1),
  value: z.string(),
});

export const Intent = z.object({
  id: Uuid,
  ts: IsoDateTime,
  persona: PersonaId,
  action: IntentAction,
  venue: Venue,
  market: z.string().min(1),
  side: Side,
  sizeUsd: PositiveUsdString,
  leverage: z.number().nonnegative(),
  confidence: z.number().min(0).max(1),
  rationale: z.string().max(500),
  signals: z.array(Signal),
});

export const Decision = z.object({
  intentId: Uuid,
  allowed: z.boolean(),
  reasons: z.array(RuleCode).min(1),
  usedSlack: z.boolean(),
  checkedAt: IsoDateTime,
});

// ---------- Slack ----------
export const SlackRequestStatus = z.enum(["PENDING", "APPROVED", "DENIED", "EXPIRED"]);

export const SlackRequest = z.object({
  id: Uuid,
  account: Address,
  persona: z.string().min(1),
  intentId: Uuid,
  rule: RuleCode,
  requested: z.object({
    maxLeverage: z.number().positive(),
    maxNotionalUsd: PositiveUsdString,
    extraRiskUsd: PositiveUsdString,
    durationSec: z.number().int().positive(),
  }),
  why: z.array(z.object({ text: z.string().min(1), source: z.string().min(1) })),
  createdAt: IsoDateTime,
  expiresAt: IsoDateTime,
  status: SlackRequestStatus,
});

// ---------- Risk (gateway /risk/:address) ----------
/** Signed decimal string (percentages from the gateway). */
export const DecimalString = z.string().regex(/^-?\d+(\.\d+)?$/, "expected decimal string");

// Shape follows Rails' gateway.openapi.yaml (the producer): ts is unix seconds, percentages are strings.
export const RiskPosition = z.object({
  market: z.string().min(1),
  side: z.enum(["LONG", "SHORT"]),
  sizeUsd: PositiveUsdString,
  entryPrice: PriceString,
  markPrice: PriceString,
  liqPrice: PriceString,
  liqDistancePct: DecimalString,
  unrealizedPnlUsd: UsdString,
});

export const RiskSnapshot = z.object({
  account: Address,
  ts: z.number().int().nonnegative(),
  equityUsd: UsdString,
  collateralUsd: UsdString,
  marginUsedUsd: UsdString,
  weeklyPnlPct: DecimalString,
  fundingPaidUsd: UsdString,
  slackLeftUsd: UsdString,
  positions: z.array(RiskPosition),
  exposureByMarket: z.record(z.string(), UsdString),
});

// ---------- Receipts ----------
export const SignalsSnapshot = z.record(z.string(), z.unknown());

export const ReceiptDetail = z.object({
  reasonHash: Hash32,
  signalHash: Hash32,
  intent: Intent,
  decision: Decision,
  signalsSnapshot: SignalsSnapshot,
  model: z.string().min(1),
  decidedAtMs: z.number().int().nonnegative(),
  confirmedAtMs: z.number().int().nonnegative().nullable(),
  execTxHash: Hash32.nullable(),
});

// ---------- Transactions ----------
/** Monad mainnet (143) and testnet (10143). §7.2 freezes 143; testnet is accepted while we build on 10143. */
export const ChainId = z.union([z.literal(143), z.literal(10143)]);

export const TxRequest = z.object({
  to: Address,
  data: Hex,
  value: UintString,
  gas: UintString,
  chainId: ChainId,
});

// ---------- inferred types ----------
export type Address = z.infer<typeof Address>;
export type Hex = z.infer<typeof Hex>;
export type Hash32 = z.infer<typeof Hash32>;
export type Venue = z.infer<typeof Venue>;
export type Side = z.infer<typeof Side>;
export type PersonaId = z.infer<typeof PersonaId>;
export type PersonaMode = z.infer<typeof PersonaMode>;
export type IntentAction = z.infer<typeof IntentAction>;
export type RuleCode = z.infer<typeof RuleCode>;
export type Policy = z.infer<typeof Policy>;
export type Persona = z.infer<typeof Persona>;
export type Signal = z.infer<typeof Signal>;
export type Intent = z.infer<typeof Intent>;
export type Decision = z.infer<typeof Decision>;
export type SlackRequestStatus = z.infer<typeof SlackRequestStatus>;
export type SlackRequest = z.infer<typeof SlackRequest>;
export type RiskPosition = z.infer<typeof RiskPosition>;
export type RiskSnapshot = z.infer<typeof RiskSnapshot>;
export type SignalsSnapshot = z.infer<typeof SignalsSnapshot>;
export type ReceiptDetail = z.infer<typeof ReceiptDetail>;
export type ChainId = z.infer<typeof ChainId>;
export type TxRequest = z.infer<typeof TxRequest>;
