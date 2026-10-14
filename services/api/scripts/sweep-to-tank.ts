// Testnet ops: return MON stranded in ORPHANED agent wallets (test runs, abandoned traders) to the gas tank.
// Never touches persona wallets or the agent wallet of any ACTIVE mandate (re-checked onchain per wallet).
// Each swept wallet is left with a deny-all policy. Secrets come from .env and are never printed.
//   cd services/api && npx tsx --env-file=.env scripts/sweep-to-tank.ts 0xWallet1 0xWallet2 ...
// Options: --keep <MON> leave this much behind · --force allow persona/active-mandate wallets you name explicitly ·
//          --restore-policy put the wallet's original Privy policy back afterwards (instead of deny-all).
import { createPublicClient, http, getAddress, type Address } from "viem";
import { monadTestnet } from "viem/chains";
import { PrivyClient } from "../src/wallet/privy";
import { denyAllPolicy } from "../src/wallet/policies";

const RPC = "https://testnet-rpc.monad.xyz";
const env = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`${k} missing`);
  return v;
};

async function main() {
  if (Number(process.env.CHAIN_ID ?? 10143) !== 10143) throw new Error("testnet only");
  const tank = getAddress(env("GAS_TANK_ADDRESS"));
  const keep = new Set((process.env.PERSONA_WALLETS ?? "").match(/0x[0-9a-fA-F]{40}/g)?.map((a) => a.toLowerCase()) ?? []);
  const privy = new PrivyClient(env("PRIVY_APP_ID"), env("PRIVY_APP_SECRET"));
  const pub = createPublicClient({ chain: monadTestnet, transport: http(RPC) });
  const envio = (await (await fetch("https://raw.githubusercontent.com/yashpy/Onchain-Finance-Trading/main/deploy/envio-url.txt")).text()).trim();
  const active = (await (
    await fetch(envio, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: "{ Mandate(where:{paused:{_eq:false}}) { agentWallet } }" }) })
  ).json()) as { data: { Mandate: { agentWallet: string }[] } };
  for (const m of active.data.Mandate) keep.add(m.agentWallet.toLowerCase());

  const argv = process.argv.slice(2);
  const opt = (f: string) => argv.includes(f);
  const keepIdx = argv.indexOf("--keep");
  const keepWei = keepIdx >= 0 ? BigInt(Math.round(Number(argv[keepIdx + 1]) * 1e6)) * 10n ** 12n : 0n;
  const targets = argv.filter((a, i) => /^0x[0-9a-fA-F]{40}$/.test(a) && argv[i - 1] !== "--keep");
  let total = 0n;
  for (const raw of targets) {
    const addr = getAddress(raw);
    if (keep.has(addr.toLowerCase()) && !opt("--force")) {
      console.log(`SKIP ${addr}: persona or active-mandate agent wallet`);
      continue;
    }
    const w = await privy.findWalletByAddress(addr);
    if (!w) {
      console.log(`SKIP ${addr}: not a Privy wallet of this app`);
      continue;
    }
    const bal = await pub.getBalance({ address: addr });
    const fees = await pub.estimateFeesPerGas();
    const gas = 21_000n; // plain transfer, explicit limit
    const maxFee = (fees.maxFeePerGas * 12n) / 10n;
    const value = bal - gas * maxFee - keepWei;
    if (value <= 0n) {
      console.log(`SKIP ${addr}: balance too small`);
      continue;
    }
    const allow = await privy.createPolicy({
      version: "1.0",
      name: `leash sweep to tank ${addr.slice(0, 8)}`,
      chain_type: "ethereum",
      rules: [
        {
          name: "Allow MON to gas tank only",
          method: "eth_signTransaction",
          action: "ALLOW",
          conditions: [
            { field_source: "ethereum_transaction", field: "chain_id", operator: "eq", value: "10143" },
            { field_source: "ethereum_transaction", field: "to", operator: "eq", value: tank.toLowerCase() },
          ],
        },
      ],
    });
    await privy.setWalletPolicy(w.id, allow.id);
    try {
      const nonce = await pub.getTransactionCount({ address: addr });
      const signed = await privy.signTransaction(w.id, { chainId: 10143, to: tank, value, gas, nonce, maxFeePerGas: maxFee, maxPriorityFeePerGas: fees.maxPriorityFeePerGas, type: "eip1559" });
      const hash = await pub.sendRawTransaction({ serializedTransaction: signed });
      const r = await pub.waitForTransactionReceipt({ hash });
      console.log(`${r.status === "success" ? "SWEPT" : "REVERTED"} ${addr} → tank ${(Number(value) / 1e18).toFixed(4)} MON ${hash}`);
      if (r.status === "success") total += value;
    } finally {
      if (opt("--restore-policy") && w.policy_ids?.length) await privy.setWalletPolicy(w.id, w.policy_ids[0]!);
      else {
        const deny = await privy.createPolicy(denyAllPolicy(addr.slice(0, 10)));
        await privy.setWalletPolicy(w.id, deny.id);
      }
    }
  }
  console.log(`total returned ${(Number(total) / 1e18).toFixed(4)} MON; tank now ${(Number(await pub.getBalance({ address: tank })) / 1e18).toFixed(4)} MON`);
}

void main().catch((e) => {
  console.error("sweep failed:", (e as Error).message.slice(0, 300));
  process.exit(1);
});
