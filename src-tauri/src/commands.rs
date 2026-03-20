use tauri::State;
use std::sync::Arc;
use crate::db::{Database, SessionRecord, DailyTotal, GoalsConfig, StreakInfo, InsightsData, GoalsStatus, AchievementInfo};
use crate::session::{SharedSession, SessionStatus, get_status};

pub type DbState = Arc<Database>;

#[tauri::command]
pub fn get_session_status(session: State<SharedSession>) -> SessionStatus {
    get_status(&session)
}

#[tauri::command]
pub fn get_sessions(db: State<DbState>, limit: i32) -> Result<Vec<SessionRecord>, String> {
    db.get_sessions(limit).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_daily_totals(db: State<DbState>, days: i32) -> Result<Vec<DailyTotal>, String> {
    db.get_daily_totals(days).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_goals(db: State<DbState>) -> Result<GoalsConfig, String> {
    db.get_goals().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_goal(db: State<DbState>, goal_type: String, minutes: i32) -> Result<(), String> {
    db.set_goal(&goal_type, minutes).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_streak(db: State<DbState>) -> Result<StreakInfo, String> {
    db.get_streak().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_insights(db: State<DbState>) -> Result<InsightsData, String> {
    db.get_insights().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_goals_status(db: State<DbState>) -> Result<GoalsStatus, String> {
    db.get_goals_status().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_achievements(db: State<DbState>) -> Result<Vec<AchievementInfo>, String> {
    db.get_all_achievements().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_session_note(db: State<DbState>, id: i64, note: String) -> Result<(), String> {
    db.update_session_note(id, &note).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_setting(db: State<DbState>, key: String) -> Result<Option<String>, String> {
    db.get_setting(&key).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_setting(db: State<DbState>, key: String, value: String) -> Result<(), String> {
    db.set_setting(&key, &value).map_err(|e| e.to_string())
}
