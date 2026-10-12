// Referee executor: every minute, for each watched user, read the mandate (chain), gateway /health + /risk,
// apply rules.ts, and on breach sign MandateRegistry.pause(user, "referee:<rule>") from the referee key
// via sendTx (explicit gas). The CRE workflow (cre/referee) runs the same rules; this process holds the
// key because the deployed registry only accepts pause() from the referee EOA (see docs/LIMITATIONS.md).
//
//   CHAIN_ID=10143 pnpm referee [--once] [--log ../docs/referee-sim.log]
import "dotenv/config";
import { appendFileSync } from "node:fs";
import { LEASH, mandateRegistryAbi, monadChain, sendTxAndWait } from "@leash/shared";
import { createPublicClient, createWalletClient, encodeFunctionData, http, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { z } from "zod";
import { DEFAULT_REFEREE, evaluate, type RefereeInput } from "./rules";

const env = z
  .object({
    CHAIN_ID: z.coerce.number().pipe(z.union([z.literal(143), z.literal(10143)])).default(10143),
    MONAD_RPC_URL: z.string().optional(),
    MONAD_TESTNET_RPC_URL: z.string().optional(),
    REFEREE_PRIVATE_KEY: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
    GATEWAY_URL: z.string().optional(),
    ENVIO_URL: z.string().optional(),
    REFEREE_WATCH: z.string().optional(),
    STALE_FAILS_MAX: z.coerce.number().default(3),
    REFEREE_INTERVAL_SEC: z.coerce.number().default(60),
  })
  .parse(process.env);

const args = process.argv.slice(2);
const once = args.includes("--once");
const logFile = args.includes("--log") ? args[args.indexOf("--log") + 1] : undefined;

const deployment = env.CHAIN_ID === 143 ? LEASH.mainnet : LEASH.testnet;
const registry = deployment.mandateRegistry.address as Address | null;
if (!registry) throw new Error(`MandateRegistry not deployed on ${env.CHAIN_ID}`);
const rpc = env.CHAIN_ID === 143 ? env.MONAD_RPC_URL : env.MONAD_TESTNET_RPC_URL;
const chain = monadChain(env.CHAIN_ID);
const publicClient = createPublicClient({ chain, transport: http(rpc) });
const account = privateKeyToAccount(env.REFEREE_PRIVATE_KEY as `0x${string}`);
const wallet = createWalletClient({ account, chain, transport: http(rpc) });
const staleCounts = new Map<string, number>();

function log(event: Record<string, unknown>) {
  const line = JSON.stringify({ ts: new Date().toISOString(), chainId: env.CHAIN_ID, ...event });
  console.log(line);
  if (logFile) appendFileSync(logFile, `${line}\n`);
}

async function getJson(url: string): Promise<unknown | null> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

async function watchList(): Promise<Address[]> {
  const fromEnv = (env.REFEREE_WATCH ?? "").split(",").map((s) => s.trim()).filter(Boolean) as Address[];
  if (!env.ENVIO_URL) return fromEnv;
  try {
    const r = await fetch(env.ENVIO_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: "query ActiveMandates { Mandate(where: { paused: { _eq: false } }) { id } }" }),
      signal: AbortSignal.timeout(5000),
    });
    const j = (await r.json()) as { data?: { Mandate?: { id: string }[] } };
    return [...new Set([...fromEnv, ...((j.data?.Mandate ?? []).map((m) => m.id) as Address[])])];
  } catch {
    return fromEnv;
  }
}

const Health = z.object({ ok: z.boolean(), cacheLagBlocks: z.number() });
const Risk = z.object({ weeklyPnlPct: z.union([z.string(), z.number()]).transform(String), positions: z.array(z.object({ market: z.string(), liqDistancePct: z.union([z.string(), z.number()]).transform(String) })) });

async function checkUser(user: Address) {
  const m = await publicClient.readContract({ address: registry!, abi: mandateRegistryAbi, functionName: "getMandate", args: [user] });
  const mandate = BigInt(m.updatedAt) === 0n ? null : { maxWeeklyLossBps: Number(m.maxWeeklyLossBps), paused: m.paused };
  const [h, r] = env.GATEWAY_URL ? await Promise.all([getJson(`${env.GATEWAY_URL}/health`), getJson(`${env.GATEWAY_URL}/risk/${user}`)]) : [null, null];
  const input: RefereeInput = {
    mandate,
    health: Health.safeParse(h).success ? Health.parse(h) : null,
    risk: Risk.safeParse(r).success ? Risk.parse(r) : null,
    staleCount: staleCounts.get(user) ?? 0,
  };
  const v = evaluate(input, { ...DEFAULT_REFEREE, staleFailsMax: env.STALE_FAILS_MAX });
  staleCounts.set(user, v.staleCount);
  if (v.action !== "pause") {
    log({ user, verdict: v.action, detail: v.detail });
    return;
  }
  log({ user, verdict: "BREACH", rule: v.rule, detail: v.detail });
  // Re-check right before acting: never pause twice / race the user.
  if (!(await publicClient.readContract({ address: registry!, abi: mandateRegistryAbi, functionName: "isActive", args: [user] }))) {
    log({ user, verdict: "skip", detail: "became inactive before pause" });
    return;
  }
  const data = encodeFunctionData({ abi: mandateRegistryAbi, functionName: "pause", args: [user, v.reason] });
  const res = await sendTxAndWait(wallet, publicClient, { to: registry!, data }, { chainId: env.CHAIN_ID });
  staleCounts.delete(user);
  log({ user, verdict: "PAUSED", reason: v.reason, txHash: res.hash, gas: res.gas.toString(), block: res.receipt.blockNumber.toString() });
}

async function round() {
  const users = await watchList();
  log({ event: "round", referee: account.address, users: users.length, gateway: env.GATEWAY_URL ? "set" : "MISSING" });
  for (const u of users) {
    try {
      await checkUser(u);
    } catch (e) {
      log({ user: u, verdict: "error", detail: (e as Error).message.slice(0, 200) });
    }
  }
}

await round();
if (!once) setInterval(() => void round(), env.REFEREE_INTERVAL_SEC * 1000);
