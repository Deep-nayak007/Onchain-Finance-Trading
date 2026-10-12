import { describe, expect, it } from "vitest";
import { ReceiptDetail, reasonHash, signalHash, type Policy } from "@leash/shared";
import { PERSONA_DEFS } from "../src/personas";
import { changedMeaningfully } from "../src/signals/snapshot";
import { FakeRegistry, intentJson, makeEngine, USER } from "./helpers";

const policy: Policy = { ...PERSONA_DEFS.falcon.defaultPolicy, maxLeverage: 3, maxNotionalUsd: "25", maxTotalExposureUsd: "100" };

function running(store: ReturnType<typeof makeEngine>["store"]) {
  store.upsertUser({ account: USER, persona: "falcon", policy, policyHash: "0x01", state: "RUNNING" });
}

describe("engine.tickUser (paper)", () => {
  it("allowed intent → EXECUTED receipt (paper), hashes recompute, no venue call", async () => {
    const { engine, store, sink } = makeEngine({ replies: [intentJson()] });
    running(store);
    const r = await engine.tickUser(USER);
    expect(r.kind).toBe("decided");
    if (r.kind !== "decided") return;
    expect(r.status).toBe("EXECUTED");
    expect(r.detail.execTxHash).toBeNull();
    expect(ReceiptDetail.parse(r.detail)).toBeTruthy();
    expect(r.detail.reasonHash).toBe(reasonHash({ intent: r.detail.intent, decision: r.detail.decision }));
    expect(r.detail.signalHash).toBe(signalHash(r.detail.signalsSnapshot));
    expect(store.getReceipt(r.detail.reasonHash)?.intent.id).toBe(r.detail.intent.id);
    expect(sink.logged).toHaveLength(1);
    expect(store.getUser(USER)?.lastDecision).toMatchObject({ allowed: true });
  });

  it("LIVE: executes through the gateway with idempotencyKey = intent.id", async () => {
    const { engine, store } = makeEngine({ replies: [intentJson()], live: true });
    running(store);
    const r = await engine.tickUser(USER);
    expect(r.kind === "decided" && r.status).toBe("EXECUTED");
    if (r.kind === "decided") expect(r.detail.execTxHash).toMatch(/^0x0+1$/);
  });

  it("LIVE: venue refusal → FAILED receipt, never throws", async () => {
    const { engine, store } = makeEngine({ replies: [intentJson({ sizeUsd: "60" })], live: true });
    store.upsertUser({ account: USER, persona: "falcon", policy: { ...policy, maxNotionalUsd: "100", maxTotalExposureUsd: "500" }, policyHash: "0x01", state: "RUNNING" });
    const r = await engine.tickUser(USER); // checker allows $60, mock gateway refuses > MAX_ORDER_USD (25)
    expect(r.kind === "decided" && r.status).toBe("FAILED");
  });

  it("denied for leverage with high confidence → REJECTED + slack request + push", async () => {
    const { engine, store, pusher } = makeEngine({ replies: [intentJson({ leverage: 5, confidence: 0.85 })] });
    running(store);
    const r = await engine.tickUser(USER);
    expect(r.kind).toBe("decided");
    if (r.kind !== "decided") return;
    expect(r.status).toBe("REJECTED");
    expect(r.detail.decision.reasons).toEqual(["LEVERAGE_EXCEEDS"]);
    expect(r.slackRequestId).toBeDefined();
    const pending = store.pendingSlack(USER);
    expect(pending[0]).toMatchObject({ rule: "LEVERAGE_EXCEEDS", requested: { maxLeverage: 5, durationSec: 3600 }, status: "PENDING" });
    expect(pusher.sent[0]!.data).toEqual({ type: "slack", id: r.slackRequestId });
  });

  it("no slack request for low confidence or non-limit denials, and only one pending", async () => {
    const { engine, store, advance } = makeEngine({
      replies: [intentJson({ leverage: 5, confidence: 0.65 }), intentJson({ leverage: 5, confidence: 0.9 }), intentJson({ leverage: 5, confidence: 0.9 })],
    });
    running(store);
    await engine.tickUser(USER);
    expect(store.pendingSlack(USER)).toHaveLength(0);
    (engine as unknown as { lastSnapshot: Map<string, unknown> }).lastSnapshot.clear();
    await engine.tickUser(USER);
    expect(store.pendingSlack(USER)).toHaveLength(1);
    advance(1000);
    (engine as unknown as { lastSnapshot: Map<string, unknown> }).lastSnapshot.clear();
    await engine.tickUser(USER);
    expect(store.pendingSlack(USER)).toHaveLength(1);
  });

  it("slack approval re-checks the original intent and executes with usedSlack", async () => {
    const registry = new FakeRegistry();
    const { engine, store, advance, now } = makeEngine({ replies: [intentJson({ leverage: 5, confidence: 0.85 })], registry });
    running(store);
    const r = await engine.tickUser(USER);
    const id = r.kind === "decided" ? r.slackRequestId! : "";
    registry.slack = { active: true, maxLeverage: 5, maxNotionalUsd: "25", extraRiskUsd: "2", expiresAt: Math.floor(now() / 1000) + 3600 };
    advance(30_000);
    const res = await engine.approveSlack(id);
    expect(res.status).toBe("APPROVED");
    expect(res.receipt?.decision).toMatchObject({ allowed: true, usedSlack: true });
    expect(store.getSlack(id)?.request.status).toBe("APPROVED");
  });

  it("slack approval after 2 min does not execute", async () => {
    const registry = new FakeRegistry();
    const { engine, store, advance, now } = makeEngine({ replies: [intentJson({ leverage: 5, confidence: 0.85 })], registry });
    running(store);
    const r = await engine.tickUser(USER);
    registry.slack = { active: true, maxLeverage: 5, maxNotionalUsd: "25", extraRiskUsd: "2", expiresAt: Math.floor(now() / 1000) + 3600 };
    advance(121_000);
    expect((await engine.approveSlack(r.kind === "decided" ? r.slackRequestId! : "")).status).toBe("EXPIRED");
  });

  it("stops when the mandate is inactive onchain (paused / pulled leash)", async () => {
    const registry = new FakeRegistry();
    registry.active = false;
    const { engine, store } = makeEngine({ registry });
    running(store);
    expect(await engine.tickUser(USER)).toEqual({ kind: "stopped", reason: "mandate inactive onchain" });
    expect(store.getUser(USER)?.state).toBe("PAUSED");
  });

  it("mandate limits onchain override the stored policy", async () => {
    const registry = new FakeRegistry();
    registry.mandate = {
      policyHash: "0x01",
      maxNotionalUsd: "10",
      maxLeverage: 3,
      maxWeeklyLossPct: 10,
      agentId: 1n,
      agentWallet: USER,
      perplKey: USER,
      paused: false,
      updatedAt: 1,
    };
    const { engine, store } = makeEngine({ replies: [intentJson({ sizeUsd: "20" })], registry });
    running(store);
    const r = await engine.tickUser(USER);
    expect(r.kind === "decided" && r.detail.decision.reasons).toEqual(["NOTIONAL_EXCEEDS"]);
  });

  it("HOLD is not receipted; unchanged inputs skip the LLM entirely", async () => {
    const { engine, store, sink } = makeEngine({ replies: [intentJson({ action: "HOLD", sizeUsd: "0", leverage: 0 })] });
    running(store);
    expect((await engine.tickUser(USER)).kind).toBe("hold");
    expect(sink.logged).toHaveLength(0);
    expect(await engine.tickUser(USER)).toEqual({ kind: "skipped", reason: "no meaningful change" });
  });

  it("LLM down → fallback strategy still produces a checked, receipted decision", async () => {
    const { engine, store } = makeEngine({ replies: [new Error("timeout")] });
    running(store);
    const r = await engine.tickUser(USER);
    expect(r.kind === "decided" && r.detail.model).toBe("fallback-rules-v1");
  });
});

