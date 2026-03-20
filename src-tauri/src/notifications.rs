use std::sync::Arc;
use std::thread;
use std::time::Duration;
use chrono::{Local, Timelike, Weekday, Datelike};
use tauri::AppHandle;
use tauri_plugin_notification::NotificationExt;
use crate::db::Database;

pub fn start_notification_scheduler(app_handle: AppHandle, db: Arc<Database>) {
    thread::spawn(move || {
        let mut last_reminder_date: Option<String> = None;
        let mut last_weekly_summary_week: Option<u32> = None;

        loop {
            thread::sleep(Duration::from_secs(60));

            let now = Local::now();
            let today = now.format("%Y-%m-%d").to_string();

            let reminder_hour: u32 = db.get_setting("reminder_hour")
                .ok().flatten()
                .and_then(|v| v.parse().ok())
                .unwrap_or(20);

            let reminder_enabled: bool = db.get_setting("reminder_enabled")
                .ok().flatten()
                .map(|v| v == "true")
                .unwrap_or(true);

            if reminder_enabled
                && now.hour() == reminder_hour
                && now.minute() == 0
                && last_reminder_date.as_deref() != Some(&today)
            {
                if let Ok(status) = db.get_goals_status() {
                    let daily_seconds_needed = status.config.daily_minutes as i64 * 60;
                    if status.today_seconds < daily_seconds_needed {
                        let remaining = (daily_seconds_needed - status.today_seconds) / 60;
                        let _ = app_handle.notification()
                            .builder()
                            .title("🎹 Time to Practice!")
                            .body(&format!("You still need {} more minutes to reach your daily goal.", remaining))
                            .show();
                        last_reminder_date = Some(today.clone());
                    }
                }
            }

            if now.hour() == 21 && now.minute() == 0 {
                let streak_alert: bool = db.get_setting("streak_alert")
                    .ok().flatten()
                    .map(|v| v != "false")
                    .unwrap_or(true);
                if streak_alert {
                    if let Ok(streak) = db.get_streak() {
                        if streak.current_streak > 0
                            && streak.last_played_date.as_deref() != Some(&today)
                        {
                            let _ = app_handle.notification()
                                .builder()
                                .title("🔥 Streak At Risk!")
                                .body(&format!("Your {}-day streak is at risk! Play anything before midnight.", streak.current_streak))
                                .show();
                        }
                    }
                }
            }

            let week_number = now.iso_week().week();
            if now.weekday() == Weekday::Sun
                && now.hour() == 20
                && now.minute() == 0
                && last_weekly_summary_week != Some(week_number)
            {
                let weekly_summary: bool = db.get_setting("weekly_summary")
                    .ok().flatten()
                    .map(|v| v != "false")
                    .unwrap_or(true);
                if weekly_summary {
                    if let Ok(insights) = db.get_insights() {
                        let _ = app_handle.notification()
                            .builder()
                            .title("📊 Weekly Piano Summary")
                            .body(&format!(
                                "This week you practiced {} total hours all-time. Keep it up!",
                                insights.total_seconds_alltime / 3600
                            ))
                            .show();
                        last_weekly_summary_week = Some(week_number);
                    }
                }
            }
        }
    });
}
