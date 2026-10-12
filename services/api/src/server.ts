// REST API for the app (ARCHITECTURE §7.4, services/api/openapi.yaml). Every body/param validated with zod.
import { createHmac, timingSafeEqual } from "node:crypto";
import { Address, Hash32, PersonaId, type ChainId } from "@leash/shared";
import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import type { Address as ViemAddress, PublicClient } from "viem";
import { z } from "zod";
import type { LeashAddresses, Registry } from "./chain/contracts";
import { compilePolicy } from "./compile/compile";
import type { Gateway } from "./exec/gateway";
import type { Kuru } from "./exec/kuru";
import { drip, DripError, type DripDeps } from "./gas/drip";
import type { ChatJson } from "./llm/client";
import type { Engine } from "./loop/engine";
import type { Scheduler } from "./loop/scheduler";
import { PERSONA_IDS, persona as personaOf } from "./personas";
import type { Pusher } from "./push/expo";
import type { Envio, LeaderboardRow } from "./signals/envio";
import { livePending } from "./slack/requests";
import type { Store } from "./store/db";
import { Wallets } from "./wallet/wallets";

export type AppDeps = {
  chainId: ChainId;
  live: boolean;
  modelCompile: string;
  store: Store;
  chat: ChatJson | null;
  gateway: Gateway;
  envio: Envio;
  registry: Registry | null;
  addresses: LeashAddresses | null;
  wallets: Wallets;
  engine: Engine;
  scheduler: Scheduler | null;
  pusher: Pusher;
  publicClient: PublicClient;
  drip: Omit<DripDeps, "store">;
  kuru: Kuru | null;
  alchemyNotifyToken?: string;
  corsOrigins?: string[];
  log?: (m: string) => void;
};

const AccountParam = z.object({ account: Address });

async function body<S extends z.ZodType>(c: Context, schema: S): Promise<z.infer<S>> {
  const raw = await c.req.json().catch(() => {
    throw new HttpError(400, "body must be JSON");
  });
  const r = schema.safeParse(raw);
  if (!r.success) throw new HttpError(400, "invalid request", r.error.issues);
  return r.data;
}

