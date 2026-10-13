//! In-memory Perpl exchange cache, kept current from the SDK event stream.
//!
//! A background task takes a `SnapshotBuilder` snapshot at the latest safe
//! block and then applies `stream::raw` events forever. The cache tracks the
//! block it is current to; `/health` reports the lag against the chain tip and
//! the write path refuses to execute when that lag is too large (fail closed).

use std::{pin::pin, sync::Arc, time::Duration};

use alloy::{
    providers::{Provider, ProviderBuilder},
    rpc::client::RpcClient,
    transports::layers::{RetryBackoffLayer, ThrottleLayer},
};
use futures::StreamExt;
use perpl_sdk::{Chain, state::Exchange, state::SnapshotBuilder, stream};
use tokio::sync::RwLock;

/// Max requests/sec to the RPC. QuickNode's free tier caps at 50/s, so we stay
/// comfortably under it to leave headroom for the event-stream polling that
/// runs alongside the snapshot burst.
const RPC_MAX_RPS: u32 = 20;

/// Build a throttled + retrying provider so the Perpl snapshot's burst of calls
/// stays under the RPC's rate limit (otherwise it 429s forever and never
/// completes — see the ThrottleLayer / RetryBackoffLayer).
async fn build_provider(rpc: &str) -> anyhow::Result<impl Provider + Clone> {
    let client = RpcClient::builder()
        // Retry transient failures (incl. any 429s that slip through) with backoff.
        .layer(RetryBackoffLayer::new(10, 200, 300))
        // Cap outbound request rate.
        .layer(ThrottleLayer::new(RPC_MAX_RPS))
        .connect(rpc)
        .await?;
    Ok(ProviderBuilder::new().connect_client(client))
}

/// Shared, concurrently-readable exchange snapshot plus the block it is at.
#[derive(Clone)]
pub struct Cache {
    inner: Arc<RwLock<Option<Exchange>>>,
    rpc: String,
    chain_id: u64,
}

impl Cache {
    pub fn new(rpc: String, chain_id: u64) -> Self {
        Self { inner: Arc::new(RwLock::new(None)), rpc, chain_id }
    }

    fn chain(&self) -> Chain {
        if self.chain_id == 143 { Chain::mainnet() } else { Chain::testnet() }
    }

    /// Block the cache is current to, or None before the first snapshot.
    pub async fn block(&self) -> Option<u64> {
        self.inner.read().await.as_ref().map(|e| e.instant().block_number())
    }

    /// Run a closure against the live exchange snapshot, if one exists.
    pub async fn with<R>(&self, f: impl FnOnce(&Exchange) -> R) -> Option<R> {
        self.inner.read().await.as_ref().map(f)
    }

    /// Spawn the snapshot + event-apply loop. Rebuilds the snapshot on a fatal
    /// stream error rather than leaving a frozen cache (which would read as
    /// stale and fail closed anyway).
    pub fn spawn(self: &Cache) {
        let cache = self.clone();
        tokio::spawn(async move {
            loop {
                if let Err(e) = cache.run_once().await {
                    tracing::error!("perpl cache loop error: {e:?}; rebuilding in 5s");
                    // Drop the snapshot so health reports no cache until rebuilt.
                    *cache.inner.write().await = None;
                    tokio::time::sleep(Duration::from_secs(5)).await;
                }
            }
        });
    }

    async fn run_once(&self) -> anyhow::Result<()> {
        let chain = self.chain();
        let provider = build_provider(&self.rpc).await?;

        // Discover every listed perpetual, tracking all open positions so any
        // account's exposure is available without naming it in advance.
        let exchange = SnapshotBuilder::new(&chain, provider.clone())
            .with_all_positions()
            .build()
            .await?;
        let start = exchange.instant().next();
        tracing::info!(
            "perpl snapshot: {} perpetuals @ block {}",
            exchange.perpetuals().len(),
            exchange.instant().block_number()
        );
        *self.inner.write().await = Some(exchange);

        let events = stream::raw(&chain, provider, start, tokio::time::sleep);
        let mut events = pin!(events);
        while let Some(block_events) = events.next().await {
            let block_events = block_events?;
            let mut guard = self.inner.write().await;
            if let Some(exchange) = guard.as_mut() {
                exchange.apply_events(&block_events)?;
            }
        }
        Ok(())
    }
}

/// Current chain tip, independent of the cache, for computing lag.
pub async fn chain_tip(rpc: &str) -> anyhow::Result<u64> {
    let provider = build_provider(rpc).await?;
    Ok(provider.get_block_number().await?)
}

