export interface SongRecord {
  id: number;
  title: string;
  artist: string | null;
  genre: string | null;
  album: string | null;
  year: number | null;
  cover_url: string | null;
  spotify_url: string | null;
  musicbrainz_recording_id: string | null;
  musicbrainz_release_id: string | null;
  created_at: number;
  // populated by get_song_stats
  total_seconds?: number;
  session_count?: number;
  last_played_date?: string | null;
  // learning journey
  avg_feeling?: number | null;
  status?: string | null;
}

export interface SongDetail {
  song: SongRecord;
  sessions: SessionRecord[];
}

export interface MidiEventRecord {
  id: number;
  session_id: number;
  relative_ms: number;
  note: number;
  velocity: number;
  channel: number;
}

export interface SessionRecord {
  id: number;
  date: string;
  start_ts: number;
  end_ts: number;
  duration_seconds: number;
  note: string | null;
  song_id: number | null;
  song_name: string | null;
  feeling: number | null;
  song: SongRecord | null;
}

export interface DailyTotal {
  date: string;
  total_seconds: number;
  session_count: number;
}

export interface GoalsConfig {
  daily_minutes: number;
}

export interface StreakInfo {
  current_streak: number;
  best_streak: number;
  last_played_date: string | null;
}

export interface InsightsData {
  total_seconds_alltime: number;
  total_sessions: number;
  avg_session_seconds: number;
  longest_session_seconds: number;
  best_day_seconds: number;
  best_day_date: string | null;
  morning_seconds: number;
  afternoon_seconds: number;
  evening_seconds: number;
}

export interface DayGoalStatus {
  date: string;
  minutes: number;
  goal_met: boolean;
}

export interface GoalsStatus {
  config: GoalsConfig;
  today_seconds: number;
  past_week_days: DayGoalStatus[];
}

export interface AchievementInfo {
  key: string;
  title: string;
  description: string;
  icon: string;
  unlocked_at: number | null;
}

export interface SessionStatus {
  is_playing: boolean;
  session_start_ts: number | null;
  elapsed_seconds: number;
  midi_port_name: string | null;
  midi_connected: boolean;
}
