-- Copy the practice data out of the pre-v2 tables (renamed legacy_*), then
-- drop them. Runs after the songs are copied and temp.song_id_map maps each
-- old song id to its (possibly merged) new id.

INSERT INTO sessions (id, started_at, ended_at, practice_date, song_id, practice_type, feeling, note)
SELECT s.id, s.start_ts, MAX(s.end_ts, s.start_ts), s.date, m.new_id,
       CASE WHEN s.practice_type IN ('first', 'section', 'full', 'performance') THEN s.practice_type END,
       CASE WHEN s.feeling BETWEEN 1 AND 5 THEN s.feeling END,
       s.note
FROM legacy_sessions s
LEFT JOIN temp.song_id_map m ON m.old_id = s.song_id;

INSERT INTO midi_events (session_id, seq, relative_ms, note, velocity, channel)
SELECT session_id, ROW_NUMBER() OVER (PARTITION BY session_id ORDER BY id) - 1,
       relative_ms, note, velocity, channel
FROM legacy_midi_events
WHERE session_id IN (SELECT id FROM sessions)
  AND note BETWEEN 0 AND 127 AND velocity BETWEEN 0 AND 127;

-- One history entry per song, at its final (merged) status.
DELETE FROM song_status_changes;
INSERT INTO song_status_changes (song_id, from_status, to_status, changed_at)
SELECT id, NULL, status, created_at FROM songs;

-- Unlock times were stored in seconds.
INSERT INTO achievements (key, unlocked_at)
SELECT key, CASE WHEN unlocked_at < 100000000000 THEN unlocked_at * 1000 ELSE unlocked_at END
FROM legacy_achievements;

INSERT OR REPLACE INTO goals (goal_type, target_minutes)
SELECT goal_type, target_minutes FROM legacy_goals
WHERE goal_type = 'daily' AND target_minutes > 0;

INSERT INTO settings (key, value)
SELECT key, value FROM legacy_settings WHERE value IS NOT NULL;

DROP TABLE temp.song_id_map;
DROP TABLE legacy_midi_events;
DROP TABLE legacy_sessions;
DROP TABLE legacy_songs;
DROP TABLE legacy_goals;
DROP TABLE legacy_achievements;
DROP TABLE legacy_settings;
