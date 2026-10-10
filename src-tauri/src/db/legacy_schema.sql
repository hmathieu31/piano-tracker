-- The tables as the last pre-v2 build created them (schema version 0).

CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    start_ts INTEGER NOT NULL,
    end_ts INTEGER NOT NULL,
    duration_seconds INTEGER NOT NULL,
    note TEXT
);
CREATE TABLE IF NOT EXISTS goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    goal_type TEXT NOT NULL UNIQUE,
    target_minutes INTEGER NOT NULL DEFAULT 30
);
CREATE TABLE IF NOT EXISTS achievements (key TEXT PRIMARY KEY, unlocked_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS songs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    artist TEXT,
    genre TEXT,
    album TEXT,
    year INTEGER,
    cover_url TEXT,
    spotify_url TEXT,
    musicbrainz_recording_id TEXT,
    musicbrainz_release_id TEXT,
    created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS midi_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    relative_ms INTEGER NOT NULL,
    note INTEGER NOT NULL,
    velocity INTEGER NOT NULL,
    channel INTEGER NOT NULL DEFAULT 0
);
