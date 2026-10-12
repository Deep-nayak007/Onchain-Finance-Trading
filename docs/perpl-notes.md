# Perpl notes — Q1 & Q2 (RAILS-owned open questions)

Grounded in the Perpl SDK source (https://github.com/PerplFoundation/dex-sdk,
`crates/sdk`) and docs. These answers also belong in ARCHITECTURE §10.

## Q2 — Collateral token

**Answered from the SDK.** `Chain::mainnet()` in `crates/sdk/src/lib.rs` pins
the exchange collateral token on chain 143 to:

```
collateral_token = 0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a   (chain 143)
exchange         = 0x34B6552d57a35a1D042CcAe1951BD1C370112a6F   (chain 143)
deployed_at_block = 54773010
```

Bytecode for both is confirmed on chain 143 (`cast code`). This is a 6-decimal
AUSD-class stable collateral; the UI shows "dollars" (ARCHITECTURE §6, FACE copy
rules). If a user funds a different asset, the swap path is Kuru AUSD↔MON
(Owl's hedge helper, Brain Q3). Addresses recorded in
`packages/shared/addresses.ts` → `PERPL`.

## Q1 — Perpl trade-only API keys

**Mechanism (from the SDK design).** The Perpl SDK never holds a key: it
*prepares* `execOrdersV2` calldata and leaves signing to the caller
(`crates/sdk/src/exec.rs`, `OrderRequest::call`). A "trade-only key" is simply
a separate signer that the exchange recognizes as authorized to **place and
cancel orders** for an account, but which cannot move collateral out — withdrawal
stays gated to the account owner. That is what makes a hot key safe in the
gateway: the worst case is unwanted trades (still bounded by the mandate, the
Referee and the user's pause), never loss of funds.

**Can our app prepare the enrollment for the user to sign?** Yes — that is the
whole point of the split. The gateway generates the per-user trade-only key
locally (`keystore.rs`), and `POST /keys/prepare` returns:
- `tradeKey`: the public address of the generated key, and
- `enrollment`: an unsigned `TxRequest` the **user** signs from their own wallet
  to authorize that key on the exchange (no gateway key touches it).

The exact authorization selector/payload is confirmed against the deployed
exchange ABI at CP0/CP2 and dropped into `prepare_key_enrollment`
(`perpl.rs`). Until then the endpoint returns a documented placeholder so Brain
and Face can wire the flow (see docs/LIMITATIONS.md).

**Kill switch.** `POST /keys/disable` flips a local flag; every subsequent
`/orders/execute` for that user is refused with `KEY_DISABLED`, independent of
the on-chain pause. Belt and suspenders.
