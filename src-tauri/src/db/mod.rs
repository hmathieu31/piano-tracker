//! SQLite persistence.
//!
//! `Database` wraps a single connection. Each submodule adds the queries for
//! one area of the app as its own `impl Database` block:
//!
//! - `catalog`: songs, artists, albums and genres
//! - `sessions`: practice sessions and their tagging
//! - `mastery`: mastery stages and the suggestions to advance them
//! - `midi`: the notes recorded during a session
//! - `stats`: daily totals, streaks, insights and goals
//! - `achievements`: achievement definitions and unlocking
//! - `settings`: the key-value settings store
//! - `dev`: demo data for development
//!
//! The schema and its migrations live in `migrations`.

mod achievements;
mod catalog;
mod dev;
mod mastery;
mod midi;
mod migrations;
mod sessions;
mod settings;
mod stats;

use std::sync::{Mutex, MutexGuard};
use rusqlite::{Connection, Params, Row, Transaction};

pub use achievements::AchievementInfo;
pub use catalog::{NewSong, SongDetail, SongRecord};
pub use mastery::MasterySuggestion;
pub use midi::MidiEventRecord;
pub use sessions::SessionRecord;
pub use stats::{DailyTotal, GoalsConfig, GoalsStatus, InsightsData, StreakInfo};

pub type Result<T> = rusqlite::Result<T>;

pub struct Database {
    conn: Mutex<Connection>,
}

impl Database {
    pub fn new(path: &std::path::Path) -> Result<Self> {
        Ok(Database { conn: Mutex::new(Connection::open(path)?) })
    }

    /// Bring the schema up to date. Must run before any other call.
    pub fn init(&self) -> Result<()> {
        migrations::migrate(&mut self.conn())
    }

    fn conn(&self) -> MutexGuard<'_, Connection> {
        self.conn.lock().unwrap()
    }

    /// Run `f` in a transaction, committed only if it succeeds.
    fn transaction<T>(&self, f: impl FnOnce(&Transaction) -> Result<T>) -> Result<T> {
        let mut conn = self.conn();
        let tx = conn.transaction()?;
        let value = f(&tx)?;
        tx.commit()?;
        Ok(value)
    }
}

/// Run a query and collect every mapped row.
fn query_all<T, P: Params>(
    conn: &Connection,
    sql: &str,
    params: P,
    map: impl FnMut(&Row) -> Result<T>,
) -> Result<Vec<T>> {
    let mut stmt = conn.prepare(sql)?;
    let rows = stmt.query_map(params, map)?;
    rows.collect()
}

#[cfg(test)]
pub(crate) fn test_db() -> Database {
    let db = Database::new(std::path::Path::new(":memory:")).unwrap();
    db.init().unwrap();
    db
}
