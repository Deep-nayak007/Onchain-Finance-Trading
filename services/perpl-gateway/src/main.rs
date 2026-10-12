//! LEASH Perpl execution gateway.
//!
//! A fail-closed HTTP service over the Perpl perpetuals exchange on Monad: it
//! keeps a live SDK snapshot, serves read endpoints to Brain and the app, and
//! on the write path signs orders with per-user trade-only keys that can never
//! withdraw. It refuses to execute when the cache is stale, the mandate is
//! inactive, the market is not allowlisted, or the size exceeds MAX_ORDER_USD.

mod app;
mod cache;
mod config;
mod error;
mod keystore;
mod perpl;
mod registry;
mod routes;
mod store;
mod types;

use std::sync::Arc;

use app::AppState;
use cache::Cache;
use config::Config;
use keystore::KeyStore;
use registry::Registry;
use store::Store;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "perpl_gateway=info,tower_http=info".into()),
        )
        .init();

    let cfg = Arc::new(Config::from_env()?);
    tracing::info!(
        "gateway: chain {} rpc {} allowlist {:?} max_order_usd {} stale_blocks_max {}",
        cfg.chain_id,
        cfg.monad_rpc,
        cfg.market_allowlist,
        cfg.max_order_usd,
        cfg.stale_blocks_max
    );

    let cache = Cache::new(cfg.monad_rpc.clone(), cfg.chain_id);
    cache.spawn();

    let registry = Registry::new(cfg.monad_rpc.clone(), cfg.mandate_registry);
    let keys = KeyStore::new(cfg.keystore_dir.clone(), cfg.keystore_password.clone())?;
    let store = Store::open(&cfg.db_path)?;

    let state = AppState { cfg: cfg.clone(), cache, registry, keys, store };
    let app = app::router(state);

    let listener = tokio::net::TcpListener::bind(&cfg.bind).await?;
    tracing::info!("listening on {}", cfg.bind);
    axum::serve(listener, app).await?;
    Ok(())
}
