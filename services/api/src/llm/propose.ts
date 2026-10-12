// Intent proposal: LLM (JSON mode) → zod → Intent. On any LLM failure: deterministic fallback.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { Intent, IntentAction, Side, Signal, Venue, usdFromNumber, type PersonaId, type Policy } from "@leash/shared";
import { z } from "zod";
import type { EffectiveLimits } from "@leash/shared";
import { completeJson, LlmError, type ChatJson } from "./client";
import type { Snapshot } from "../signals/snapshot";

export const FALLBACK_MODEL = "fallback-rules-v1";

const promptDir = join(import.meta.dirname, "prompts");
const read = (f: string) => readFileSync(join(promptDir, f), "utf8");
const INTENT_SCHEMA = read("_intent_schema.md");

export function personaSystemPrompt(persona: PersonaId): string {
  return `${read(`${persona}.md`)}\n\n${INTENT_SCHEMA}`;
}

/** Lenient on number-vs-string for money fields (models often emit numbers), strict on everything else. */
const usd = z.union([z.string(), z.number()]).transform((v, ctx) => {
  const s = typeof v === "number" ? usdFromNumber(v) : v.trim();
  if (!/^\d+(\.\d{1,6})?$/.test(s)) ctx.addIssue({ code: "custom", message: "sizeUsd must be a non-negative USD decimal string" });
  return s;
});

const IntentProposalStrict = z.object({
  action: IntentAction,
  venue: Venue,
  market: z.string().min(1),
  side: Side,
  sizeUsd: usd,
  leverage: z.number().min(0),
  confidence: z.number().min(0).max(1),
  rationale: z.string().min(1).max(500),
  signals: z.array(Signal).max(8).default([]),
});

/** HOLD needs no venue/market/side (models often omit them); fill safe defaults for HOLD only. Trades stay strict. */
export function intentProposalSchema(defaultMarket = "MON-PERP") {
  return z.preprocess((v) => {
    if (!v || typeof v !== "object" || (v as { action?: unknown }).action !== "HOLD") return v;
    const o = v as Record<string, unknown>;
    return {
      venue: "PERPL",
      market: defaultMarket,
      side: "LONG",
      sizeUsd: "0",
      leverage: 0,
      confidence: 0,
      rationale: "Holding: nothing changed enough to act.",
      ...Object.fromEntries(Object.entries(o).filter(([, x]) => x !== null && x !== "")),
    };
  }, IntentProposalStrict);
}
export const IntentProposal = intentProposalSchema();
export type IntentProposal = z.infer<typeof IntentProposalStrict>;

export type ProposeInput = {
  persona: PersonaId;
  policy: Policy;
  limits: EffectiveLimits;
  snapshot: Snapshot;
  now: number;
};

export type Proposal = { intent: Intent; model: string; llmError?: string };

function toIntent(p: IntentProposal, input: ProposeInput): Intent {
  return Intent.parse({ ...p, id: randomUUID(), ts: new Date(input.now).toISOString(), persona: input.persona, rationale: p.rationale.slice(0, 500) });
}

export function userPrompt(input: ProposeInput): string {
  const { policy, limits, snapshot } = input;
  return JSON.stringify({
    allowedMarkets: policy.markets,
    allowedVenues: policy.venues,
    effectiveLimits: { maxLeverage: limits.maxLeverage, maxNotionalUsd: Number(limits.maxNotionalUsd6) / 1e6, maxWeeklyLossPct: limits.maxWeeklyLossPct },
    minConfidence: policy.minConfidence,
    requireSmartMoneyAgreement: policy.requireSmartMoneyAgreement,
    signals: snapshot,
  });
}

/** Deterministic strategy: follow smartMoneyScore sign, 2x, $10, only when |score| ≥ 0.5. */
export function fallbackIntent(input: ProposeInput): Intent {
  const s = input.snapshot.smartMoneyScore;
  const market = input.policy.markets.find((m) => m.endsWith("-PERP")) ?? input.policy.markets[0] ?? "MON-PERP";
  const base = { venue: "PERPL" as const, market, signals: s === null ? [] : [{ source: "nansen" as const, key: "smartMoneyScore", value: String(s) }] };
  if (s === null || Math.abs(s) < 0.5) {
    return toIntent(
      { ...base, action: "HOLD", side: "LONG", sizeUsd: "0", leverage: 0, confidence: 0, rationale: "Fallback rules: smart-money signal too weak to act; holding." },
      input,
    );
  }
  return toIntent(
    {
      ...base,
      action: "OPEN",
      side: s > 0 ? "LONG" : "SHORT",
      sizeUsd: "10",
      leverage: 2,
      confidence: Math.min(1, Math.abs(s)),
      rationale: `Fallback rules: smart money is net ${s > 0 ? "buying" : "selling"} (score ${s.toFixed(2)}), so a small ${s > 0 ? "long" : "short"} at 2x.`,
    },
    input,
  );
}

export async function proposeIntent(chat: ChatJson | null, model: string, input: ProposeInput): Promise<Proposal> {
  try {
    const market = input.policy.markets.find((m) => m.endsWith("-PERP")) ?? input.policy.markets[0];
    const { data } = await completeJson(chat, intentProposalSchema(market), { model, system: personaSystemPrompt(input.persona), user: userPrompt(input) });
    return { intent: toIntent(data, input), model };
  } catch (e) {
    const msg = e instanceof LlmError ? `${e.kind}: ${e.message}` : (e as Error).message;
    return { intent: fallbackIntent(input), model: FALLBACK_MODEL, llmError: msg };
  }
}
