// Typed config from process.env (dotenv is loaded in main.ts). Never log this object: it holds secrets.
import { z } from "zod";

const bool = z
  .string()
  .optional()
  .transform((v) => v === "true" || v === "1");
const num = (d: number) => z.coerce.number().default(d);
const opt = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() ? v.trim() : undefined));

export const ConfigSchema = z.object({
  PORT: num(8787),
  DATABASE_PATH: z.string().default("./data/leash.db"),
  CHAIN_ID: z.coerce.number().pipe(z.union([z.literal(143), z.literal(10143)])).default(10143),
  MONAD_RPC_URL: opt,
  MONAD_TESTNET_RPC_URL: opt,
  ALCHEMY_RPC_URL: opt,
  ALCHEMY_NOTIFY_TOKEN: opt,
  /** Per-webhook signing key from the Alchemy dashboard (verifies X-Alchemy-Signature). */
  ALCHEMY_WEBHOOK_SIGNING_KEY: opt,
  GAS_TANK_ADDRESS: opt,
  GAS_TANK_PRIVATE_KEY: opt,
  DRIP_MON: z.string().default("0.2"),
  LLM_BASE_URL: opt,
  LLM_API_KEY: opt,
  LLM_MODEL_COMPILE: z.string().default("qwen-plus-character"),
  LLM_MODEL_TICK: z.string().default("qwen-flash-character"),
  LLM_MODE: z.string().default("json"),
  LLM_TIMEOUT_MS: num(8000),
  PRIVY_APP_ID: opt,
  PRIVY_APP_SECRET: opt,
  NANSEN_API_KEY: opt,
  NANSEN_CACHE_SECONDS: num(900),
  /** Each netflow call costs 5 credits on the free plan. */
  NANSEN_DAILY_CALLS: num(10),
  GATEWAY_URL: opt,
  ENVIO_URL: opt,
  TENDERLY_ACCESS_KEY: opt,
  LIVE: bool,
  MAX_ORDER_USD: num(25),
  TICK_SECONDS: num(30),
  SHADOW_TICK_SECONDS: num(180),
  /** JSON {"falcon":{"id","address"},...} from scripts/persona-wallets.ts; keeps persona wallets stable across deploys. */
  PERSONA_WALLETS: opt,
  /** Passkey association (RP = this API's host). Public identifiers, not secrets. Comma-separated lists allowed. */
  APPLE_TEAM_ID: opt,
  ANDROID_CERT_SHA256: opt,
  MOBILE_APP_ID: z.string().default("app.leash.mobile"),
  /** Enables POST /demo/intent (paper only) for filming; unset = endpoint disabled. */
  DEMO_TOKEN: opt,
  /** Comma-separated origins; empty = allow all (mobile app has no origin). */
  CORS_ORIGINS: opt,
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  return ConfigSchema.parse(env);
}

export function rpcUrl(cfg: Config): string | undefined {
  return cfg.CHAIN_ID === 143 ? (cfg.MONAD_RPC_URL ?? cfg.ALCHEMY_RPC_URL) : cfg.MONAD_TESTNET_RPC_URL;
}
