//! The Up next song: picked before playing, it tags the sessions that follow.

use super::{Database, Result, SongRecord};

const UP_NEXT_KEY: &str = "up_next_song_id";

impl Database {
    /// The song the next session will be tagged with, if one is picked and
    /// still in the catalog.
    pub fn get_up_next(&self) -> Result<Option<SongRecord>> {
        let Some(id) = self.get_setting(UP_NEXT_KEY)?.and_then(|v| v.parse::<i64>().ok()) else {
            return Ok(None);
        };
        self.get_song(id)
    }

    /// Pick the Up next song, or clear it with `None`.
    pub fn set_up_next(&self, song_id: Option<i64>) -> Result<()> {
        match song_id {
            Some(id) => self.set_setting(UP_NEXT_KEY, &id.to_string()),
            None => {
                self.conn().execute("DELETE FROM settings WHERE key = ?1", [UP_NEXT_KEY])?;
                Ok(())
            }
        }
    }

    /// Tag a freshly saved session with the Up next song. The song stays
    /// Up next, so a run of sessions on one piece needs no tagging at all.
    /// Returns the song the session was tagged with.
    pub fn apply_up_next(&self, session_id: i64) -> Result<Option<SongRecord>> {
        let Some(song) = self.get_up_next()? else { return Ok(None) };
        self.link_session_song(session_id, song.id)?;
        Ok(Some(song))
    }
}

#[cfg(test)]
mod tests {
    use crate::db::{test_db, NewSong};

    #[test]
    fn up_next_tags_new_sessions_until_cleared() {
        let db = test_db();
        let song_id = db.create_song(&NewSong {
            title: "Gymnopédie No. 1", artist: Some("Erik Satie"), genre: None, album: None,
            year: None, cover_url: None, itunes_track_id: None, difficulty: None,
        }).unwrap();

        let untagged = db.insert_session("2026-10-10", 0, 60_000).unwrap();
        assert!(db.apply_up_next(untagged).unwrap().is_none());
        assert_eq!(db.get_session(untagged).unwrap().unwrap().song_id, None);

        db.set_up_next(Some(song_id)).unwrap();
        for start in [100_000, 200_000] {
            let s = db.insert_session("2026-10-10", start, start + 60_000).unwrap();
            assert_eq!(db.apply_up_next(s).unwrap().map(|s| s.id), Some(song_id));
            assert_eq!(db.get_session(s).unwrap().unwrap().song_id, Some(song_id));
        }

        db.set_up_next(None).unwrap();
        assert!(db.get_up_next().unwrap().is_none());

        // A stale id left in settings is ignored.
        db.set_setting("up_next_song_id", "999").unwrap();
        assert!(db.get_up_next().unwrap().is_none());
    }
}
