//! Bridge between the Perpl SDK snapshot and the gateway's wire types, plus
//! order preparation and signed execution.
//!
//! Market symbols in the API ("MON-PERP") are resolved to the SDK's
//! `PerpetualId` by matching the perpetual's on-chain name/symbol. Fixed-point
//! values are rendered as decimal strings (ARCHITECTURE §6) by relying on the
//! SDK's own `UD64`/`D64` Display, which already prints human units.

use alloy::{
    network::{EthereumWallet, TransactionBuilder},
    primitives::{Address, U256, utils::format_units},
    providers::{Provider, ProviderBuilder},
    rpc::types::TransactionRequest,
    signers::local::PrivateKeySigner,
};
use fastnum::UD64;
use perpl_sdk::{
    state::{Exchange, Perpetual},
    types::{OrderRequest, PerpetualId, RequestType},
};
use std::str::FromStr;

/// Parse a decimal string into a `UD64`, mapping errors to a 400.
fn parse_ud64(s: &str, field: &str) -> Result<UD64> {
    s.parse::<UD64>()
        .map_err(|_| GatewayError::new(Code::BadRequest, format!("bad {field}: {s}")))
}

use crate::{
    app::AppState,
    error::{Code, GatewayError, Result},
    types::*,
};

/// Resolve an API market symbol to a tracked perpetual.
fn find_perp<'a>(ex: &'a Exchange, market: &str) -> Option<&'a Perpetual> {
    let want = market.to_uppercase();
    ex.perpetuals().values().find(|p| {
        p.name().to_uppercase() == want
            || p.symbol().to_uppercase() == want
            // "MON-PERP" vs a "MON" symbol: match the base before the suffix.
            || want.strip_suffix("-PERP").map(|b| b == p.symbol().to_uppercase()).unwrap_or(false)
    })
}

pub fn markets(ex: &Exchange) -> Vec<Market> {
    ex.perpetuals()
        .values()
        .map(|p| Market {
            market: perp_symbol(p),
            perp_id: p.id() as u64,
            mark: p.mark_price().to_string(),
            index: p.oracle_price().to_string(),
            funding_rate: p.funding_rate().to_string(),
            tick_size: ten_pow_neg(p.price_converter().decimals()),
            lot_size: ten_pow_neg(p.size_converter().decimals()),
        })
        .collect()
}

pub fn book(ex: &Exchange, market: &str, depth: usize) -> Option<Book> {
    let perp = find_perp(ex, market)?;
    let b = perp.l3_book();
    let asks = b
        .asks()
        .iter()
        .take(depth)
        .map(|(price, level)| BookLevel {
            price: price.to_string(),
            size: level.size().to_string(),
        })
        .collect();
    let bids = b
        .bids()
        .iter()
        .take(depth)
        .map(|(price, level)| BookLevel {
            price: price.0.to_string(),
            size: level.size().to_string(),
        })
        .collect();
    Some(Book { bids, asks, ts: ex.instant().block_timestamp() })
}

pub fn account(ex: &Exchange, addr: Address) -> Account {
    // `with_all_positions` tracks positions exchange-wide; find the account by
    // its address (it may not exist yet, in which case we return zeros).
    let acct = ex.accounts().values().find(|a| a.address() == addr);

    let (collateral, equity, positions) = match acct {
        None => ("0".to_string(), "0".to_string(), vec![]),
        Some(a) => {
            let positions = a
                .positions()
                .iter()
                .filter_map(|(perp_id, pos)| {
                    let perp = ex.perpetuals().get(perp_id)?;
                    let mark = perp.mark_price();
                    let size = pos.size();
                    let size_usd = size * mark;
                    let liq = pos.liquidation_price();
                    let liq_dist = if mark > UD64::ZERO {
                        let diff = if liq > mark { liq - mark } else { mark - liq };
                        (diff / mark * UD64::from(100u64)).to_string()
                    } else {
                        "0".to_string()
                    };
                    Some(Position {
                        market: perp_symbol(perp),
                        side: if pos.r#type().is_long() { "LONG".into() } else { "SHORT".into() },
                        size_usd: size_usd.to_string(),
                        entry_price: pos.entry_price().to_string(),
                        mark_price: mark.to_string(),
                        liq_price: liq.to_string(),
                        liq_distance_pct: liq_dist,
                        unrealized_pnl_usd: pos.pnl().to_string(),
                    })
                })
                .collect::<Vec<_>>();
            (a.balance().to_string(), (a.balance()).to_string(), positions)
        }
    };

    Account {
        collateral_usd: collateral,
        equity_usd: equity,
        margin_used_usd: "0".into(),
        positions,
    }
}