describe("engine.tickShadow", () => {
  it("allowed shadow call → logShadow, no execution", async () => {
    const { engine, sink } = makeEngine({ replies: [intentJson({ side: "SHORT", sizeUsd: "10", leverage: 1, confidence: 0.8 })] });
    const r = await engine.tickShadow("otter");
    expect(r.kind === "decided" && r.status).toBe("SHADOW");
    expect(sink.logged[0]).toMatchObject({ kind: "shadow", persona: "otter" });
  });

  it("denied shadow call is not logged", async () => {
    const { engine, sink } = makeEngine({ replies: [intentJson({ leverage: 4, confidence: 0.9 })] });
    const r = await engine.tickShadow("otter");
    expect(r.kind).toBe("skipped");
    expect(sink.logged).toHaveLength(0);
  });
});

describe("changedMeaningfully", () => {
  const base = { ts: "t", smartMoneyScore: 0.5, nansen: null, perpl: { market: "MON-PERP", mark: "2.000", index: "2", fundingRate: "0", markChangePct: null, changeWindowMin: null }, risk: null, envio: null };
  it("only > 0.5% mark moves count", () => {
    expect(changedMeaningfully(base, { ...base, perpl: { ...base.perpl, mark: "2.009" } })).toBe(false);
    expect(changedMeaningfully(base, { ...base, perpl: { ...base.perpl, mark: "2.011" } })).toBe(true);
    expect(changedMeaningfully(undefined, base)).toBe(true);
  });
});
