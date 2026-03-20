export interface SessionRecord {
  id: number;
  date: string;
  start_ts: number;
  end_ts: number;
  duration_seconds: number;
  note: string | null;
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
