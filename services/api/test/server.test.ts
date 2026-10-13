import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { Policy, ReceiptDetail, SlackRequest, policyHash } from "@leash/shared";
import { createApp, validAlchemySignature, type AppDeps } from "../src/server";
import { Envio } from "../src/signals/envio";
import { Wallets } from "../src/wallet/wallets";
import { FakeChat, fakePublicClient, intentJson, makeEngine, USER } from "./helpers";

const policyJson = {
  version: 1,
  markets: ["MON-PERP"],
  venues: ["PERPL"],
  maxLeverage: 3,
  maxNotionalUsd: "25",
  maxTotalExposureUsd: "100",
  maxWeeklyLossPct: 10,
  maxTradesPerHour: 4,
  cooldownSec: 300,
  requireSmartMoneyAgreement: true,
  minConfidence: 0.6,
  sleeveUsd: "0",
};

function setup(replies: string[] = []) {
  const e = makeEngine({ replies });
  const deps: AppDeps = {
    chainId: 10143,
    live: false,
    modelCompile: "qwen-plus-character",
    store: e.store,
    chat: new FakeChat([JSON.stringify(policyJson)]),
    gateway: e.gateway,
    envio: new Envio(undefined),
    registry: null,
    addresses: null,
    wallets: new Wallets(e.store, null, { chainId: 10143, receiptLog: null, kuruMarkets: [], tokens: [] }),
    engine: e.engine,
    scheduler: null,
    pusher: e.pusher,
    publicClient: fakePublicClient,
    drip: { wallet: null, publicClient: fakePublicClient, amountMon: "0.2", chainId: 10143 },
    kuru: null,
    alchemyNotifyToken: "whsec",
    demoToken: "demo-secret",
    passkey: { appleTeamIds: ["ABCDE12345"], androidCertSha256: [`${"AB:".repeat(31)}AB`], appId: "app.leash.mobile" },
    log: () => {},
    rateLimitPerMin: 1000,
    retryDelayMs: 0,
  };
  const app = createApp(deps);
  const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    app.request(path, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });
  return { app, deps, e, post };
}

