# BRAIN — Agent engine, API, Referee

> Paste into your coding agent with `ARCHITECTURE.md`. Work in `services/api/`, `guardian/`, `packages/shared/` (not `abis/` or `addresses.ts`) on branch `brain`.

## Mission
Build the trader's mind and its watchdog: signals → Claude proposes → plain code decides → execute → commit a receipt onchain. Own the API the app talks to, the three personas, slack requests, shadow mode, the Privy policy wallets, Kuru, Nansen, gas drip, and the Chainlink CRE Referee.

## Deliverables

| Due | Deliverable | Acceptance |
|---|---|---|
| **CP0** Sun 23:00 | `schemas.ts` (§7.2), `canonical.ts`, `sendTx.ts`, fixtures (EXECUTED, REJECTED + slack request, SHADOW), OpenAPI stub for §7.4 | Face and Rails import them |
| CP1 Mon 12:00 | `checkIntent(policy, slack, state, intent)` pure function + ≥ 25 table-driven tests (every RuleCode, slack on/off/expired) | Tests pass |
| CP1 | `POST /mandate/compile`: Claude → `Policy` (structured output), clamp to demo maxima (≤ 5x, ≤ $100), Leash Card lines, `policyHash` | 5 sample prompts → sensible policies |
| CP1 | Agent loop in paper mode (`LIVE=false`) for Falcon against fixtures and the gateway mock; `POST /gas/drip` | Paper receipts on testnet |
| CP2 Mon 20:00 | Live Falcon trade through gateway `/orders/execute`; `ReceiptDetail` store + `GET /receipts/:reasonHash`; `decidedAtMs`/`confirmedAtMs`; Nansen signals → `smartMoneyScore` + "why" chips | One real trade + receipt the app verifies ✓ |
| CP3 Tue 08:00 | **Personas**: Otter and Owl in shadow (`logShadow` from persona wallets), `GET /traders` | Shadow receipts on 143 |
| CP3 | **Slack requests**: create on high-confidence limit denials, Expo push, approve/deny endpoints, re-check + execute on approval | Demo: denied → push → Face ID → executed with `usedSlack` |
| CP3 | **Privy**: one server wallet per user × trader; policy allows only `ReceiptLog.logReceipt`, Kuru router, ERC-20 transfers to that user; `/agent/kill` → deny-all. Policy JSON in `docs/privy-policy.json` | A disallowed call is rejected in a test |
| CP3 | **Kuru**: Owl's hedge sleeve (AUSD↔MON) + swap helper used by Face's spot screen | One real swap on 143 |
| CP3 | **Referee** (CRE, TS): cron 1 min + HTTP trigger; reads gateway `/risk` and `/health`, Envio; breach (weekly loss ≥ limit, liq distance < 5%, or 3× stale) → `pause(user,"referee:<rule>")` from the referee key. Simulate if Monad writes aren't supported (Q4) | Breach → pause, with logs for the video |
| Ship | Write-up (≈ 250 words) + README sections: five knots, threat model, sponsor map | Integrated in repo |
| Stretch | Aurora 1Click `/fund/quote`; Alchemy simulate before send (Q6); Alchemy Notify deposit push | Only after CP3 |

## Design notes
- **The LLM never executes.** Invalid/unparseable output → HOLD, receipted as `REJECTED` + `INVALID_INTENT`.
- Claude via the Anthropic API with tool-use/structured output for `Policy` and `Intent`. Prompts in `services/api/prompts/<persona>.md`, versioned; log the model id in `ReceiptDetail`.
- Persona prompts: Falcon (momentum, requires smart-money agreement), Otter (mean reversion, small size, long cooldowns), Owl (funding harvest; perps + Kuru hedge). Same engine, different prompt + default policy.
- Effective limits = mandate merged with `activeSlack` if not expired. Slack requests only for `LEVERAGE_EXCEEDS` / `NOTIONAL_EXCEEDS`, confidence ≥ 0.7, max one pending per user, TTL 10 min; ask for the minimum needed (e.g. 5x for 60 min, extra risk ≤ $8).
- Perps only through the gateway (`idempotencyKey = intent.id`); re-check `isActive(user)` immediately before executing.
- Hash with `canonical.ts` only; Face recomputes the same hash on the phone.
- History from Envio; loop state recoverable from Envio after restart.
- MON buffers on agent, persona, gas-tank and referee wallets (Reserve Balance).

## You consume
Rails: ABIs/addresses (CP0 interface, CP1 real), gateway (§7.3), Envio queries (§7.5). Face: device push tokens.

## Coding-agent setup
- `npm i -g @alchemy/cli@latest` → `alchemy auth` → `alchemy install mcp` + `alchemy install skills`; teach your agent with `alchemy --json --no-interactive agent-prompt`.
- Docs: Privy server wallets + policies, Kuru SDK (Q3), Nansen API (Q7), Chainlink CRE (workflows, cron/HTTP triggers, EVM capability, `cre workflow simulate`), Anthropic structured outputs, Expo push API.

## Open questions you own
Q3, Q4, Q6, Q7, Q8 → write answers into ARCHITECTURE §10 by CP1.
