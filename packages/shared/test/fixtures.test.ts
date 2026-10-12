import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { z } from "zod";
import { policyHash, reasonHash, signalHash } from "../src/canonical";
import { Decision, Intent, Persona, Policy, ReceiptDetail, RiskSnapshot, SlackRequest, TxRequest } from "../src/schemas";

const load = (name: string): unknown => JSON.parse(readFileSync(join(import.meta.dirname, "..", "fixtures", name), "utf8"));

// parse() strips unknown keys, so toEqual(input) also catches typos / extra fields.
function expectValid(schema: z.ZodType, value: unknown) {
  const res = schema.safeParse(value);
  if (!res.success) throw new Error(res.error.message);
  expect(res.data).toEqual(value);
}

const records = (name: string) => Object.entries(load(name) as Record<string, unknown>);

describe("fixtures validate against schemas", () => {
  it("policy.json", () => expectValid(Policy, load("policy.json")));
  it("traders.json: Falcon LIVE, Otter + Owl SHADOW", () => {
    const traders = load("traders.json") as unknown[];
    traders.forEach((t) => expectValid(Persona, t));
    const modes = Object.fromEntries((traders as { id: string; mode: string }[]).map((t) => [t.id, t.mode]));
    expect(modes).toEqual({ falcon: "LIVE", otter: "SHADOW", owl: "SHADOW" });
  });
  it.each(records("intents.json"))("intents.json %s", (_k, v) => expectValid(Intent, v));
  it.each(records("decisions.json"))("decisions.json %s", (_k, v) => expectValid(Decision, v));
  it("slack-request.json", () => expectValid(SlackRequest, load("slack-request.json")));
  it("risk-snapshot.json", () => expectValid(RiskSnapshot, load("risk-snapshot.json")));
  it("tx-request.json", () => expectValid(TxRequest, load("tx-request.json")));
});

describe("receipt fixtures", () => {
  const files = ["receipt-executed.json", "receipt-rejected.json", "receipt-shadow.json"];

  it.each(files)("%s validates and its hashes recompute", (f) => {
    const r = load(f) as ReceiptDetail;
    expectValid(ReceiptDetail, r);
    expect(r.reasonHash).toBe(reasonHash({ intent: r.intent, decision: r.decision }));
    expect(r.signalHash).toBe(signalHash(r.signalsSnapshot));
    expect(r.decision.intentId).toBe(r.intent.id);
  });

  it("covers EXECUTED, REJECTED (+ slack request) and SHADOW", () => {
    const executed = load("receipt-executed.json") as ReceiptDetail;
    const rejected = load("receipt-rejected.json") as ReceiptDetail;
    const shadow = load("receipt-shadow.json") as ReceiptDetail;
    const slack = load("slack-request.json") as SlackRequest;

    expect(executed.decision.allowed).toBe(true);
    expect(executed.execTxHash).not.toBeNull();

    expect(rejected.decision.allowed).toBe(false);
    expect(rejected.decision.reasons).toContain(slack.rule);
    expect(slack.intentId).toBe(rejected.intent.id);

    const traders = load("traders.json") as Persona[];
    expect(traders.find((t) => t.id === shadow.intent.persona)?.mode).toBe("SHADOW");
    expect(shadow.execTxHash).toBeNull();
  });

  it("policy-hash.json matches policy.json", () => {
    expect((load("policy-hash.json") as { policyHash: string }).policyHash).toBe(policyHash(load("policy.json")));
  });
});
