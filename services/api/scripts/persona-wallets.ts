// Creates (or reuses) the three persona Privy wallets, each locked to ReceiptLog.logShadow on CHAIN_ID,
// optionally drips gas from the gas tank, and prints the PERSONA_WALLETS env line + addresses for Rails.
//   CHAIN_ID=10143 pnpm persona-wallets [--drip]
import "dotenv/config";
import type { Address } from "viem";
import { buildApp } from "../src/app";
import { loadConfig } from "../src/config";
import { drip } from "../src/gas/drip";
import { PERSONA_IDS } from "../src/personas";

const cfg = loadConfig();
const { deps, summary } = buildApp(cfg);
console.log(`[persona-wallets] ${summary}`);
if (!deps.wallets.configured) {
  console.error("Privy or ReceiptLog not configured for this chain");
  process.exit(1);
}

const out: Record<string, { id: string; address: Address }> = {};
for (const p of PERSONA_IDS) {
  const w = await deps.wallets.personaWallet(p);
  out[p] = { id: w.walletId, address: w.address };
  console.log(`${p.padEnd(6)} ${w.address}`);
  if (process.argv.includes("--drip")) {
    try {
      const r = await drip({ ...deps.drip, store: deps.store }, w.address);
      console.log(`       dripped ${r.amountMon} MON: ${r.txHash}`);
    } catch (e) {
      console.log(`       drip skipped: ${(e as Error).message}`);
    }
  }
}
console.log(`\nAdd to services/api/.env (wallet ids are not secrets; unusable without the Privy app secret):`);
console.log(`PERSONA_WALLETS='${JSON.stringify(out)}'`);
process.exit(0);
