// Regenerates packages/shared/fixtures/*.json (run: pnpm --filter @leash/shared fixtures).
// Hashes are computed with the real canonical.ts so Face can verify them on device.
// All addresses, agentIds and tx hashes below are PLACEHOLDERS (0x000…), not deployed contracts.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { policyHash, reasonHash, signalHash } from "../src/canonical";
import type { Decision, Intent, Persona, Policy, ReceiptDetail, RiskSnapshot, SlackRequest, TxRequest } from "../src/schemas";

const dir = join(import.meta.dirname, "..", "fixtures");
const write = (name: string, value: unknown) => writeFileSync(join(dir, name), `${JSON.stringify(value, null, 2)}\n`);

const USER = "0x00000000000000000000000000000000000a11ce";
const placeholder = (n: number) => `0x${n.toString(16).padStart(40, "0")}`;
const t0 = Date.parse("2026-10-12T05:00:00.000Z");
const iso = (ms: number) => new Date(ms).toISOString();

const falconPolicy: Policy = {
  version: 1,
  markets: ["MON-PERP"],
  venues: ["PERPL"],
  maxLeverage: 3,
  maxNotionalUsd: "50",
  maxTotalExposureUsd: "100",
  maxWeeklyLossPct: 10,
  maxTradesPerHour: 4,
  cooldownSec: 300,
  requireSmartMoneyAgreement: true,
  minConfidence: 0.6,
  sleeveUsd: "0",
};

const traders: Persona[] = [
  {
    id: "falcon",
    agentId: "1",
    name: "Falcon",
    style: "Momentum. Follows smart money (Nansen) into strength.",
    mode: "LIVE",
    wallet: placeholder(0xf1),
    defaultPolicy: falconPolicy,
  },
  {
    id: "otter",
    agentId: "2",
    name: "Otter",
    style: "Mean reversion. Small size, long cooldowns.",
    mode: "SHADOW",
    wallet: placeholder(0xf2),
    defaultPolicy: {
      ...falconPolicy,
      maxLeverage: 2,
      maxNotionalUsd: "20",
      maxTotalExposureUsd: "40",
      maxTradesPerHour: 2,
      cooldownSec: 1800,
      requireSmartMoneyAgreement: false,
      minConfidence: 0.65,
    },
  },
  {
    id: "owl",
    agentId: "3",
    name: "Owl",
    style: "Funding harvester. Hedges spot on Kuru.",
    mode: "SHADOW",
    wallet: placeholder(0xf3),
    defaultPolicy: {
      ...falconPolicy,
      markets: ["MON-PERP", "MON/AUSD"],
      venues: ["PERPL", "KURU"],
      maxLeverage: 2,
      maxNotionalUsd: "30",
      maxTotalExposureUsd: "60",
      maxTradesPerHour: 2,
      cooldownSec: 900,
      requireSmartMoneyAgreement: false,
      sleeveUsd: "30",
    },
  },
];

const signals: Intent["signals"] = [
  { source: "nansen", key: "smartMoneyNetflow24hUsd", value: "182000" },
  { source: "nansen", key: "smartMoneyScore", value: "0.64" },
  { source: "perpl", key: "markChange1hPct", value: "1.8" },
];

const signalsSnapshot = {
  ts: iso(t0 - 5_000),
  smartMoneyScore: 0.64,
  nansen: { token: "MON", smartMoneyNetflow24hUsd: "182000", topBuyers: 7, topSellers: 2 },
  perpl: { market: "MON-PERP", mark: "0.0412", index: "0.0411", fundingRate: "0.0001", markChange1hPct: 1.8 },
  envio: { recentReceipts: 3, openPositions: 0 },
};

const intents = {
  executed: {
    id: "3f1c2a8e-7b4d-4e2a-9c61-0d5b8e7f1a01",
    ts: iso(t0),
    persona: "falcon",
    action: "OPEN",
    venue: "PERPL",
    market: "MON-PERP",
    side: "LONG",
    sizeUsd: "25",
    leverage: 2,
    confidence: 0.78,
    rationale: "Smart money net inflow of $182k over 24h and mark up 1.8% in the last hour. Small momentum long within limits.",
    signals,
  },
  rejected: {
    id: "8a2e4c6b-1d3f-4a5b-8c7d-9e0f1a2b3c02",
    ts: iso(t0 + 60_000),
    persona: "falcon",
    action: "OPEN",
    venue: "PERPL",
    market: "MON-PERP",
    side: "LONG",
    sizeUsd: "80",
    leverage: 5,
    confidence: 0.82,
    rationale: "Breakout confirmed by smart-money accumulation; conviction high enough to press with 5x on $80.",
    signals,
  },
  shadow: {
    id: "c4d5e6f7-a8b9-4c0d-9e1f-2a3b4c5d6e03",
    ts: iso(t0 + 120_000),
    persona: "otter",
    action: "OPEN",
    venue: "PERPL",
    market: "MON-PERP",
    side: "SHORT",
    sizeUsd: "15",
    leverage: 1.5,
    confidence: 0.7,
    rationale: "Price stretched 2.1 standard deviations above its 4h mean; fading the move with small size.",
    signals: [{ source: "perpl", key: "zScore4h", value: "2.1" }],
  },
  hold: {
    id: "e7f8a9b0-c1d2-4e3f-8a4b-5c6d7e8f9a04",
    ts: iso(t0 + 180_000),
    persona: "falcon",
    action: "HOLD",
    venue: "PERPL",
    market: "MON-PERP",
    side: "LONG",
    sizeUsd: "0",
    leverage: 0,
    confidence: 0.4,
    rationale: "No meaningful change in signals since the last tick.",
    signals: [],
  },
} satisfies Record<string, Intent>;

