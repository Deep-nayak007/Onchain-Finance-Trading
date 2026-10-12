# LEASH contracts

Two contracts, no owner, no upgradeability, no backdoor. They are the **Rules**
and **Receipts** knots of LEASH.

## Addresses

Filled in at CP1 after deploy; see `packages/shared/addresses.ts` for the live
values, deploy blocks and explorer links.

| Contract | Chain | Address | Explorer |
|---|---|---|---|
| MandateRegistry | 143 | _(CP1)_ | MonadVision / Monadscan |
| ReceiptLog | 143 | _(CP1)_ | MonadVision / Monadscan |
| MandateRegistry | 10143 | _(CP1 testnet)_ | — |
| ReceiptLog | 10143 | _(CP1 testnet)_ | — |

Both are verified with Sourcify (MonadVision) and Etherscan-compatible
(Monadscan). `foundry.toml` sets `metadata = true`, `metadata_hash = "none"`,
`use_literal_content = true` so the source embeds for verification.

## MandateRegistry — the Rules knot

Records what a user authorized their trader to do and lets them (and only them)
change or revoke it.

Events: `MandateSet`, `SlackGranted`, `SlackRevoked`, `Paused`, `Resumed`.

- `setMandate(Mandate)` — `msg.sender` is the user. Requires a non-zero
  `agentWallet` and `perplKey` and `maxLeverageX10 > 0`. Unpauses and clears any
  slack. There is no admin path: a user can only ever set **their own** mandate.
- `grantSlack(Slack)` — user only; requires an existing, unpaused mandate and
  `now < expiresAt <= now + 24h`. A narrow, time-boxed exception.
- `revokeSlack()` / `resume()` — user only.
- `pause(user, reason)` — callable by the **user or the Referee**, nobody else.
  Clears slack. This is the one privileged action in the system, and it can
  only *stop* trading, never start it or change limits.
- `activeSlack(user)` / `isActive(user)` — views the gateway and app read.

### Why it's safe
- **No owner.** There is no `onlyOwner`, no admin role, no pause-everything
  switch. The only privileged address is the immutable `referee`, set once in
  the constructor and never changeable.
- **The Referee can only pause.** It cannot set a mandate, grant slack, or
  resume. The worst a compromised Referee can do is stop a user's trader —
  which fails safe.
- **Only the user resumes.** Once paused, trading restarts only when the user
  signs `resume()`.
- **No upgradeability.** No proxy, no `delegatecall` to replaceable logic. What
  judges read is what runs.

## ReceiptLog — the Receipts knot

Commit–reveal receipts: every decision logs hashes of its reasoning and the
signals it saw, so a decision can't be rewritten after the fact.

Event: `TradeReceipt(user, agentId, seq, venue, market, side, sizeUsd6,
price1e18, status, usedSlack, reasonHash, signalHash, execTxHash)`.

- `logReceipt(ReceiptInput)` — only the user's registered `agentWallet` (read
  live from `MandateRegistry.getMandate`). `EXECUTED` additionally requires
  `isActive(user)`, so a receipt claiming a live trade can't be logged while
  paused. `SHADOW` is rejected here.
- `logShadow(agentId, ReceiptInput)` — anyone may call; it **forces**
  `user = msg.sender` and `status = SHADOW`, so a shadow (paper) call can only
  speak for its own caller. Envio counts it toward an agent only when the
  caller is a known persona wallet.
- `seq[user]` increments on every receipt, making the per-user feed
  tamper-evident (a missing seq is a dropped receipt).

### Why it's safe
- Authorization is read from the registry, not stored or settable here.
- A paused user cannot have an `EXECUTED` receipt logged against them.
- `logShadow` can never impersonate another user.

## Deploy + verify

```bash
# testnet first
forge script script/Deploy.s.sol:Deploy --rpc-url $MONAD_TESTNET_RPC --broadcast --slow -vvvv
# smoke it, then mainnet (ask Yadnesh before the first mainnet deploy)
forge script script/Deploy.s.sol:Deploy --rpc-url $MONAD_RPC --broadcast --slow -vvvv

# verify (both)
forge verify-contract <addr> MandateRegistry --chain 143 \
  --verifier sourcify --verifier-url https://sourcify-api-monad.blockvision.org/
forge verify-contract <addr> MandateRegistry --chain 143 \
  --verifier etherscan --etherscan-api-key $MONADSCAN_KEY --watch
```
