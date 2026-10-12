import { describe, expect, it } from "vitest";
import { checkIntent, effectiveLimits, isSlackable, type CheckState, type SlackGrant } from "../src/risk/checkIntent";
import { Decision, RULE_CODES, type Intent, type Policy, type RuleCode } from "../src/schemas";

const NOW = Date.parse("2026-10-12T12:00:00.000Z");

const policy: Policy = {
  version: 1,
  markets: ["MON-PERP", "MON/AUSD"],
  venues: ["PERPL", "KURU"],
  maxLeverage: 3,
  maxNotionalUsd: "50",
  maxTotalExposureUsd: "100",
  maxWeeklyLossPct: 10,
  maxTradesPerHour: 4,
  cooldownSec: 300,
  requireSmartMoneyAgreement: true,
  minConfidence: 0.6,
  sleeveUsd: "30",
};

const state: CheckState = {
  now: NOW,
  paused: false,
  positions: [],
  totalExposureUsd: "0",
  weeklyPnlPct: 0,
  equityUsd: "100",
  tradesLastHour: 0,
  lastTradeAt: null,
  smartMoneyScore: 0.6,
};

const intent: Intent = {
  id: "3f1c2a8e-7b4d-4e2a-9c61-0d5b8e7f1a01",
  ts: "2026-10-12T12:00:00.000Z",
  persona: "falcon",
  action: "OPEN",
  venue: "PERPL",
  market: "MON-PERP",
  side: "LONG",
  sizeUsd: "25",
  leverage: 2,
  confidence: 0.8,
  rationale: "test",
  signals: [],
};

const slack: SlackGrant = { active: true, maxLeverage: 5, maxNotionalUsd: "80", extraRiskUsd: "8", expiresAt: NOW / 1000 + 3600 };
const expiredSlack: SlackGrant = { ...slack, expiresAt: NOW / 1000 - 1 };
const inactiveSlack: SlackGrant = { ...slack, active: false };

type Case = {
  name: string;
  intent?: Partial<Intent> | unknown;
  state?: Partial<CheckState>;
  policy?: Partial<Policy>;
  slack?: SlackGrant | null;
  reasons: RuleCode[];
  usedSlack?: boolean;
};

const cases: Case[] = [
  { name: "happy path → OK", reasons: ["OK"] },
  { name: "paused", state: { paused: true }, reasons: ["PAUSED"] },
  { name: "garbage LLM payload → INVALID_INTENT", intent: { foo: 1 }, reasons: ["INVALID_INTENT"] },
  { name: "rationale > 500 chars → INVALID_INTENT", intent: { rationale: "x".repeat(501) }, reasons: ["INVALID_INTENT"] },
  { name: "SWAP on PERPL → INVALID_INTENT", intent: { action: "SWAP" }, reasons: ["INVALID_INTENT"] },
  { name: "zero size OPEN → INVALID_INTENT", intent: { sizeUsd: "0" }, reasons: ["INVALID_INTENT"] },
  { name: "venue not allowed", policy: { venues: ["KURU"] }, reasons: ["VENUE_NOT_ALLOWED"] },
  { name: "market not allowed", intent: { market: "BTC-PERP" }, reasons: ["MARKET_NOT_ALLOWED"] },
  { name: "low confidence", intent: { confidence: 0.59 }, reasons: ["LOW_CONFIDENCE"] },
  { name: "confidence exactly at min passes", intent: { confidence: 0.6 }, reasons: ["OK"] },
  { name: "smart money disagrees (short vs positive score)", intent: { side: "SHORT" }, reasons: ["NO_SMART_MONEY_AGREEMENT"] },
  { name: "smart money unknown", state: { smartMoneyScore: null }, reasons: ["NO_SMART_MONEY_AGREEMENT"] },
  { name: "smart money zero", state: { smartMoneyScore: 0 }, reasons: ["NO_SMART_MONEY_AGREEMENT"] },
  { name: "smart money not required", state: { smartMoneyScore: -1 }, policy: { requireSmartMoneyAgreement: false }, reasons: ["OK"] },
  { name: "short agrees with negative score", intent: { side: "SHORT" }, state: { smartMoneyScore: -0.5 }, reasons: ["OK"] },
  { name: "leverage exceeds", intent: { leverage: 3.5 }, reasons: ["LEVERAGE_EXCEEDS"] },
  { name: "leverage at limit passes", intent: { leverage: 3 }, reasons: ["OK"] },
  { name: "notional exceeds", intent: { sizeUsd: "50.000001" }, reasons: ["NOTIONAL_EXCEEDS"] },
  { name: "exposure exceeds", state: { totalExposureUsd: "80" }, reasons: ["EXPOSURE_EXCEEDS"] },
  { name: "weekly loss limit hit", state: { weeklyPnlPct: -10 }, reasons: ["WEEKLY_LOSS_LIMIT"] },
  { name: "rate limit", state: { tradesLastHour: 4 }, reasons: ["RATE_LIMIT"] },
  { name: "cooldown", state: { lastTradeAt: NOW - 299_000 }, reasons: ["COOLDOWN"] },
  { name: "cooldown elapsed", state: { lastTradeAt: NOW - 300_000 }, reasons: ["OK"] },
  { name: "withdraw-like market → CANNOT_WITHDRAW", intent: { market: "WITHDRAW" }, reasons: ["MARKET_NOT_ALLOWED", "CANNOT_WITHDRAW"] },
  {
    name: "send to address → CANNOT_WITHDRAW",
    intent: { venue: "KURU", action: "SWAP", side: "SELL", market: "0x00000000000000000000000000000000000a11ce" },
    state: { smartMoneyScore: -0.4 },
    reasons: ["MARKET_NOT_ALLOWED", "CANNOT_WITHDRAW"],
  },
  {
    name: "multi-reason denial keeps rule order",
    intent: { leverage: 5, sizeUsd: "80", confidence: 0.5 },
    state: { paused: true, tradesLastHour: 9 },
    reasons: ["PAUSED", "LOW_CONFIDENCE", "LEVERAGE_EXCEEDS", "NOTIONAL_EXCEEDS", "RATE_LIMIT"],
  },
  // slack
  { name: "slack active: 5x $80 passes, usedSlack", intent: { leverage: 5, sizeUsd: "80" }, slack, reasons: ["OK"], usedSlack: true },
  { name: "slack active but not needed: usedSlack false", slack, reasons: ["OK"], usedSlack: false },
  { name: "slack active but ask exceeds slack", intent: { leverage: 6 }, slack, reasons: ["LEVERAGE_EXCEEDS"] },
  { name: "slack expired → base limits", intent: { leverage: 5, sizeUsd: "80" }, slack: expiredSlack, reasons: ["LEVERAGE_EXCEEDS", "NOTIONAL_EXCEEDS"] },
  { name: "slack inactive → base limits", intent: { leverage: 5 }, slack: inactiveSlack, reasons: ["LEVERAGE_EXCEEDS"] },
  { name: "slack absent → base limits", intent: { leverage: 5 }, slack: null, reasons: ["LEVERAGE_EXCEEDS"] },
  { name: "slack extra risk widens weekly loss budget (10% + $8/$100)", state: { weeklyPnlPct: -12 }, slack, reasons: ["OK"], usedSlack: true },
  { name: "slack extra risk exhausted", state: { weeklyPnlPct: -18 }, slack, reasons: ["WEEKLY_LOSS_LIMIT"] },
  { name: "slack does not bypass other rules", intent: { leverage: 5, confidence: 0.1 }, slack, reasons: ["LOW_CONFIDENCE"] },
  // risk-reducing and no-op actions
  { name: "HOLD is an allowed no-op", intent: { action: "HOLD", sizeUsd: "0", leverage: 0, confidence: 0 }, reasons: ["OK"] },
  {
    name: "CLOSE bypasses limit rules",
    intent: { action: "CLOSE", leverage: 10, sizeUsd: "500", side: "SHORT" },
    state: { weeklyPnlPct: -50, tradesLastHour: 99, lastTradeAt: NOW, totalExposureUsd: "1000" },
    reasons: ["OK"],
  },
  { name: "REDUCE still blocked when paused", intent: { action: "REDUCE" }, state: { paused: true }, reasons: ["PAUSED"] },
  {
    name: "Kuru SWAP within sleeve",
    intent: { venue: "KURU", action: "SWAP", market: "MON/AUSD", side: "BUY", leverage: 1, sizeUsd: "20" },
    reasons: ["OK"],
  },
];

