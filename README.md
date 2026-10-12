# LEASH — give your AI trader slack. Never your keys.

LEASH lets people who don't think of themselves as crypto users hire an AI trader on Monad, write its rules in plain
English, and watch every decision land onchain as a receipt they can verify on their phone. The trader proposes; plain
code decides; five independent knots can stop it.

> Monad Metropolis hackathon · Onchain Finance & Trading. Lanes: **Brain** (agent, API, Referee), **Rails** (contracts,
> Perpl gateway, Envio), **Face** (mobile app, video). Source of truth: [`ARCHITECTURE.md`](ARCHITECTURE.md).

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
