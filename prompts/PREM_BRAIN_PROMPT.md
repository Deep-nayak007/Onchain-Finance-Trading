# Kickoff prompt — Prem · BRAIN lane

> **How to use this file**
> - Part A is for you (manual steps the coding agent can't do).
> - Part B is the kickoff prompt: paste everything from "Part B" down into your coding agent, once, on branch `brain`.
> - Part C has short prompts to paste at each later checkpoint.

---

## Part A — Manual steps (Prem does these; the agent can't)

### A1. Tonight, before CP0 (Sun 23:00)

Free sources only: hackathon perks (Resources tab, one voucher per team) plus sponsors' free tiers.

| # | Step | Free source | Output → `services/api/.env` |
|---|---|---|---|
| 1 | Install Node 20, pnpm, gh, Foundry, Alchemy CLI, CRE CLI | open source | — |
| 2 | Wallets: `cast wallet new` ×2 → **Referee**, **Gas tank**; **send Referee address to Yadnesh** | Foundry | `REFEREE_PRIVATE_KEY`, `GAS_TANK_PRIVATE_KEY` |
| 3 | Testnet MON → both wallets | faucet.monad.xyz (backup: faucet.quicknode.com/monad) | — |
| 4 | Team RPC: claim **QuickNode Build** perk (new account), make Monad mainnet + testnet endpoints, share with team | hackathon perk | `MONAD_RPC_URL`, `MONAD_TESTNET_RPC_URL` |
| 5 | Simulation/debugging: claim **Tenderly Pro** perk, create project, invite Yadnesh | hackathon perk | `TENDERLY_ACCOUNT`, `TENDERLY_PROJECT`, `TENDERLY_ACCESS_KEY` |
| 6 | Alchemy free account + app (Monad), `alchemy auth`, Notify key | Alchemy free tier (bounty sponsor) | `ALCHEMY_RPC_URL`, `ALCHEMY_NOTIFY_TOKEN` |
| 7 | Privy app with server wallets | Privy free developer plan | `PRIVY_APP_ID`, `PRIVY_APP_SECRET` |
| 8 | Nansen API key | Nansen free plan (100 one-time credits, then daily top-up to 10); ask the Nansen bounty team for hackathon credits | `NANSEN_API_KEY` |
| 9 | Chainlink CRE account + `cre login` | CRE free; `cre workflow simulate` is free | — |
| 10 | LLM: **Qwen** via Alibaba Model Studio (international) new-user free quota; backup: OpenRouter free tier | modelstudio console / openrouter.ai | `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL_*` |
| 11 | Mainnet MON/AUSD: **not free**. Either ~$50 of your own for a mainnet demo, or keep everything on testnet | — | — |

### A2. Monday morning (before CP1, 12:00)
- Deploy the API to a host with a persistent disk and public HTTPS (Railway, Fly.io or Render). Set the env vars there. **Send `API_URL` to Deep.**
- Run the agent's persona-wallet script, **send the three persona wallet addresses to Yadnesh** (for ERC-8004 and Envio), and fund each with a little MON.

### A3. Monday evening (CP2, 20:00)
- Get the Kuru router + MON/AUSD market addresses (Q3) → **send to Yadnesh**.
- After paper mode looks right: set `LIVE=true` with `MAX_ORDER_USD=25`. Watch the first Falcon trade end to end with Yadnesh and Deep.

### A4. Tuesday
- Freeze features at 08:00. Run the Referee breach demo and save its logs for Deep's video.
- Write the 250-word write-up and the README sections. Fill the bounty fields on the submission form with Deep.

---

## Part B — Kickoff prompt (paste from here down into your coding agent)

You are the coding agent for **Prem**, who owns the **BRAIN** lane of **LEASH**, a 3-person entry in the Monad Metropolis hackathon (track: Onchain Finance & Trading). Teammates: **Yadnesh** owns RAILS (contracts, Perpl gateway, Envio). **Deep** owns FACE (mobile app, video). You build the trader's mind and its watchdog: signals → the LLM (Qwen) proposes → plain code decides → execute → commit a receipt onchain. You also own the API the app talks to, the three personas, slack requests, shadow mode, Privy policy wallets, Kuru, Nansen, the gas drip, and the Chainlink CRE Referee.

Work autonomously. Make reasonable decisions, write them down, and keep moving. Stop and ask Prem only for:
- secrets or keys you don't have
- the first transaction that spends real mainnet funds
- flipping `LIVE=true`
- a change to a frozen interface (ARCHITECTURE.md §7)
- a blocker longer than 45 minutes

### B1. Load context before writing code (in this order)
1. Read `ARCHITECTURE.md` at the repo root **completely**. It is the source of truth.
2. Read `briefs/BRAIN.md` completely: your deliverables and acceptance criteria.
3. Read `prompts/YADNESH_RAILS_PROMPT.md` §6 and `prompts/DEEP_FACE_PROMPT.md` §6 and §8 to see exactly what they expect from you.
4. Fetch and read these docs (they're new; don't rely on memory):
   - **Monad:** https://docs.monad.xyz/llms.txt, then:
     - `/developer-essentials/gas-pricing` (gas charged on the gas **limit**)
     - `/developer-essentials/reserve-balance`
     - `/developer-essentials/eip-7702`
     - `/developer-essentials/historical-data`
     - `/reference/rpc-differences`
   - **Mera:** https://docs.monad.xyz/guides/mera.md, so you understand how Deep's users sign.
   - **LLM: Qwen through an OpenAI-compatible API.** Alibaba Model Studio international base URL `https://dashscope-intl.aliyuncs.com/compatible-mode/v1`; backup OpenRouter `https://openrouter.ai/api/v1`. Read their docs for tool calling / function calling and `response_format: {type: "json_object"}`. Use the `openai` npm package configured from `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL_TICK`, `LLM_MODEL_COMPILE`.
   - **Privy:** server wallets (create, sign/send on EVM with a custom chain id 143) and **policies**: allowlisted contracts and methods, value caps, transfer recipients (Q8), and updating a policy at runtime.
   - **Nansen:** API/MCP docs; find endpoints with Monad smart-money coverage (Q7). Background: https://nansen.ai/post/monad-onchain-data
   - **Kuru:** docs + TypeScript SDK; router and MON/AUSD market on 143 (Q3).
   - **Chainlink CRE:** workflows in TypeScript, cron + HTTP triggers, HTTP client capability, EVM read/write capability, `cre workflow simulate`; whether Monad is supported for EVM writes (Q4).
   - **Alchemy:** Monad API quickstart, simulation APIs (is Monad supported? Q6), Notify webhooks. Run `alchemy install mcp`, `alchemy install skills`, and `alchemy --json --no-interactive agent-prompt` to learn the CLI.
   - **Expo push** from a server: `expo-server-sdk`.
5. Write `services/api/CLAUDE.md` and `guardian/CLAUDE.md` (≤ 40 lines each) summarizing the rules and facts that apply there.
6. Produce a task list mapping every row of `briefs/BRAIN.md` to a checkpoint, then start. Don't wait for plan approval.

### B2. Hard rules
- **LLM provider is Qwen via an OpenAI-compatible API.** This overrides every mention of Claude or the Anthropic API in `briefs/BRAIN.md` and `ARCHITECTURE.md`. Keep the provider behind `llm/client.ts` so it can be swapped by changing env vars only.
- **The LLM never executes.** Only `checkIntent` decides. Unparseable or invalid LLM output → HOLD, and if it was a trade attempt, receipt it as `REJECTED` + `INVALID_INTENT`.
- **Never invent** addresses, ABIs, endpoints or SDK functions. ABIs and addresses come from `packages/shared/abis` and `addresses.ts` (owned by Yadnesh); external APIs come from their docs.
- **All hashing** through `packages/shared/canonical.ts`. Deep's app recomputes `reasonHash` on the phone and must get the same bytes.
  - `reasonHash = keccak256(toBytes(canonicalJSON({ intent, decision })))`
  - `signalHash = keccak256(toBytes(canonicalJSON(signalsSnapshot)))`
- **All transactions** through `packages/shared/sendTx.ts`: estimate, +10%, explicit `gas`, chain 143.
- Re-check `MandateRegistry.isActive(user)` right before any execution. Perps go **only** through the gateway's `/orders/execute` with `idempotencyKey = intent.id`.
- History comes from Envio, never from historical RPC state.
- **Paper by default:** `LIVE=false` and `MAX_ORDER_USD=25` until Prem flips it.
- Secrets in `.env` only (commit `.env.example`); never log keys or full LLM prompts containing keys.
- TypeScript strict; zod for every external and LLM payload.
- **Small, descriptive commits** on `brain`; pull `main` before touching `packages/`; PR to `main` at checkpoints.
- **Blocked > 45 min?** Stub behind the interface, note it in `docs/LIMITATIONS.md`, tell Prem, move on.

### B3. Code layout
```
packages/shared/            (you own these files; Yadnesh owns abis/ + addresses.ts)
  schemas.ts      zod types from ARCHITECTURE §7.2 + inferred TS types
  canonical.ts    canonicalJSON(value): recursively sorted keys, no whitespace, finite numbers only
  sendTx.ts       sendTx(walletClient, publicClient, request) with explicit gas
  risk/checkIntent.ts + checkIntent.test.ts
  fixtures/       policy, intents, decisions, receipt details (EXECUTED, REJECTED+slack, SHADOW), slack request, risk snapshot, traders
services/api/src/
  server.ts                 Hono routes (§7.4), CORS, request validation with zod
  store/db.ts               SQLite (better-sqlite3): users, receipt_details, slack_requests, devices, drips, idempotency
  chain/registry.ts         getMandate, activeSlack, isActive (viem)
  chain/receipts.ts         logReceipt / logShadow (via Privy wallet)
  llm/client.ts             proposeIntent(), compilePolicy() via OpenAI-compatible tool calling (zod-to-json-schema), 8s timeout
  llm/fallback.ts           deterministic strategy used when the LLM errors, times out or fails zod: follow smartMoneyScore sign, 2x, $10, only when |score| ≥ 0.5; ReceiptDetail.model = "fallback-rules-v1"
  llm/prompts/{falcon,otter,owl,compile}.md   versioned prompts
  signals/{nansen,envio,perpl}.ts            → SignalsSnapshot + smartMoneyScore (−1..1)
  loop/scheduler.ts         one single-flight loop per active user (30s ± jitter); shadow loops every 3 min
  loop/tick.ts              gather → propose → check → (simulate) → execute → receipt → slack
  exec/gateway.ts           typed client for §7.3
  exec/kuru.ts              Kuru swaps (Owl's hedge sleeve + helper for Deep's spot screen)
  wallet/privy.ts           create wallet per user×trader, set/replace policy, deny-all, send tx
  slack/requests.ts         create / approve / deny / expire
  push/expo.ts              send push { type:"slack", id } and deposit alerts
  gas/drip.ts               one drip per address from the gas tank
guardian/                   Chainlink CRE workflow (TypeScript)
```

### B4. Logic specs

**checkIntent(policy, slack, state, intent) → Decision.** Pure, deterministic, no I/O.

`state` = `{ now, paused, positions, totalExposureUsd, weeklyPnlPct, tradesLastHour, lastTradeAt, smartMoneyScore }`.

Effective limits = the mandate's values, or the active slack's values when `slack.active && slack.expiresAt > now`. Slack's `extraRiskUsd` adds to the weekly risk budget.

Evaluate **all** rules and return **every** failing code (not just the first), in this order:

`PAUSED`, `INVALID_INTENT`, `VENUE_NOT_ALLOWED`, `MARKET_NOT_ALLOWED`, `LOW_CONFIDENCE`, `NO_SMART_MONEY_AGREEMENT` (when required and the score's sign disagrees with the side), `LEVERAGE_EXCEEDS`, `NOTIONAL_EXCEEDS`, `EXPOSURE_EXCEEDS`, `WEEKLY_LOSS_LIMIT`, `RATE_LIMIT`, `COOLDOWN`, `CANNOT_WITHDRAW` (any intent that moves funds anywhere except Perpl, Kuru or back to the user).

`allowed` = no failing codes. `usedSlack` = true only if the intent passes *because of* the slack values. `HOLD` intents are allowed no-ops and are **not** receipted.

Write ≥ 25 table-driven tests, including slack active / expired / absent and multi-reason denials.

**Rules compiler** (`POST /mandate/compile`, input `{account, text, persona}`):
1. The LLM (`LLM_MODEL_COMPILE`) produces `Policy` via tool calling or JSON mode, validated with zod (one retry with the validation error, then a safe default policy plus a warning).
2. Clamp to the demo maxima (leverage ≤ 5, notional ≤ $100, weekly loss ≤ 20%) and add a warning for each clamp.
3. Produce 4–6 plain-English Leash Card lines.
4. Compute `policyHash`.
5. **Additive to §7.4:** also return `{ agentId, agentWallet, perplKey }`, so the app can sign `setMandate` in one go.
   - `agentWallet`: get-or-create the Privy server wallet for this user×trader.
   - `perplKey`: from the gateway's `/keys/prepare`. Ask Yadnesh to include `keyAddress` in that response.

   Announce this additive change in team chat and update ARCHITECTURE §7.4 in the same PR.

**Tick** (live persona, per user):
1. `isActive`? If not, stop the loop.
2. Gather the signals snapshot (Nansen flows for MON + traded tokens, gateway `/risk` + `/markets`, Envio recent receipts/fills).
   - **Nansen is on the free plan:** cache Nansen responses for 15 minutes, shared across all users and personas, and keep total calls under ~10/day after the initial 100 credits.
   - **Only call the LLM when inputs changed meaningfully** (new Nansen snapshot, mark moved > 0.5%, position changed); otherwise HOLD without an LLM call. This keeps LLM spend low.
   - Use Tenderly simulation before sending if Alchemy simulation doesn't support Monad (Q6).
3. Propose with the persona's prompt (`LLM_MODEL_TICK`), passing policy + effective limits + compact signals. On LLM error, timeout or invalid output, use `llm/fallback.ts`.
4. `checkIntent`.
5. If allowed and `LIVE`: Alchemy simulate (if Q6 is yes) → gateway `/orders/execute`, or Kuru via the Privy wallet → record `execTxHash`.
6. Store `ReceiptDetail` with `decidedAtMs`, then `logReceipt` via Privy; set `confirmedAtMs` when its receipt confirms.
7. If denied only for `LEVERAGE_EXCEEDS` / `NOTIONAL_EXCEEDS` with confidence ≥ 0.7 and no pending request: create a `SlackRequest` (ask for the minimum: e.g. 5x for 60 min, extra risk ≤ $8; TTL 10 min) → Expo push.

**Shadow personas (Otter, Owl):** no user and no execution. Propose against the persona's `defaultPolicy`; if allowed → `logShadow(agentId, input)` from that persona's Privy wallet, with `price1e18` = current mark from the gateway. Interval: 3 min.

**Slack approval:** `POST /slack/:id/approved {txHash}` → wait for the receipt, confirm `activeSlack(user)` onchain → re-run `checkIntent` on the original intent if ≤ 2 min old → execute → receipt with `usedSlack = true`.

**Kill:** `POST /agent/kill` → stop the loop, set the Privy policy to deny-all, call gateway `/keys/disable`. The onchain `pause` is signed by the user in the app.

**Gas drip:** one drip per address (`DRIP_MON` from env), explicit gas `21000`, rate-limited, recorded in SQLite.

**Privy wallets:**
- One per user×trader (created at compile/activate), policy:
  - chain 143
  - allow `ReceiptLog.logReceipt`, the Kuru router, and ERC-20 `transfer`s **only to that user**
  - per-tx and per-day caps
  - deny everything else
- One per persona: allow only `ReceiptLog.logShadow`.
- Put the policy JSON in `docs/privy-policy.json`. Write one test proving a disallowed call is rejected.

**Referee (guardian/, CRE TypeScript):**
- Cron trigger every minute, plus an HTTP trigger for the demo.
- List active users from Envio. For each, read gateway `/risk/:address` and `/health`.
- Breach if:
  - `weeklyPnlPct ≤ −maxWeeklyLossBps/100`, or
  - any `liqDistancePct < 5`, or
  - 3 consecutive stale/failed reads (fail closed).
- On breach → EVM write `MandateRegistry.pause(user, "referee:<rule>")` from the Referee key.
- If CRE can't write to Monad (Q4), run with `cre workflow simulate` and save the breach → pause log to `docs/referee-sim.log`.

### B5. Execution plan (America/Phoenix)

**CP0, Sun 23:00:**
- `packages/shared`: `schemas.ts`, `canonical.ts` (+ tests: key order independence, nested objects, arrays keep order), `sendTx.ts`, all fixtures.
- `services/api/openapi.yaml` for §7.4.
- `.env.example`.
- PR to `main`. Post in team chat: the additive compile change, and that fixtures are ready.

**CP1, Mon 12:00:**
- `checkIntent` + tests.
- `/mandate/compile` with 5 sample prompts in `docs/compile-samples.md`.
- Falcon paper loop on testnet against the gateway mock + fixtures (receipts via a testnet Privy wallet).
- `/gas/drip`, `/devices`, `/agent/status`, `/config`.
- Persona-wallet creation script (prints addresses for Prem to send Yadnesh).
- Deployed API (Prem deploys; you write the Dockerfile and deploy notes).

**CP2, Mon 20:00:**
- Real gateway + real contracts on 143.
- Nansen signals with "why" chips.
- `GET /receipts/:reasonHash`.
- One **live** Falcon trade ≤ $25 after Prem flips `LIVE`. Deep's app verifies its hash ✓.

**CP3, Tue 08:00:**
- Otter + Owl shadow loops and `GET /traders` (stats from Envio).
- Slack requests end to end with Expo push.
- Privy policies + kill.
- Kuru sleeve + spot helper.
- Referee (live or simulated) with saved logs.
- Alchemy simulate (if supported) + Notify deposit push.

**Ship:**
- README sections: five knots, threat model, sponsor → feature map, "why Monad".
- 250-word write-up in `docs/writeup.md`.
- Every stub listed in `docs/LIMITATIONS.md`.

### B6. Environment (`services/api/.env.example`)
```
PORT=8787
CHAIN_ID=143
MONAD_RPC_URL=
MONAD_TESTNET_RPC_URL=
ALCHEMY_RPC_URL=
TENDERLY_ACCOUNT=
TENDERLY_PROJECT=
TENDERLY_ACCESS_KEY=
NANSEN_CACHE_SECONDS=900
LLM_BASE_URL=https://dashscope-intl.aliyuncs.com/compatible-mode/v1
LLM_API_KEY=
LLM_MODEL_TICK=qwen-plus
LLM_MODEL_COMPILE=qwen-plus
LLM_TIMEOUT_MS=8000
PRIVY_APP_ID=
PRIVY_APP_SECRET=
NANSEN_API_KEY=
GATEWAY_URL=
ENVIO_URL=
GAS_TANK_PRIVATE_KEY=
DRIP_MON=0.2
LIVE=false
MAX_ORDER_USD=25
TICK_SECONDS=30
SHADOW_TICK_SECONDS=180
ALCHEMY_NOTIFY_TOKEN=
DATABASE_PATH=./data/leash.db
```
`guardian/.env.example`: `REFEREE_PRIVATE_KEY`, `GATEWAY_URL`, `ENVIO_URL`, `MONAD_RPC_URL`, `STALE_FAILS_MAX=3`.

### B7. Interfaces with teammates
| You give | To | When |
|---|---|---|
| Schemas, `canonical.ts`, `sendTx.ts`, fixtures, API OpenAPI | Deep, Yadnesh | CP0 |
| Referee address (from Prem) | Yadnesh | CP0 |
| `API_URL`, push payload `{type:"slack", id}` | Deep | CP1 |
| Persona wallet addresses (from Prem) | Yadnesh | CP1 |
| Kuru router + market addresses (Q3), Kuru swap helper | Yadnesh, Deep | CP2 / CP3 |

| You need | From | When |
|---|---|---|
| ABIs, `addresses.ts`, gateway mock + OpenAPI, Envio queries + fixtures | Yadnesh | CP0 |
| `GATEWAY_URL` live (with `keyAddress` in `/keys/prepare`) | Yadnesh | CP1 |
| Contracts on 143, `ENVIO_URL` live | Yadnesh | CP1 / CP2 |
| Demo user address with a signed mandate, Expo push token | Deep | CP2 |

### B8. Checkpoint status report (post in team chat)
```
BRAIN · CP<n> · <time>
Done: …
Live: API <url> | paper/live | persona wallets <addrs>
Blocked / stubbed: … (docs/LIMITATIONS.md)
Need from Yadnesh/Deep: …
Next: …
```

### B9. Definition of done
- `checkIntent` is fully tested.
- Falcon trades live within the leash; every non-HOLD decision is receipted and verifies on the phone.
- Slack, shadow personas, kill and Referee are demonstrable.
- Privy policies are proven by a test.
- API deployed; README sections and write-up written; stubs listed.

---

## Part C — Paste these at each checkpoint (same agent session, or a new one)

**C1 · Monday morning (start of CP1 work)**
> Pull `main`. Re-read ARCHITECTURE.md §7 and `briefs/BRAIN.md`. Continue with the CP1 items in B5 of `prompts/PREM_BRAIN_PROMPT.md`: checkIntent + tests, the rules compiler, the Falcon paper loop on testnet, drip/devices/status/config endpoints, the persona-wallet script, and a Dockerfile with deploy notes. Run all tests, then open a PR to `main` and draft my CP1 status report.

**C2 · Monday afternoon (CP2)**
> Pull `main` (Yadnesh's contracts, gateway and Envio URLs should be in `addresses.ts`). Switch everything from mocks to live on chain 143. Add Nansen signals with "why" chips and `GET /receipts/:reasonHash`. Run one paper tick against the real gateway and show me the full ReceiptDetail. Then stop and ask me before setting LIVE=true for the first real Falcon trade.

**C3 · Monday night (CP3)**
> Implement the CP3 items in B5: Otter/Owl shadow loops + `/traders`, slack requests end to end with Expo push, Privy policies + kill with a rejection test, the Kuru sleeve + spot helper, and the Chainlink CRE Referee (live or `cre workflow simulate`, with logs saved to `docs/referee-sim.log`). Open a PR and draft my CP3 status report.

**C4 · Tuesday (Ship)**
> Feature freeze; fixes only. Write the README sections (five knots, threat model, sponsor → feature map, why Monad), `docs/writeup.md` (≈250 words) and `docs/LIMITATIONS.md`. List every contract and service URL. Check `.env.example` files are complete and no secrets are committed.
