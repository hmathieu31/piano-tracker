//! The key-value settings store.

use rusqlite::{params, OptionalExtension};
use super::{Database, Result};

impl Database {
    pub fn get_setting(&self, key: &str) -> Result<Option<String>> {
        self.conn()
            .query_row("SELECT value FROM settings WHERE key = ?1", params![key], |r| r.get(0))
            .optional()
    }

    pub fn set_setting(&self, key: &str, value: &str) -> Result<()> {
        self.conn().execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
            params![key, value],
        )?;
        Ok(())
    }

    /// A setting parsed as `T`, or `default` when unset, unreadable or invalid.
    pub fn setting_or<T: std::str::FromStr>(&self, key: &str, default: T) -> T {
        self.get_setting(key).ok().flatten().and_then(|v| v.parse().ok()).unwrap_or(default)
    }
}
