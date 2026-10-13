// Builds every dependency from config. Missing integrations degrade to safe stubs (logged once at boot).
import { KURU, KURU_TESTNET, PERPL, monadChain } from "@leash/shared";
import { createWalletClient, http, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { leashAddresses, makePublicClient, OnchainRegistry } from "./chain/contracts";
import { rpcUrl, type Config } from "./config";
import { makeGateway } from "./exec/gateway";
import { ChainMarketsGateway, perplChainConfig } from "./exec/perpl-chain";
import { MarkHistory } from "./signals/momentum";
import { Kuru } from "./exec/kuru";
import { makeChat } from "./llm/client";
import { Engine } from "./loop/engine";
import { LocalReceiptSink, OnchainReceiptSink } from "./loop/receipts";
import { Scheduler } from "./loop/scheduler";
import { ExpoPusher } from "./push/expo";
import { createApp, type AppDeps } from "./server";
import { Envio } from "./signals/envio";
import { Nansen } from "./signals/nansen";
import { Store } from "./store/db";
import { PrivyClient } from "./wallet/privy";
import { Wallets } from "./wallet/wallets";

export function buildApp(cfg: Config, opts: { store?: Store; startLoops?: boolean } = {}) {
  const log = (m: string) => console.log(m);
  const store = opts.store ?? new Store(cfg.DATABASE_PATH);
  const url = rpcUrl(cfg);
  const publicClient = makePublicClient(cfg.CHAIN_ID, url);
  const addresses = leashAddresses(cfg.CHAIN_ID);
  const registry = addresses ? new OnchainRegistry(publicClient, addresses.mandateRegistry) : null;

  const kuruMarket = (cfg.CHAIN_ID === 143 ? KURU.monAusdMarket : KURU_TESTNET.monUsdcMarket) as Address | null;
  const sleeveTokens = (cfg.CHAIN_ID === 143 ? [PERPL.collateralToken] : [KURU_TESTNET.usdc]).filter(Boolean) as Address[];
  const privy = cfg.PRIVY_APP_ID && cfg.PRIVY_APP_SECRET ? new PrivyClient(cfg.PRIVY_APP_ID, cfg.PRIVY_APP_SECRET) : null;
  const wallets = new Wallets(store, privy, {
    chainId: cfg.CHAIN_ID,
    receiptLog: addresses?.receiptLog ?? null,
    kuruMarkets: kuruMarket ? [kuruMarket] : [],
    tokens: sleeveTokens,
  });

  if (cfg.PERSONA_WALLETS) {
    const parsed = JSON.parse(cfg.PERSONA_WALLETS) as Record<string, { id: string; address: Address }>;
    for (const [persona, w] of Object.entries(parsed)) {
      const key = `persona:${persona}`;
      if (!store.getWallet(key)) store.saveWallet({ key, walletId: w.id, address: w.address, policyId: null });
    }
  }

  // No gateway yet → mock account/execute, but REAL Perpl markets read onchain when the chain has them (testnet).
  const perplCfg = perplChainConfig(cfg.CHAIN_ID);
  const gateway = !cfg.GATEWAY_URL && perplCfg ? new ChainMarketsGateway(publicClient, perplCfg, { maxOrderUsd: cfg.MAX_ORDER_USD }) : makeGateway(cfg);
  const marks = new MarkHistory();
  const nansen = new Nansen(store, { apiKey: cfg.NANSEN_API_KEY, cacheSeconds: cfg.NANSEN_CACHE_SECONDS, dailyBudget: cfg.NANSEN_DAILY_CALLS });
  const envio = new Envio(cfg.ENVIO_URL);
  const chat = makeChat(cfg);
  const pusher = new ExpoPusher(store);
  const sink = wallets.configured && addresses ? new OnchainReceiptSink(wallets, publicClient, addresses.receiptLog, cfg.CHAIN_ID, url) : new LocalReceiptSink();

  const monPriceUsd = async () => {
    const m = (await gateway.markets()).find((x) => x.market === "MON-PERP");
    if (!m) throw new Error("no MON-PERP mark for sizing");
    return Number(m.mark);
  };
  const kuru = kuruMarket && url ? new Kuru({ market: kuruMarket, rpcUrl: url, chainId: cfg.CHAIN_ID, publicClient, wallets: wallets.configured ? wallets : null, monPriceUsd }) : null;

  const engine = new Engine({ live: cfg.LIVE, modelTick: cfg.LLM_MODEL_TICK, store, gateway, nansen, envio, marks, chat, registry, sink, pusher, spot: kuru, log });
  const scheduler = new Scheduler(engine, store, { tickSeconds: cfg.TICK_SECONDS, shadowTickSeconds: cfg.SHADOW_TICK_SECONDS, shadowPersonas: ["otter", "owl"], log });

  const gasTank = cfg.GAS_TANK_PRIVATE_KEY
    ? createWalletClient({ account: privateKeyToAccount(cfg.GAS_TANK_PRIVATE_KEY as `0x${string}`), chain: monadChain(cfg.CHAIN_ID), transport: http(url) })
    : null;

  const deps: AppDeps = {
    chainId: cfg.CHAIN_ID,
    live: cfg.LIVE,
    modelCompile: cfg.LLM_MODEL_COMPILE,
    store,
    chat,
    gateway,
    envio,
    registry,
    addresses,
    wallets,
    engine,
    scheduler,
    pusher,
    publicClient,
    drip: { wallet: gasTank, publicClient, amountMon: cfg.DRIP_MON, chainId: cfg.CHAIN_ID },
    kuru,
    alchemyNotifyToken: cfg.ALCHEMY_WEBHOOK_SIGNING_KEY,
    demoToken: cfg.DEMO_TOKEN,
    passkey: {
      appleTeamIds: (cfg.APPLE_TEAM_ID ?? "").split(",").map((s) => s.trim()).filter((s) => /^[A-Z0-9]{10}$/.test(s)),
      androidCertSha256: (cfg.ANDROID_CERT_SHA256 ?? "").split(",").map((s) => s.trim().toUpperCase()).filter((s) => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(s)),
      appId: cfg.MOBILE_APP_ID,
    },
    corsOrigins: cfg.CORS_ORIGINS?.split(",").map((s) => s.trim()),
    log,
  };

  const summary = [
    `chain=${cfg.CHAIN_ID}`,
    `live=${cfg.LIVE}`,
    `contracts=${addresses ? "yes" : "NO"}`,
    `gateway=${gateway.kind}${gateway instanceof ChainMarketsGateway ? "+perpl-onchain-markets" : ""}`,
    `llm=${chat ? "yes" : "fallback-only"}`,
    `privy=${privy ? "yes" : "NO"}`,
    `receipts=${sink.onchain ? "onchain" : "local"}`,
    `nansen=${cfg.NANSEN_API_KEY ? "yes" : "NO"}`,
    `envio=${envio.configured ? "yes" : "NO"}`,
    `kuru=${kuru ? "yes" : "NO"}`,
    `gasTank=${gasTank ? "yes" : "NO"}`,
  ].join(" ");

  return { app: createApp(deps), deps, scheduler, summary };
}