describe("checkIntent (table)", () => {
  it.each(cases)("$name", (c) => {
    const i = c.intent && typeof c.intent === "object" && "foo" in c.intent ? c.intent : { ...intent, ...(c.intent as Partial<Intent>) };
    const d = checkIntent({ ...policy, ...c.policy }, c.slack ?? null, { ...state, ...c.state }, i);
    expect(d.reasons).toEqual(c.reasons);
    expect(d.allowed).toBe(c.reasons[0] === "OK");
    expect(d.usedSlack).toBe(c.usedSlack ?? false);
    expect(Decision.safeParse(d).success).toBe(true);
  });
});

describe("checkIntent properties", () => {
  it("has ≥ 25 cases and covers every RuleCode", () => {
    expect(cases.length).toBeGreaterThanOrEqual(25);
    const covered = new Set(cases.flatMap((c) => c.reasons));
    expect(RULE_CODES.filter((r) => !covered.has(r))).toEqual([]);
  });

  it("is deterministic and uses state.now for checkedAt", () => {
    const a = checkIntent(policy, null, state, intent);
    const b = checkIntent(policy, null, state, intent);
    expect(a).toEqual(b);
    expect(a.checkedAt).toBe("2026-10-12T12:00:00.000Z");
    expect(a.intentId).toBe(intent.id);
  });

  it("keeps a valid intentId even for invalid payloads", () => {
    expect(checkIntent(policy, null, state, { id: intent.id }).intentId).toBe(intent.id);
    expect(Decision.safeParse(checkIntent(policy, null, state, null)).success).toBe(true);
  });

  it("effectiveLimits switches to slack values only while live", () => {
    expect(effectiveLimits(policy, slack, state).maxLeverage).toBe(5);
    expect(effectiveLimits(policy, expiredSlack, state).maxLeverage).toBe(3);
  });

  it("isSlackable only for pure leverage/notional denials", () => {
    expect(isSlackable(checkIntent(policy, null, state, { ...intent, leverage: 5, sizeUsd: "80" }))).toBe(true);
    expect(isSlackable(checkIntent(policy, null, state, { ...intent, leverage: 5, confidence: 0.1 }))).toBe(false);
    expect(isSlackable(checkIntent(policy, null, state, intent))).toBe(false);
  });
});
