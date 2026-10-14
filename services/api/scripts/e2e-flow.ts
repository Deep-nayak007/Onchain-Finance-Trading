// Live WRITE-path e2e against the deployed testnet stack, exactly as the app does it, with a throwaway account whose key
// lives only in memory (never printed). drip → compile → setMandate → activate → kill refused while active → pause →
// kill (cleanup legs) → resume → activate → pause + kill (leave nothing running).
//   cd services/api && npx tsx scripts/e2e-flow.ts
import { createPublicClient, createWalletClient, encodeFunctionData, http, parseUnits, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "viem/chains";
import { mandateRegistryAbi } from "@leash/shared/abis";
import { sendTxAndWait } from "@leash/shared/sendTx";
import { policyHash, reasonHash, signalHash } from "@leash/shared";
const POINTER = "https://raw.githubusercontent.com/yashpy/Onchain-Finance-Trading/main/deploy/envio-url.txt";

const API = process.env.API_URL ?? "https://leash-brain-api.onrender.com";
const RPC = "https://testnet-rpc.monad.xyz";

let fails = 0;
const check = (name: string, ok: boolean, got: unknown) => {
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name} → ${typeof got === "string" ? got : JSON.stringify(got)}`.slice(0, 220));
};
async function api(method: string, path: string, body?: unknown) {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });
  return { status: r.status, json: (await r.json().catch(() => null)) as Record<string, unknown> | null };
}

async function main() {
  const account = privateKeyToAccount(generatePrivateKey());
  const user = account.address;
  console.log(`throwaway account ${user}`);
  const pub = createPublicClient({ chain: monadTestnet, transport: http(RPC) });
  const wallet = createWalletClient({ account, chain: monadTestnet, transport: http(RPC) });
  const cfg = await api("GET", "/config");
  const registry = (cfg.json?.addresses as { mandateRegistry: Address }).mandateRegistry;
  const tx = (data: Hex) => sendTxAndWait(wallet, pub, { to: registry, data }, { chainId: 10143 });

  // Each run costs two drips (user + agent wallet); don't drain the shared tank.
  const tank = Number((await api("GET", "/health")).json?.gasTankMon ?? 0);
  if (tank < Number(process.env.MIN_TANK ?? 0.5)) {
    console.log(`SKIP  gas tank has ${tank} MON (< 0.5); refill it before running the write-path test`);
    process.exit(2);
  }
  const drip = await api("POST", "/gas/drip", { account: user });
  check("drip", drip.status === 200, drip);
  const repeat = await api("POST", "/gas/drip", { account: user });
  check("repeat drip → 409 (one per address)", repeat.status === 409, repeat);
  const bal = await pub.getBalance({ address: user });
  check("drip landed onchain", bal > 0n, bal.toString());

  const c = await api("POST", "/mandate/compile", { account: user, persona: "falcon", text: "Max 2x leverage, $20 a trade, stop if I lose 5% in a week." });
  check("compile", c.status === 200 && !!c.json?.agentWallet && !!c.json?.perplKey, { status: c.status, agentWallet: c.json?.agentWallet, perplKey: c.json?.perplKey, warnings: c.json?.warnings });
  if (c.status !== 200 || !c.json?.agentWallet) process.exit(1);
  const p = c.json.policy as { maxNotionalUsd: string; maxLeverage: number; maxWeeklyLossPct: number };
  check("policyHash recomputes", policyHash(c.json.policy) === c.json.policyHash, c.json.policyHash);

  const set = await tx(
    encodeFunctionData({
      abi: mandateRegistryAbi,
      functionName: "setMandate",
      args: [
        {
          policyHash: c.json.policyHash as Hex,
          maxNotionalUsd6: parseUnits(p.maxNotionalUsd, 6),
          maxLeverageX10: Math.round(p.maxLeverage * 10),
          maxWeeklyLossBps: Math.round(p.maxWeeklyLossPct * 100),
          agentId: BigInt(String(c.json.agentId ?? "0")),
          agentWallet: c.json.agentWallet as Address,
          perplKey: c.json.perplKey as Address,
          paused: false,
          updatedAt: 0n,
        },
      ],
    }),
  );
  check("setMandate onchain (explicit gas)", set.receipt.status === "success", `${set.hash} gas ${set.gas}`);

  const act = await api("POST", "/agent/activate", { account: user, txHash: set.hash, policy: c.json.policy });
  check("activate → RUNNING", act.status === 200 && act.json?.state === "RUNNING", act);
  const st = await api("GET", `/agent/status/${user}`);
  check("status RUNNING", st.json?.state === "RUNNING", st.json);
  const pol = await api("GET", `/policy/${user}`);
  check("policy served", pol.status === 200, pol.status);
  // Fresh verifiable receipt (needs DEMO_TOKEN): paper intent → onchain logReceipt → API reasoning ↔ Envio record.
  if (process.env.DEMO_TOKEN) {
    const r = await fetch(`${API}/demo/intent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-demo-token": process.env.DEMO_TOKEN },
      body: JSON.stringify({ account: user, side: "LONG", sizeUsd: "5", leverage: 1, confidence: 0.9 }),
      signal: AbortSignal.timeout(120_000),
    });
    const dj = (await r.json()) as { kind?: string; status?: string; reasonHash?: string };
    check("demo intent decided + receipted", r.status === 200 && dj.kind === "decided" && !!dj.reasonHash, dj);
    if (dj.reasonHash) {
      const det = await api("GET", `/receipts/${dj.reasonHash}`);
      const d = det.json as { intent: unknown; decision: unknown; signalsSnapshot: unknown; reasonHash: string; signalHash: string } | null;
      check("API reasoning recomputes to reasonHash (✓)", det.status === 200 && !!d && reasonHash({ intent: d.intent, decision: d.decision }) === dj.reasonHash && signalHash(d.signalsSnapshot) === d.signalHash, det.status);
      const envio = (await (await fetch(POINTER)).text()).trim();
      let rec: unknown = null;
      for (let i = 0; i < 18 && !rec; i++) {
        await new Promise((res) => setTimeout(res, 5000));
        const q = await fetch(envio, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: "query($h:String!){ Receipt(where:{reasonHash:{_eq:$h}},limit:1){ id seq } }", variables: { h: dj.reasonHash.toLowerCase() } }) });
        rec = ((await q.json()) as { data?: { Receipt?: unknown[] } }).data?.Receipt?.[0] ?? null;
      }
      check("receipt indexed onchain (Envio)", !!rec, rec);
      console.log(`FRESH RECEIPT ${dj.reasonHash} tx ${String((rec as { id?: string } | null)?.id ?? "").split("-")[0]}`);
    }
  }

  // The trader must actually tick: an LLM (or fallback) decision, checked by the rules, receipted onchain.
  let last: Record<string, unknown> | null = null;
  for (let i = 0; i < 40 && !last?.lastDecision; i++) {
    await new Promise((r) => setTimeout(r, 10_000));
    last = (await api("GET", `/agent/status/${user}`)).json;
  }
  check("trader ticked (decision made)", !!last?.lastTick && !!last?.lastDecision, last);
  if (process.env.KEEP_RUNNING) {
    // Public demo account: leave the trader RUNNING (paper). The Referee can pause it; nobody else holds this key.
    console.log(`DEMO ACCOUNT ${user} (left running)`);
    console.log(fails ? `\n${fails} FAILED` : "\nall checks passed");
    process.exit(fails ? 1 : 0);
  }
  const killEarly = await api("POST", "/agent/kill", { account: user });
  check("kill while active onchain → 409", killEarly.status === 409, killEarly);

  const pause = await tx(encodeFunctionData({ abi: mandateRegistryAbi, functionName: "pause", args: [user, "user"] }));
  check("pause onchain", pause.receipt.status === "success", pause.hash);
  const kill = await api("POST", "/agent/kill", { account: user, txHash: pause.hash });
  const cleanup = kill.json?.cleanup as { wallet?: boolean; gatewayKey?: boolean } | undefined;
  check("kill → KILLED", kill.status === 200 && kill.json?.state === "KILLED", kill.json);
  check("kill cleanup: Privy deny-all", cleanup?.wallet === true, cleanup);
  check("kill cleanup: gateway key disabled", cleanup?.gatewayKey === true, cleanup);

  const resume = await tx(encodeFunctionData({ abi: mandateRegistryAbi, functionName: "resume", args: [] }));
  check("resume onchain", resume.receipt.status === "success", resume.hash);
  const re = await api("POST", "/agent/activate", { account: user, txHash: resume.hash, policy: c.json.policy });
  check("re-activate after resume → RUNNING", re.status === 200 && re.json?.state === "RUNNING", re.json);

  // leave nothing running
  const pause2 = await tx(encodeFunctionData({ abi: mandateRegistryAbi, functionName: "pause", args: [user, "user"] }));
  const kill2 = await api("POST", "/agent/kill", { account: user, txHash: pause2.hash });
  check("cleanup: paused + killed", kill2.json?.state === "KILLED", kill2.json?.state);

  console.log(fails ? `\n${fails} FAILED` : "\nall write-path checks passed");
  process.exit(fails ? 1 : 0);
}

void main().catch((e) => {
  console.error("FAIL  aborted:", (e as Error).message.slice(0, 300));
  process.exit(1);
});
