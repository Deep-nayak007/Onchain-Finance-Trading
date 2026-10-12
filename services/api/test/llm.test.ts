import { describe, expect, it } from "vitest";
import { Policy, policyHash } from "@leash/shared";
import { clampPolicy, compilePolicy, leashCard } from "../src/compile/compile";
import { completeJson, extractJson, LlmError } from "../src/llm/client";
import { FALLBACK_MODEL, fallbackIntent, IntentProposal, proposeIntent } from "../src/llm/propose";
import type { Snapshot } from "../src/signals/snapshot";
import { PERSONA_DEFS } from "../src/personas";
import { FakeChat, intentJson } from "./helpers";
import { effectiveLimits } from "@leash/shared";

const goodPolicy = {
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

describe("completeJson (JSON mode, zod, one retry)", () => {
  it("returns parsed data on the first valid reply", async () => {
    const chat = new FakeChat([JSON.stringify(goodPolicy)]);
    const r = await completeJson(chat, Policy, { model: "m", system: "s", user: "u" });
    expect(r.data.maxLeverage).toBe(3);
    expect(chat.calls).toHaveLength(1);
  });

  it("retries once with the validation error, then succeeds", async () => {
    const chat = new FakeChat([JSON.stringify({ ...goodPolicy, maxLeverage: "lots" }), JSON.stringify(goodPolicy)]);
    const r = await completeJson(chat, Policy, { model: "m", system: "s", user: "u" });
    expect(r.data.maxLeverage).toBe(3);
    expect(chat.calls).toHaveLength(2);
    const retry = chat.calls[1]!.history as { content: string }[];
    expect(retry.at(-1)!.content).toMatch(/maxLeverage/);
  });

  it("throws LlmError(invalid) after two bad replies", async () => {
    const chat = new FakeChat(["not json", "{}"]);
    await expect(completeJson(chat, Policy, { model: "m", system: "s", user: "u" })).rejects.toMatchObject({ kind: "invalid" });
  });

  it("throws LlmError(unconfigured) without a client and (transport) on network errors", async () => {
    await expect(completeJson(null, Policy, { model: "m", system: "s", user: "u" })).rejects.toBeInstanceOf(LlmError);
    await expect(completeJson(new FakeChat([new Error("timeout")]), Policy, { model: "m", system: "s", user: "u" })).rejects.toMatchObject({ kind: "transport" });
  });

  it("extractJson tolerates code fences", () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });
});

describe("rules compiler", () => {
  it("clamps to demo maxima with one warning per clamp", () => {
    const { policy, warnings } = clampPolicy({ ...goodPolicy, maxLeverage: 20, maxNotionalUsd: "500", maxTotalExposureUsd: "900", maxWeeklyLossPct: 50 } as Policy);
    expect(policy.maxLeverage).toBe(5);
    expect(policy.maxNotionalUsd).toBe("100");
    expect(policy.maxTotalExposureUsd).toBe("100");
    expect(policy.maxWeeklyLossPct).toBe(20);
    expect(warnings).toHaveLength(4);
  });

  it("drops unknown markets and keeps venues consistent", () => {
    const { policy, warnings } = clampPolicy({ ...goodPolicy, markets: ["BTC-PERP", "MON/AUSD"], venues: ["PERPL"], sleeveUsd: "20" } as Policy);
    expect(policy.markets).toEqual(["MON/AUSD"]);
    expect(policy.venues).toEqual(["KURU"]);
    expect(warnings.join(" ")).toMatch(/BTC-PERP/);
  });

  it("produces 4-6 plain-English Leash Card lines", () => {
    const lines = leashCard(goodPolicy as Policy, "falcon");
    expect(lines.length).toBeGreaterThanOrEqual(4);
    expect(lines.length).toBeLessThanOrEqual(6);
    expect(lines.join(" ")).toMatch(/never withdraw/i);
  });

  it("compiles via the LLM (numbers coerced to USD strings) and hashes canonically", async () => {
    const chat = new FakeChat([JSON.stringify({ ...goodPolicy, maxNotionalUsd: 40, sleeveUsd: 0 })]);
    const r = await compilePolicy(chat, "qwen-plus-character", "Small trades, max 3x, $40 a trade", "falcon");
    expect(r.policy.maxNotionalUsd).toBe("40");
    expect(r.policyHash).toBe(policyHash(r.policy));
    expect(r.model).toBe("qwen-plus-character");
    expect(chat.calls[0]!.system).toMatch(/JSON/);
  });

  it("falls back to the persona's safe defaults with a warning", async () => {
    const r = await compilePolicy(new FakeChat(["nope", "still nope"]), "m", "whatever", "otter");
    expect(r.policy).toEqual(clampPolicy(PERSONA_DEFS.otter.defaultPolicy).policy);
    expect(r.warnings[0]).toMatch(/safe defaults/);
  });
});

const snap = (score: number | null): Snapshot => ({
  ts: "2026-10-12T12:00:00.000Z",
  smartMoneyScore: score,
  nansen: null,
  perpl: { market: "MON-PERP", mark: "2.43", index: "2.43", fundingRate: "0.00001" },
  risk: null,
  envio: null,
});
const input = (score: number | null) => {
  const policy = PERSONA_DEFS.falcon.defaultPolicy;
  return { persona: "falcon" as const, policy, limits: effectiveLimits(policy, null, { now: 0 }), snapshot: snap(score), now: Date.parse("2026-10-12T12:00:00.000Z") };
};

describe("intent proposal", () => {
  it("accepts a valid LLM proposal and stamps id/ts/persona", async () => {
    const p = await proposeIntent(new FakeChat([intentJson({ sizeUsd: 12.5 })]), "qwen-flash-character", input(0.7));
    expect(p.model).toBe("qwen-flash-character");
    expect(p.intent.sizeUsd).toBe("12.5");
    expect(p.intent.persona).toBe("falcon");
  });

  it("falls back to rules when the LLM fails twice", async () => {
    const p = await proposeIntent(new FakeChat(["{}", "{}"]), "m", input(0.7));
    expect(p.model).toBe(FALLBACK_MODEL);
    expect(p.intent).toMatchObject({ action: "OPEN", side: "LONG", sizeUsd: "10", leverage: 2 });
    expect(p.llmError).toMatch(/invalid/);
  });

  it("fallback: follows score sign only when |score| ≥ 0.5", () => {
    expect(fallbackIntent(input(-0.6))).toMatchObject({ action: "OPEN", side: "SHORT" });
    expect(fallbackIntent(input(0.3)).action).toBe("HOLD");
    expect(fallbackIntent(input(null)).action).toBe("HOLD");
  });

  it("IntentProposal rejects out-of-range confidence", () => {
    expect(IntentProposal.safeParse(JSON.parse(intentJson({ confidence: 2 }))).success).toBe(false);
  });
});
