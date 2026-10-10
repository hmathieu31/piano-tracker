-- Schema version 1: see migrations.rs. Never edit a released version;
-- add a new migration instead.

-- ── Catalog ─────────────────────────────────────────────────────────────
CREATE TABLE artists (
    id          INTEGER PRIMARY KEY,
    name        TEXT    NOT NULL,
    name_key    TEXT    NOT NULL UNIQUE,
    created_at  INTEGER NOT NULL
);
CREATE TABLE genres (
    id        INTEGER PRIMARY KEY,
    name      TEXT NOT NULL,
    name_key  TEXT NOT NULL UNIQUE
);
CREATE TABLE albums (
    id         INTEGER PRIMARY KEY,
    title      TEXT    NOT NULL,
    title_key  TEXT    NOT NULL,
    artist_id  INTEGER REFERENCES artists(id) ON DELETE SET NULL,
    year       INTEGER,
    cover_url  TEXT
);
CREATE UNIQUE INDEX ux_albums_identity ON albums(title_key, COALESCE(artist_id, 0));
CREATE TABLE songs (
    id          INTEGER PRIMARY KEY,
    title       TEXT    NOT NULL,
    title_key   TEXT    NOT NULL,
    artist_id   INTEGER REFERENCES artists(id) ON DELETE RESTRICT,
    album_id    INTEGER REFERENCES albums(id)  ON DELETE SET NULL,
    year        INTEGER,
    cover_url   TEXT,
    difficulty  INTEGER CHECK (difficulty BETWEEN 1 AND 5),
    status      TEXT    NOT NULL DEFAULT 'learning'
                CHECK (status IN ('wishlist', 'learning', 'practicing', 'mastered')),
    notes       TEXT,
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL
);
CREATE UNIQUE INDEX ux_songs_identity ON songs(title_key, COALESCE(artist_id, 0));
CREATE INDEX ix_songs_artist ON songs(artist_id);
CREATE INDEX ix_songs_album  ON songs(album_id);
CREATE TABLE song_credits (
    song_id    INTEGER NOT NULL REFERENCES songs(id)   ON DELETE CASCADE,
    artist_id  INTEGER NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
    role       TEXT    NOT NULL CHECK (role IN ('composer', 'performer', 'arranger')),
    PRIMARY KEY (song_id, artist_id, role)
) WITHOUT ROWID;
CREATE INDEX ix_song_credits_artist ON song_credits(artist_id);
CREATE TABLE song_genres (
    song_id   INTEGER NOT NULL REFERENCES songs(id)  ON DELETE CASCADE,
    genre_id  INTEGER NOT NULL REFERENCES genres(id) ON DELETE CASCADE,
    PRIMARY KEY (song_id, genre_id)
) WITHOUT ROWID;
CREATE INDEX ix_song_genres_genre ON song_genres(genre_id);
CREATE TABLE song_external_ids (
    song_id      INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
    provider     TEXT    NOT NULL CHECK (provider IN ('itunes', 'musicbrainz', 'spotify')),
    external_id  TEXT    NOT NULL,
    PRIMARY KEY (provider, external_id)
) WITHOUT ROWID;
CREATE INDEX ix_song_external_ids_song ON song_external_ids(song_id);

-- ── Practice ────────────────────────────────────────────────────────────
CREATE TABLE sessions (
    id                INTEGER PRIMARY KEY,
    started_at        INTEGER NOT NULL,
    ended_at          INTEGER NOT NULL,
    practice_date     TEXT    NOT NULL,
    duration_seconds  INTEGER GENERATED ALWAYS AS ((ended_at - started_at) / 1000) STORED,
    song_id           INTEGER REFERENCES songs(id) ON DELETE RESTRICT,
    practice_type     TEXT CHECK (practice_type IN ('first', 'section', 'full', 'performance')),
    feeling           INTEGER CHECK (feeling BETWEEN 1 AND 5),
    note              TEXT,
    CHECK (ended_at >= started_at)
);
CREATE INDEX ix_sessions_date    ON sessions(practice_date);
CREATE INDEX ix_sessions_started ON sessions(started_at);
CREATE INDEX ix_sessions_song    ON sessions(song_id);
CREATE TABLE midi_events (
    session_id   INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    seq          INTEGER NOT NULL,
    relative_ms  INTEGER NOT NULL,
    note         INTEGER NOT NULL CHECK (note BETWEEN 0 AND 127),
    velocity     INTEGER NOT NULL CHECK (velocity BETWEEN 0 AND 127),
    channel      INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (session_id, seq)
) WITHOUT ROWID;
CREATE TABLE song_status_changes (
    id           INTEGER PRIMARY KEY,
    song_id      INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
    from_status  TEXT,
    to_status    TEXT    NOT NULL,
    changed_at   INTEGER NOT NULL,
    session_id   INTEGER REFERENCES sessions(id) ON DELETE SET NULL
);
CREATE INDEX ix_status_changes_song    ON song_status_changes(song_id, changed_at);
CREATE INDEX ix_status_changes_session ON song_status_changes(session_id);

-- ── Gamification and settings ───────────────────────────────────────────
CREATE TABLE achievements (
    key          TEXT PRIMARY KEY,
    unlocked_at  INTEGER NOT NULL,
    session_id   INTEGER REFERENCES sessions(id) ON DELETE SET NULL
);
CREATE INDEX ix_achievements_session ON achievements(session_id);
CREATE TABLE goals (
    goal_type       TEXT PRIMARY KEY CHECK (goal_type IN ('daily')),
    target_minutes  INTEGER NOT NULL CHECK (target_minutes > 0)
);
CREATE TABLE settings (
    key    TEXT PRIMARY KEY,
    value  TEXT NOT NULL
);
INSERT INTO goals (goal_type, target_minutes) VALUES ('daily', 30);
