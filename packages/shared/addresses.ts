// LEASH shared addresses — the single source of truth (ARCHITECTURE §9).
//
// RULES:
// - Every address here is either (a) deployed by us, or (b) read from an
//   authoritative source and verified to have bytecode on chain 143 with
//   `cast code <addr> --rpc-url $MONAD_RPC`.
// - Each externally-sourced address carries a comment linking its source.
// - Never invent an address. If it is not yet known, leave it `null` and fill
//   it in once the deploy/registration lands.

export const CHAIN_ID = 143 as const;
export const CHAIN_ID_TESTNET = 10143 as const;

export const RPC = {
  mainnet: 'https://rpc.monad.xyz',
  testnet: 'https://testnet-rpc.monad.xyz',
} as const;

export const EXPLORER = {
  // MonadVision (BlockVision) + Monadscan.
  monadVision: 'https://monadvision.io',
  monadscan: 'https://monadscan.com',
} as const;

/**
 * Perpl perpetual DEX on Monad mainnet.
 * Source: perpl-sdk `Chain::mainnet()` in
 * https://github.com/PerplFoundation/dex-sdk `crates/sdk/src/lib.rs`.
 * Verified: bytecode present on chain 143.
 */
export const PERPL = {
  exchange: '0x34B6552d57a35a1D042CcAe1951BD1C370112a6F',
  // Collateral token (Q2 — see docs/perpl-notes.md). 6-decimal AUSD-class token.
  collateralToken: '0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a',
  deployedAtBlock: 54773010,
} as const;

/**
 * Perpl on Monad testnet (10143), the live demo network.
 * Source: perpl-sdk `Chain::testnet()` (https://github.com/PerplFoundation/dex-sdk crates/sdk/src/lib.rs @78ce8a06)
 * and docs.perpl.xyz/resources/for-developers/networks-and-configuration. Bytecode checked on 10143 (Brain, 2026-10-12);
 * `getExchangeInfo()` confirms the collateral. Market ids from GET https://testnet.perpl.xyz/api/v1/pub/context.
 */
export const PERPL_TESTNET = {
  exchange: '0x1964C32f0bE608E7D29302AFF5E61268E72080cc',
  collateralToken: '0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC', // AUSD, 6 decimals; min account open 100 AUSD
  deployedAtBlock: 62953,
  perpIds: { 'MON-PERP': 64, 'BTC-PERP': 16, 'ETH-PERP': 32, 'SOL-PERP': 48 } as Record<string, number>,
} as const;

/**
 * ERC-8004 registries on Monad mainnet (chain 143).
 * Source: https://github.com/erc-8004/erc-8004-contracts README "Monad Mainnet".
 * Verified: bytecode present on chain 143. (Q5)
 */
export const ERC8004 = {
  identityRegistry: '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432',
  reputationRegistry: '0x8004BAa17C55a88189AE136b182e5fdA19dE9b63',
} as const;

export const ERC8004_TESTNET = {
  // Source: erc-8004-contracts README "Monad Testnet".
  identityRegistry: '0x8004A818BFB912233c491871b3d84c89A494BD9e',
  reputationRegistry: '0x8004B663056A597Dffe9eCcC1965A193B7388713',
} as const;

type Deployment = {
  address: `0x${string}` | null;
  deployBlock: number | null;
  explorer: string | null;
};

/**
 * LEASH contracts we deploy. Filled in at CP1 after `forge script Deploy`
 * (testnet first, then mainnet). Each entry gets its MonadVision/Monadscan
 * link once verified.
 */
export const LEASH = {
  mainnet: {
    mandateRegistry: { address: null, deployBlock: null, explorer: null } as Deployment,
    receiptLog: { address: null, deployBlock: null, explorer: null } as Deployment,
    // Referee key supplied by Brain via REFEREE_ADDRESS at CP0.
    referee: null as `0x${string}` | null,
  },
  testnet: {
    // Deployed by Deploy.s.sol on Monad testnet (10143), block 70331260.
    mandateRegistry: {
      address: '0x81bbeaf263eeae41cfd4be137427af3ba7248467',
      deployBlock: 70331260,
      explorer: 'https://testnet.monadexplorer.com/address/0x81bbeaf263eeae41cfd4be137427af3ba7248467',
    } as Deployment,
    receiptLog: {
      address: '0x21b168148e7c47ca0f1fab8bf9f69faff3aed6b3',
      deployBlock: 70331260,
      explorer: 'https://testnet.monadexplorer.com/address/0x21b168148e7c47ca0f1fab8bf9f69faff3aed6b3',
    } as Deployment,
    // Referee key from Brain (REFEREE_ADDRESS).
    referee: '0xFad2FFf6024214711Dc3A6521F40e5871A779a44' as `0x${string}` | null,
  },
} as const;

/**
 * Trader persona identities. `agentId` filled in at CP3 after ERC-8004
 * registration via the Agent0 SDK; `wallet` comes from Brain at CP1.
 * Envio counts a shadow receipt only when msg.sender matches one of these
 * persona wallets.
 */
export const PERSONAS = {
  falcon: { agentId: null as string | null, wallet: null as `0x${string}` | null, mode: 'LIVE' },
  otter: { agentId: null as string | null, wallet: null as `0x${string}` | null, mode: 'SHADOW' },
  owl: { agentId: null as string | null, wallet: null as `0x${string}` | null, mode: 'SHADOW' },
} as const;

/**
 * Kuru spot order book — router + MON/AUSD market. Supplied by Brain (Q3) at
 * CP2. Left null until sourced and bytecode-checked on chain 143.
 *
 * Integration notes:
 * - Owl's hedge sleeve + Face's spot screen use the Kuru TS SDK
 *   `@kuru-labs/kuru-sdk` (e.g. `KuruSdk.IOC.placeMarket()`), owned by
 *   Brain/Face.
 * - RAILS indexes the order book's `Trade` event into `KuruTrade`; the event
 *   signature comes from the Monad kuru-terminal reference indexer
 *   (https://github.com/monad-developers/kuru-terminal). The `monAusdMarket`
 *   address below is the order-book contract the indexer watches.
 */
export const KURU = {
  // Source: https://docs.kuru.io/contracts/Contract-addresses (Mainnet). Bytecode checked on 143 (Brain, Q3).
  router: '0xd651346d7c789536ebf06dc72aE3C8502cd695CC' as `0x${string}` | null,
  monAusdMarket: '0x131a2e70a5b31a517a74b8c567149bc294470da9' as `0x${string}` | null,
} as const;

export const KURU_TESTNET = {
  // Source: https://docs.kuru.io/contracts/Contract-addresses (Testnet). Bytecode checked on 10143 (Brain, Q3).
  // No MON/AUSD market on testnet; MON/USDC is the official testnet market.
  router: '0x7EFbE105Ca7415dE98F96622173458ac1c054630' as `0x${string}` | null,
  monUsdcMarket: '0xa241896A7Dbe8a550D2E5fF7A914bB1989ceD2D9' as `0x${string}` | null,
  usdc: '0x3bA3d39AFcf8bb994f7964B3e0171Ea2Ba361570' as `0x${string}` | null,
} as const;

/** Live service URLs. Filled in as each deploys. */
export const SERVICES = {
  // Public HTTPS Perpl gateway (CP1). Render free tier, reads Perpl mainnet
  // (chain 143). /health ok when cache lag <= STALE_BLOCKS_MAX (60 on Render).
  gatewayUrl: 'https://leash-gateway.onrender.com' as string | null,
  // Envio Cloud GraphQL endpoint (CP2).
  envioUrl: null as string | null,
} as const;