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

Updated October 12, 2026. Face connects to the deployed Brain API on Monad testnet 10143 in paper mode. The public handoff receipt is independently verified against its actual ReceiptLog transaction, including reason hash, signal hash, execution hash and slack flag. This proves a paper decision was logged onchain; it does not prove a venue trade or a Face ID ceremony.

- Brain/Rails code was imported from their merged main branch. The live adapter now uses their actual shared canonicalizer, ABIs, addresses, unit helpers and gas-explicit sender. Sample data remains isolated in `apps/mobile/mocks`.
- A permanent passkey domain, paid Apple team/signing details, and an actual PRF-capable phone are missing. Real-device passkey acceptance and the 0-value testnet proof are pending. The app never selects a domain for the team.
- Gateway and Envio URLs are still absent. Risk/depth, general receipt feed, indexed PnL, Perpl deposit/enrollment/manual orders remain unavailable in the testnet profile, with explicit errors. There is no live fallback to sample data. The public receipt uses a documented transaction hash fetched from the RPC, not an invented indexer response or an unbounded historical scan.
- Onchain rules, slack, pause/resume and activation are wired but cannot be accepted end-to-end until real passkey signing works. Cloud compilation and unsigned setMandate preparation were tested. A fresh test wallet received 0.2 test MON once; repeat drip was refused. No app signature or user transaction was sent.
- The Kuru BUY quote and unsigned transactions were tested against the deployed API. A real swap still needs test USDC and signing. SELL uses a USD amount (API converts to MON); the testnet book has no bids. The Kuru depth display has no supplied live interface yet. Testnet spot dollars are labelled USDC, not AUSD.
- Full Policy JSON is retained during the session after compile and shown only if its hash matches the current mandate. There is no API endpoint to retrieve a full policy after app restart; unknown limits/performance remain unavailable rather than being guessed. Seven-day trader returns are unavailable; receipt counters/drawdown display only when the API supplies indexed stats.
- The sample rule compiler is deterministic and produces a visible sample warning. It is not an AI compiler. Persona performance and order-book data are samples. Sample hash matches never show an onchain ✓.
- Demo data is held in memory and resets when the app reloads. Demo orders and swaps illustrate flows rather than constitute an exchange or financial simulator.
- Native Desktop builds encounter Apple File Provider/Finder metadata errors during framework signing. `ios:cached` builds an identical dependency/source copy under `Library/Caches` without extended attributes. The generated iOS project is not source-controlled.
- Runtime delivery of push requests from a terminated app and real device permission/failure states need testing. Slack polling works independently of push.
- The two-minute preview and web screenshot exports use sample data. They are review assets, not evidence for live bounty acceptance. Submission form fields require the signed-in team workspace.
- `npm audit fix --ignore-scripts` leaves 29 inherited dependency reports (18 high, 11 moderate) in the current Expo/React Native dependency graph. npm suggests incompatible major changes/downgrades for the remaining reports, including Expo 44; those were not applied. Review upstream patches before a public production release. This is recorded as an unresolved check, not a clean security audit.

The permanent passkey domain was requested from Deep while work continued. No messages were sent to teammates and no app was deployed or submitted. Source updates are pushed to the face branch after validation.
