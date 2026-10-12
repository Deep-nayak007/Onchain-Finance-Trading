# RAILS — Contracts, Perpl gateway, Envio

> Paste into your coding agent with `ARCHITECTURE.md`. Work in `contracts/`, `services/perpl-gateway/`, `indexer/`, `packages/shared/abis/`, `packages/shared/addresses.ts` on branch `rails`.

## Mission
Everything onchain, Perpl execution, and the data layer every screen reads. Three of the five knots live in your code (Rules onchain, Exchange key, plus the data the Referee trusts). Ship stable ABIs first; everyone builds on them.

## Deliverables

| Due | Deliverable | Acceptance |
|---|---|---|
| **CP0** Sun 23:00 | `IMandateRegistry.sol`, `IReceiptLog.sol` exactly as §7.1 + ABIs in `packages/shared/abis/`; `indexer/schema.graphql` + `packages/shared/queries.graphql` + JSON fixtures; gateway OpenAPI stub (§7.3) + mock responses | Brain and Face build against them |
| **CP0** | Answer **Q1** (Perpl trade-only keys) and **Q2** (collateral token) in chat | Posted |
| CP1 Mon 12:00 | `MandateRegistry` + `ReceiptLog` implemented; Foundry tests: only user sets mandate/slack; slack expiry ≤ 24h; pause by user or referee clears slack; only user resumes; only `agentWallet` logs receipts; EXECUTED reverts when paused; `logShadow` forces `user = msg.sender`, `status = SHADOW`; seq increments | Tests pass |
| CP1 | Deployed on 10143 then **143**, verified on MonadVision (Sourcify) + Monadscan; addresses + explorer links in `addresses.ts` | Verified badges |
| CP1 | Gateway (axum): `perpl-sdk` snapshot + event cache on mainnet; `/health`, `/markets`, `/book`, `/account`; public HTTPS URL | Matches the Perpl UI for a test account |
| CP1 | Envio indexer on `MandateRegistry` + `ReceiptLog` (all events incl. `SlackGranted`, `Paused`) | Test receipts in GraphQL |
| CP2 Mon 20:00 | Gateway `/orders/prepare`, `/deposit/prepare`, `/orders/execute` (per-user trade-only key, idempotent, explicit gas; refuses if `!isActive`, stale cache, market not allowlisted, size > `MAX_ORDER_USD`) | One manual (app-signed) and one agent trade on 143 |
| CP2 | Indexer on **Envio Cloud**, URL in `addresses.ts` | App reads it |
| CP3 Tue 08:00 | `/risk/:address` (liq price + distance, exposure, unrealized PnL, funding, weekly PnL %, `slackLeftUsd`); `/keys/prepare`, `/keys/disable` | Numbers sanity-checked against the Perpl UI |
| CP3 | Indexer: Perpl fills + Kuru trades → `realizedPnlUsd`, `shadowPnlUsd` (mark-to-market from Perpl prices), `maxDrawdownPct`, daily `PnlSnapshot`; shadow receipts counted only from known persona wallets | Leaderboard query returns Falcon/Otter/Owl |
| CP3 | ERC-8004: register Falcon, Otter, Owl via Agent0 SDK (agent cards on IPFS: name, style, services → `API_URL`, `supportedTrust`); agentIds in `addresses.ts` | Visible on 8004scan / trust8004 |
| Ship | `docs/contracts.md` (addresses, events, why it's safe) + architecture diagram PNG for README | Done |
| Stretch | `pauseWithPasskey(user, webauthnAssertion)` via P-256 precompile `0x0100`, relayable by anyone | Only after CP3 |

## Contract notes
- Constructor takes `referee` address (get it from Brain at CP0). No owner, no upgradability; judges will read it. Keep each contract ≲ 150 lines.
- `ReceiptLog` reads `MandateRegistry.getMandate(user).agentWallet` for auth. Use the `ReceiptInput` struct; enable `via_ir` if stack-too-deep.
- foundry.toml: `network = "monad"`, `metadata = true`, `metadata_hash = "none"`, `use_literal_content = true`.
- Verify: `forge verify-contract <addr> <Name> --chain 143 --verifier sourcify --verifier-url https://sourcify-api-monad.blockvision.org/` and `--verifier etherscan --etherscan-api-key $KEY --watch`.

## Gateway notes
- `perpl-sdk` (Rust ≥ 1.85) caches state from snapshot + events and **prepares** `execOrdersV2` calldata; it doesn't sign, so sign with alloy. `perpl-cli` for manual tests. Local tests need the Monad anvil from `category-labs/foundry` `v1.5.0-monad.0.2.0`. Examples: `PerplFoundation/dex-sdk-examples`.
- One trade-only key per user, generated and held only by the gateway (env/KMS-lite file). It can never withdraw, so a hot key is safe by design; say so in docs.
- Fail closed: refuse to execute when `cacheLagBlocks` exceeds a threshold.
- Explicit gas on every tx; log `idempotencyKey → txHash`.

## Envio notes
- `claude mcp add --transport http envio-docs https://docs.envio.dev/mcp`
- `pnpx envio@3.0.0-rc.0 init template -t erc20 -l typescript -d ./indexer --api-token ""`, then swap in our contracts. Use the auto-discovered `.claude/skills/` (config, schema, handlers, multichain, testing, external calls).
- Deploy: Envio GitHub App → push to `envio` branch → `pnpx envio-cloud login` → `pnpx envio-cloud indexer add --name leash-monad --repo <repo> --branch envio --yes` → `envio-cloud deployment status … -o json`.
- `Receipt.id = txHash-logIndex`. If PnL from fills is blocked by CP2, fall back to gateway-computed PnL and note it in `docs/LIMITATIONS.md`.

## You consume
Brain: referee address (CP0), persona wallet addresses (CP1), Kuru addresses (Q3).

## Docs to load
Monad: llms.txt, Differences from Ethereum, Verify (Foundry), Precompiles. Perpl: docs.perpl.xyz For developers + Quickstart, `cargo doc -p perpl-sdk`. ERC-8004: Agent0 SDK, `erc-8004-contracts` README (Q5), best-practices. Envio: HyperIndex quickstart, Index Monad data, HyperSync, envio-cloud CLI.
