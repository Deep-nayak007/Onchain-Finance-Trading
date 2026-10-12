//! Reads the MandateRegistry on chain 143. The write path calls `isActive`
//! immediately before signing, so a paused or absent mandate fails closed.

use alloy::{primitives::Address, providers::ProviderBuilder, sol};

sol! {
    #[sol(rpc)]
    interface IMandateRegistry {
        function isActive(address user) external view returns (bool);
    }
}

#[derive(Clone)]
pub struct Registry {
    rpc: String,
    address: Option<Address>,
}

impl Registry {
    pub fn new(rpc: String, address: Option<Address>) -> Self {
        Self { rpc, address }
    }

    /// Whether the user's mandate exists and is not paused. If the registry
    /// address is not configured we fail closed (treat as inactive) rather
    /// than letting an unconfigured gateway execute.
    pub async fn is_active(&self, user: Address) -> anyhow::Result<bool> {
        let Some(addr) = self.address else {
            return Ok(false);
        };
        let provider = ProviderBuilder::new().connect(&self.rpc).await?;
        let registry = IMandateRegistry::new(addr, provider);
        Ok(registry.isActive(user).call().await?)
    }
}
