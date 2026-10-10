//! Demo data for development.

use chrono::Duration;
use rusqlite::params;
use super::catalog::{find_or_create_song, NewSong};
use super::mastery::change_status;
use super::{Database, Result};
use crate::time::{day_key, now_ms};

impl Database {
    /// Insert realistic demo data. Returns false, changing nothing, if the
    /// database was already seeded.
    pub fn seed_dev_data(&self) -> Result<bool> {
        self.transaction(|tx| {
            let already: bool = tx.query_row(
                "SELECT EXISTS (SELECT 1 FROM settings WHERE key = 'dev_seeded')", [], |r| r.get(0),
            )?;
            if already {
                return Ok(false);
            }
            let now = now_ms();
            let today = chrono::Utc::now().date_naive();

            // ── Songs ──────────────────────────────────────────────────────────────
            // (title, artist, genre, album, year, status)
            let song_data: &[(&str, &str, &str, &str, i32, &str)] = &[
                ("Clair de Lune",           "Claude Debussy",       "Classical",    "Suite bergamasque",                      1905, "mastered"),
                ("Nocturne Op. 9 No. 2",    "Frédéric Chopin",      "Classical",    "Nocturnes Op. 9",                        1832, "practicing"),
                ("River Flows in You",      "Yiruma",               "Contemporary", "First Love",                             2001, "practicing"),
                ("Für Elise",               "Ludwig van Beethoven", "Classical",    "Bagatelles",                             1810, "mastered"),
                ("Comptine d'un autre été", "Yann Tiersen",         "Soundtrack",   "Le Fabuleux Destin d'Amélie Poulain",    2001, "learning"),
                ("Gymnopédie No. 1",        "Erik Satie",           "Classical",    "Trois Gymnopédies",                      1888, "learning"),
                ("The Entertainer",         "Scott Joplin",         "Ragtime",      "Piano Rags",                             1902, "mastered"),
            ];

            let mut song_ids: Vec<i64> = Vec::new();
            for (title, artist, genre, album, year, status) in song_data {
                let id = find_or_create_song(tx, &NewSong {
                    title, artist: Some(artist), genre: Some(genre), album: Some(album), year: Some(*year),
                    cover_url: None, itunes_track_id: None, difficulty: None,
                }, now, None)?;
                change_status(tx, id, status, None)?;
                song_ids.push(id);
            }

            // ── Sessions ───────────────────────────────────────────────────────────
            // (days_ago, hour, duration_min, song_idx, feeling: 1-5 or None=unrated)
            let sessions: &[(i64, u32, i64, usize, Option<i64>)] = &[
                (88, 9,  20, 3, None),
                (85, 10, 25, 3, Some(2)),
                (82, 9,  30, 3, Some(3)),
                (79, 11, 35, 3, Some(3)),
                (76, 9,  40, 3, Some(4)),
                (74, 10, 45, 0, None),
                (72, 9,  30, 3, Some(4)),
                (70, 21, 50, 0, Some(2)),
                (67, 9,  35, 3, Some(4)),
                (65, 10, 45, 0, Some(3)),
                (63, 9,  60, 6, None),
                (61, 10, 40, 0, Some(3)),
                (59, 9,  55, 6, Some(4)),
                (57, 11, 50, 0, Some(3)),
                (55, 9,  45, 3, Some(5)),
                (53, 10, 60, 6, Some(4)),
                (51, 9,  70, 0, Some(4)),
                (49, 10, 45, 6, Some(5)),
                (47, 9,  55, 0, Some(4)),
                (45, 14, 30, 1, None),
                (43, 9,  65, 0, Some(4)),
                (41, 10, 35, 1, Some(2)),
                (39, 9,  60, 0, Some(5)),
                (37, 10, 40, 1, Some(3)),
                (35, 9,  50, 2, None),
                (33, 11, 45, 1, Some(3)),
                (31, 9,  55, 2, Some(3)),
                (29, 10, 60, 1, Some(4)),
                (27, 9,  50, 2, Some(4)),
                (25, 10, 65, 0, Some(5)),
                (23, 9,  45, 1, Some(4)),
                (21, 10, 55, 2, Some(4)),
                (19, 9,  60, 4, None),
                (17, 10, 70, 1, Some(4)),
                (15, 9,  50, 2, Some(4)),
                (14, 10, 45, 4, Some(2)),
                (13, 9,  60, 5, None),
                (12, 10, 55, 1, Some(4)),
                (11, 9,  65, 2, Some(5)),
                (10, 10, 50, 4, Some(3)),
                (9,  9,  45, 5, Some(3)),
                (8,  10, 70, 1, Some(4)),
                (7,  9,  60, 5, Some(3)),
                (6,  10, 75, 2, Some(5)),
                (5,  9,  55, 4, Some(3)),
                (4,  10, 65, 5, Some(4)),
                (3,  9,  80, 1, Some(5)),
                (2,  10, 60, 2, Some(5)),
                (1,  9,  70, 4, Some(3)),
                (0,  10, 45, 5, Some(4)),
            ];

            for (days_ago, hour, duration_min, song_idx, feeling) in sessions {
                let session_date = today - Duration::days(*days_ago);
                let naive_dt = session_date.and_hms_opt(*hour, 30, 0).unwrap();
                let start_ts = naive_dt.and_utc().timestamp_millis();
                let end_ts = start_ts + duration_min * 60 * 1000;

                tx.execute(
                    "INSERT INTO sessions (practice_date, started_at, ended_at, song_id, feeling)
                     VALUES (?1, ?2, ?3, ?4, ?5)",
                    params![day_key(session_date), start_ts, end_ts, song_ids[*song_idx], feeling],
                )?;
            }

            tx.execute("INSERT INTO settings (key, value) VALUES ('dev_seeded', 'true')", [])?;
            Ok(true)
        })
    }

    /// Wipe all sessions, the song catalog and the seed flag; other settings stay.
    pub fn clear_dev_data(&self) -> Result<()> {
        self.transaction(|tx| tx.execute_batch("
            DELETE FROM midi_events;
            DELETE FROM sessions;
            DELETE FROM song_status_changes;
            DELETE FROM song_genres;
            DELETE FROM song_credits;
            DELETE FROM song_external_ids;
            DELETE FROM songs;
            DELETE FROM albums;
            DELETE FROM artists;
            DELETE FROM genres;
            DELETE FROM settings WHERE key = 'dev_seeded';
        "))
    }
}

#[cfg(test)]
mod tests {
    use crate::db::test_db;

    #[test]
    fn seed_and_clear_dev_data() {
        let db = test_db();
        assert!(db.seed_dev_data().unwrap());
        assert!(!db.seed_dev_data().unwrap());
        let songs = db.get_song_stats().unwrap();
        assert_eq!(songs.len(), 7);
        assert!(songs.iter().all(|s| s.session_count > 0));
        assert_eq!(db.get_sessions(100).unwrap().len(), 50);
        db.clear_dev_data().unwrap();
        assert!(db.get_songs().unwrap().is_empty());
        assert!(db.get_sessions(10).unwrap().is_empty());
    }
}