class HttpError extends Error {
  constructor(
    readonly status: 400 | 401 | 404 | 409 | 429 | 502 | 503,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export function createApp(d: AppDeps) {
  const app = new Hono();
  const log = d.log ?? ((m: string) => console.log(m));
  app.use("*", cors({ origin: d.corsOrigins?.length ? d.corsOrigins : "*" }));

  app.onError((err, c) => {
    if (err instanceof HttpError) return c.json({ error: err.message, ...(err.details ? { details: err.details } : {}) }, err.status);
    if (err instanceof DripError) return c.json({ error: err.message }, err.status);
    log(`[api] ${c.req.method} ${c.req.path} failed: ${err.message}`);
    return c.json({ error: "internal error" }, 500);
  });

  app.get("/health", (c) => c.json({ ok: true, chainId: d.chainId, live: d.live, gateway: d.gateway.kind, markets: "marketsSource" in d.gateway ? d.gateway.marketsSource : d.gateway.kind, llm: !!d.chat, privy: d.wallets.configured, contracts: !!d.addresses }));

  // ---- mandate ----
  app.post("/mandate/compile", async (c) => {
    const req = await body(c, z.object({ account: Address, text: z.string().min(1).max(2000), persona: PersonaId }));
    const result = await compilePolicy(d.chat, d.modelCompile, req.text, req.persona);
    d.store.savePolicy(result.policyHash, result.policy);
    d.store.setKv(`compile:${req.account.toLowerCase()}`, { persona: req.persona, policyHash: result.policyHash });

    const warnings = [...result.warnings];
    let agentWallet: string | null = null;
    if (d.wallets.configured) {
      try {
        agentWallet = (await d.wallets.userWallet(req.account as ViemAddress, req.persona)).address;
      } catch (e) {
        warnings.push("Trader wallet couldn't be created yet; try again in a minute.");
        log(`[compile] privy wallet: ${(e as Error).message}`);
      }
    } else warnings.push("Trader wallet service isn't configured on this server.");
    let perplKey: string | null = null;
    try {
      perplKey = (await d.gateway.keysPrepare(req.account)).tradeKey;
    } catch (e) {
      warnings.push("Perpl trade key isn't available yet.");
      log(`[compile] keys/prepare: ${(e as Error).message}`);
    }
    return c.json({
      policy: result.policy,
      policyHash: result.policyHash,
      leashCard: result.leashCard,
      warnings,
      agentId: personaOf(req.persona).agentId,
      agentWallet,
      perplKey,
    });
  });

  // ---- agent ----
  app.post("/agent/activate", async (c) => {
    const req = await body(c, z.object({ account: Address, txHash: Hash32.optional() }));
    const account = req.account as ViemAddress;
    if (req.txHash) await d.publicClient.waitForTransactionReceipt({ hash: req.txHash as `0x${string}`, timeout: 60_000 });
    const compiled = d.store.getKv<{ persona: z.infer<typeof PersonaId>; policyHash: string }>(`compile:${account.toLowerCase()}`, Number.MAX_SAFE_INTEGER);

    let policyHash = compiled?.policyHash;
    let persona = compiled?.persona ?? "falcon";
    if (d.registry) {
      const m = await d.registry.getMandate(account);
      if (!m) throw new HttpError(409, "no mandate onchain for this account");
      if (m.paused) throw new HttpError(409, "mandate is paused onchain; resume() first");
      policyHash = m.policyHash;
      persona = PERSONA_IDS.find((p) => personaOf(p).agentId === m.agentId.toString() && m.agentId !== 0n) ?? persona;
      if (d.wallets.configured) {
        const w = await d.wallets.restore(account, persona);
        if (w.address.toLowerCase() !== m.agentWallet.toLowerCase()) throw new HttpError(409, "mandate agentWallet doesn't match this trader's wallet; re-sign setMandate with the compiled agentWallet");
      }
    }
    const policy = policyHash ? d.store.getPolicy(policyHash) : null;
    if (!policy || !policyHash) throw new HttpError(409, "unknown policyHash; call /mandate/compile first");
    d.store.upsertUser({ account, persona, policy, policyHash, state: "RUNNING" });
    d.scheduler?.startUser(account);
    return c.json(statusOf(d, account));
  });

  app.post("/agent/kill", async (c) => {
    const req = await body(c, z.object({ account: Address, txHash: Hash32.optional() }));
    const account = req.account as ViemAddress;
    d.scheduler?.stopUser(account);
    const user = d.store.getUser(account);
    if (user) d.store.setUserState(account, "KILLED");
    const results = await Promise.allSettled([
      user ? d.wallets.denyAll(account, user.persona) : Promise.resolve(false),
      d.gateway.keysDisable(account),
    ]);
    results.forEach((r, i) => r.status === "rejected" && log(`[kill] ${i === 0 ? "privy deny-all" : "gateway keys/disable"} failed: ${r.reason}`));
    return c.json(statusOf(d, account));
  });

  app.get("/agent/status/:account", (c) => {
    const p = AccountParam.safeParse(c.req.param());
    if (!p.success) throw new HttpError(400, "invalid account");
    const user = d.store.getUser(p.data.account);
    if (!user) throw new HttpError(404, "unknown account");
    return c.json(statusOf(d, p.data.account));
  });

  // ---- traders ----
  app.get("/traders", async (c) => {
    let stats: LeaderboardRow[] = [];
    if (d.envio.configured) stats = await d.envio.leaderboard().catch(() => []);
    const traders = PERSONA_IDS.map((id) => {
      const wallet = d.store.getWallet(Wallets.personaKey(id))?.address ?? null;
      const p = personaOf(id, wallet);
      const s = stats.find((r) => r.id === p.agentId && p.agentId !== "0");
      return {
        ...p,
        stats: s
          ? {
              executedCount: s.executed,
              rejectedCount: s.rejected,
              shadowCount: s.shadow,
              volumeUsd: s.volumeUsd,
              realizedPnlUsd: s.realizedPnlUsd,
              shadowPnlUsd: s.shadowPnlUsd,
              maxDrawdownPct: Number(s.maxDrawdownPct),
            }
          : null,
      };
    });
    return c.json(traders);
  });

  // ---- receipts ----
  app.get("/receipts/:reasonHash", (c) => {
    const h = Hash32.safeParse(c.req.param("reasonHash"));
    if (!h.success) throw new HttpError(400, "invalid reasonHash");
    const r = d.store.getReceipt(h.data);
    if (!r) throw new HttpError(404, "receipt not found");
    return c.json(r);
  });

  // ---- slack ----
  app.get("/slack/pending/:account", (c) => {
    const p = AccountParam.safeParse(c.req.param());
    if (!p.success) throw new HttpError(400, "invalid account");
    return c.json(livePending(d.store, p.data.account));
  });

  app.post("/slack/:id/approved", async (c) => {
    const id = z.uuid().safeParse(c.req.param("id"));
    if (!id.success) throw new HttpError(400, "invalid id");
    const req = await body(c, z.object({ txHash: Hash32 }));
    const rec = d.store.getSlack(id.data);
    if (!rec) throw new HttpError(404, "slack request not found");
    if (rec.request.status !== "PENDING") throw new HttpError(409, `request is ${rec.request.status}`);
    if (Date.parse(rec.request.expiresAt) < Date.now()) {
      d.store.saveSlack({ ...rec.request, status: "EXPIRED" }, rec.intent);
      throw new HttpError(409, "request expired");
    }
    const r = await d.publicClient.waitForTransactionReceipt({ hash: req.txHash as `0x${string}`, timeout: 60_000 });
    if (r.status !== "success") throw new HttpError(409, "grantSlack transaction reverted");
    const res = await d.engine.approveSlack(id.data);
    if (res.status === "NOT_ACTIVE") throw new HttpError(409, "slack not active onchain");
    return c.json({ request: d.store.getSlack(id.data)!.request, receipt: res.receipt });
  });

  app.post("/slack/:id/denied", (c) => {
    const id = z.uuid().safeParse(c.req.param("id"));
    if (!id.success) throw new HttpError(400, "invalid id");
    const rec = d.store.getSlack(id.data);
    if (!rec) throw new HttpError(404, "slack request not found");
    if (rec.request.status === "PENDING") d.store.saveSlack({ ...rec.request, status: "DENIED" }, rec.intent);
    return c.json({ request: d.store.getSlack(id.data)!.request });
  });

  // ---- devices / gas ----
  app.post("/devices", async (c) => {
    const req = await body(c, z.object({ account: Address, expoPushToken: z.string().regex(/^Expo(nent)?PushToken\[.+\]$/) }));
    d.store.addDevice(req.account, req.expoPushToken);
    return c.json({ ok: true });
  });

  app.post("/gas/drip", async (c) => {
    // Accepts {address} (OpenAPI) or {account} (what the Face app sends); same meaning.
    const req = await body(
      c,
      z.object({ address: Address.optional(), account: Address.optional() }).refine((b) => b.address || b.account, { message: "address (or account) is required" }),
    );
    return c.json(await drip({ ...d.drip, store: d.store }, (req.address ?? req.account) as ViemAddress));
  });

  // ---- spot (Kuru helper for Face's spot screen; additive) ----
  app.post("/spot/prepare", async (c) => {
    if (!d.kuru) throw new HttpError(503, "Kuru not configured on this chain");
    const req = await body(c, z.object({ account: Address, side: z.enum(["BUY", "SELL"]), sizeUsd: z.coerce.number().positive().max(100) }));
    return c.json(await d.kuru.prepare(req.account as ViemAddress, req.side, req.sizeUsd));
  });

  // ---- config ----
  app.get("/config", (c) => {
    const personas = PERSONA_IDS.map((id) => personaOf(id, d.store.getWallet(Wallets.personaKey(id))?.address ?? null));
    return c.json({
      chainId: d.chainId,
      addresses: { mandateRegistry: d.addresses?.mandateRegistry ?? null, receiptLog: d.addresses?.receiptLog ?? null },
      referee: d.addresses?.referee ?? null,
      personas,
      live: d.live,
    });
  });

  // ---- webhooks ----
  app.post("/webhooks/alchemy", async (c) => {
    const raw = await c.req.text();
    const sig = c.req.header("x-alchemy-signature") ?? "";
    if (!d.alchemyNotifyToken || !validAlchemySignature(raw, sig, d.alchemyNotifyToken)) throw new HttpError(401, "bad signature");
    const parsed = AlchemyActivity.safeParse(JSON.parse(raw));
    if (parsed.success) {
      for (const a of parsed.data.event.activity) {
        if (!a.toAddress || a.value === undefined) continue;
        await d.pusher.send(a.toAddress, "Deposit received", `${a.value} ${a.asset ?? ""} arrived`, { type: "deposit", amount: String(a.value), token: a.asset ?? "" }).catch(() => 0);
      }
    }
    return c.json({ ok: true });
  });

  return app;
}

const AlchemyActivity = z.object({
  event: z.object({
    activity: z.array(z.object({ toAddress: z.string().optional(), value: z.number().optional(), asset: z.string().optional() }).passthrough()),
  }),
});

/** Alchemy Notify: X-Alchemy-Signature = hex(HMAC-SHA256(signingKey, rawBody)). */
export function validAlchemySignature(raw: string, sig: string, key: string): boolean {
  const expected = createHmac("sha256", key).update(raw, "utf8").digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(sig);
  return a.length === b.length && timingSafeEqual(a, b);
}

function statusOf(d: AppDeps, account: string) {
  const u = d.store.getUser(account);
  return {
    state: u?.state ?? "IDLE",
    persona: u?.persona ?? null,
    lastTick: u?.lastTick ?? null,
    lastDecision: (u?.lastDecision as object | null) ?? null,
  };
}
