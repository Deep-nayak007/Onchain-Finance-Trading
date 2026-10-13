# LEASH — give your AI trader slack. Never your keys.

LEASH lets people who don't think of themselves as crypto users hire an AI trader on Monad, write its rules in plain
English, and watch every decision land onchain as a receipt they can verify on their phone. The trader proposes; plain
code decides; five independent knots can stop it.

> Monad Metropolis hackathon · Onchain Finance & Trading. Lanes: **Brain** (agent, API, Referee), **Rails** (contracts,
> Perpl gateway, Envio), **Face** (mobile app, video). Source of truth: [`ARCHITECTURE.md`](ARCHITECTURE.md).

## ▶ Live demo runs on Monad testnet (10143)

| What | Where |
|---|---|
| Brain API | **https://leash-brain-api.fly.dev** (`/health`, `/config`, `/traders`, `/receipts/:reasonHash`; spec `services/api/openapi.yaml`) |
| MandateRegistry | [`0x81bbeaf263eeae41cfd4be137427af3ba7248467`](https://testnet.monadvision.com/address/0x81bbeaf263eeae41cfd4be137427af3ba7248467) |
| ReceiptLog | [`0x21b168148e7c47ca0f1fab8bf9f69faff3aed6b3`](https://testnet.monadvision.com/address/0x21b168148e7c47ca0f1fab8bf9f69faff3aed6b3) |
| Referee key | [`0xFad2FFf6024214711Dc3A6521F40e5871A779a44`](https://testnet.monadvision.com/address/0xFad2FFf6024214711Dc3A6521F40e5871A779a44) |
| Perpl exchange (live market data) | [`0x1964C32f0bE608E7D29302AFF5E61268E72080cc`](https://testnet.monadvision.com/address/0x1964C32f0bE608E7D29302AFF5E61268E72080cc) · AUSD [`0xa9012a…22dC`](https://testnet.monadvision.com/address/0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC) |
| Kuru MON/USDC | [`0xa241896A7Dbe8a550D2E5fF7A914bB1989ceD2D9`](https://testnet.monadvision.com/address/0xa241896A7Dbe8a550D2E5fF7A914bB1989ceD2D9) |
| ERC-8004 identity | [`0x8004A818BFB912233c491871b3d84c89A494BD9e`](https://testnet.monadvision.com/address/0x8004A818BFB912233c491871b3d84c89A494BD9e): Falcon **#2227**, Otter **#2228**, Owl **#2229** (cards: `https://leash-brain-api.fly.dev/agents/falcon.json`) |
| Persona wallets (Privy, `logShadow` only) | Falcon [`0x2477…1994`](https://testnet.monadvision.com/address/0x2477150BBA80a4E9127151eB863892f346211994) · Otter [`0x1780…0FB6`](https://testnet.monadvision.com/address/0x1780E260D175e975c6FFD31ed1FfaE9b6e7D0FB6) · Owl [`0x3858…d22C`](https://testnet.monadvision.com/address/0x38581aaaf757d195e2343651Ada5E7cE58F9d22C) |
| Perpl gateway | **https://leash-perpl-gateway.fly.dev** (`/health`, `/markets`, `/book/MON-PERP`, `/risk/:address`): Rails' Rust gateway, 15 live testnet perps |
| Envio GraphQL | *(Envio Cloud: indexer ready on branch `envio`; waiting on the GitHub-app grant)* · mainnet gateway (Rails, Render): https://leash-gateway.onrender.com |

**Proven on testnet** (tx links in [`docs/testnet-evidence.md`](docs/testnet-evidence.md)): rules compiled by Qwen → policy-locked Privy wallet
→ `setMandate` → agent runs on live Perpl prices → receipts onchain (REJECTED, EXECUTED with `usedSlack`, SHADOW) → slack request →
`grantSlack` → approve → kill/resume → Referee breach pauses onchain. Execution is **paper** (`LIVE=false`): a live Perpl order needs
testnet collateral (see [`docs/testnet-feasibility.md`](docs/testnet-feasibility.md)).

**Mainnet is a config switch, not a code change:** `CHAIN_ID=143` + mainnet RPC, Rails' 143 addresses in `addresses.ts`, funded wallets
(`docs/deploy.md` → "Going live"). On mainnet we've proven only reads: Kuru MON/AUSD market params, Perpl + ERC-8004 bytecode.

## The five knots
Any single knot can stop the trader without trusting the others.

| # | Knot | Held by | Enforces | Where |
|---|---|---|---|---|
| 1 | **Rules** | `MandateRegistry` + `checkIntent` (pure code) | leverage, size, exposure, markets, rate limits, weekly loss; slack grants with expiry | `contracts/`, `packages/shared/src/risk/checkIntent.ts` |
| 2 | **Wallet** | Privy server-wallet policy (default-deny) | the trader's wallet can only log receipts, trade on Kuru, and send tokens **back to the user** | `services/api/src/wallet/policies.ts`, [`docs/privy-policy.json`](docs/privy-policy.json) |
| 3 | **Exchange** | Perpl trade-only key | the trader can never withdraw collateral | `services/perpl-gateway/` |
| 4 | **Referee** | Chainlink CRE workflow + referee key | pauses onchain on weekly-loss breach, liquidation risk, or 3× stale data (fails closed) | `guardian/` |
| 5 | **You** | Mera passkey | kill switch; only you can resume; you approve slack with Face ID | `apps/mobile/` |

**How a decision flows:** signals (Nansen, Perpl, Envio) → Qwen proposes an `Intent` in JSON mode (zod-validated, one
retry, deterministic fallback) → `checkIntent` returns every failing rule → execute only if allowed (gateway re-checks
`isActive`) → `ReceiptDetail` stored and `reasonHash`/`signalHash` committed via `ReceiptLog` → the phone recomputes
`keccak256(canonicalJSON({intent, decision}))` and shows ✓ only on match.

**Slack requests:** when a confident intent is denied *only* for leverage or size, the trader asks for the minimum
exception (e.g. "5x up to $20 for 60 min, extra risk ≤ $8"). You sign `grantSlack` with Face ID; Brain re-checks the
original intent and executes with `usedSlack = true` on the receipt.

**Shadow-first traders:** Otter (mean reversion) and Owl (funding + Kuru hedge) call trades in shadow mode via
`logShadow` from their own policy-locked wallets, so their paper record is committed *before* outcomes and can't be edited.

## Threat model
| Threat | What stops it |
|---|---|
| LLM hallucinates or is prompt-injected into a huge trade | The LLM never executes. `checkIntent` (pure code) enforces the signed mandate; the gateway enforces `MAX_ORDER_USD` and `isActive`; Privy refuses anything off-policy. |
| Brain server is compromised | Its Privy wallets can only log receipts / trade on Kuru / return funds to the user; the Perpl key can't withdraw; the user (or the Referee) can pause onchain at any time. |
| Trader tries to move funds out | `CANNOT_WITHDRAW` in the checker **and** Privy's `transfer.to == user` rule (proven against live Privy: transfers to anyone else are refused). |
| Fake or edited track record | Every decision (executed, denied, shadow) is committed onchain with `reasonHash`/`signalHash` and a per-user `seq`; shadow calls are committed before outcomes. |
| Stale or broken data feeds | Tick fails closed when risk is unavailable; the Referee pauses after 3 consecutive stale reads. |
| Referee key compromised | It can only `pause`; it can't set mandates, grant slack or resume. Worst case: trading stops. |
| User loses the phone | Mandates and slack are bounded and expire; nothing can be withdrawn by the trader. |

## Sponsor → feature map
| Sponsor | Feature |
|---|---|
| Perpl | Live trader via trade-only key; risk view + Referee math from `/risk` |
| Kuru | Owl's hedge sleeve + spot helper (`POST /spot/prepare`) on the MON order book |
| Privy | One policy-locked server wallet per user × trader; deny-all on kill |
| Nansen | Smart-money netflow signal + "why" chips (Monad coverage pending, see Q7) |
| Chainlink CRE | Referee workflow: cron + HTTP trigger, EVM read on Monad, breach → pause |
| Envio | Receipts feed, leaderboard, PnL (Rails) |
| Alchemy | RPC + Notify deposit webhooks (simulation is unsupported on Monad) |
| Agora / Mera | Passkey sign-in, AUSD balance, user-signed trades (Face) |

## Why Monad
- **Receipts are cheap enough to log every decision**, including denials and shadow calls, so the track record is complete, not cherry-picked.
- **Fast finality → visible speed:** each receipt shows decision → confirmed time (≈1–1.5 s on testnet in our runs).
- **Gas is charged on the gas limit**, so every tx goes through `sendTx` (estimate + 10%, explicit gas).
- **No 7702 on user wallets** (Reserve Balance), so Brain runs a one-time gas drip instead.
- **Perpl and Kuru** give a real perp venue and order book; LEASH is the front door for people who aren't pros.

## Repo
```
packages/shared/   schemas (zod), canonical JSON + hashes, sendTx, checkIntent, fixtures · abis/ + addresses.ts (Rails)
services/api/      Brain API (Hono): compile, agent loop, receipts, slack, Privy, Kuru, Nansen, drip — openapi.yaml
guardian/          Referee: rules, CRE workflow (cre/), executor
contracts/ indexer/ services/perpl-gateway/   Rails
apps/mobile/       Face
docs/              testnet evidence, deploy, limitations, compile samples, Privy policy, write-up
```
Run: `pnpm install && pnpm test` · API: `cd services/api && CHAIN_ID=10143 pnpm dev` · Referee: `cd guardian && pnpm referee`.

## Status (Brain, 2026-10-12)
Proven on Monad **testnet** in paper mode: compile → Privy wallet → `setMandate` → activate → receipts onchain
(REJECTED, EXECUTED with `usedSlack`, SHADOW) → slack request → `grantSlack` → approve → kill, plus a Referee breach that
paused a user onchain. Evidence with tx hashes: [`docs/testnet-evidence.md`](docs/testnet-evidence.md). Not yet live:
the real Perpl gateway, Envio Cloud, mainnet contracts. See [`docs/LIMITATIONS.md`](docs/LIMITATIONS.md).

## Mobile app (Face)


The Face lane is an Expo React Native app for iOS, Android, and a browser preview. It includes every screen in the supplied brief, the dark visual system, on-device receipt fingerprints, and an interactive threat-model demo. **The default build uses clearly labelled sample data.** Real Face ID and mainnet acceptance require the team's account domain, shared package, deployments, and services.

For local testing before Brain/Rails arrive, run from the repository root:

```sh
npm run mock:ios
```

This opens the installed development build through **localhost**, forces mock mode, and bypasses real passkey onboarding. Edit [mocks/data.json](apps/mobile/mocks/data.json) for sample values. Tap **DEMO** to reset the sample, renew slack, or test an empty portfolio. Keep the terminal running. `npm run mock:web` runs the same samples in a browser. The old `100.110…` server address is blocked by iOS App Transport Security; use the localhost entry. [Mock testing guide](apps/mobile/mocks/README.md).

Start the regular development server from the repository root:

```sh
npm install
npm run web
```

The browser preview runs at http://localhost:8081. Start the development client with `npm start`. Expo Go cannot run the native Mera passkey module.

On this Mac, build in a local cache to avoid synced Desktop metadata breaking Xcode signing:

```sh
npm run ios:cached --workspace @leash/mobile -- --device "iPhone 17 Pro"
```

Then run `npm start` from this source workspace and open its server in the LEASH development client. The cache is `~/Library/Caches/leash-native-build`; code remains in `apps/mobile`. If the project lives outside a synced directory, `npm run ios` builds directly.

Checks and capture tools:

```sh
npm run check
npm run test:mobile
npm run smoke --workspace @leash/mobile
npm run capture --workspace @leash/mobile
npm run export:web --workspace @leash/mobile
```

`smoke` and `capture` need the preview server running. The sample-data flow includes a short-hold cancellation, pause/resume, a denied trade → slack approval → executed receipt, receipt tampering, rule-card editing, trader selection, quotes, and a manual trade. `/dev/components` shows the component library; `/break-leash` explains seven attacks.

Use [ARCHITECTURE.md](ARCHITECTURE.md) as the source of truth. The app's [integration guide](docs/FACE_INTEGRATION.md), [checkpoint checklist](docs/FACE_CHECKLIST.md), and [limitations](docs/LIMITATIONS.md) identify the remaining team dependencies. Demo artifacts are in `artifacts/`.

The official portal displays **October 14, 2026, 03:59 UTC**, which is **Tuesday, October 13 at 8:59 PM in Phoenix**. Target delivery at least two hours earlier, **6:59 PM Phoenix**. See [submission notes](docs/SUBMISSION.md) and the [official calendar](https://hackathon.monad.xyz/calendar).

The source handoff is packaged as `artifacts/leash-face-kit.zip`; a standalone static browser export is `artifacts/leash-web-preview.zip`. Neither is published.
