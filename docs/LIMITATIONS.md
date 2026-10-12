# LIMITATIONS — RAILS lane

Honest list of what is stubbed behind a frozen interface, and why. Each item
names the interface it sits behind so a teammate can build against it today and
the real implementation can drop in without a shape change.

## Contracts
- None. `MandateRegistry` and `ReceiptLog` are complete, implement
  ARCHITECTURE §7.1 exactly, and pass the full Foundry suite (31 tests). Deploy
  + verification is a runtime step gated on `DEPLOYER_PRIVATE_KEY` and
  `REFEREE_ADDRESS` (see docs/contracts.md).

## Perpl gateway
- **`/orders/execute` not yet exercised against mainnet.** The calldata is
  built with the Perpl SDK (`OrderRequest::builder` → `prepare_v2` →
  `execOrdersV2`), signed with alloy and sent with an explicit gas limit
  (estimate + 10%). It has not yet been run end-to-end against a funded
  trade-only key on chain 143 — that happens at CP2 with Prem. Behind the
  frozen §7.3 shape.
- **`/deposit/prepare` returns a documented error** until the exact collateral
  deposit selector is confirmed from the SDK ABI (CP2). Shape is frozen; the
  approve leg + exchange deposit are ready to fill in.
- **`/keys/prepare` enrollment payload** is pending the Q1 confirmation of how
  a third-party app prepares a Perpl trade-only key authorization for the user
  to sign (see docs/perpl-notes.md). The key is generated and the response
  shape is frozen; only the `enrollment` TxRequest body is a placeholder.
- **`/risk` weekly fields** (`weeklyPnlPct`, `fundingPaidUsd`, `slackLeftUsd`)
  are returned as "0" until Envio's `PnlSnapshot` baseline is wired at CP2–CP3.
  Live equity/collateral/positions and liq distance are real.

## Envio
- **PnL + fills not yet indexed.** `realizedPnlUsd`, `shadowPnlUsd`,
  `maxDrawdownPct`, `PnlSnapshot` and `PerplFill` are defined in the schema but
  populated at CP3 once the Perpl fill ABI is wired. Receipts, mandates, slack,
  pauses and the executed/rejected/shadow leaderboard counters are live now.
- **Kuru `Trade` is wired but needs the market address + decimals.** The
  `KuruOrderBook.Trade` event (signature from the Monad kuru-terminal reference
  indexer) is in `config.yaml` and handled into `KuruTrade`; it only needs the
  MON/AUSD order-book address (Q3, from Brain) and the market's base/quote
  decimals to scale `baseAmount`/`quoteAmount`. Side and price map today.
- **Persona-gated shadow counting** keys off `PERSONA_WALLETS` in
  `EventHandlers.ts`, which is empty until the persona wallet addresses land in
  `addresses.ts` at CP1. Until then shadows are counted unconditionally (noted
  in-handler); after CP1 only known persona wallets count.

## ERC-8004
- Registration script is ready; it runs at CP3 once persona wallet keys and
  `PINATA_JWT` are available. agentIds then go into `addresses.ts`.

## Open questions owned by Rails
- Q1 (trade-only key enrollment) and Q2 (collateral token): see
  docs/perpl-notes.md. Q2 is answered from the SDK; Q1's exact signing payload
  is confirmed at CP0 and dropped into `/keys/prepare`.
- Q5 (ERC-8004 registry on 143): answered — addresses verified on chain, in
  `addresses.ts`.