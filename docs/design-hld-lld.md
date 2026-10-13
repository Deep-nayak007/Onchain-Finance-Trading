# LEASH — HLD & LLD

High-Level Design (the shape of the system) and Low-Level Design (the exact
contracts, endpoints, schemas and rules). Grounded in the code on `main`.

Lanes / owners: 🟦 **Rails (Yadnesh)** — contracts, Perpl gateway, Envio ·
🟪 **Brain (Prem)** — AI engine, API, Referee · 🟥 **Face (Deep)** — app, video.

---

# PART A — HIGH-LEVEL DESIGN (HLD)

## A1. Problem & goal
Let a non-crypto user hire an AI to trade perps/spot on Monad **without**
handing over custody, without a black box, and without a fakeable track record.

## A2. Guiding principles
1. **The LLM never executes.** It only proposes; deterministic code decides.
2. **Least authority.** The exchange key can trade but not withdraw; the spot
   wallet can only call Kuru and repay the user.
3. **Everything is a receipt.** Executed, rejected, failed, shadow — all logged
   on-chain with commit hashes, verifiable on the phone.
4. **Fail closed.** Stale data, inactive mandate, or over-limit → refuse.
5. **No owner, no upgradeability** in the contracts. Only the Referee is
   privileged, and it can only *pause*.

## A3. Components (and who owns them)

| Layer | Component | Tech | Owner |
|---|---|---|---|
| Client | Mobile/web app | Expo RN + viem, WebAuthn passkey | 🟥 Face |
| Mind | Agent loop + Qwen + checker | Node/TS, Qwen (JSON mode) | 🟪 Brain |
| Mind | REST API | Hono | 🟪 Brain |
| Mind | Referee watchdog | Chainlink CRE (TS) | 🟪 Brain |
| Wallet | Privy policy wallet (per user×trader) | Privy | 🟪 Brain |
| Rules | `MandateRegistry` | Solidity, Foundry | 🟦 Rails |
| Record | `ReceiptLog` | Solidity, Foundry | 🟦 Rails |
| Execution | Perpl gateway | Rust (axum, alloy, perpl-sdk) | 🟦 Rails |
| Data | Envio indexer | Envio HyperIndex v3 | 🟦 Rails |
| Identity | 3 ERC-8004 agents | Agent0 SDK | 🟦 Rails |

## A4. The five knots (independent stop controls)
Rules (`MandateRegistry`) · Wallet (Privy) · Exchange key (gateway) ·
Referee (CRE → `pause`) · You (passkey → `pause`/`resume`). Any one stops the
trader; none has to trust the others.

## A5. Trust boundaries
- **On-chain (public, trustless):** `MandateRegistry`, `ReceiptLog`, Perpl, Kuru.
- **Off-chain services (Rails/Brain):** gateway holds trade-only keys; Brain
  holds Privy + API keys. Compromise bounded by: can't withdraw (knot 3),
  can't exceed mandate (knot 1, enforced on-chain for `logReceipt`), referee +
  user can pause (knots 4–5).
- **Device (user):** passkey private key never leaves the Secure Enclave.

## A6. Deployment (testnet demo)
Monad testnet (10143). Contracts verified on MonadVision/Sourcify. Gateway +
API + Referee + app on **Render** (free). Envio runs as `envio dev` behind a
self-healing Cloudflare tunnel (Envio Cloud blocked on provider side). Mainnet
(143) is a config-only switch; held for budget. See `docs/LIMITATIONS.md`.

