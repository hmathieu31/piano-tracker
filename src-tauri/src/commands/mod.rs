//! Tauri commands, the API the React app calls with `invoke`. Each command
//! is a thin wrapper over `Database`; errors reach the frontend as strings.

pub mod dev;
pub mod midi;
pub mod practice;
pub mod songs;
pub mod stats;

use std::sync::Arc;
use serde::{Serialize, Serializer};
use crate::db::Database;

pub type DbState = Arc<Database>;

/// An error returned to the frontend, serialized as its message.
#[derive(Debug)]
pub struct CommandError(String);

impl From<rusqlite::Error> for CommandError {
    fn from(e: rusqlite::Error) -> Self { CommandError(e.to_string()) }
}

impl From<std::io::Error> for CommandError {
    fn from(e: std::io::Error) -> Self { CommandError(e.to_string()) }
}

impl From<tauri::Error> for CommandError {
    fn from(e: tauri::Error) -> Self { CommandError(e.to_string()) }
}

impl Serialize for CommandError {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.0)
    }
}

pub type CommandResult<T> = Result<T, CommandError>;
