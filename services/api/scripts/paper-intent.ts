// Dev/demo tool: submit ONE hand-written intent for an active user through the real path
// (mandate + slack from chain → checkIntent → paper execution → ReceiptDetail → logReceipt onchain).
// The receipt's model is "manual-paper-test" so it can never be mistaken for an LLM decision.
//
//   CHAIN_ID=10143 pnpm tsx scripts/paper-intent.ts <account> OPEN LONG 10 2 0.8
//   CHAIN_ID=10143 pnpm tsx scripts/paper-intent.ts otter OPEN SHORT 10 1 0.8     (shadow persona → logShadow)
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { Intent } from "@leash/shared";
import type { Address } from "viem";
import { PERSONA_IDS } from "../src/personas";
import { buildApp } from "../src/app";
import { loadConfig } from "../src/config";

const [account, action = "OPEN", side = "LONG", sizeUsd = "10", leverage = "2", confidence = "0.8"] = process.argv.slice(2);
if (!account) {
  console.error("usage: paper-intent.ts <account> [action side sizeUsd leverage confidence]");
  process.exit(1);
}
const cfg = loadConfig();
if (cfg.LIVE) {
  console.error("refusing: paper-intent only runs with LIVE=false");
  process.exit(1);
}
const { deps, summary } = buildApp(cfg);
console.log(`[paper-intent] ${summary}`);

const intent = Intent.parse({
  id: randomUUID(),
  ts: new Date().toISOString(),
  persona: PERSONA_IDS.includes(account as never) ? account : "falcon",
  action,
  venue: "PERPL",
  market: "MON-PERP",
  side,
  sizeUsd,
  leverage: Number(leverage),
  confidence: Number(confidence),
  rationale: "Manual paper test submitted by the Brain operator to verify the receipt path.",
  signals: [],
});
const r = PERSONA_IDS.includes(account as never)
  ? await deps.engine.submitShadowIntent(account as "otter", intent, "manual-paper-test")
  : await deps.engine.submitIntent(account as Address, intent, "manual-paper-test");
if (r.kind !== "decided") {
  console.log(`[paper-intent] ${r.kind}${"reason" in r ? `: ${r.reason}` : ""}`);
  process.exit(0);
}
const stored = deps.store.getReceipt(r.detail.reasonHash);
console.log(
  JSON.stringify(
    {
      status: r.status,
      reasons: r.detail.decision.reasons,
      usedSlack: r.detail.decision.usedSlack,
      reasonHash: r.detail.reasonHash,
      signalHash: r.detail.signalHash,
      decidedAtMs: r.detail.decidedAtMs,
      confirmedAtMs: stored?.confirmedAtMs ?? null,
      latencyMs: stored?.confirmedAtMs ? stored.confirmedAtMs - r.detail.decidedAtMs : null,
      slackRequestId: r.slackRequestId ?? null,
    },
    null,
    2,
  ),
);
process.exit(0);