## A7. Non-functional targets
- Fail closed within `STALE_BLOCKS_MAX` (50 blocks ≈ 20s) of cache lag.
- Order size hard cap `MAX_ORDER_USD` (25) at the gateway.
- Slack grants expire ≤ 24h, enforced on-chain.
- History served only by Envio (full nodes don't serve old state).

---

# PART B — LOW-LEVEL DESIGN (LLD)

## B1. Contracts — `MandateRegistry` 🟦

**Storage:** `mapping(address=>Mandate)`, `mapping(address=>Slack)`,
`immutable referee`, `constant MAX_SLACK_DURATION = 24h`.

**Structs**
```
Mandate { bytes32 policyHash; uint64 maxNotionalUsd6; uint16 maxLeverageX10;
          uint16 maxWeeklyLossBps; uint256 agentId; address agentWallet;
          address perplKey; bool paused; uint64 updatedAt }
Slack   { uint16 maxLeverageX10; uint64 maxNotionalUsd6; uint64 extraRiskUsd6;
          uint64 expiresAt }
```

**Functions & rules**
| Function | Caller | Rules |
|---|---|---|
| `setMandate(m)` | user (`msg.sender`) | non-zero `agentWallet`/`perplKey`, `leverage>0`; unpauses; clears slack; emits `MandateSet` |
| `grantSlack(s)` | user | mandate exists, not paused, `now < expiresAt ≤ now+24h`; emits `SlackGranted` |
| `revokeSlack()` | user | clears slack; emits `SlackRevoked` |
| `pause(user,reason)` | **user or referee** | clears slack; emits `Paused(user,by,reason)` |
| `resume()` | user only | emits `Resumed` |
| `getMandate / activeSlack / isActive / referee` | view | `isActive = mandate exists && !paused`; `activeSlack` returns `(s, s.expiresAt > now)` |

**Errors:** `ZeroAgentWallet, ZeroPerplKey, ZeroLeverage, NoMandate, IsPaused,
SlackExpiryInPast, SlackExpiryTooFar, NotUserOrReferee, NotUser`.
**Safety:** no owner/upgrade; referee can *only* pause.

## B2. Contracts — `ReceiptLog` 🟦

**Storage:** `immutable registry`, `mapping(address=>uint64) seq`.
**Struct `ReceiptInput`:** `user, venue(PERPL|KURU), market(bytes32), side(int8),
sizeUsd6(uint128), price1e18(uint256), status(EXECUTED|REJECTED|FAILED|SHADOW),
usedSlack(bool), reasonHash, signalHash, execTxHash`.

| Function | Caller | Rules |
|---|---|---|
| `logReceipt(r)` | the user's registered `agentWallet` (read from registry) | `status != SHADOW`; `EXECUTED` requires `isActive(r.user)`; `++seq[r.user]`; emits `TradeReceipt` |
| `logShadow(agentId, r)` | anyone | forces `user=msg.sender`, `status=SHADOW`; `++seq`; Envio counts only known persona wallets |

**Event:** `TradeReceipt(user indexed, agentId indexed, seq indexed, venue,
market, side, sizeUsd6, price1e18, status, usedSlack, reasonHash, signalHash,
execTxHash)`.
**Errors:** `NotAgentWallet, ShadowNotAllowed, MandateNotActive`.

## B3. Commit–reveal hashing (shared) 🟪 canonical, 🟦/🟥 verify
`reasonHash = keccak256(utf8(canonicalJSON({intent, decision})))`,
`signalHash = keccak256(utf8(canonicalJSON(signalsSnapshot)))`,
`policyHash = keccak256(utf8(canonicalJSON(policy)))`. Canonical JSON =
sorted keys, no whitespace (`packages/shared/canonical.ts`). The phone
recomputes `reasonHash` and shows ✓ only on a match.

## B4. Perpl gateway (Rust) 🟦

Modules: `app`(router) · `config` · `cache`(SDK snapshot + event stream) ·
`registry`(reads `isActive`) · `keystore`(per-user trade-only keys) ·
`store`(SQLite idempotency + disabled keys) · `perpl`(SDK bridge) · `routes` ·
`error`.

**Endpoints**
| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | `{ok, block, cacheLagBlocks}` |
| GET | `/markets` | listed perps (decimal strings) |
| GET | `/book/:market` | L2/L3 book |
| GET | `/account/:address` | collateral, equity, positions |
| GET | `/risk/:address` | liq distance, exposure, weekly PnL, slackLeft |
| POST | `/orders/prepare` | unsigned `execOrdersV2` TxRequest |
| POST | `/orders/execute` | sign with user's trade-only key + explicit gas |
| POST | `/deposit/prepare` | approve+deposit (stub until Perpl test collateral) |
| POST | `/keys/prepare` | `{keyAddress, tradeKey, enrollment}` |
| POST | `/keys/disable` | kill switch |

**`/orders/execute` fail-closed order:** disabled key → market allowlist →
`size ≤ MAX_ORDER_USD` → cache fresh (`lag ≤ STALE_BLOCKS_MAX`) →
`MandateRegistry.isActive(account)` → sign & send. Idempotent on
`idempotencyKey` (SQLite `key→txHash`).
**Error codes:** `MANDATE_INACTIVE, STALE_CACHE, MARKET_NOT_ALLOWED,
SIZE_EXCEEDS_MAX, KEY_DISABLED, NO_KEY, NOT_FOUND, BAD_REQUEST, UPSTREAM_ERROR,
INTERNAL_ERROR`.
**RPC:** throttled to 20 req/s + retry backoff (QuickNode 50/s cap).

## B5. Envio indexer 🟦

**Contracts/events handled:** `MandateRegistry.{MandateSet, SlackGranted,
SlackRevoked, Paused, Resumed}`, `ReceiptLog.TradeReceipt`,
`KuruOrderBook.Trade`.
**Entities:** `User, Mandate, SlackGrant, Agent, Receipt, PauseEvent,
PerplFill, KuruTrade, PnlSnapshot`.
**Keys/rules:** `Receipt.id = txHash-logIndex`; `Agent` counters
executed/rejected/shadow + `volumeUsd`; shadow counted only when emitter is a
known persona wallet; `SlackGrant.user` is `@index`ed for the
Paused/SlackRevoked lookups.

## B6. Agent loop (Brain) 🟪
Every ~30s: read mandate+`activeSlack` → gather (gateway `/risk`, Envio,
Nansen) → **Qwen → `Intent`** (zod, JSON mode; invalid → HOLD) →
`checkIntent(policy, slack, state, intent) → Decision` → if allowed, gateway
`/orders/execute` (perps) or Privy→Kuru (spot) → store `ReceiptDetail` →
`logReceipt`. Denied high-confidence limit breaches → `SlackRequest` → push.

`RuleCode`s: `OK, PAUSED, MARKET_NOT_ALLOWED, VENUE_NOT_ALLOWED,
LEVERAGE_EXCEEDS, NOTIONAL_EXCEEDS, EXPOSURE_EXCEEDS, WEEKLY_LOSS_LIMIT,
RATE_LIMIT, COOLDOWN, LOW_CONFIDENCE, NO_SMART_MONEY_AGREEMENT, INVALID_INTENT,
CANNOT_WITHDRAW`.

## B7. Referee (Brain) 🟪
Cron (1 min) + HTTP trigger reads gateway `/risk` + `/health` + Envio. Breach =
weekly loss ≥ limit, or liq distance < 5%, or 3× consecutive stale →
`pause(user, "referee:<rule>")` from the referee key.

## B8. Key sequences

**Onboarding:** passkey→EOA → `/gas/drip` → fund collateral →
`/deposit/prepare` (user signs) → `/keys/prepare` (authorize trade-only key) →
`/devices`.

**Activate:** `/mandate/compile` (Qwen → Policy, clamped) → user signs
`setMandate` → `/agent/activate` (Brain creates the Privy policy wallet).

**One tick:** see B6.

**Kill:** user signs `pause(user,"user")` → `/agent/kill` (loop off, Privy
deny-all, gateway `/keys/disable`). Gateway + Brain both refuse when
`isActive==false`.

## B9. Units
`usd6` (6-dec int) on-chain/DB, decimal strings in JSON. Prices 1e18 on-chain,
decimal strings in APIs. Side `±1` int8 on-chain / `LONG|SHORT|BUY|SELL` in TS.
Markets `bytes32 = keccak256(name)`. Leverage `X10` (30 = 3.0×). bps for %.

## B10. Failure handling
| Failure | Handling |
|---|---|
| Qwen invalid/injected | HOLD → `REJECTED`+`INVALID_INTENT`; never executes |
| Over-limit intent | `checkIntent` denies; optional slack request |
| Stale gateway cache | `/health ok:false`; executes refused `STALE_CACHE` |
| Mandate paused | `logReceipt` EXECUTED reverts; gateway refuses `MANDATE_INACTIVE` |
| Duplicate submit | idempotency returns original txHash |
| RPC 429 | 20 req/s throttle + retry backoff |
| Envio tunnel restarts | Brain re-reads `deploy/envio-url.txt` every 60s |

---

*See also: `docs/architecture.md` (diagrams), `docs/contracts.md`,
`docs/pnl.md`, `docs/perpl-notes.md` (Q1/Q2), `docs/LIMITATIONS.md`.*