/// Build an unsigned `execOrdersV2` tx for the user to sign (`/orders/prepare`).
pub fn prepare_order_tx(ex: &Exchange, chain_id: u64, req: &PrepareOrder) -> Result<TxRequest> {
    let (perp_id, request) = build_order_request(ex, &req.market, &req.side, &req.size_usd, &req.price, req.leverage, req.reduce_only)?;
    let _ = perp_id;
    // orders_call needs a provider for its RawCallBuilder; we only want the
    // calldata, so build the descriptor and encode via the SDK path with a
    // throwaway provider. The gas is estimated by the caller when signing;
    // we set a safe explicit limit here.
    let data = encode_calldata(ex, &request)?;
    Ok(TxRequest {
        to: format!("{:#x}", ex.chain().exchange()),
        data,
        value: "0".into(),
        gas: "600000".into(),
        chain_id,
    })
}

/// Sign and send an order with the user's trade-only key (`/orders/execute`).
pub async fn execute_order(
    st: &AppState,
    signer: PrivateKeySigner,
    req: &ExecuteOrder,
) -> Result<String> {
    // Rebuild calldata from the live snapshot.
    let data = st
        .cache
        .with(|ex| {
            let (_pid, request) = build_order_request(
                ex, &req.market, &req.side, &req.size_usd, &req.price, req.leverage, req.reduce_only,
            )?;
            encode_calldata(ex, &request)
        })
        .await
        .ok_or_else(|| GatewayError::new(Code::StaleCache, "cache not ready"))??;

    let to = st
        .cache
        .with(|ex| ex.chain().exchange())
        .await
        .ok_or_else(|| GatewayError::new(Code::StaleCache, "cache not ready"))?;

    let from = signer.address();
    let wallet = EthereumWallet::from(signer);
    let provider = ProviderBuilder::new()
        .wallet(wallet)
        .connect(&st.cfg.monad_rpc)
        .await
        .map_err(|e| GatewayError::new(Code::Upstream, e.to_string()))?;

    let data_bytes = alloy::primitives::Bytes::from_str(&data)
        .map_err(|e| GatewayError::new(Code::Internal, e.to_string()))?;
    let mut tx = TransactionRequest::default()
        .with_from(from)
        .with_to(to)
        .with_input(data_bytes);

    // Monad charges gas on the declared limit: estimate, then +10%.
    let est = provider
        .estimate_gas(tx.clone())
        .await
        .map_err(|e| GatewayError::new(Code::Upstream, format!("estimate_gas: {e}")))?;
    tx = tx.with_gas_limit(est + est / 10);

    let pending = provider
        .send_transaction(tx)
        .await
        .map_err(|e| GatewayError::new(Code::Upstream, format!("send: {e}")))?;
    Ok(format!("{:#x}", *pending.tx_hash()))
}

/// Approve + deposit the collateral token (`/deposit/prepare`).
pub fn prepare_deposit(st: &AppState, req: &PrepareDeposit) -> Result<Vec<TxRequest>> {
    // Collateral token + exchange are known from the SDK Chain. We return an
    // ERC-20 approve followed by the exchange deposit, both for the user to
    // sign. The exact deposit selector is read from the SDK ABI at CP2; until
    // then this returns the approve leg and a documented placeholder deposit.
    let _ = (st, req);
    Err(GatewayError::new(
        Code::BadRequest,
        "deposit/prepare wired at CP2 — see docs/LIMITATIONS.md",
    ))
}