describe("API routes", () => {
  it("POST /mandate/compile → policy, hash, card, and the additive agentId/agentWallet/perplKey", async () => {
    const { post } = setup();
    const res = await post("/mandate/compile", { account: USER, text: "max 3x, $25 a trade", persona: "falcon" });
    expect(res.status).toBe(200);
    const j = (await res.json()) as Record<string, unknown>;
    const policy = Policy.parse(j.policy);
    expect(j.policyHash).toBe(policyHash(policy));
    expect((j.leashCard as string[]).length).toBeGreaterThanOrEqual(4);
    expect(j).toHaveProperty("agentId");
    expect(j.agentWallet).toBeNull(); // Privy not configured in tests → null + warning
    expect(j.perplKey).toMatch(/^0x[0-9a-fA-F]{40}$/); // from gateway mock keys/prepare
    expect((j.warnings as string[]).join(" ")).toMatch(/wallet/i);
  });

  it("validates bodies (400 with details)", async () => {
    const { post } = setup();
    const res = await post("/mandate/compile", { account: "nope", text: "", persona: "eagle" });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { details: unknown[] }).details.length).toBeGreaterThan(0);
    expect((await post("/devices", "not json")).status).toBe(400);
  });

  it("activate (paper, no contracts) → RUNNING; status; kill → KILLED and gateway key disabled", async () => {
    const { app, post, e } = setup();
    await post("/mandate/compile", { account: USER, text: "x", persona: "falcon" });
    const act = await post("/agent/activate", { account: USER });
    expect(act.status).toBe(200);
    expect(await act.json()).toMatchObject({ state: "RUNNING", persona: "falcon" });
    expect(await (await app.request(`/agent/status/${USER}`)).json()).toMatchObject({ state: "RUNNING" });
    const kill = await post("/agent/kill", { account: USER });
    expect(await kill.json()).toMatchObject({ state: "KILLED" });
    await expect(e.gateway.execute({ account: USER, market: "MON-PERP", side: "LONG", sizeUsd: "5", price: "2", leverage: 1, idempotencyKey: "k" })).rejects.toThrow(/KEY_DISABLED/);
  });

  it("GET /policy/:account returns the stored rules after activate", async () => {
    const { app, post } = setup();
    expect((await app.request(`/policy/${USER}`)).status).toBe(404);
    await post("/mandate/compile", { account: USER, text: "x", persona: "falcon" });
    await post("/agent/activate", { account: USER });
    expect(await (await app.request(`/policy/${USER}`)).json()).toMatchObject({ persona: "falcon", policy: { version: 1 } });
  });

  it("after a store wipe, activate accepts the app's policy only if it hashes to the onchain policyHash", async () => {
    const { post, deps } = setup();
    const good = Policy.parse(policyJson);
    const mandate = { policyHash: policyHash(good), paused: false, agentId: 0n, agentWallet: USER, perplKey: USER };
    deps.registry = { isActive: async () => true, getMandate: async () => mandate, activeSlack: async () => null } as unknown as AppDeps["registry"];
    const app2 = createApp(deps);
    const act = (body: unknown) => app2.request("/agent/activate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    expect((await act({ account: USER })).status).toBe(409); // store has no policy
    expect((await act({ account: USER, policy: { ...good, maxLeverage: 5 } })).status).toBe(409); // forged: hash mismatch
    const ok = await act({ account: USER, policy: good });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ state: "RUNNING" });
    void post;
  });

  it("activate without compile → 409; unknown status → 404", async () => {
    const { app, post } = setup();
    expect((await post("/agent/activate", { account: USER })).status).toBe(409);
    expect((await app.request(`/agent/status/${USER}`)).status).toBe(404);
  });

  it("GET /receipts/:reasonHash serves the stored ReceiptDetail", async () => {
    const { app, e } = setup([intentJson()]);
    e.store.upsertUser({ account: USER, persona: "falcon", policy: policyJson as Policy, policyHash: "0x01", state: "RUNNING" });
    const r = await e.engine.tickUser(USER);
    if (r.kind !== "decided") throw new Error("expected a decision");
    const res = await app.request(`/receipts/${r.detail.reasonHash}`);
    expect(ReceiptDetail.parse(await res.json()).reasonHash).toBe(r.detail.reasonHash);
    expect((await app.request(`/receipts/0x${"0".repeat(64)}`)).status).toBe(404);
  });

  it("slack: pending → approved (re-check + execute) and denied", async () => {
    const { app, post, e } = setup([intentJson({ leverage: 5, confidence: 0.9 })]);
    e.store.upsertUser({ account: USER, persona: "falcon", policy: policyJson as Policy, policyHash: "0x01", state: "RUNNING" });
    await e.engine.tickUser(USER);
    const pending = SlackRequest.array().parse(await (await app.request(`/slack/pending/${USER}`)).json());
    expect(pending).toHaveLength(1);
    const res = await post(`/slack/${pending[0]!.id}/approved`, { txHash: `0x${"ab".repeat(32)}` });
    expect(res.status).toBe(200);
    const j = (await res.json()) as { request: { status: string }; receipt: { decision: { usedSlack: boolean } } };
    expect(j.request.status).toBe("APPROVED");
    expect(j.receipt.decision.usedSlack).toBe(true);
    expect((await post(`/slack/${pending[0]!.id}/approved`, { txHash: `0x${"ab".repeat(32)}` })).status).toBe(409);
    expect((await post(`/slack/${pending[0]!.id}/denied`, {})).status).toBe(200);
  });

  it("devices, config, traders, drip without gas tank", async () => {
    const { app, post } = setup();
    expect((await post("/devices", { account: USER, expoPushToken: "ExponentPushToken[abc]" })).status).toBe(200);
    expect((await post("/devices", { account: USER, expoPushToken: "nope" })).status).toBe(400);
    expect(await (await app.request("/config")).json()).toMatchObject({ chainId: 10143, live: false });
    const traders = (await (await app.request("/traders")).json()) as { id: string; mode: string }[];
    expect(traders.map((t) => [t.id, t.mode])).toEqual([
      ["falcon", "LIVE"],
      ["otter", "SHADOW"],
      ["owl", "SHADOW"],
    ]);
    expect((await post("/gas/drip", { address: USER })).status).toBe(503);
    expect((await post("/gas/drip", { account: USER })).status).toBe(503); // Face's body shape is accepted too
    expect((await post("/gas/drip", {})).status).toBe(400);
  });

  it("/demo/intent: token-guarded, paper-only, same checker → receipt → slack path, labelled manual", async () => {
    const { post, e } = setup();
    e.store.upsertUser({ account: USER, persona: "falcon", policy: policyJson as Policy, policyHash: "0x01", state: "RUNNING" });
    const body = { account: USER, side: "LONG", sizeUsd: "15", leverage: 5, confidence: 0.9 };
    expect((await post("/demo/intent", body)).status).toBe(401);
    expect((await post("/demo/intent", body, { "x-demo-token": "nope-nope-n" })).status).toBe(401);
    const res = await post("/demo/intent", body, { "x-demo-token": "demo-secret" });
    expect(res.status).toBe(200);
    const j = (await res.json()) as { status: string; decision: { reasons: string[] }; slackRequestId: string | null; reasonHash: string };
    expect(j.status).toBe("REJECTED");
    expect(j.decision.reasons).toEqual(["LEVERAGE_EXCEEDS"]);
    expect(j.slackRequestId).toBeTruthy();
    expect(e.store.getReceipt(j.reasonHash)?.model).toBe("manual-paper-test");
  });

  it("landing page + passkey association files (JSON, exact paths)", async () => {
    const { app } = setup();
    expect(await (await app.request("/")).json()).toMatchObject({ network: "Monad testnet (10143)", mode: "paper" });
    const aasa = await app.request("/.well-known/apple-app-site-association");
    expect(aasa.headers.get("content-type")).toMatch(/application\/json/);
    expect(await aasa.json()).toEqual({ webcredentials: { apps: ["ABCDE12345.app.leash.mobile"] } });
    const al = (await (await app.request("/.well-known/assetlinks.json")).json()) as { target: { package_name: string; sha256_cert_fingerprints: string[] } }[];
    expect(al[0]!.target.package_name).toBe("app.leash.mobile");
    expect(al[0]!.target.sha256_cert_fingerprints).toHaveLength(1);
  });

  it("serves ERC-8004 registration files with the persona's onchain agentId", async () => {
    const { app } = setup();
    const j = (await (await app.request("/agents/falcon.json")).json()) as { type: string; registrations: { agentId: number; agentRegistry: string }[] };
    expect(j.type).toBe("https://eips.ethereum.org/EIPS/eip-8004#registration-v1");
    expect(j.registrations).toEqual([{ agentId: 2227, agentRegistry: "eip155:10143:0x8004A818BFB912233c491871b3d84c89A494BD9e" }]);
    expect((await app.request("/agents/eagle.json")).status).toBe(404);
    expect((await app.request("/agents/otter.svg")).headers.get("content-type")).toMatch(/image\/svg/);
  });

  it("kill is refused while the trader is active onchain; compile is rate-limited per IP", async () => {
    const { app, deps, post } = setup();
    deps.registry = { isActive: async () => true, getMandate: async () => null, activeSlack: async () => null };
    const app2 = createApp({ ...deps, rateLimitPerMin: 2 });
    const res = await app2.request("/agent/kill", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ account: USER }) });
    expect(res.status).toBe(409);
    const hit = () => app2.request("/mandate/compile", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "9.9.9.9" }, body: "{}" });
    expect((await hit()).status).toBe(400);
    expect((await hit()).status).toBe(400);
    expect((await hit()).status).toBe(429);
    void app;
    void post;
  });

  it("alchemy webhook requires a valid HMAC signature and pushes deposits", async () => {
    const { post, e } = setup();
    e.store.addDevice(USER, "ExponentPushToken[abc]");
    const payload = JSON.stringify({ event: { activity: [{ toAddress: USER, value: 25, asset: "AUSD" }] } });
    expect((await post("/webhooks/alchemy", payload, { "x-alchemy-signature": "bad" })).status).toBe(401);
    const sig = createHmac("sha256", "whsec").update(payload).digest("hex");
    expect((await post("/webhooks/alchemy", payload, { "x-alchemy-signature": sig })).status).toBe(200);
    expect(e.pusher.sent.at(-1)!.data).toMatchObject({ type: "deposit", token: "AUSD" });
    expect(validAlchemySignature("x", "y", "k")).toBe(false);
  });
});
