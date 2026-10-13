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
- `cargo build`; deploy via `Dockerfile`. Hosted on **Render free**
  (`render.yaml`): testnet demo = `leash-perpl-gateway-testnet.onrender.com`,
  mainnet = `leash-gateway.onrender.com`. (Fly was used first but its trial
  ended.) Render free sleeps on idle, so keep a /health ping warm; `PORT` is
  injected (config falls back to it when `GATEWAY_BIND` is unset). URLs live in
  `packages/shared/addresses.ts` → `SERVICES.gatewayUrl` / `gatewayUrlMainnet`.
- RPC is throttled to 20 req/s (`cache.rs`) so the snapshot stays under
  QuickNode's 50/s cap; `STALE_BLOCKS_MAX=50` (~20s) to avoid flapping.
- Q1/Q2 answered in `docs/perpl-notes.md`. `/deposit/prepare` + the enrollment
  leg of `/keys/prepare` are deliberately stubbed (BAD_REQUEST / null) until
  Perpl test collateral exists — this is the app's "Fund the Leash" 400.
