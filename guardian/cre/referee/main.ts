// LEASH Referee as a Chainlink CRE workflow (knot 4). Cron every minute + HTTP trigger (demo button).
// Reads the mandate onchain (EVM read on monad-testnet), the gateway's /health and /risk (HTTP capability,
// identical consensus), applies ../../src/rules.ts, and reports a verdict per user.
// Writes: CRE writes go through a forwarder into a receiver contract's onReport(); the deployed
// MandateRegistry only accepts pause() from the referee EOA, so the executor (guardian/src/executor.ts)
// signs the pause. See docs/LIMITATIONS.md for the receiver-contract upgrade path.
import {
  bytesToHex,
  consensusIdenticalAggregation,
  cre,
  encodeCallMsg,
  getNetwork,
  type HTTPSendRequester,
  json,
  LAST_FINALIZED_BLOCK_NUMBER,
  Runner,
  type Runtime,
} from "@chainlink/cre-sdk";
import { decodeFunctionResult, encodeFunctionData, zeroAddress, type Address } from "viem";
import { z } from "zod";
import { evaluate, type RefereeInput } from "../../src/rules";

const configSchema = z.object({
  schedule: z.string(),
  chainSelectorName: z.string(),
  mandateRegistry: z.string(),
  gatewayUrl: z.string(),
  envioUrl: z.string(),
  watch: z.array(z.string()),
  minLiqDistancePct: z.number(),
  maxCacheLagBlocks: z.number(),
});
type Config = z.infer<typeof configSchema>;

// ARCHITECTURE §7.1 (frozen): MandateRegistry.getMandate(address) → Mandate.
const getMandateAbi = [
  {
    type: "function",
    name: "getMandate",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "policyHash", type: "bytes32" },
          { name: "maxNotionalUsd6", type: "uint64" },
          { name: "maxLeverageX10", type: "uint16" },
          { name: "maxWeeklyLossBps", type: "uint16" },
          { name: "agentId", type: "uint256" },
          { name: "agentWallet", type: "address" },
          { name: "perplKey", type: "address" },
          { name: "paused", type: "bool" },
          { name: "updatedAt", type: "uint64" },
        ],
      },
    ],
  },
] as const;

function readMandate(runtime: Runtime<Config>, user: Address): RefereeInput["mandate"] {
  const network = getNetwork({ chainFamily: "evm", chainSelectorName: runtime.config.chainSelectorName, isTestnet: true });
  if (!network) throw new Error(`network ${runtime.config.chainSelectorName} not found`);
  const evm = new cre.capabilities.EVMClient(network.chainSelector.selector);
  const data = encodeFunctionData({ abi: getMandateAbi, functionName: "getMandate", args: [user] });
  const res = evm
    .callContract(runtime, { call: encodeCallMsg({ from: zeroAddress, to: runtime.config.mandateRegistry as Address, data }), blockNumber: LAST_FINALIZED_BLOCK_NUMBER })
    .result();
  const m = decodeFunctionResult({ abi: getMandateAbi, functionName: "getMandate", data: bytesToHex(res.data) });
  if (m.updatedAt === 0n) return null;
  return { maxWeeklyLossBps: Number(m.maxWeeklyLossBps), paused: m.paused };
}

/** GET a gateway path; returns the JSON body as a string, or "" on any failure (→ counts as stale). */
const fetchGateway = (sendRequester: HTTPSendRequester, url: string): string => {
  try {
    const resp = sendRequester.sendRequest({ url, method: "GET" as const }).result();
    if (resp.statusCode < 200 || resp.statusCode >= 300) return "";
    return JSON.stringify(json(resp));
  } catch {
    return "";
  }
};

function gatewayJson(runtime: Runtime<Config>, path: string): unknown | null {
  const http = new cre.capabilities.HTTPClient();
  const body = http.sendRequest(runtime, fetchGateway, consensusIdenticalAggregation<string>())(`${runtime.config.gatewayUrl}${path}`).result();
  return body ? JSON.parse(body) : null;
}

function checkAll(runtime: Runtime<Config>): string {
  const verdicts = runtime.config.watch.map((u) => {
    const user = u as Address;
    const mandate = readMandate(runtime, user);
    const h = gatewayJson(runtime, "/health") as { ok?: boolean; cacheLagBlocks?: number } | null;
    const r = gatewayJson(runtime, `/risk/${user}`) as { weeklyPnlPct?: string | number; positions?: { market: string; liqDistancePct: string | number }[] } | null;
    const v = evaluate(
      {
        mandate,
        health: h && typeof h.ok === "boolean" ? { ok: h.ok, cacheLagBlocks: Number(h.cacheLagBlocks ?? 0) } : null,
        risk: r && r.weeklyPnlPct !== undefined ? { weeklyPnlPct: String(r.weeklyPnlPct), positions: (r.positions ?? []).map((p) => ({ market: p.market, liqDistancePct: String(p.liqDistancePct) })) } : null,
        // CRE runs are stateless: each run reports one stale observation; the executor counts consecutive ones.
        staleCount: 0,
      },
      { staleFailsMax: 3, minLiqDistancePct: runtime.config.minLiqDistancePct, maxCacheLagBlocks: runtime.config.maxCacheLagBlocks },
    );
    const line = v.action === "pause" ? `BREACH user=${user} rule=${v.rule} → pause(user,"${v.reason}") — ${v.detail}` : `${v.action} user=${user} — ${v.detail}`;
    runtime.log(line);
    return { user, ...v };
  });
  return JSON.stringify(verdicts);
}

const onCron = (runtime: Runtime<Config>): string => checkAll(runtime);
const onHttp = (runtime: Runtime<Config>): string => {
  runtime.log("HTTP trigger: on-demand referee check");
  return checkAll(runtime);
};

const initWorkflow = (config: Config) => [
  cre.handler(new cre.capabilities.CronCapability().trigger({ schedule: config.schedule }), onCron),
  cre.handler(new cre.capabilities.HTTPCapability().trigger({}), onHttp),
];

export async function main() {
  const runner = await Runner.newRunner<Config>({ configSchema });
  await runner.run(initWorkflow);
}

main();
