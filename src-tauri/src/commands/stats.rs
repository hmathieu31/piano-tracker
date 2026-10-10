//! Statistics, goals, achievements and settings.

use tauri::State;
use super::{CommandResult, DbState};
use crate::db::{AchievementInfo, DailyTotal, GoalsConfig, GoalsStatus, InsightsData, StreakInfo};

#[tauri::command]
pub fn get_daily_totals(db: State<DbState>, days: i32) -> CommandResult<Vec<DailyTotal>> {
    Ok(db.get_daily_totals(days)?)
}

#[tauri::command]
pub fn get_streak(db: State<DbState>) -> CommandResult<StreakInfo> {
    Ok(db.get_streak()?)
}

#[tauri::command]
pub fn get_insights(db: State<DbState>) -> CommandResult<InsightsData> {
    Ok(db.get_insights()?)
}

#[tauri::command]
pub fn get_goals(db: State<DbState>) -> CommandResult<GoalsConfig> {
    Ok(db.get_goals()?)
}

#[tauri::command]
pub fn set_goal(db: State<DbState>, goal_type: String, minutes: i32) -> CommandResult<()> {
    Ok(db.set_goal(&goal_type, minutes)?)
}

#[tauri::command]
pub fn get_goals_status(db: State<DbState>) -> CommandResult<GoalsStatus> {
    Ok(db.get_goals_status()?)
}

#[tauri::command]
pub fn get_achievements(db: State<DbState>) -> CommandResult<Vec<AchievementInfo>> {
    Ok(db.get_all_achievements()?)
}

#[tauri::command]
pub fn get_setting(db: State<DbState>, key: String) -> CommandResult<Option<String>> {
    Ok(db.get_setting(&key)?)
}

#[tauri::command]
pub fn set_setting(db: State<DbState>, key: String, value: String) -> CommandResult<()> {
    Ok(db.set_setting(&key, &value)?)
}
