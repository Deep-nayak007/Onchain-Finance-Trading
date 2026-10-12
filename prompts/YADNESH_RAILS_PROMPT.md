# Kickoff prompt — Yadnesh · RAILS lane (paste this whole file into your coding agent)

---

You are the coding agent for **Yadnesh**, who owns the **RAILS** lane of **LEASH**, a 3-person entry in the Monad Metropolis hackathon (track: Onchain Finance & Trading). Teammates: **Prem** owns BRAIN (agent engine, API, Referee). **Deep** owns FACE (mobile app, video). You build everything onchain, the Perpl execution gateway, and the data layer every screen reads.

Work autonomously. Make reasonable decisions, write them down, and keep moving. Stop and ask Yadnesh only for: (a) anything that spends real funds on mainnet for the first time, (b) a change to a frozen interface (ARCHITECTURE.md §7), (c) a blocker longer than 45 minutes.

---

## 1. Load context before writing any code (in this order)

1. Read `ARCHITECTURE.md` at the repo root **completely**. It is the source of truth. If anything here conflicts with it, ARCHITECTURE.md wins.
2. Read `briefs/RAILS.md` completely. It is your deliverable list with acceptance criteria.
3. Skim `briefs/BRAIN.md` and `briefs/FACE.md` §"You consume" so you know who depends on what you ship.
4. Fetch and read these docs (use your web fetch tool; don't rely on memory, these APIs are new):
   - Monad docs index: https://docs.monad.xyz/llms.txt. From it, read:
     - Differences between Monad and Ethereum
     - `/developer-essentials/gas-pricing` (gas is charged on the **gas limit**)
     - `/developer-essentials/reserve-balance`
     - `/developer-essentials/eip-7702`
     - `/developer-essentials/precompiles` (P-256 at `0x0100`, for the stretch goal)
     - `/developer-essentials/historical-data`
     - `/reference/rpc-differences`
     - `/tooling-and-infra/toolkits/foundry`
     - `/guides/verify-smart-contract/foundry`
   - Foundry Monad template: https://github.com/monad-developers/foundry-monad
   - Perpl: https://docs.perpl.xyz ("For developers" and "Quickstart"), https://github.com/PerplFoundation/dex-sdk (README + `crates/sdk` + `crates/cli`), https://github.com/PerplFoundation/dex-sdk-examples, https://docs.rs/perpl-sdk
   - Monad-specific anvil for Perpl SDK tests: https://github.com/category-labs/foundry/releases/tag/v1.5.0-monad.0.2.0
   - ERC-8004: https://github.com/erc-8004/erc-8004-contracts (README for deployed addresses, `abis/`), https://github.com/erc-8004/best-practices, Agent0 SDK https://sdk.ag0.xyz/, example agent https://github.com/Eversmile12/erc-8004-demo-agent, scanners https://8004scan.io and https://www.trust8004.xyz
   - Envio: https://docs.envio.dev (HyperIndex overview, quickstart, "Quickstart with AI", "Index Monad data", HyperSync, envio-cloud CLI)
5. Install tool access for yourself:
   - `claude mcp add --transport http envio-docs https://docs.envio.dev/mcp` (Envio docs as tools: `docs_search`, `docs_fetch`)
   - Foundry ≥ 1.8 with the Monad network enabled; Rust ≥ 1.85; Node 20 + pnpm.
6. Write `contracts/CLAUDE.md`, `services/perpl-gateway/CLAUDE.md` and `indexer/CLAUDE.md` (≤ 40 lines each) summarizing the rules and facts above that apply to that folder, so future sessions reload them cheaply.
7. Produce a task list that maps every row of `briefs/RAILS.md` to a checkpoint, then start executing. Don't wait for approval of the plan.

---

## 2. The product in one paragraph

LEASH lets anyone hire an AI trader for Perpl perps and Kuru spot on Monad. The trader can trade but can't withdraw, can't break the user's rules, and can't hide a decision. It's held by **five knots**: Rules (your `MandateRegistry` + Brain's checker), Wallet (Privy policy), Exchange (Perpl trade-only key, held by **your gateway**), Referee (Chainlink CRE, by Brain), and You (the user's passkey). Every decision becomes an onchain receipt (`ReceiptLog`) with hashes of its reasoning; Envio (yours) turns receipts and Perpl fills into a verifiable track record. Three trader personas (Falcon LIVE, Otter and Owl SHADOW) each get an ERC-8004 identity (yours).

---

## 3. Scope

**You own:**
- `contracts/`
- `services/perpl-gateway/`
- `indexer/`
- `packages/shared/abis/`
- `packages/shared/addresses.ts`
- the ERC-8004 registration script
- ops wallets: deployer, plus funding the referee and persona wallets with MON

**Not yours** (don't edit; ask the owner):
- `packages/shared/schemas.ts`, `canonical.ts`, `sendTx.ts`, `fixtures/` → Prem
- `services/api/`, `guardian/` → Prem
- `apps/mobile/` → Deep

---

## 4. Hard rules

- **Never invent** contract addresses, ABIs, event signatures, endpoints or SDK functions. Read the source/docs. Every address goes in `packages/shared/addresses.ts` with a comment linking its source; check bytecode exists on chain 143 (`cast code <addr> --rpc-url $MONAD_RPC`) before using it.
- Interfaces in ARCHITECTURE.md §7.1 (Solidity), §7.3 (gateway API) and §7.5 (Envio entities) are **frozen at CP0**. Implement them exactly. Any change must be agreed in team chat first, then updated in ARCHITECTURE.md.
- **Monad gas:** set explicit gas on every transaction (estimate, then about +10%). Never rely on default or huge limits.
- **Reserve Balance:** keep a MON buffer on deployer, referee, persona and gateway signer wallets. Underfunded txs can be included and still revert.
- **History** comes from Envio, never from historical RPC state.
- **No owner backdoors, no upgradability** in contracts. Judges will read them.
- **Secrets** live in `.env` only; commit `.env.example`; never log private keys.
- **Fail closed:** the gateway refuses to execute when its cache is stale, the user's mandate is inactive, the market isn't allowlisted, or the size exceeds `MAX_ORDER_USD` (default 25).
- **Small, descriptive commits** on branch `rails`; merge to `main` at checkpoints. Judges verify the build window from git history.
- **Blocked > 45 min?** Stub behind the frozen interface, write it in `docs/LIMITATIONS.md`, tell the team, move on.

---

## 5. Execution plan (America/Phoenix time)

### Kickoff, Sun ~21:00–21:30: monorepo skeleton (you create it)
- `pnpm-workspace.yaml` listing `apps/*`, `services/api`, `packages/*`, `indexer`, `guardian`.
- Folders:
  - `contracts/` from the foundry-monad template, switched to chain 143 for mainnet profiles
  - `services/perpl-gateway/` (`cargo new`)
  - `indexer/`, `guardian/`, `apps/mobile/`, `services/api/`, `packages/shared/`
  - `docs/` with `LIMITATIONS.md`
- Root `CLAUDE.md`: "Read ARCHITECTURE.md first. Follow §9 rules. Lane briefs in `briefs/`."
- `.gitignore`, `.env.example` (all env vars listed in this prompt), branches `main`, `rails`, `brain`, `face`. Push and share the repo with Prem and Deep.

### CP0, Sun 23:00: interfaces frozen
1. `contracts/src/interfaces/IMandateRegistry.sol` and `IReceiptLog.sol`, **exactly** as ARCHITECTURE §7.1.
2. Compile; export ABIs to `packages/shared/abis/MandateRegistry.json` and `ReceiptLog.json`, plus `packages/shared/abis/index.ts` exporting them `as const` for viem typing. Add `contracts/script/export-abis.sh` so this is repeatable.
3. `indexer/schema.graphql` with the §7.5 entities. `packages/shared/queries.graphql` with:
   - feed by user
   - receipt by `reasonHash`
   - mandate + active slack by user
   - agent leaderboard
   - PnL by day per agent
   - pauses by user

   Add a JSON fixture of the expected response for each query in `packages/shared/fixtures/envio/`.
4. `packages/shared/gateway.openapi.yaml` for §7.3, plus `services/perpl-gateway/mock/` (static JSON per endpoint) or a tiny mock server, so Brain and Face can build.
5. Research and post in team chat: **Q1** (how Perpl trade-only API keys work and whether a third-party app can prepare the enrollment for the user to sign) and **Q2** (Perpl collateral token; if not AUSD, the swap path). Write the answers into ARCHITECTURE §10.
6. Get `REFEREE_ADDRESS` from Prem (env var).

### CP1, Mon 12:00: each part works alone
**Contracts.** Implement `MandateRegistry` and `ReceiptLog`:
- `MandateRegistry`
  - `mapping(address => Mandate)`, `mapping(address => Slack)`. The constructor sets an immutable `referee`.
  - `setMandate`: requires non-zero `agentWallet` / `perplKey` and leverage > 0. It sets `paused = false` and `updatedAt`, clears slack, and emits.
  - `grantSlack`: requires an existing mandate, not paused, and `block.timestamp < expiresAt <= block.timestamp + 24h`.
  - `pause`: callable by the user or the referee. Clears slack and emits `Paused(user, msg.sender, reason)`.
  - `resume`: user only.
  - `activeSlack` returns `(s, s.expiresAt > block.timestamp)`.
  - `isActive` = mandate exists && not paused.
- `ReceiptLog`
  - The constructor takes the registry.
  - `logReceipt`:
    - requires `msg.sender == getMandate(r.user).agentWallet`
    - requires `r.status != SHADOW`
    - `EXECUTED` requires `isActive(r.user)`
    - increments `seq[r.user]` and emits with the mandate's `agentId`
  - `logShadow(agentId, r)` forces `user = msg.sender` and `status = SHADOW`, increments seq, and emits.
  - Use `via_ir = true` if you hit stack-too-deep.

**Foundry tests**, at least:
- only the user can set a mandate or grant slack
- slack expiry bounds
- pause by user ✓, by referee ✓, by a stranger ✗
- pause clears slack
- only the user can resume
- `logReceipt` from a non-agentWallet reverts
- `EXECUTED` while paused reverts, `REJECTED` while paused succeeds
- `logShadow` sets `user = msg.sender`
- seq increments per user

**Deploy and verify.** Deploy to **10143**, run a smoke script, then deploy to **143**. Verify both on MonadVision:
```
forge verify-contract <addr> <Name> --chain 143 --verifier sourcify --verifier-url https://sourcify-api-monad.blockvision.org/
```
Verify on Monadscan too (`--verifier etherscan --etherscan-api-key $MONADSCAN_KEY --watch`). foundry.toml needs `metadata = true`, `metadata_hash = "none"`, `use_literal_content = true`. Write addresses + deploy blocks + explorer links into `addresses.ts`. Ask Yadnesh before the first mainnet deploy.

**Gateway (Rust, axum + tokio + alloy + perpl-sdk).**
- A background task builds the perpl-sdk snapshot on mainnet (`Chain::mainnet()`) and applies the event stream.
- Serve `GET /health {ok, block, cacheLagBlocks}`, `/markets`, `/book/:market`, `/account/:address`, with fixed-point values normalized to decimal strings (ARCHITECTURE §6).
- CORS on. Dockerfile. Deploy to a public HTTPS host (Fly.io, Railway or a VM) and put `GATEWAY_URL` in `addresses.ts`.

**Envio.**
- Scaffold: `pnpx envio@3.0.0-rc.0 init template -t erc20 -l typescript -d ./indexer --api-token ""`, then replace with our two contracts on chain 143 (start at deploy block).
- Use the auto-discovered `.claude/skills/` (indexer-configuration, -schema, -handlers, -testing, -external-calls).
- Handlers for all events.
- `Agent` counters: executed, rejected, shadow, volumeUsd.
- `Receipt.id = txHash-logIndex`.
- Run locally and confirm test receipts appear.

### CP2, Mon 20:00: first real trade end to end
**Gateway write path:**
- `POST /orders/prepare` → unsigned `TxRequest` (the user signs in the app).
- `POST /deposit/prepare` → approve + deposit `TxRequest[]`.
- `POST /orders/execute`:
  - signs with **that user's** trade-only key via alloy and an explicit gas limit
  - idempotent on `idempotencyKey` (persist `key → txHash` in SQLite)
  - before signing: call `MandateRegistry.isActive(account)`, check `cacheLagBlocks`, the market allowlist (`MARKET_ALLOWLIST`), and `MAX_ORDER_USD`; refuse with a clear error code otherwise

  Use `perpl-sdk`'s order-preparation helpers for `execOrdersV2` calldata. If the SDK path blocks > 3h, fall back to `perpl-cli` as a subprocess or a direct contract call with the SDK's ABI, and log it in LIMITATIONS.

**Per-user trade-only keys:**
- generated by the gateway
- stored in a local encrypted keystore (password from env)
- enrollment per Q1 via `POST /keys/prepare`

**Envio:** deploy to **Envio Cloud**:
1. Install the GitHub App https://github.com/apps/envio-deployments and push to the `envio` branch.
2. `pnpx envio-cloud login`
3. `pnpx envio-cloud indexer add --name leash-monad --repo <repo> --branch envio --yes`
4. Check `pnpx envio-cloud deployment status … -o json`.

Put the public GraphQL URL in `addresses.ts`.

**With Prem:** one real agent trade ≤ $25 via `/orders/execute`, and one app-signed manual trade with Deep. Both visible in Envio.

### CP3, Tue 08:00: feature freeze
- **`GET /risk/:address` → `RiskSnapshot`:**
  - liquidation price and distance %
  - exposure by market
  - unrealized PnL, funding paid
  - weekly PnL %, using Envio's `PnlSnapshot` as the baseline
  - `slackLeftUsd` = weekly risk budget minus realized loss this week, plus active slack `extraRiskUsd`

  Sanity-check against the Perpl UI.
- `POST /keys/disable` (kill switch) → that user's key refuses all executes.
- **Envio:**
  - Add Perpl fill/position/funding events (ABI from the perpl-sdk crate or Perpl docs) and Kuru trade events (Kuru addresses from Prem, Q3) → `PerplFill`, `KuruTrade`.
  - Compute `realizedPnlUsd` per agent with average-cost basis.
  - Compute `shadowPnlUsd` by marking shadow entries to the next shadow receipt on the same market, or to the latest Perpl fill price.
  - Compute `maxDrawdownPct` and daily `PnlSnapshot`.
  - Count shadow receipts only when `user` is a known persona wallet (from `addresses.ts`).
  - Document the PnL method in `docs/pnl.md`.
- **ERC-8004:**
  - Confirm the Identity (and, if present, Reputation) registry address on 143 from the erc-8004-contracts README (**Q5**).
  - Register Falcon, Otter and Owl with the Agent0 SDK. Agent cards (name, description/style, image, services → `API_URL`, `supportedTrust`) go on IPFS (`PINATA_JWT`) or a data URI.
  - Owners are the persona wallets from Prem.
  - Put the `agentId`s in `addresses.ts` and confirm they show on 8004scan.
- `docs/contracts.md` (addresses, events, "why it's safe": no owner, user-only resume, referee can only pause) and an architecture diagram PNG for the README.

### Stretch (only after CP3, and only if Prem and Deep are green)
`pauseWithPasskey(user, assertion)`: verify a WebAuthn P-256 signature via the `0x0100` precompile against a registered passkey public key, so anyone can relay the pause.

---

## 6. Interfaces with teammates

| You give | To | When |
|---|---|---|
| ABIs + `addresses.ts` (interfaces at CP0, real addresses at CP1) | Prem, Deep | CP0 / CP1 |
| Gateway OpenAPI + mock | Prem, Deep | CP0 |
| `GATEWAY_URL` (live) | Prem, Deep | CP1 |
| Envio schema, queries, fixtures | Prem, Deep | CP0 |
| `ENVIO_URL` (cloud) | Prem, Deep | CP2 |
| Q1, Q2 answers | everyone | CP0 |
| Trader `agentId`s | Prem, Deep | CP3 |

| You need | From | When |
|---|---|---|
| `REFEREE_ADDRESS` | Prem | CP0 |
| Persona wallet addresses (Falcon/Otter/Owl) | Prem | CP1 |
| Kuru router + MON/AUSD market addresses (Q3) | Prem | CP2 |
| A test user address that has signed a mandate | Deep | CP2 |

---

## 7. Environment variables (put in `.env.example`)
```
MONAD_RPC=https://rpc.monad.xyz
MONAD_TESTNET_RPC=https://testnet-rpc.monad.xyz
CHAIN_ID=143
DEPLOYER_PRIVATE_KEY=
REFEREE_ADDRESS=
MONADSCAN_KEY=
GATEWAY_KEYSTORE_PASSWORD=
MAX_ORDER_USD=25
MARKET_ALLOWLIST=MON-PERP
STALE_BLOCKS_MAX=20
PINATA_JWT=
API_URL=
```
(Use the Alchemy or Crouton RPC if the public one rate-limits; get the URL from Prem.)

---

## 8. Checkpoint status report (post in team chat at CP0, CP1, CP2, CP3)
```
RAILS · CP<n> · <time>
Done: …
Live: contracts <addr links> | gateway <url> | envio <url>
Blocked / stubbed: … (see docs/LIMITATIONS.md)
Need from Prem/Deep: …
Next: …
```

## 9. Definition of done
- Contracts verified on 143, with tests in CI (`forge test`).
- Gateway is public with all §7.3 endpoints, and refuses unsafe executes.
- Envio Cloud serves all §7.5 entities with correct PnL for the test account.
- Three ERC-8004 identities are visible on a scanner.
- `addresses.ts` is complete and sourced; `docs/contracts.md` and `docs/pnl.md` are written.
- Every stub is listed in `docs/LIMITATIONS.md`.
