# LIMITATIONS — RAILS lane

Honest list of what is stubbed behind a frozen interface, and why. Each item
names the interface it sits behind so a teammate can build against it today and
the real implementation can drop in without a shape change.

## Contracts
- None. `MandateRegistry` and `ReceiptLog` are complete, implement
  ARCHITECTURE §7.1 exactly, and pass the full Foundry suite (31 tests). Deploy
  + verification is a runtime step gated on `DEPLOYER_PRIVATE_KEY` and
  `REFEREE_ADDRESS` (see docs/contracts.md).

## Perpl gateway
- **`/orders/execute` not yet exercised against mainnet.** The calldata is
  built with the Perpl SDK (`OrderRequest::builder` → `prepare_v2` →
  `execOrdersV2`), signed with alloy and sent with an explicit gas limit
  (estimate + 10%). It has not yet been run end-to-end against a funded
  trade-only key on chain 143 — that happens at CP2 with Prem. Behind the
  frozen §7.3 shape.
- **`/deposit/prepare` returns a documented error** until the exact collateral
  deposit selector is confirmed from the SDK ABI (CP2). Shape is frozen; the
  approve leg + exchange deposit are ready to fill in.
- **`/keys/prepare` enrollment payload** is pending the Q1 confirmation of how
  a third-party app prepares a Perpl trade-only key authorization for the user
  to sign (see docs/perpl-notes.md). The key is generated and the response
  shape is frozen; only the `enrollment` TxRequest body is a placeholder.
- **`/risk` weekly fields** (`weeklyPnlPct`, `fundingPaidUsd`, `slackLeftUsd`)
  are returned as "0" until Envio's `PnlSnapshot` baseline is wired at CP2–CP3.
  Live equity/collateral/positions and liq distance are real.

## Envio
- **PnL + fills not yet indexed.** `realizedPnlUsd`, `shadowPnlUsd`,
  `maxDrawdownPct`, `PnlSnapshot` and `PerplFill` are defined in the schema but
  populated at CP3 once the Perpl fill ABI is wired. Receipts, mandates, slack,
  pauses and the executed/rejected/shadow leaderboard counters are live now.
- **Kuru `Trade` is wired but needs the market address + decimals.** The
  `KuruOrderBook.Trade` event (signature from the Monad kuru-terminal reference
  indexer) is in `config.yaml` and handled into `KuruTrade`; it only needs the
  MON/AUSD order-book address (Q3, from Brain) and the market's base/quote
  decimals to scale `baseAmount`/`quoteAmount`. Side and price map today.
- **Persona-gated shadow counting** keys off `PERSONA_WALLETS` in
  `EventHandlers.ts`, which is empty until the persona wallet addresses land in
  `addresses.ts` at CP1. Until then shadows are counted unconditionally (noted
  in-handler); after CP1 only known persona wallets count.

## ERC-8004
- Registration script is ready; it runs at CP3 once persona wallet keys and
  `PINATA_JWT` are available. agentIds then go into `addresses.ts`.

## Open questions owned by Rails
- Q1 (trade-only key enrollment) and Q2 (collateral token): see
  docs/perpl-notes.md. Q2 is answered from the SDK; Q1's exact signing payload
  is confirmed at CP0 and dropped into `/keys/prepare`.
- Q5 (ERC-8004 registry on 143): answered — addresses verified on chain, in
  `addresses.ts`.

# LIMITATIONS — BRAIN lane

Updated 2026-10-12. Everything below sits behind an interface, so the real thing drops in without a shape change.

