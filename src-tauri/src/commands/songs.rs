//! The song catalog and mastery stages.

use tauri::State;
use super::{CommandResult, DbState};
use crate::db::{MasterySuggestion, NewSong, SongDetail, SongRecord};

/// Find or create a catalog song; returns its id. The arguments are the
/// fields of the frontend's `invoke` call.
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn create_song(
    db: State<DbState>,
    title: String,
    artist: Option<String>,
    genre: Option<String>,
    album: Option<String>,
    year: Option<i32>,
    cover_url: Option<String>,
    itunes_track_id: Option<String>,
    difficulty: Option<i32>,
) -> CommandResult<i64> {
    Ok(db.create_song(&NewSong {
        title: &title,
        artist: artist.as_deref(),
        genre: genre.as_deref(),
        album: album.as_deref(),
        year,
        cover_url: cover_url.as_deref(),
        itunes_track_id: itunes_track_id.as_deref(),
        difficulty,
    })?)
}

#[tauri::command]
pub fn update_song_genre(db: State<DbState>, song_id: i64, genre: String) -> CommandResult<()> {
    Ok(db.update_song_genre(song_id, &genre)?)
}

#[tauri::command]
pub fn update_song_difficulty(db: State<DbState>, song_id: i64, difficulty: Option<i32>) -> CommandResult<()> {
    Ok(db.update_song_difficulty(song_id, difficulty)?)
}

#[tauri::command]
pub fn get_songs(db: State<DbState>) -> CommandResult<Vec<SongRecord>> {
    Ok(db.get_songs()?)
}

#[tauri::command]
pub fn get_song_stats(db: State<DbState>) -> CommandResult<Vec<SongRecord>> {
    Ok(db.get_song_stats()?)
}

/// Same as `get_song_stats`; kept for the Library page.
#[tauri::command]
pub fn get_all_songs_with_stats(db: State<DbState>) -> CommandResult<Vec<SongRecord>> {
    Ok(db.get_song_stats()?)
}

#[tauri::command]
pub fn get_recent_songs(db: State<DbState>, limit: i32) -> CommandResult<Vec<SongRecord>> {
    Ok(db.get_recent_songs(limit)?)
}

#[tauri::command]
pub fn get_song_with_sessions(db: State<DbState>, song_id: i64) -> CommandResult<Option<SongDetail>> {
    Ok(db.get_song_with_sessions(song_id)?)
}

#[tauri::command]
pub fn set_song_status(db: State<DbState>, song_id: i64, status: String) -> CommandResult<()> {
    Ok(db.set_song_status(song_id, &status)?)
}

/// The next mastery stage this song is ready for, if any.
#[tauri::command]
pub fn get_mastery_suggestion(db: State<DbState>, song_id: i64) -> CommandResult<Option<MasterySuggestion>> {
    Ok(db.mastery_suggestion(song_id)?)
}

/// Advance a song's mastery status after the user confirms a suggestion.
#[tauri::command]
pub fn confirm_mastery_advance(db: State<DbState>, song_id: i64, new_status: String) -> CommandResult<()> {
    Ok(db.confirm_mastery_advance(song_id, &new_status)?)
}
