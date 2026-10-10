//! Desktop notifications: practice reminders, streak alerts and the weekly summary.

use std::sync::Arc;
use std::thread;
use std::time::Duration;
use chrono::{Datelike, Local, Timelike, Weekday};
use tauri::AppHandle;
use tauri_plugin_notification::NotificationExt;
use crate::db::Database;
use crate::time::day_key;

/// Show a desktop notification; failures are ignored.
pub fn notify(app: &AppHandle, title: &str, body: &str) {
    let _ = app.notification().builder().title(title).body(body).show();
}

pub fn start_notification_scheduler(app: AppHandle, db: Arc<Database>) {
    thread::spawn(move || {
        let mut last_reminder_date: Option<String> = None;
        let mut last_weekly_summary_week: Option<u32> = None;

        loop {
            thread::sleep(Duration::from_secs(60));

            let now = Local::now();
            let today = day_key(now.date_naive());
            let on_the_hour = |hour: u32| now.hour() == hour && now.minute() == 0;

            let reminder_hour: u32 = db.setting_or("reminder_hour", 20);
            if db.setting_or("reminder_enabled", true)
                && on_the_hour(reminder_hour)
                && last_reminder_date.as_deref() != Some(&today)
            {
                if let Ok(status) = db.get_goals_status() {
                    let goal_seconds = status.config.daily_minutes as i64 * 60;
                    if status.today_seconds < goal_seconds {
                        let remaining = (goal_seconds - status.today_seconds) / 60;
                        notify(&app, "🎹 Time to Practice!",
                            &format!("You still need {remaining} more minutes to reach your daily goal."));
                        last_reminder_date = Some(today.clone());
                    }
                }
            }

            if on_the_hour(21) && db.setting_or("streak_alert", true) {
                if let Ok(streak) = db.get_streak() {
                    if streak.current_streak > 0 && streak.last_played_date.as_deref() != Some(&today) {
                        notify(&app, "🔥 Streak At Risk!", &format!(
                            "Your {}-day streak is at risk! Play anything before midnight.",
                            streak.current_streak
                        ));
                    }
                }
            }

            let week = now.iso_week().week();
            if now.weekday() == Weekday::Sun
                && on_the_hour(20)
                && last_weekly_summary_week != Some(week)
                && db.setting_or("weekly_summary", true)
            {
                if let Ok(insights) = db.get_insights() {
                    notify(&app, "📊 Weekly Piano Summary", &format!(
                        "This week you practiced {} total hours all-time. Keep it up!",
                        insights.total_seconds_alltime / 3600
                    ));
                    last_weekly_summary_week = Some(week);
                }
            }
        }
    });
}
