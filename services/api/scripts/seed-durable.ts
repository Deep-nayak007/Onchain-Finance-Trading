// One-off: copy live state from the RUNNING Brain into the durable Postgres mirror, so the first boot with
// DATABASE_URL restores it. Rows are produced by the real Store (same format the Brain writes). Read-only on chain.
//   npx tsx --env-file=.env scripts/seed-durable.ts --account 0x… [--account 0x…] --receipt 0x… [--receipt 0x…]
import { createPublicClient, http, type Address } from "viem";
import { monadTestnet } from "viem/chains";
import { mandateRegistryAbi } from "@leash/shared/abis";
import { Policy, ReceiptDetail } from "@leash/shared";
import { PERSONA_IDS, persona as personaOf } from "../src/personas";
import { Store } from "../src/store/db";
import { DurableMirror } from "../src/store/mirror";
import { PrivyClient } from "../src/wallet/privy";
import { Wallets } from "../src/wallet/wallets";

const API = process.env.API_URL ?? "https://leash-brain-api.onrender.com";
const REGISTRY = "0x81bbeaf263eeae41cfd4be137427af3ba7248467" as Address;
const args = process.argv.slice(2);
const list = (flag: string) => args.flatMap((a, i) => (args[i - 1] === flag ? [a] : []));

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL missing");
  const store = new Store();
  const mirror = DurableMirror.fromUrl(process.env.DATABASE_URL, store);
  await mirror.ensureSchema();
  mirror.attach();
  const pub = createPublicClient({ chain: monadTestnet, transport: http("https://testnet-rpc.monad.xyz") });
  const privy = new PrivyClient(process.env.PRIVY_APP_ID!, process.env.PRIVY_APP_SECRET!);

  for (const account of list("--account")) {
    const p = (await (await fetch(`${API}/policy/${account}`)).json()) as { policy: unknown; policyHash: string; persona: string };
    const policy = Policy.parse(p.policy);
    const m = (await pub.readContract({ address: REGISTRY, abi: mandateRegistryAbi, functionName: "getMandate", args: [account as Address] })) as {
      policyHash: string;
      agentId: bigint;
      agentWallet: Address;
      paused: boolean;
    };
    if (m.policyHash.toLowerCase() !== p.policyHash.toLowerCase()) throw new Error(`${account}: onchain policyHash differs from the Brain's`);
    const persona = PERSONA_IDS.find((id) => personaOf(id).agentId === m.agentId.toString()) ?? "falcon";
    const w = await privy.findWalletByAddress(m.agentWallet);
    if (!w) throw new Error(`${account}: agent wallet ${m.agentWallet} not found in Privy`);
    store.savePolicy(p.policyHash, policy);
    store.upsertUser({ account, persona, policy, policyHash: p.policyHash, state: m.paused ? "PAUSED" : "RUNNING" });
    store.saveWallet({ key: Wallets.userKey(account, persona), walletId: w.id, address: w.address as Address, policyId: w.policy_ids?.[0] ?? null });
    store.setKv(`compile:${account.toLowerCase()}`, { persona, policyHash: p.policyHash });
    console.log(`seeded account ${account} (${persona}, ${m.paused ? "PAUSED" : "RUNNING"}, agent ${m.agentWallet})`);
  }

  for (const hash of list("--receipt")) {
    const r = await fetch(`${API}/receipts/${hash}`);
    if (!r.ok) throw new Error(`receipt ${hash}: ${r.status}`);
    const d = ReceiptDetail.parse(await r.json());
    const account = list("--account")[0] ?? null;
    store.saveReceipt(d, { account, status: d.decision.allowed ? "EXECUTED" : "REJECTED" });
    console.log(`seeded receipt ${hash}`);
  }

  await mirror.drain();
  console.log(`mirror: pending ${mirror.status.pending}, lastError ${mirror.status.lastError ?? "none"}`);
}

void main().catch((e) => {
  console.error("seed failed:", (e as Error).message.slice(0, 300));
  process.exit(1);
});
