//! Durable state: idempotency records (`idempotencyKey -> txHash`) and the set
//! of disabled trade-only keys (the kill switch). SQLite via rusqlite.

use std::sync::{Arc, Mutex};

use rusqlite::Connection;

#[derive(Clone)]
pub struct Store {
    conn: Arc<Mutex<Connection>>,
}

impl Store {
    pub fn open(path: &str) -> anyhow::Result<Self> {
        let conn = Connection::open(path)?;
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS idempotency (
                 key      TEXT PRIMARY KEY,
                 tx_hash  TEXT NOT NULL,
                 created  INTEGER NOT NULL
             );
             CREATE TABLE IF NOT EXISTS disabled_keys (
                 user     TEXT PRIMARY KEY,
                 disabled INTEGER NOT NULL
             );",
        )?;
        Ok(Self { conn: Arc::new(Mutex::new(conn)) })
    }

    /// Look up a previously-sent tx for this idempotency key.
    pub fn get_idempotent(&self, key: &str) -> anyhow::Result<Option<String>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT tx_hash FROM idempotency WHERE key = ?1")?;
        let mut rows = stmt.query([key])?;
        if let Some(row) = rows.next()? {
            Ok(Some(row.get(0)?))
        } else {
            Ok(None)
        }
    }

    pub fn put_idempotent(&self, key: &str, tx_hash: &str) -> anyhow::Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT OR IGNORE INTO idempotency(key, tx_hash, created) VALUES (?1, ?2, ?3)",
            rusqlite::params![key, tx_hash, now()],
        )?;
        Ok(())
    }

    pub fn is_disabled(&self, user: &str) -> anyhow::Result<bool> {
        let conn = self.conn.lock().unwrap();
        let mut stmt =
            conn.prepare("SELECT disabled FROM disabled_keys WHERE user = ?1")?;
        let mut rows = stmt.query([user.to_lowercase()])?;
        if let Some(row) = rows.next()? {
            let v: i64 = row.get(0)?;
            Ok(v != 0)
        } else {
            Ok(false)
        }
    }

    pub fn set_disabled(&self, user: &str, disabled: bool) -> anyhow::Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO disabled_keys(user, disabled) VALUES (?1, ?2)
             ON CONFLICT(user) DO UPDATE SET disabled = ?2",
            rusqlite::params![user.to_lowercase(), disabled as i64],
        )?;
        Ok(())
    }
}

fn now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}
