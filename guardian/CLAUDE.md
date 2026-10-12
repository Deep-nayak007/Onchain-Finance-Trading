# guardian — Referee (knot 4) rules (read ARCHITECTURE.md first)

## What it is
- Independent watchdog. Breach → `MandateRegistry.pause(user, "referee:<rule>")`. It can only stop trading, never start it.
- Rules (`src/rules.ts`, pure, no deps, bundled into CRE): weekly PnL ≤ −maxWeeklyLossBps/100, any liqDistancePct < 5,
  or 3 consecutive stale/failed reads (fail closed). Already-paused or no mandate → skip.

## Layout
- `src/rules.ts` + `test/rules.test.ts` (vitest).
- `src/executor.ts`: every 60s reads mandate (chain), gateway /health + /risk, applies rules, pauses via `sendTx`
  from REFEREE_PRIVATE_KEY. Re-checks `isActive` right before pausing. `--once`, `--log ../docs/referee-sim.log`.
- `cre/`: Chainlink CRE workflow (TypeScript, bun). Cron (1 min) + HTTP trigger. EVM read on monad-testnet,
  HTTP capability with identical consensus. `cd cre && cre workflow simulate referee -T staging-settings`.
- `scripts/demo-gateway.ts`: DEMO ONLY breaching /risk for filming (`weekly_loss|liq|stale|ok`).

## Why the executor holds the key
- CRE writes go forwarder → receiver `onReport()`. The deployed registry's `referee` is our EOA
  (0xFad2FFf6024214711Dc3A6521F40e5871A779a44), so CRE detects and the executor signs. Receiver-contract path is in LIMITATIONS.

## Rules
- Testnet (CHAIN_ID=10143) unless Prem says mainnet. Keep MON on the referee address.
- Secrets only in guardian/.env (dotenv). Never print/log/commit them. `.env.example` = names only.
- Every tx via `sendTx` (estimate +10%, explicit gas). Log every verdict as JSON lines (video evidence).
- Addresses only from packages/shared/addresses.ts.
