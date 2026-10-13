//! Wire types for the gateway API (ARCHITECTURE §7.3). All fixed-point values
//! are normalized to decimal strings (ARCHITECTURE §6).

use serde::{Deserialize, Serialize};

#[derive(Serialize)]
pub struct Health {
    pub ok: bool,
    pub block: u64,
    #[serde(rename = "cacheLagBlocks")]
    pub cache_lag_blocks: u64,
}

#[derive(Serialize)]
pub struct Market {
    pub market: String,
    #[serde(rename = "perpId")]
    pub perp_id: u64,
    pub mark: String,
    pub index: String,
    #[serde(rename = "fundingRate")]
    pub funding_rate: String,
    #[serde(rename = "tickSize")]
    pub tick_size: String,
    #[serde(rename = "lotSize")]
    pub lot_size: String,
}

#[derive(Serialize)]
pub struct BookLevel {
    pub price: String,
    pub size: String,
}

#[derive(Serialize)]
pub struct Book {
    pub bids: Vec<BookLevel>,
    pub asks: Vec<BookLevel>,
    pub ts: u64,
}

#[derive(Serialize)]
pub struct Position {
    pub market: String,
    pub side: String,
    #[serde(rename = "sizeUsd")]
    pub size_usd: String,
    #[serde(rename = "entryPrice")]
    pub entry_price: String,
    #[serde(rename = "markPrice")]
    pub mark_price: String,
    #[serde(rename = "liqPrice")]
    pub liq_price: String,
    #[serde(rename = "liqDistancePct")]
    pub liq_distance_pct: String,
    #[serde(rename = "unrealizedPnlUsd")]
    pub unrealized_pnl_usd: String,
}

#[derive(Serialize)]
pub struct Account {
    #[serde(rename = "collateralUsd")]
    pub collateral_usd: String,
    #[serde(rename = "equityUsd")]
    pub equity_usd: String,
    #[serde(rename = "marginUsedUsd")]
    pub margin_used_usd: String,
    pub positions: Vec<Position>,
}

#[derive(Serialize)]
pub struct RiskSnapshot {
    pub account: String,
    pub ts: u64,
    #[serde(rename = "equityUsd")]
    pub equity_usd: String,
    #[serde(rename = "collateralUsd")]
    pub collateral_usd: String,
    #[serde(rename = "marginUsedUsd")]
    pub margin_used_usd: String,
    #[serde(rename = "weeklyPnlPct")]
    pub weekly_pnl_pct: String,
    #[serde(rename = "fundingPaidUsd")]
    pub funding_paid_usd: String,
    #[serde(rename = "slackLeftUsd")]
    pub slack_left_usd: String,
    pub positions: Vec<Position>,
    #[serde(rename = "exposureByMarket")]
    pub exposure_by_market: std::collections::BTreeMap<String, String>,
}

/// Unsigned transaction for the user (or gateway) to sign. Matches §7.2 TxRequest.
#[derive(Serialize)]
pub struct TxRequest {
    pub to: String,
    pub data: String,
    pub value: String,
    pub gas: String,
    #[serde(rename = "chainId")]
    pub chain_id: u64,
}

#[derive(Deserialize)]
pub struct PrepareOrder {
    // Part of the frozen §7.3 request; used by the deposit/key paths at CP2.
    #[allow(dead_code)]
    pub account: String,
    pub market: String,
    pub side: String, // LONG | SHORT
    #[serde(rename = "sizeUsd")]
    pub size_usd: String,
    pub price: String,
    pub leverage: f64,
    #[serde(default)]
    pub reduce_only: bool,
}

#[derive(Deserialize)]
pub struct ExecuteOrder {
    pub account: String,
    pub market: String,
    pub side: String,
    #[serde(rename = "sizeUsd")]
    pub size_usd: String,
    pub price: String,
    pub leverage: f64,
    #[serde(default)]
    pub reduce_only: bool,
    #[serde(rename = "idempotencyKey")]
    pub idempotency_key: String,
}

#[derive(Serialize)]
pub struct ExecuteResult {
    #[serde(rename = "txHash")]
    pub tx_hash: String,
    pub status: String,
}

#[derive(Deserialize)]
#[allow(dead_code)] // fields consumed by prepare_deposit at CP2
pub struct PrepareDeposit {
    pub account: String,
    #[serde(rename = "amountUsd")]
    pub amount_usd: String,
}

#[derive(Deserialize)]
pub struct KeyRequest {
    pub account: String,
}

#[derive(Serialize)]
pub struct KeyPrepareResult {
    /// Public address of the generated per-user trade-only key — the key the
    /// user authorizes on Perpl. (Requested by Brain for the mandate/enroll UI.)
    #[serde(rename = "keyAddress")]
    pub key_address: String,
    /// Alias of `keyAddress`, kept for backward compatibility.
    #[serde(rename = "tradeKey")]
    pub trade_key: String,
    /// Enrollment payload the user signs to authorize the trade-only key (Q1).
    /// `null` while the enrollment format is pending: the key itself is still created and returned,
    /// so the mandate can bind `perplKey` (paper mode / until Q1 lands).
    pub enrollment: Option<TxRequest>,
}

#[derive(Serialize)]
pub struct Ack {
    pub ok: bool,
}
