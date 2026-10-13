// Typed client for the Perpl gateway (ARCHITECTURE §7.3, packages/shared/gateway.openapi.yaml).
// HttpGateway talks to GATEWAY_URL; MockGateway serves Rails' services/perpl-gateway/mock/*.json in-process.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { RiskSnapshot, TxRequest } from "@leash/shared";
import { z } from "zod";

export const Health = z.object({ ok: z.boolean(), block: z.number(), cacheLagBlocks: z.number() });
export const Market = z.object({
  market: z.string(),
  perpId: z.number(),
  mark: z.string(),
  index: z.string(),
  fundingRate: z.string(),
  tickSize: z.string(),
  lotSize: z.string(),
});
export const ExecuteResult = z.object({ txHash: z.string(), status: z.enum(["SENT", "DUPLICATE"]) });
export const KeyPrepareResult = z.object({ tradeKey: z.string().regex(/^0x[0-9a-fA-F]{40}$/), enrollment: TxRequest.or(z.unknown()) });
export const GatewayErrorBody = z.object({ code: z.string(), message: z.string() });

export type Health = z.infer<typeof Health>;
export type Market = z.infer<typeof Market>;
export type ExecuteResult = z.infer<typeof ExecuteResult>;
export type KeyPrepareResult = z.infer<typeof KeyPrepareResult>;

export type ExecuteOrder = {
  account: string;
  market: string;
  side: "LONG" | "SHORT";
  sizeUsd: string;
  price: string;
  leverage: number;
  reduce_only?: boolean;
  idempotencyKey: string;
};

export class GatewayError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(`gateway ${status} ${code}: ${message}`);
    this.name = "GatewayError";
  }
}

export interface Gateway {
  readonly kind: "http" | "mock";
  health(): Promise<Health>;
  markets(): Promise<Market[]>;
  risk(account: string): Promise<RiskSnapshot>;
  execute(order: ExecuteOrder): Promise<ExecuteResult>;
  keysPrepare(account: string): Promise<KeyPrepareResult>;
  keysDisable(account: string): Promise<{ ok: boolean }>;
}

export class HttpGateway implements Gateway {
  readonly kind = "http" as const;
  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs = 8000,
    /** Shared secret for the gateway's write paths (x-gateway-token). */
    private readonly token?: string,
  ) {}

  private async call<S extends z.ZodType>(schema: S, path: string, body?: unknown, timeoutMs = this.timeoutMs): Promise<z.infer<S>> {
    const res = await fetch(new URL(path, this.baseUrl.endsWith("/") ? this.baseUrl : `${this.baseUrl}/`), {
      method: body === undefined ? "GET" : "POST",
      headers: { ...(body === undefined ? {} : { "content-type": "application/json" }), ...(this.token ? { "x-gateway-token": this.token } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const json: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const e = GatewayErrorBody.safeParse(json);
      throw new GatewayError(res.status, e.success ? e.data.code : "UPSTREAM_ERROR", e.success ? e.data.message : res.statusText);
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success) throw new GatewayError(res.status, "BAD_RESPONSE", `${path}: ${parsed.error.message}`);
    return parsed.data;
  }

  health() {
    return this.call(Health, "health");
  }
  markets() {
    return this.call(z.array(Market), "markets");
  }
  risk(account: string) {
    return this.call(RiskSnapshot, `risk/${account}`);
  }
  execute(order: ExecuteOrder) {
    return this.call(ExecuteResult, "orders/execute", order);
  }
  keysPrepare(account: string) {
    return this.call(KeyPrepareResult, "keys/prepare", { account }, 20_000); // keystore encryption is slow on a cold box
  }
  keysDisable(account: string) {
    return this.call(z.object({ ok: z.boolean() }), "keys/disable", { account });
  }
}

const MOCK_DIR = join(import.meta.dirname, "..", "..", "..", "perpl-gateway", "mock");

/** In-process mock over Rails' static JSON. Deterministic; idempotent execute; disable is remembered. */
export class MockGateway implements Gateway {
  readonly kind = "mock" as const;
  private readonly executed = new Map<string, ExecuteResult>();
  private readonly disabled = new Set<string>();
  constructor(private readonly opts: { maxOrderUsd: number; dir?: string } = { maxOrderUsd: 25 }) {}

  private load(name: string): unknown {
    return JSON.parse(readFileSync(join(this.opts.dir ?? MOCK_DIR, name), "utf8"));
  }

  async health() {
    return Health.parse(this.load("health.json"));
  }
  async markets() {
    return z.array(Market).parse(this.load("markets.json"));
  }
  async risk(account: string) {
    return RiskSnapshot.parse({ ...(this.load("risk.json") as object), account, ts: Math.floor(Date.now() / 1000) });
  }
  async execute(order: ExecuteOrder) {
    const prev = this.executed.get(order.idempotencyKey);
    if (prev) return { ...prev, status: "DUPLICATE" as const };
    if (this.disabled.has(order.account.toLowerCase())) throw new GatewayError(403, "KEY_DISABLED", "key disabled");
    if (Number(order.sizeUsd) > this.opts.maxOrderUsd) throw new GatewayError(403, "SIZE_EXCEEDS_MAX", `size > ${this.opts.maxOrderUsd}`);
    const n = (this.executed.size + 1).toString(16).padStart(64, "0");
    const res: ExecuteResult = { txHash: `0x${n}`, status: "SENT" };
    this.executed.set(order.idempotencyKey, res);
    return res;
  }
  async keysPrepare(_account: string) {
    return KeyPrepareResult.parse(this.load("keys-prepare.json"));
  }
  async keysDisable(account: string) {
    this.disabled.add(account.toLowerCase());
    return { ok: true };
  }
}

export function makeGateway(cfg: { GATEWAY_URL?: string; MAX_ORDER_USD: number; GATEWAY_API_TOKEN?: string }): Gateway {
  return cfg.GATEWAY_URL ? new HttpGateway(cfg.GATEWAY_URL, 8000, cfg.GATEWAY_API_TOKEN) : new MockGateway({ maxOrderUsd: cfg.MAX_ORDER_USD });
}
