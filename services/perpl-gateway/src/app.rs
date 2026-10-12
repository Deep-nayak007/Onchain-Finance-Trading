//! Axum app wiring and shared state.

use std::sync::Arc;

use axum::{
    Router,
    routing::{get, post},
};
use tower_http::cors::CorsLayer;

use crate::{cache::Cache, config::Config, keystore::KeyStore, registry::Registry, routes, store::Store};

#[derive(Clone)]
pub struct AppState {
    pub cfg: Arc<Config>,
    pub cache: Cache,
    pub registry: Registry,
    pub keys: KeyStore,
    pub store: Store,
}

pub fn router(state: AppState) -> Router {
    Router::new()
        // Read path.
        .route("/health", get(routes::health))
        .route("/markets", get(routes::markets))
        .route("/book/{market}", get(routes::book))
        .route("/account/{address}", get(routes::account))
        .route("/risk/{address}", get(routes::risk))
        // Write path.
        .route("/orders/prepare", post(routes::orders_prepare))
        .route("/orders/execute", post(routes::orders_execute))
        .route("/deposit/prepare", post(routes::deposit_prepare))
        // Per-user trade-only keys.
        .route("/keys/prepare", post(routes::keys_prepare))
        .route("/keys/disable", post(routes::keys_disable))
        .layer(CorsLayer::permissive())
        .with_state(state)
}
