//! Clock helpers shared by the recorder, the database and the scheduler.

use chrono::{DateTime, Local, NaiveDate};

/// Current wall-clock time in UTC milliseconds.
pub fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

/// Today's date in the local time zone.
pub fn today() -> NaiveDate {
    Local::now().date_naive()
}

/// A day as stored in `sessions.practice_date` (YYYY-MM-DD).
pub fn day_key(date: NaiveDate) -> String {
    date.format("%Y-%m-%d").to_string()
}

/// The local practice day a UTC millisecond timestamp falls on.
pub fn local_day(ts_ms: i64) -> String {
    let date = DateTime::from_timestamp_millis(ts_ms)
        .map(|t| t.with_timezone(&Local).date_naive())
        .unwrap_or_else(today);
    day_key(date)
}

/// "1m 30s", "2m", "45s".
pub fn format_duration(seconds: i64) -> String {
    let (mins, secs) = (seconds / 60, seconds % 60);
    match (mins, secs) {
        (0, s) => format!("{s}s"),
        (m, 0) => format!("{m}m"),
        (m, s) => format!("{m}m {s}s"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn formats_durations() {
        assert_eq!(format_duration(45), "45s");
        assert_eq!(format_duration(120), "2m");
        assert_eq!(format_duration(90), "1m 30s");
    }
}