const decisions = {
  executed: { intentId: intents.executed.id, allowed: true, reasons: ["OK"], usedSlack: false, checkedAt: iso(t0 + 40) },
  rejected: {
    intentId: intents.rejected.id,
    allowed: false,
    reasons: ["LEVERAGE_EXCEEDS", "NOTIONAL_EXCEEDS"],
    usedSlack: false,
    checkedAt: iso(t0 + 60_040),
  },
  shadow: { intentId: intents.shadow.id, allowed: true, reasons: ["OK"], usedSlack: false, checkedAt: iso(t0 + 120_040) },
  hold: { intentId: intents.hold.id, allowed: true, reasons: ["OK"], usedSlack: false, checkedAt: iso(t0 + 180_040) },
} satisfies Record<string, Decision>;

const receipt = (k: "executed" | "rejected" | "shadow", extra: Pick<ReceiptDetail, "model" | "decidedAtMs" | "confirmedAtMs" | "execTxHash">): ReceiptDetail => ({
  reasonHash: reasonHash({ intent: intents[k], decision: decisions[k] }),
  signalHash: signalHash(signalsSnapshot),
  intent: intents[k],
  decision: decisions[k],
  signalsSnapshot,
  ...extra,
});

const slackRequest: SlackRequest = {
  id: "5b6c7d8e-9f0a-4b1c-8d2e-3f4a5b6c7d05",
  account: USER,
  persona: "falcon",
  intentId: intents.rejected.id,
  rule: "LEVERAGE_EXCEEDS",
  requested: { maxLeverage: 5, maxNotionalUsd: "80", extraRiskUsd: "8", durationSec: 3600 },
  why: [
    { text: "Smart money bought $182k of MON in 24h", source: "nansen" },
    { text: "Mark up 1.8% in the last hour", source: "perpl" },
    { text: "Max extra loss capped at $8", source: "leash" },
  ],
  createdAt: iso(t0 + 60_100),
  expiresAt: iso(t0 + 60_100 + 600_000),
  status: "PENDING",
};

const riskSnapshot: RiskSnapshot = {
  account: USER,
  ts: Math.floor((t0 + 30_000) / 1000),
  equityUsd: "101.25",
  collateralUsd: "100",
  marginUsedUsd: "12.5",
  weeklyPnlPct: "1.25",
  fundingPaidUsd: "0.03",
  slackLeftUsd: "0",
  positions: [
    {
      market: "MON-PERP",
      side: "LONG",
      sizeUsd: "25",
      entryPrice: "0.0412",
      markPrice: "0.0414",
      liqPrice: "0.0215",
      liqDistancePct: "48.07",
      unrealizedPnlUsd: "0.121359",
    },
  ],
  exposureByMarket: { "MON-PERP": "25" },
};

const txRequest: TxRequest = { to: placeholder(0xc0), data: "0x", value: "0", gas: "23100", chainId: 10143 };

write("policy.json", falconPolicy);
write("traders.json", traders);
write("intents.json", intents);
write("decisions.json", decisions);
write("signals-snapshot.json", signalsSnapshot);
write("receipt-executed.json", receipt("executed", { model: "qwen-flash-character", decidedAtMs: t0 + 40, confirmedAtMs: t0 + 452, execTxHash: `0x${"ab".repeat(32)}` }));
write("receipt-rejected.json", receipt("rejected", { model: "qwen-flash-character", decidedAtMs: t0 + 60_040, confirmedAtMs: t0 + 60_431, execTxHash: null }));
write("receipt-shadow.json", receipt("shadow", { model: "qwen-flash-character", decidedAtMs: t0 + 120_040, confirmedAtMs: t0 + 120_418, execTxHash: null }));
write("slack-request.json", slackRequest);
write("risk-snapshot.json", riskSnapshot);
write("tx-request.json", txRequest);
write("policy-hash.json", { policyHash: policyHash(falconPolicy) });
console.log(`fixtures written to ${dir}`);
