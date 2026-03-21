import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { SongRecord, MidiEventRecord } from '../types';

export function useSongs() {
  const [data, setData] = useState<SongRecord[]>([]);

  const refresh = useCallback(async () => {
    try {
      const songs = await invoke<SongRecord[]>('get_song_stats');
      setData(songs);
    } catch {}
  }, []);

  useEffect(() => {
    refresh();
    let unlisten: (() => void) | undefined;
    listen('session-ended', refresh).then(fn => { unlisten = fn; });
    return () => { unlisten?.(); };
  }, [refresh]);

  return { data, refresh };
}

export function useRecentSongs(limit = 5) {
  const [data, setData] = useState<SongRecord[]>([]);

  const refresh = useCallback(async () => {
    try {
      const songs = await invoke<SongRecord[]>('get_recent_songs', { limit });
      setData(songs);
    } catch {}
  }, [limit]);

  useEffect(() => {
    refresh();
    let unlisten: (() => void) | undefined;
    listen('session-ended', refresh).then(fn => { unlisten = fn; });
    return () => { unlisten?.(); };
  }, [refresh]);

  return { data, refresh };
}

export function useMidiEvents(sessionId: number | null) {
  const [data, setData] = useState<MidiEventRecord[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (sessionId == null) { setData([]); return; }
    setLoading(true);
    invoke<MidiEventRecord[]>('get_midi_events', { sessionId })
      .then(setData)
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, [sessionId]);

  return { data, loading };
}
