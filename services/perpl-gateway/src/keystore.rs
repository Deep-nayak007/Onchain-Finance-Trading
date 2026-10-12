//! Per-user trade-only keys, generated and held only by the gateway.
//!
//! Why a hot key is safe here: a Perpl trade-only key can place and cancel
//! orders but can **never** withdraw collateral (that stays gated by the
//! user's own authorization). So even a fully compromised gateway cannot move
//! a user's funds out — the worst case is unwanted trades, which the mandate,
//! the Referee and the user's pause all still bound. See docs/contracts.md.
//!
//! Keys are stored as alloy JSON keystores (scrypt) encrypted with
//! `GATEWAY_KEYSTORE_PASSWORD`, one file per user address.

use std::{fs, path::PathBuf};

use alloy::signers::local::PrivateKeySigner;
use anyhow::{Context, anyhow};

#[derive(Clone)]
pub struct KeyStore {
    dir: PathBuf,
    password: String,
}

impl KeyStore {
    pub fn new(dir: impl Into<PathBuf>, password: String) -> anyhow::Result<Self> {
        let dir = dir.into();
        fs::create_dir_all(&dir).context("create keystore dir")?;
        if password.is_empty() {
            return Err(anyhow!("GATEWAY_KEYSTORE_PASSWORD must be set"));
        }
        Ok(Self { dir, password })
    }

    fn path(&self, user: &str) -> PathBuf {
        self.dir.join(format!("{}.json", user.to_lowercase()))
    }

    pub fn exists(&self, user: &str) -> bool {
        self.path(user).exists()
    }

    /// Load the user's trade-only signer, decrypting the keystore file.
    pub fn load(&self, user: &str) -> anyhow::Result<PrivateKeySigner> {
        let path = self.path(user);
        if !path.exists() {
            return Err(anyhow!("no trade-only key for {user}"));
        }
        PrivateKeySigner::decrypt_keystore(&path, &self.password)
            .map_err(|e| anyhow!("decrypt keystore: {e}"))
    }

    /// Generate a fresh trade-only key for the user if one does not exist, and
    /// return its public address (the key the user authorizes on Perpl).
    pub fn get_or_create(&self, user: &str) -> anyhow::Result<alloy::primitives::Address> {
        if self.exists(user) {
            return Ok(self.load(user)?.address());
        }
        let mut rng = rand::thread_rng();
        let (signer, _json) = PrivateKeySigner::new_keystore(
            &self.dir,
            &mut rng,
            &self.password,
            Some(&format!("{}.json", user.to_lowercase())),
        )
        .map_err(|e| anyhow!("create keystore: {e}"))?;
        Ok(signer.address())
    }
}
