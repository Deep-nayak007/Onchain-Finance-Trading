# services/perpl-gateway/ — agent notes

Fail-closed Rust (axum + tokio + alloy + perpl-sdk) gateway over Perpl on Monad.

- Pinned to Rust 1.94.1 (`rust-toolchain.toml`) — alloy 2.5 / fastnum 0.7
  require ≥ 1.94.1. SDK itself needs ≥ 1.85.
- API shape is frozen (ARCHITECTURE §7.3); mock responses in `mock/`.
- Chain facts come from `perpl-sdk` `Chain::mainnet()` (chain 143, exchange
  `0x34B6…2a6F`, collateral `0x0000…012a`). Never hard-code other addresses.
- State: a background task takes a `SnapshotBuilder` snapshot and applies
  `stream::raw` events. `/health` reports `cacheLagBlocks`; the write path
  refuses when lag > `STALE_BLOCKS_MAX`.
- Orders: build with `OrderRequest::builder` → `prepare_v2` → `execOrdersV2`
  calldata; the SDK never signs. `/orders/execute` signs with the user's
  trade-only key (alloy) and an explicit gas limit (estimate + 10%).
- Trade-only keys are generated per user and stored as encrypted alloy
  keystores (`GATEWAY_KEYSTORE_PASSWORD`). They can't withdraw → hot key safe.
- Fail closed order: disabled key → market allowlist → size ≤ MAX_ORDER_USD →
  cache fresh → `MandateRegistry.isActive(user)`. Idempotent on
  `idempotencyKey` (SQLite `key → txHash`).
- Local Perpl SDK tests need the Monad anvil from category-labs/foundry
  v1.5.0-monad.0.2.0 on PATH.
- `cargo build`; deploy via `Dockerfile`. Put the public URL in
  `packages/shared/addresses.ts` → `SERVICES.gatewayUrl`.
- Q1/Q2 answered in `docs/perpl-notes.md`.