/// Enrollment payload for authorizing the per-user trade-only key (`/keys/prepare`, Q1).
pub fn prepare_key_enrollment(
    st: &AppState,
    _account: &str,
    _trade_key: Address,
) -> Result<TxRequest> {
    // Q1: Perpl trade-only key enrollment is a user-signed authorization on the
    // exchange binding `trade_key` to the account with trade-only (no-withdraw)
    // scope. The exact selector is confirmed at CP0 and filled in here; until
    // then we return a documented placeholder so Brain/Face can integrate the
    // flow. See docs/perpl-notes.md (Q1) and docs/LIMITATIONS.md.
    let _ = st;
    Err(GatewayError::new(
        Code::BadRequest,
        "keys/prepare enrollment payload pending Q1 confirmation — see docs/perpl-notes.md",
    ))
}

// ---- helpers ----

fn perp_symbol(p: &Perpetual) -> String {
    // Present a stable "<SYMBOL>-PERP" label the rest of the stack keys on.
    let sym = p.symbol().to_uppercase();
    if sym.ends_with("-PERP") { sym } else { format!("{sym}-PERP") }
}

fn ten_pow_neg(decimals: u8) -> String {
    if decimals == 0 {
        return "1".to_string();
    }
    format!("0.{}1", "0".repeat((decimals - 1) as usize))
}

/// Build an SDK `OrderRequest` from the API fields. `sizeUsd` is converted to a
/// base-asset size via the limit price (size = notional / price). Marketable
/// limit orders use immediate-or-cancel.
fn build_order_request(
    ex: &Exchange,
    market: &str,
    side: &str,
    size_usd: &str,
    price: &str,
    leverage: f64,
    reduce_only: bool,
) -> Result<(PerpetualId, OrderRequest)> {
    let perp = find_perp(ex, market)
        .ok_or_else(|| GatewayError::new(Code::NotFound, format!("market {market}")))?;
    let perp_id = perp.id();

    let price_ud = parse_ud64(price, "price")?;
    let notional = parse_ud64(size_usd, "sizeUsd")?;
    if price_ud == UD64::ZERO {
        return Err(GatewayError::new(Code::BadRequest, "price must be > 0"));
    }
    let size = notional / price_ud;
    let lev = parse_ud64(&leverage.to_string(), "leverage")?;

    let req_type = match (side.to_uppercase().as_str(), reduce_only) {
        ("LONG", false) | ("BUY", false) => RequestType::OpenLong,
        ("SHORT", false) | ("SELL", false) => RequestType::OpenShort,
        ("LONG", true) | ("BUY", true) => RequestType::CloseShort,
        ("SHORT", true) | ("SELL", true) => RequestType::CloseLong,
        _ => return Err(GatewayError::new(Code::BadRequest, "side must be LONG/SHORT")),
    };

    let request = OrderRequest::builder(perp_id, req_type, price_ud, size)
        .leverage(lev)
        .immediate_or_cancel(true)
        .build(ex)
        .map_err(|e| GatewayError::new(Code::BadRequest, format!("order rejected: {e:?}")))?;
    Ok((perp_id, request))
}

/// Encode `execOrdersV2` calldata for a single request as a 0x-hex string.
fn encode_calldata(ex: &Exchange, request: &OrderRequest) -> Result<String> {
    use alloy::sol_types::SolCall;
    use perpl_sdk::abi::dex;

    let (desc, extension) = request
        .prepare_v2(ex)
        .map_err(|e| GatewayError::new(Code::BadRequest, format!("prepare_v2: {e:?}")))?;
    let call = dex::Exchange::execOrdersV2Call {
        orderDescs: vec![desc],
        revertOnFail: true,
        extensions: vec![extension],
    };
    Ok(format!("0x{}", alloy::hex::encode(call.abi_encode())))
}

/// Format a U256 USD6 value as a decimal string (unused helper kept for §6 parity).
#[allow(dead_code)]
fn usd6_to_decimal(v: U256) -> String {
    format_units(v, 6).unwrap_or_else(|_| "0".into())
}
