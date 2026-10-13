//! HTTP handlers for the gateway API (ARCHITECTURE §7.3).
//!
//! Read endpoints serve the SDK's in-memory snapshot, normalizing fixed-point
//! values to decimal strings (§6). The write path prepares `execOrdersV2`
//! calldata via the SDK and, for `/orders/execute`, signs with the user's
//! trade-only key under a strict fail-closed gate.

use alloy::primitives::Address;
use axum::{
    Json,
    extract::{Path, State},
};
use std::collections::BTreeMap;

use crate::{
    app::AppState,
    cache,
    error::{Code, GatewayError, Result},
    perpl, types::*,
};

fn parse_addr(s: &str) -> Result<Address> {
    s.parse::<Address>()
        .map_err(|_| GatewayError::new(Code::BadRequest, format!("bad address: {s}")))
}

fn now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

// ---- /health ----

pub async fn health(State(st): State<AppState>) -> Json<Health> {
    let cache_block = st.cache.block().await.unwrap_or(0);
    let tip = cache::chain_tip(&st.cfg.monad_rpc).await.unwrap_or(cache_block);
    let lag = tip.saturating_sub(cache_block);
    Json(Health {
        ok: cache_block > 0 && lag <= st.cfg.stale_blocks_max,
        block: cache_block,
        cache_lag_blocks: lag,
    })
}

// ---- /markets ----

pub async fn markets(State(st): State<AppState>) -> Result<Json<Vec<Market>>> {
    let out = st
        .cache
        .with(|ex| perpl::markets(ex))
        .await
        .ok_or_else(|| GatewayError::new(Code::StaleCache, "cache not ready"))?;
    Ok(Json(out))
}

// ---- /book/:market ----

pub async fn book(
    State(st): State<AppState>,
    Path(market): Path<String>,
) -> Result<Json<Book>> {
    let out = st
        .cache
        .with(|ex| perpl::book(ex, &market, 20))
        .await
        .ok_or_else(|| GatewayError::new(Code::StaleCache, "cache not ready"))?
        .ok_or_else(|| GatewayError::new(Code::NotFound, format!("market {market}")))?;
    Ok(Json(out))
}

// ---- /account/:address ----

pub async fn account(
    State(st): State<AppState>,
    Path(address): Path<String>,
) -> Result<Json<Account>> {
    let addr = parse_addr(&address)?;
    let out = st
        .cache
        .with(|ex| perpl::account(ex, addr))
        .await
        .ok_or_else(|| GatewayError::new(Code::StaleCache, "cache not ready"))?;
    Ok(Json(out))
}

// ---- /risk/:address ----

pub async fn risk(
    State(st): State<AppState>,
    Path(address): Path<String>,
) -> Result<Json<RiskSnapshot>> {
    let addr = parse_addr(&address)?;
    let acct = st
        .cache
        .with(|ex| perpl::account(ex, addr))
        .await
        .ok_or_else(|| GatewayError::new(Code::StaleCache, "cache not ready"))?;

    // Weekly PnL % and slackLeftUsd use Envio's PnlSnapshot as the baseline
    // (ARCHITECTURE §7.3). Until Envio is wired at CP2 the gateway returns the
    // live-derived fields and leaves the weekly baseline at "0" — documented
    // in docs/LIMITATIONS.md.
    let mut exposure: BTreeMap<String, String> = BTreeMap::new();
    for p in &acct.positions {
        exposure.insert(p.market.clone(), p.size_usd.clone());
    }
    Ok(Json(RiskSnapshot {
        account: format!("{addr:#x}"),
        ts: now_secs(),
        equity_usd: acct.equity_usd.clone(),
        collateral_usd: acct.collateral_usd.clone(),
        margin_used_usd: acct.margin_used_usd.clone(),
        weekly_pnl_pct: "0".into(),
        funding_paid_usd: "0".into(),
        slack_left_usd: "0".into(),
        positions: acct.positions,
        exposure_by_market: exposure,
    }))
}

// ---- /orders/prepare ----

pub async fn orders_prepare(
    State(st): State<AppState>,
    Json(req): Json<PrepareOrder>,
) -> Result<Json<TxRequest>> {
    check_market_allowed(&st, &req.market)?;
    check_size(&st, &req.size_usd)?;
    let tx = st
        .cache
        .with(|ex| perpl::prepare_order_tx(ex, st.cfg.chain_id, &req))
        .await
        .ok_or_else(|| GatewayError::new(Code::StaleCache, "cache not ready"))??;
    Ok(Json(tx))
}

// ---- /orders/execute ----

/// Write paths that act with a user's trade key are callable only by Brain (shared secret).
fn require_token(st: &AppState, headers: &axum::http::HeaderMap) -> Result<()> {
    match &st.cfg.api_token {
        None => Ok(()),
        Some(want) => {
            let got = headers.get("x-gateway-token").and_then(|v| v.to_str().ok()).unwrap_or("");
            if got.len() == want.len() && got.as_bytes().iter().zip(want.as_bytes()).fold(0u8, |a, (x, y)| a | (x ^ y)) == 0 {
                Ok(())
            } else {
                Err(GatewayError::new(Code::Unauthorized, "missing or bad x-gateway-token"))
            }
        }
    }
}

