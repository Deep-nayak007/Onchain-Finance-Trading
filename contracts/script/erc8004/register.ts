/**
 * Register the three LEASH trader personas (Falcon, Otter, Owl) as ERC-8004
 * agents on Monad mainnet (chain 143) via the Agent0 SDK.
 *
 * The SDK mints the agent NFT in the Identity Registry, uploads the agent card
 * to IPFS (Pinata), and sets the agent URI. Each persona is owned by its own
 * persona wallet (from addresses.ts PERSONAS, supplied by Brain at CP1).
 *
 * Pattern reference: https://github.com/Eversmile12/erc-8004-demo-agent
 * SDK docs: https://sdk.ag0.xyz/
 * Registry addresses (verified on 143): see packages/shared/addresses.ts ERC8004.
 *
 * Env:
 *   PINATA_JWT          IPFS uploads
 *   MONAD_RPC           chain 143 RPC
 *   API_URL             the persona's A2A/service endpoint
 *   FALCON_PRIVATE_KEY  persona wallet keys (owners); one per persona
 *   OTTER_PRIVATE_KEY
 *   OWL_PRIVATE_KEY
 *
 * Run:  pnpm tsx contracts/script/erc8004/register.ts
 *
 * After it prints the agentIds, copy them into addresses.ts PERSONAS and
 * confirm they appear on https://8004scan.io and https://www.trust8004.xyz.
 */
import "dotenv/config";
// agent0-sdk resolves the registries by chainId; chain 143 maps to the Monad
// mainnet IdentityRegistry 0x8004A169FB4a3325136EB29fA0ceB6D2e539a432.
import { SDK } from "agent0-sdk";

const CHAIN_ID = 143;
const RPC = process.env.MONAD_RPC ?? "https://rpc.monad.xyz";
const API_URL = process.env.API_URL ?? "https://api.leash.example";

type Persona = {
  key: string; // env var name holding the persona wallet private key
  name: string;
  style: string;
  image: string;
};

const PERSONAS: Persona[] = [
  {
    key: "FALCON_PRIVATE_KEY",
    name: "Falcon",
    style:
      "Momentum trader on Perpl perps. Follows smart money (Nansen) and only acts when the move and the flow agree. LIVE.",
    image: "ipfs://REPLACE_FALCON_IMAGE",
  },
  {
    key: "OTTER_PRIVATE_KEY",
    name: "Otter",
    style:
      "Mean-reversion trader. Small size, long cooldowns, patient entries. SHADOW.",
    image: "ipfs://REPLACE_OTTER_IMAGE",
  },
  {
    key: "OWL_PRIVATE_KEY",
    name: "Owl",
    style:
      "Funding harvester. Collects Perpl funding and hedges the spot leg on Kuru. SHADOW.",
    image: "ipfs://REPLACE_OWL_IMAGE",
  },
];

async function registerPersona(p: Persona): Promise<void> {
  const pk = process.env[p.key];
  if (!pk) throw new Error(`${p.key} not set`);
  if (!process.env.PINATA_JWT) throw new Error("PINATA_JWT not set");

  const sdk = new SDK({
    chainId: CHAIN_ID,
    rpcUrl: RPC,
    signer: pk,
    ipfs: "pinata",
    pinataJwt: process.env.PINATA_JWT,
  });

  const agent = sdk.createAgent(p.name, p.style, p.image);
  // The persona's service endpoint (Brain's API). supportedTrust = reputation,
  // which Envio-computed track records back.
  await agent.setA2A(`${API_URL}/traders/${p.name.toLowerCase()}`);
  agent.setTrust(true, false, false); // reputation only
  agent.setActive(true);

  const result = await agent.registerIPFS();
  console.log(`✅ ${p.name}: agentId=${result.agentId} uri=${result.agentURI}`);
  console.log(`   8004scan: https://8004scan.io  |  trust8004: https://www.trust8004.xyz`);
}

async function main() {
  console.log(`Registering LEASH personas on Monad (chain ${CHAIN_ID})...`);
  for (const p of PERSONAS) {
    try {
      await registerPersona(p);
    } catch (e: any) {
      console.error(`❌ ${p.name}: ${e?.message ?? e}`);
    }
  }
  console.log("\nCopy the agentIds into packages/shared/addresses.ts PERSONAS.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
