//! Gateway configuration, loaded from the environment. Fail-closed defaults.

use std::env;

use alloy::primitives::Address;

#[derive(Clone, Debug)]
pub struct Config {
    pub monad_rpc: String,
    pub chain_id: u64,
    pub bind: String,
    /// MandateRegistry on chain 143 — the gateway reads `isActive` before every execute.
    pub mandate_registry: Option<Address>,
    /// Market symbols the gateway will execute against (fail closed otherwise).
    pub market_allowlist: Vec<String>,
    /// Hard cap on a single order's USD size (default 25).
    pub max_order_usd: f64,
    /// Refuse to execute when the cache lags the chain tip by more than this.
    pub stale_blocks_max: u64,
    /// Password unlocking the per-user trade-only keystore.
    pub keystore_password: String,
    /// Directory holding per-user encrypted trade-only keystores.
    pub keystore_dir: String,
    /// SQLite path for idempotency + disabled-key records.
    pub db_path: String,
    /// Shared secret required in `x-gateway-token` for write paths that act with a user's trade key
    /// (`/orders/execute`, `/keys/disable`). Unset = open (local dev only).
    pub api_token: Option<String>,
}

impl Config {
    pub fn from_env() -> anyhow::Result<Self> {
        let _ = dotenvy::dotenv();
        Ok(Self {
            monad_rpc: env::var("MONAD_RPC").unwrap_or_else(|_| "https://rpc.monad.xyz".into()),
            chain_id: env::var("CHAIN_ID").ok().and_then(|v| v.parse().ok()).unwrap_or(143),
            // GATEWAY_BIND wins; else honor a platform-provided PORT (Render,
            // Railway, Heroku-style hosts); else default to 8080 (Fly/local).
            bind: env::var("GATEWAY_BIND").unwrap_or_else(|_| {
                let port = env::var("PORT").unwrap_or_else(|_| "8080".into());
                format!("0.0.0.0:{port}")
            }),
            mandate_registry: env::var("MANDATE_REGISTRY_ADDRESS")
                .ok()
                .and_then(|v| v.parse().ok()),
            market_allowlist: env::var("MARKET_ALLOWLIST")
                .unwrap_or_else(|_| "MON-PERP".into())
                .split(',')
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect(),
            max_order_usd: env::var("MAX_ORDER_USD")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(25.0),
            stale_blocks_max: env::var("STALE_BLOCKS_MAX")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(20),
            keystore_password: env::var("GATEWAY_KEYSTORE_PASSWORD").unwrap_or_default(),
            keystore_dir: env::var("GATEWAY_KEYSTORE_DIR").unwrap_or_else(|_| "./keystore".into()),
            db_path: env::var("GATEWAY_DB_PATH").unwrap_or_else(|_| "./gateway.sqlite".into()),
            api_token: env::var("GATEWAY_API_TOKEN").ok().filter(|t| !t.trim().is_empty()),
        })
    }
}
