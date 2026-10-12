# PnL method (Envio)

How the indexer computes the numbers the leaderboard and risk views show. All
USD values are decimal strings; internally Envio uses `BigDecimal`.

## Realized PnL (`Agent.realizedPnlUsd`)
Average-cost basis per (agent, market):
- On a fill that **increases** a position, roll the average entry price:
  `avg' = (avg*qty + price*fillQty) / (qty + fillQty)`.
- On a fill that **reduces/closes**, realize
  `realized += (exitPrice - avg) * closedQty * sideSign` and leave `avg`
  unchanged for the remaining size. A flip (close-through-zero) realizes the
  closing leg at the old average, then opens the remainder at the fill price.
- Fees from each fill are subtracted from realized PnL.

Source of fills: `PerplFill` entities, indexed from the Perpl exchange fill
events (ABI from the perpl-sdk crate), keyed to the account that is the agent's
executing wallet.

## Shadow PnL (`Agent.shadowPnlUsd`)
Shadow personas don't execute, so there are no fills to realize. We mark each
shadow entry to market:
- Match a shadow entry to the **next shadow receipt on the same market** (the
  persona's own next decision) and realize the move between them; or
- if there is no next entry yet, mark to the **latest Perpl fill price** for
  that market.

This gives an honest paper track record that can't be edited after the fact,
because every shadow decision is already committed on-chain (`logShadow`) before
its outcome is known.

## Max drawdown (`Agent.maxDrawdownPct`)
Track running equity (starting notional + cumulative realized). Max drawdown is
the largest peak-to-trough decline as a percentage of the running peak.

## Daily snapshot (`PnlSnapshot`, agent × day)
`day = floor(blockTimestamp / 86400)`. Each snapshot carries that day's realized
and shadow PnL, the cumulative realized total, and the equity at day end. The
app's PnL curve and the gateway's weekly baseline (`/risk` `weeklyPnlPct`,
`slackLeftUsd`) read from these.

## Weekly loss / slack budget
`weeklyPnlPct` is computed from the last 7 days of `PnlSnapshot`. The gateway's
`slackLeftUsd = weeklyRiskBudget − realizedLossThisWeek + activeSlack.extraRiskUsd`,
where the weekly risk budget derives from the mandate's `maxWeeklyLossBps`
against equity.

> Status: receipts-driven counters are live from CP1. Fill-driven realized /
> shadow PnL and `PnlSnapshot` land at CP3 (see docs/LIMITATIONS.md). If fills
> are blocked at CP2, the gateway's own computed PnL is the fallback and that
> is noted in LIMITATIONS.