## Not live yet (waiting on other lanes)
- **Perpl gateway**: `GATEWAY_URL` unset → `MockGateway` serves Rails' `services/perpl-gateway/mock/*.json` in-process
  (static marks, so the LLM mostly HOLDs). Live Falcon trades need the real gateway + `LIVE=true` (Prem's call).
- **Envio**: `ENVIO_URL` unset → `/traders` has no stats; Referee watches `REFEREE_WATCH` instead of all active mandates.
- **ERC-8004 agentIds**: personas use `agentId = "0"` until Rails registers them (`PERSONAS` in `addresses.ts`).
- **Mainnet**: the demo runs on **Monad testnet (10143) by choice** (no mainnet MON budget). Mainnet is a **config-only switch**:
  `CHAIN_ID=143` + mainnet RPC in `services/api/.env`, `guardian/.env` and the Fly app; Rails deploys `MandateRegistry`/`ReceiptLog`
  to 143 and fills `LEASH.mainnet` in `addresses.ts`; re-point persona-wallet Privy policies to chain 143; fund agent/persona/
  referee/gas-tank wallets; gateway with `CHAIN_ID=143`; Face sets `EXPO_PUBLIC_CHAIN_ID=143`. No code changes. Proven on mainnet so
  far: Kuru market params read live on 143; Perpl mainnet exchange/collateral + ERC-8004 bytecode checked (Rails).
- **Web app (live)**: https://leash-app.onrender.com runs the Face app on real testnet services with a browser passkey wallet
  (free, no Apple account). Works where the browser supports WebAuthn PRF (Safari 18 / iCloud Keychain, Chrome with Google
  Password Manager). With iCloud Keychain the creation step may not return PRF, and browsers block the automatic follow-up
  prompt: tap "I already have a passkey" to unlock with a fresh tap. Perpl deposit/enrollment stay stubbed (no test AUSD), PnL
  series is empty (not indexed), Kuru testnet has no bids.
- **Envio Cloud blocked**: the indexer `leash-monad` exists on Envio Cloud (org prempagare07, repo `prempagare07/leash-indexer`)
  but Envio never receives the repo's push events (dashboard shows "GitHub app removed" even after reinstall; 0 commits). Until Envio
  support fixes it, the indexer is **self-hosted on Prem's Mac** behind a read-only proxy + Cloudflare quick tunnel (`scripts/envio-local`):
  same schema and queries; the URL is temporary and only up while the Mac is on.
- **Envio (indexer)**: deployed from a standalone mirror `prempagare07/leash-indexer` (the transferred monorepo couldn't be granted to the Envio GitHub app by collaborators); code is Envio-Cloud-ready (branch `envio`, verified locally); not yet hosted. Envio Cloud needs (1) the repo owner to grant the Envio Deployments GitHub app on the transferred
  repo `yashpy/Onchain-Finance-Trading` and (2) keep all indexer imports inside `indexer/` (config.yaml reads `../packages/shared/abis`).
  Self-hosting on Fly was prepared (`indexer/deploy/`) but the Fly trial blocks more apps. Until then `/traders` has no stats and the
  Referee watches `REFEREE_WATCH` instead of all active mandates; receipts still verify via the API + chain.
- **Envio (indexer)**: running **temporarily** as local `envio dev` on Rails' laptop, exposed through a Cloudflare
  quick tunnel (`SERVICES.envioUrl`). It is only reachable while that laptop is awake with both processes up, and the
  hostname changes on every tunnel restart. Envio Cloud is blocked on Envio's side for org `yashpy`: its linked-repo
  list is frozen (repos added after the original install never appear, even a brand-new repo), and `indexer add` for
  the fresh mirror `yashpy/leash-indexer` fails server-side (`Failed to add indexer`). The code is Envio-Cloud-ready:
  standalone mirrors `yashpy/leash-indexer` and `prempagare07/leash-indexer` (branch `envio`, root `./`, config
  `config.yaml`, pnpm 10 lockfile), verified with a frozen-lockfile install + codegen. Self-hosting files are in
  `indexer/deploy/` (Fly). Swap `SERVICES.envioUrl` to the hosted endpoint once either org deploys.
- **Gateway staleness**: `STALE_BLOCKS_MAX=50` (~20s). The default 20 (~8s at 0.4s blocks) flapped `ok:false` under the gateway's 20 req/s
  RPC throttle, which would have caused false Referee stale-pauses and refused executes.
- **Live Perpl orders on testnet**: need ≥ 100 testnet AUSD (no public faucet found) in an account owned by the agent trade key, plus
  Rails' gateway. Perpl's real "can't withdraw" mechanism is its API keys (mainnet design); the gateway path uses an owned demo account.
- **Kuru on testnet**: only the BUY side has liquidity and Kuru's testnet USDC has no public faucet → quotes/tx-building only.
- **`POST /demo/intent`** (token-guarded, paper-only) exists for filming the slack flow on a flat testnet market; receipts are labelled
  `manual-paper-test`.

## Stubs / honest gaps
- **Paper mode receipts**: with `LIVE=false`, allowed intents are receipted `EXECUTED` with `execTxHash = 0x0`
  (`ReceiptDetail.execTxHash = null`): no venue order was placed. The app should label these "paper".
- **Nansen (Q7)**: the netflow endpoint returns 0 rows for Monad today, so `smartMoneyScore = null`. **Demo choice:** every
  persona's default policy (and the compiler default) now has `requireSmartMoneyAgreement: false`, otherwise every open would be
  denied. Users can still ask for it in plain English. Falcon's signal in the demo is **Perpl price momentum** (see next item).
- **Live market data without the gateway**: until Rails' gateway is deployed, `/markets` is read **onchain from Perpl testnet**
  (`getPerpetualInfoV2`, ABI fragment copied verbatim from dex-sdk @78ce8a06), and Brain tracks a 30-min rolling mark history →
  `markChangePct`. Account risk + execution still use the mock gateway (`/risk` values are sample data).
- **Simulation (Q6)**: Alchemy simulation is unsupported on Monad and Tenderly is unavailable → no pre-trade simulation.
- **Referee write path (Q4)**: CRE detects (cron + HTTP, simulated on monad-testnet); the executor process signs `pause` with
  the referee key, because CRE writes need a receiver contract and the deployed registry's referee is an EOA. Fully-onchain
  path: deploy a `RefereeReceiver` (ReceiverTemplate) and set it as `referee` (registry redeploy, Rails).
  CRE runs are stateless, so "3× stale" is counted by the executor; each CRE run reports one stale observation.
- **Privy per-day caps**: Privy policies have no daily window; per-tx value cap + `MAX_ORDER_USD` + checker rate limits instead.
- **Kuru**: testnet has MON/USDC only (no MON/AUSD) and no bids → SELL quotes are refused rather than sent with `minOut = 0`.
  No real swap executed yet (needs a funded sleeve).
- **Alchemy Notify**: `/webhooks/alchemy` verifies `X-Alchemy-Signature` with `ALCHEMY_WEBHOOK_SIGNING_KEY` (not yet set).
- **Persona wallets** must be passed via `PERSONA_WALLETS` on each deploy, or new ones get created per database.
- `dripsSince` rate limit is per API instance (SQLite), fine for one instance.

## Test-only artefacts (clearly labelled)
- `services/api/scripts/paper-intent.ts`: submits a hand-written intent through the real checker/receipt path with
  `model = "manual-paper-test"` (used to prove the onchain receipt + slack flow while the LLM correctly HOLDs on static data).
- `guardian/scripts/demo-gateway.ts`: serves a breaching `/risk` to film the Referee before the real gateway is live.
- Fixture addresses in `packages/shared/fixtures/` are placeholders (`0x000…`); their hashes are real.


# LIMITATIONS — FACE lane

Updated October 12, 2026 after merging main `823c224` and checking the Render services. Current validation: [FACE_TESTNET_VALIDATION.md](FACE_TESTNET_VALIDATION.md).

- The app imports Rails' shared gateway URLs by chain: testnet `leash-perpl-gateway-testnet.onrender.com`, mainnet `leash-gateway.onrender.com`. Live testnet markets, account risk, Perpl depth, Kuru SDK depth and Envio receipt metadata were checked. Free-instance wake-up can take about a minute; requests allow 90 seconds and the UI offers retry.
- **Brain receipt reasoning is unavailable on Render:** both published hashes return 404, though their independent Envio/onchain records remain. Face retains feed rows and paper/slack metadata, shows pending verification and never invents reasoning, latency or a verification checkmark. The read-only cloud check intentionally exits 2 for this backend blocker. Prem was offline; no backend records were created or changed.
- Envio is a temporary self-hosted tunnel; its URL is read from the team's GitHub pointer and cached for 60 seconds. It remains dependent on the host laptop. Indexed PnL/fill statistics and gateway weekly PnL/funding are not yet complete upstream; the app cannot verify those as real performance.
- Deep explicitly approved native RP migration to `leash-brain-api.onrender.com` before any LEASH passkeys existed. Native configurations were regenerated. Android association is still 404; the debug fingerprint is in [FACE_PASSKEY_SETUP.md](FACE_PASSKEY_SETUP.md). iOS association currently lists Deep's Personal Team; Deep has no paid Apple Developer account. The native app still withholds iPhone sign-up without paid-team configuration. No real-device passkey ceremony or user-signed proof is claimed.
- `/keys/prepare` returns `keyAddress` and nullable `enrollment`; a null enrollment is handled as unavailable permission, never as successful authorization. Trade-only enrollment is still Q1. `/deposit/prepare` deliberately returns BAD_REQUEST upstream; this explains the Fund the Leash 400 and is not an app schema error. Perpl testnet account opening needs 100 test AUSD while this app's deposit demo remains capped at $25; live funding is not accepted. Mainnet LEASH contracts are absent and mainnet execution remains disabled upstream.
- Onchain rules, slack, pause/resume and activation use actual shared ABIs, addresses, unit helpers and gas-explicit sender, with chain checks and confirmed callbacks. User pause preparation works directly against the deployed registry even when Brain is unavailable. These flows still need real passkey signing and funded acceptance.
- Full rules can now be retrieved from Brain `/policy/:account` after a restart and are displayed only when their canonical fingerprint matches both the response and current onchain mandate. Missing rules remain unavailable. Registered testnet ERC-8004 identities are #2227, #2228 and #2229; real fill-derived performance remains pending.
- Kuru BUY depth/quotes are connected; testnet has no bids and no public USDC faucet. A funded real swap and signing remain untested. Paper receipts (`execTxHash:null`) never imply that an exchange trade was executed.
- Samples stay inside `apps/mobile/mocks`, reset on app reload and never become live proof. Sample orders/swaps illustrate flows. The sample compiler is deterministic and visibly labelled; sample hashes never show an onchain checkmark.
- `ios:cached` avoids Apple File Provider framework-signing errors by building under `Library/Caches`. Its simulator development URL defaults to localhost to avoid the previous Tailscale-IP App Transport Security error. Generated native projects are ignored.
- Runtime push delivery from a terminated physical app needs an EAS project and device testing. Polling remains available.
- The sample video/screenshots 01–06 are review artifacts; 07 records the earlier Fly paper receipt. New captures 08/09 record the current missing-reasoning state and live connection checks. These are not evidence of a real venue trade or Face ID ceremony.
- The previous dependency audit retained 29 inherited reports (18 high, 11 moderate). Incompatible Expo downgrades were not applied. Build warnings from viem/noble export resolution fall back successfully; native Xcode has one script-dependency warning.

No orders, swaps, deposits or app signatures were submitted during this integration. No teammate messages or deployments were sent. Source changes are pushed only to Face.
