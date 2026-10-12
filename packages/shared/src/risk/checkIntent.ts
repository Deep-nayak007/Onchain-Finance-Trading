// checkIntent: the Rules knot in plain code. Pure, deterministic, no I/O. The LLM only proposes;
// this function decides. Every failing rule is returned (not just the first), in RULE_CODES order.
import { Intent, RULE_CODES, Uuid, type Decision, type Policy, type RuleCode } from "../schemas";
import { toUsd6 } from "../units";

/** Active slack grant, in API units. `expiresAt` is unix seconds (as onchain). */
export type SlackGrant = {
  active: boolean;
  maxLeverage: number;
  maxNotionalUsd: string;
  extraRiskUsd: string;
  expiresAt: number;
};

export type CheckState = {
  /** Wall clock in ms (passed in so the function stays pure). */
  now: number;
  paused: boolean;
  positions: { market: string; side: "LONG" | "SHORT"; sizeUsd: string }[];
  totalExposureUsd: string;
  /** e.g. -4.2 for a 4.2% loss this week. */
  weeklyPnlPct: number;
  /** Used to convert slack.extraRiskUsd into extra weekly-loss budget. */
  equityUsd?: string;
  tradesLastHour: number;
  /** ms timestamp of the last executed trade, or null. */
  lastTradeAt: number | null;
  /** −1..1 from Nansen; null when unknown. */
  smartMoneyScore: number | null;
};

export type EffectiveLimits = {
  maxLeverage: number;
  maxNotionalUsd6: bigint;
  maxWeeklyLossPct: number;
};

/** Used as Decision.intentId when an LLM payload has no valid id. */
export const INVALID_INTENT_ID = "00000000-0000-4000-8000-000000000000";

const FUNDS_OUT = /withdraw|transfer|bridge|send|0x[0-9a-fA-F]{40}/i;
const VENUE_ACTIONS: Record<Intent["venue"], Intent["action"][]> = {
  PERPL: ["OPEN", "CLOSE", "REDUCE", "HOLD"],
  KURU: ["SWAP", "HOLD"],
};

/** Slack counts only when active and not expired at `now`. */
export function isSlackLive(slack: SlackGrant | null | undefined, now: number): slack is SlackGrant {
  return !!slack && slack.active && slack.expiresAt * 1000 > now;
}

export function effectiveLimits(policy: Policy, slack: SlackGrant | null | undefined, state: Pick<CheckState, "now" | "equityUsd">): EffectiveLimits {
  const base: EffectiveLimits = {
    maxLeverage: policy.maxLeverage,
    maxNotionalUsd6: toUsd6(policy.maxNotionalUsd),
    maxWeeklyLossPct: policy.maxWeeklyLossPct,
  };
  if (!isSlackLive(slack, state.now)) return base;
  const equity6 = state.equityUsd ? toUsd6(state.equityUsd) : 0n;
  const extraPct = equity6 > 0n ? (Number(toUsd6(slack.extraRiskUsd)) / Number(equity6)) * 100 : 0;
  return {
    maxLeverage: slack.maxLeverage,
    maxNotionalUsd6: toUsd6(slack.maxNotionalUsd),
    maxWeeklyLossPct: base.maxWeeklyLossPct + extraPct,
  };
}

/** Risk-increasing actions are limit-checked; CLOSE/REDUCE always pass the limit rules. */
const increasesRisk = (i: Pick<Intent, "action">) => i.action === "OPEN" || i.action === "SWAP";

function limitFailures(intent: Intent, policy: Policy, state: CheckState, lim: EffectiveLimits): RuleCode[] {
  const out: RuleCode[] = [];
  if (!increasesRisk(intent)) return out;
  if (intent.leverage > lim.maxLeverage) out.push("LEVERAGE_EXCEEDS");
  const size6 = toUsd6(intent.sizeUsd);
  if (size6 > lim.maxNotionalUsd6) out.push("NOTIONAL_EXCEEDS");
  if (toUsd6(state.totalExposureUsd) + size6 > toUsd6(policy.maxTotalExposureUsd)) out.push("EXPOSURE_EXCEEDS");
  if (state.weeklyPnlPct <= -lim.maxWeeklyLossPct) out.push("WEEKLY_LOSS_LIMIT");
  return out;
}

export function checkIntent(policy: Policy, slack: SlackGrant | null | undefined, state: CheckState, rawIntent: unknown): Decision {
  const checkedAt = new Date(state.now).toISOString();
  const parsed = Intent.safeParse(rawIntent);
  const rawId = Uuid.safeParse((rawIntent as { id?: unknown } | null)?.id);
  const intentId = parsed.success ? parsed.data.id : rawId.success ? rawId.data : INVALID_INTENT_ID;

  const fail = new Set<RuleCode>();
  if (state.paused) fail.add("PAUSED");

  if (!parsed.success) {
    fail.add("INVALID_INTENT");
    return finish(intentId, fail, false, checkedAt);
  }
  const intent = parsed.data;

  if (intent.action === "HOLD") return finish(intent.id, fail, false, checkedAt);

  if (!VENUE_ACTIONS[intent.venue].includes(intent.action) || toUsd6(intent.sizeUsd) <= 0n) fail.add("INVALID_INTENT");
  if (!policy.venues.includes(intent.venue)) fail.add("VENUE_NOT_ALLOWED");
  if (!policy.markets.includes(intent.market)) fail.add("MARKET_NOT_ALLOWED");
  if (intent.confidence < policy.minConfidence) fail.add("LOW_CONFIDENCE");

  if (policy.requireSmartMoneyAgreement && increasesRisk(intent)) {
    const dir = intent.side === "LONG" || intent.side === "BUY" ? 1 : -1;
    const s = state.smartMoneyScore;
    if (s === null || s === 0 || Math.sign(s) !== dir) fail.add("NO_SMART_MONEY_AGREEMENT");
  }

  const baseLim = effectiveLimits(policy, null, state);
  const slackLim = effectiveLimits(policy, slack, state);
  const baseFails = limitFailures(intent, policy, state, baseLim);
  const withSlack = limitFailures(intent, policy, state, slackLim);
  withSlack.forEach((c) => fail.add(c));

  if (increasesRisk(intent)) {
    if (state.tradesLastHour >= policy.maxTradesPerHour) fail.add("RATE_LIMIT");
    if (state.lastTradeAt !== null && state.now - state.lastTradeAt < policy.cooldownSec * 1000) fail.add("COOLDOWN");
  }
  if (FUNDS_OUT.test(intent.market)) fail.add("CANNOT_WITHDRAW");

  // usedSlack: the intent is allowed, and it is allowed only because slack widened a limit.
  const usedSlack = fail.size === 0 && baseFails.length > 0;
  return finish(intent.id, fail, usedSlack, checkedAt);
}

function finish(intentId: string, fail: Set<RuleCode>, usedSlack: boolean, checkedAt: string): Decision {
  const reasons = RULE_CODES.filter((c) => fail.has(c));
  return {
    intentId,
    allowed: reasons.length === 0,
    reasons: reasons.length ? reasons : ["OK"],
    usedSlack,
    checkedAt,
  };
}

/** Slack requests are only for limit denials the user can widen. */
export const SLACKABLE_RULES: readonly RuleCode[] = ["LEVERAGE_EXCEEDS", "NOTIONAL_EXCEEDS"];

/** True when every failing reason is slackable (so slack alone could flip the decision). */
export function isSlackable(decision: Decision): boolean {
  return !decision.allowed && decision.reasons.every((r) => SLACKABLE_RULES.includes(r));
}