pub async fn orders_execute(
    State(st): State<AppState>,
    headers: axum::http::HeaderMap,
    Json(req): Json<ExecuteOrder>,
) -> Result<Json<ExecuteResult>> {
    require_token(&st, &headers)?;
    let user = parse_addr(&req.account)?;

    // Idempotency first: a replay returns the original txHash without re-sending.
    if let Some(tx) = st.store.get_idempotent(&req.idempotency_key)? {
        return Ok(Json(ExecuteResult { tx_hash: tx, status: "DUPLICATE".into() }));
    }

    // Fail closed, in order of cheapest check first.
    if st.store.is_disabled(&req.account)? {
        return Err(GatewayError::new(Code::KeyDisabled, "trade-only key disabled"));
    }
    check_market_allowed(&st, &req.market)?;
    check_size(&st, &req.size_usd)?;

    // Cache freshness.
    let cache_block = st.cache.block().await.unwrap_or(0);
    let tip = cache::chain_tip(&st.cfg.monad_rpc).await.unwrap_or(cache_block);
    if cache_block == 0 || tip.saturating_sub(cache_block) > st.cfg.stale_blocks_max {
        return Err(GatewayError::new(Code::StaleCache, "exchange cache is stale"));
    }

    // Mandate must be active right now.
    if !st.registry.is_active(user).await.map_err(GatewayError::from)? {
        return Err(GatewayError::new(Code::MandateInactive, "mandate inactive or paused"));
    }

    if !st.keys.exists(&req.account) {
        return Err(GatewayError::new(Code::NoKey, "no trade-only key enrolled"));
    }
    let signer = st.keys.load(&req.account).map_err(GatewayError::from)?;

    // Build calldata from the SDK, sign with the user's trade-only key, and
    // send with an explicit gas limit (estimate + 10%).
    let tx_hash = perpl::execute_order(&st, signer, &req).await?;

    st.store.put_idempotent(&req.idempotency_key, &tx_hash)?;
    Ok(Json(ExecuteResult { tx_hash, status: "SENT".into() }))
}

// ---- /deposit/prepare ----

pub async fn deposit_prepare(
    State(st): State<AppState>,
    Json(req): Json<PrepareDeposit>,
) -> Result<Json<Vec<TxRequest>>> {
    let txs = perpl::prepare_deposit(&st, &req)?;
    Ok(Json(txs))
}

// ---- /keys/prepare ----

pub async fn keys_prepare(
    State(st): State<AppState>,
    Json(req): Json<KeyRequest>,
) -> Result<Json<KeyPrepareResult>> {
    let _ = parse_addr(&req.account)?;
    let trade_key =
        st.keys.get_or_create(&req.account).map_err(GatewayError::from)?;
    // Re-enable a previously-disabled key on fresh enrollment.
    st.store.set_disabled(&req.account, false)?;
    // Enrollment is optional until Q1 is confirmed: never fail the key itself on it.
    let enrollment = match perpl::prepare_key_enrollment(&st, &req.account, trade_key) {
        Ok(tx) => Some(tx),
        Err(e) => {
            tracing::warn!("keys/prepare: enrollment unavailable ({e:?}); returning key only");
            None
        }
    };
    let addr = format!("{trade_key:#x}");
    Ok(Json(KeyPrepareResult {
        key_address: addr.clone(),
        trade_key: addr,
        enrollment,
    }))
}

// ---- /keys/disable ----

pub async fn keys_disable(
    State(st): State<AppState>,
    headers: axum::http::HeaderMap,
    Json(req): Json<KeyRequest>,
) -> Result<Json<Ack>> {
    require_token(&st, &headers)?;
    let _ = parse_addr(&req.account)?;
    st.store.set_disabled(&req.account, true)?;
    Ok(Json(Ack { ok: true }))
}

// ---- shared guards ----

fn check_market_allowed(st: &AppState, market: &str) -> Result<()> {
    if st.cfg.market_allowlist.iter().any(|m| m == market) {
        Ok(())
    } else {
        Err(GatewayError::new(
            Code::MarketNotAllowed,
            format!("{market} not in allowlist"),
        ))
    }
}

fn check_size(st: &AppState, size_usd: &str) -> Result<()> {
    let size: f64 = size_usd
        .parse()
        .map_err(|_| GatewayError::new(Code::BadRequest, "bad sizeUsd"))?;
    if size > st.cfg.max_order_usd {
        return Err(GatewayError::new(
            Code::SizeExceedsMax,
            format!("size {size} > MAX_ORDER_USD {}", st.cfg.max_order_usd),
        ));
    }
    Ok(())
}
