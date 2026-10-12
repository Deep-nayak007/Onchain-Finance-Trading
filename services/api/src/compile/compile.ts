// Rules compiler: plain English → Policy (LLM JSON mode) → clamp to demo maxima → Leash Card → policyHash.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Policy, fromUsd6, policyHash, toUsd6, usdFromNumber, type PersonaId } from "@leash/shared";
import { z } from "zod";
import { completeJson, LlmError, type ChatJson } from "../llm/client";
import { PERSONA_DEFS } from "../personas";

export const DEMO_MAX = { leverage: 5, notionalUsd: "100", exposureUsd: "100", weeklyLossPct: 20 } as const;
export const KNOWN_MARKETS: Record<string, "PERPL" | "KURU"> = { "MON-PERP": "PERPL", "MON/AUSD": "KURU" };

const COMPILE_PROMPT = readFileSync(join(import.meta.dirname, "..", "llm", "prompts", "compile.md"), "utf8");

const usd = z.union([z.string(), z.number()]).transform((v) => (typeof v === "number" ? usdFromNumber(v) : v.trim()));
/** What we accept from the LLM: Policy with number→string coercion for money; validated again as Policy after clamping. */
const LlmPolicy = Policy.extend({
  version: z.union([z.literal(1), z.literal("1")]).transform(() => 1 as const),
  maxNotionalUsd: usd,
  maxTotalExposureUsd: usd,
  sleeveUsd: usd,
  maxTradesPerHour: z.number().transform((n) => Math.max(0, Math.round(n))),
  cooldownSec: z.number().transform((n) => Math.max(0, Math.round(n))),
});

export type CompileResult = { policy: Policy; policyHash: `0x${string}`; leashCard: string[]; warnings: string[]; model: string };

const minUsd = (a: string, b: string) => (toUsd6(a) <= toUsd6(b) ? a : b);

/** Clamp to demo maxima; one warning per clamp. Also drops unknown markets and fixes venue/market consistency. */
export function clampPolicy(input: Policy): { policy: Policy; warnings: string[] } {
  const w: string[] = [];
  const p: Policy = { ...input, markets: [...input.markets], venues: [...input.venues] };

  const unknown = p.markets.filter((m) => !(m in KNOWN_MARKETS));
  if (unknown.length) w.push(`Removed unsupported markets: ${unknown.join(", ")}.`);
  p.markets = p.markets.filter((m) => m in KNOWN_MARKETS);
  if (p.markets.length === 0) {
    p.markets = ["MON-PERP"];
    w.push("No supported market requested; using MON-PERP.");
  }
  const venues = [...new Set(p.markets.map((m) => KNOWN_MARKETS[m]!))].sort();
  if (venues.join() !== [...new Set(p.venues)].sort().join()) w.push(`Venues set to match markets: ${venues.join(", ")}.`);
  p.venues = venues;

  if (p.maxLeverage > DEMO_MAX.leverage) {
    w.push(`Leverage capped at ${DEMO_MAX.leverage}x (asked ${p.maxLeverage}x).`);
    p.maxLeverage = DEMO_MAX.leverage;
  }
  if (toUsd6(p.maxNotionalUsd) > toUsd6(DEMO_MAX.notionalUsd)) {
    w.push(`Trade size capped at $${DEMO_MAX.notionalUsd} (asked $${p.maxNotionalUsd}).`);
    p.maxNotionalUsd = DEMO_MAX.notionalUsd;
  }
  if (toUsd6(p.maxTotalExposureUsd) > toUsd6(DEMO_MAX.exposureUsd)) {
    w.push(`Total exposure capped at $${DEMO_MAX.exposureUsd} (asked $${p.maxTotalExposureUsd}).`);
    p.maxTotalExposureUsd = DEMO_MAX.exposureUsd;
  }
  if (toUsd6(p.maxTotalExposureUsd) < toUsd6(p.maxNotionalUsd)) {
    w.push("Total exposure raised to at least one trade's size.");
    p.maxTotalExposureUsd = p.maxNotionalUsd;
  }
  if (p.maxWeeklyLossPct > DEMO_MAX.weeklyLossPct) {
    w.push(`Weekly loss limit capped at ${DEMO_MAX.weeklyLossPct}% (asked ${p.maxWeeklyLossPct}%).`);
    p.maxWeeklyLossPct = DEMO_MAX.weeklyLossPct;
  }
  if (!p.venues.includes("KURU") && toUsd6(p.sleeveUsd) > 0n) {
    w.push("Spot sleeve set to $0 because Kuru isn't enabled.");
    p.sleeveUsd = "0";
  }
  p.sleeveUsd = minUsd(p.sleeveUsd, DEMO_MAX.notionalUsd);
  return { policy: Policy.parse(p), warnings: w };
}

const usdText = (s: string) => `$${fromUsd6(toUsd6(s))}`;

export function leashCard(p: Policy, persona: PersonaId): string[] {
  const name = PERSONA_DEFS[persona].name;
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
  const kuru = toUsd6(p.sleeveUsd) > 0n ? ` (up to ${usdText(p.sleeveUsd)} on Kuru spot to hedge)` : "";
  return [
    `${name} may trade ${p.markets.join(" and ")} only${kuru}.`,
    `Each trade is at most ${usdText(p.maxNotionalUsd)} with up to ${p.maxLeverage}x leverage; never more than ${usdText(p.maxTotalExposureUsd)} open at once.`,
    `If you're down ${p.maxWeeklyLossPct}% this week, trading stops until next week.`,
    `At most ${plural(p.maxTradesPerHour, "trade")} an hour, with at least ${plural(Math.round(p.cooldownSec / 60), "minute")} between trades.`,
    p.requireSmartMoneyAgreement ? `${name} only opens a trade when smart money (Nansen) agrees.` : `${name} acts on its own signals, and only when confident (≥ ${Math.round(p.minConfidence * 100)}%).`,
    "It can never withdraw your money. You can pull the leash any time.",
  ];
}

export async function compilePolicy(chat: ChatJson | null, model: string, text: string, persona: PersonaId): Promise<CompileResult> {
  const warnings: string[] = [];
  let raw: Policy;
  let usedModel = model;
  try {
    const { data } = await completeJson(chat, LlmPolicy, {
      model,
      system: COMPILE_PROMPT,
      user: JSON.stringify({ persona, personaStyle: PERSONA_DEFS[persona].style, rules: text }),
      temperature: 0,
    });
    const parsed = Policy.safeParse(data);
    if (!parsed.success) throw new LlmError(parsed.error.message, "invalid");
    raw = parsed.data;
  } catch (e) {
    raw = PERSONA_DEFS[persona].defaultPolicy;
    usedModel = "fallback-default-policy-v1";
    warnings.push(`Couldn't read your rules (${e instanceof LlmError ? e.kind : "error"}); using ${PERSONA_DEFS[persona].name}'s safe defaults.`);
  }
  const { policy, warnings: clampWarnings } = clampPolicy(raw);
  return { policy, policyHash: policyHash(policy), leashCard: leashCard(policy, persona), warnings: [...warnings, ...clampWarnings], model: usedModel };
}
