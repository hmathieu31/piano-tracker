import { useState, useEffect, useCallback } from 'react';
import { invoke, Channel } from '@tauri-apps/api/core';
import { relaunch } from '@tauri-apps/plugin-process';

export interface UpdateInfo {
  version: string;
  body: string | null;
}

type DownloadEvent =
  | { event: 'Started'; data: { contentLength: number | null } }
  | { event: 'Progress'; data: { chunkLength: number } }
  | { event: 'Finished' };

export const PRERELEASE_SETTING = 'prerelease_updates';

export type UpdaterState =
  | { phase: 'idle' }
  | { phase: 'checking' }
  | { phase: 'up-to-date' }
  | { phase: 'available'; update: UpdateInfo }
  | { phase: 'downloading'; progress: number }
  | { phase: 'error'; message: string };

export function useUpdater() {
  const [state, setState] = useState<UpdaterState>({ phase: 'idle' });

  // silent=true: background auto-check, errors suppressed
  // silent=false: manual check, errors shown in UI
  const checkForUpdates = useCallback(async (silent = false) => {
    setState({ phase: 'checking' });
    try {
      const prerelease = (await invoke<string | null>('get_setting', { key: PRERELEASE_SETTING })) === 'true';
      const update = await invoke<UpdateInfo | null>('check_for_update', { prerelease });
      if (update) {
        setState({ phase: 'available', update });
      } else {
        setState(silent ? { phase: 'idle' } : { phase: 'up-to-date' });
      }
    } catch (e) {
      if (silent) {
        setState({ phase: 'idle' });
        console.debug('Background update check failed:', e);
      } else {
        setState({ phase: 'error', message: String(e) });
      }
    }
  }, []);

  const installUpdate = useCallback(async () => {
    if (state.phase !== 'available') return;
    let downloaded = 0, total = 0;
    setState({ phase: 'downloading', progress: 0 });
    try {
      const onEvent = new Channel<DownloadEvent>();
      onEvent.onmessage = (event) => {
        if (event.event === 'Started') total = event.data.contentLength ?? 0;
        if (event.event === 'Progress') {
          downloaded += event.data.chunkLength;
          setState({ phase: 'downloading', progress: total > 0 ? Math.round((downloaded / total) * 100) : 0 });
        }
      };
      await invoke('install_update', { onEvent });
      await relaunch();
    } catch (e) {
      setState({ phase: 'error', message: String(e) });
    }
  }, [state]);

  const dismiss = useCallback(() => setState({ phase: 'idle' }), []);

  // Background auto-check 8s after app starts
  useEffect(() => {
    const t = setTimeout(() => checkForUpdates(true), 8000);
    return () => clearTimeout(t);
  }, []);

  return { state, checkForUpdates, installUpdate, dismiss };
}
