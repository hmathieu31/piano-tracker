import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { SessionRecord, DailyTotal, StreakInfo, InsightsData, GoalsStatus, AchievementInfo, SessionStatus, SongRecord, SongDetail } from '../types';

export function useSessionStatus() {
  const [status, setStatus] = useState<SessionStatus>({
    is_playing: false,
    session_start_ts: null,
    elapsed_seconds: 0,
    midi_port_name: null,
    midi_connected: false,
  });

  const refresh = useCallback(async () => {
    try {
      const s = await invoke<SessionStatus>('get_session_status');
      setStatus(s);
    } catch {}
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 1000);
    
    let unlistenStart: (() => void) | undefined;
    let unlistenEnd: (() => void) | undefined;
    
    listen('session-started', () => refresh()).then(fn => { unlistenStart = fn; });
    listen('session-ended', () => refresh()).then(fn => { unlistenEnd = fn; });
    
    return () => {
      clearInterval(interval);
      unlistenStart?.();
      unlistenEnd?.();
    };
  }, [refresh]);

  return status;
}

export function useDailyTotals(days: number = 30) {
  const [data, setData] = useState<DailyTotal[]>([]);
  
  const refresh = useCallback(async () => {
    try {
      const result = await invoke<DailyTotal[]>('get_daily_totals', { days });
      setData(result);
    } catch {}
  }, [days]);

  useEffect(() => {
    refresh();
    let unlisten: (() => void) | undefined;
    listen('session-ended', () => refresh()).then(fn => { unlisten = fn; });
    return () => { unlisten?.(); };
  }, [refresh]);

  return { data, refresh };
}

export function useStreak() {
  const [streak, setStreak] = useState<StreakInfo>({ current_streak: 0, best_streak: 0, last_played_date: null });
  
  const refresh = useCallback(async () => {
    try {
      const s = await invoke<StreakInfo>('get_streak');
      setStreak(s);
    } catch {}
  }, []);

  useEffect(() => {
    refresh();
    let unlisten: (() => void) | undefined;
    listen('session-ended', () => refresh()).then(fn => { unlisten = fn; });
    return () => { unlisten?.(); };
  }, [refresh]);

  return streak;
}

export function useGoalsStatus() {
  const [data, setData] = useState<GoalsStatus | null>(null);
  
  const refresh = useCallback(async () => {
    try {
      const s = await invoke<GoalsStatus>('get_goals_status');
      setData(s);
    } catch {}
  }, []);

  useEffect(() => {
    refresh();
    let unlisten: (() => void) | undefined;
    listen('session-ended', () => refresh()).then(fn => { unlisten = fn; });
    return () => { unlisten?.(); };
  }, [refresh]);

  return { data, refresh };
}

export function useInsights() {
  const [data, setData] = useState<InsightsData | null>(null);
  
  useEffect(() => {
    invoke<InsightsData>('get_insights').then(setData).catch(() => {});
    let unlisten: (() => void) | undefined;
    listen('session-ended', () => {
      invoke<InsightsData>('get_insights').then(setData).catch(() => {});
    }).then(fn => { unlisten = fn; });
    return () => { unlisten?.(); };
  }, []);

  return data;
}

export function useAchievements() {
  const [data, setData] = useState<AchievementInfo[]>([]);
  
  const refresh = useCallback(async () => {
    try {
      const a = await invoke<AchievementInfo[]>('get_achievements');
      setData(a);
    } catch {}
  }, []);

  useEffect(() => {
    refresh();
    let unlisten: (() => void) | undefined;
    listen('achievement-unlocked', () => refresh()).then(fn => { unlisten = fn; });
    return () => { unlisten?.(); };
  }, [refresh]);

  return { data, refresh };
}

export function useSessions(limit: number = 100) {
  const [data, setData] = useState<SessionRecord[]>([]);
  
  const refresh = useCallback(async () => {
    try {
      const s = await invoke<SessionRecord[]>('get_sessions', { limit });
      setData(s);
    } catch {}
  }, [limit]);

  useEffect(() => {
    refresh();
    let unlisten: (() => void) | undefined;
    listen('session-ended', () => refresh()).then(fn => { unlisten = fn; });
    return () => { unlisten?.(); };
  }, [refresh]);

  return { data, refresh };
}

export function useSongsWithStats() {
  const [data, setData] = useState<SongRecord[]>([]);

  const refresh = useCallback(async () => {
    try {
      const s = await invoke<SongRecord[]>('get_all_songs_with_stats');
      setData(s);
    } catch {}
  }, []);

  useEffect(() => {
    refresh();
    let unlisten: (() => void) | undefined;
    listen('session-ended', () => refresh()).then(fn => { unlisten = fn; });
    return () => { unlisten?.(); };
  }, [refresh]);

  return { data, refresh };
}

export function useSongDetail(songId: number | null) {
  const [data, setData] = useState<SongDetail | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (songId == null) { setData(null); return; }
    setLoading(true);
    try {
      const d = await invoke<SongDetail | null>('get_song_with_sessions', { songId });
      setData(d);
    } catch {}
    finally { setLoading(false); }
  }, [songId]);

  useEffect(() => { refresh(); }, [refresh]);

  return { data, loading, refresh };
}
