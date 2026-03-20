import { useState, useEffect, useCallback } from 'react';
import { check, Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

export type UpdaterState =
  | { phase: 'idle' }
  | { phase: 'checking' }
  | { phase: 'up-to-date' }
  | { phase: 'available'; update: Update }
  | { phase: 'downloading'; progress: number }
  | { phase: 'error'; message: string };

export function useUpdater() {
  const [state, setState] = useState<UpdaterState>({ phase: 'idle' });

  // silent=true for the background auto-check (don't surface errors or "up to date")
  // silent=false for manual "Check for updates" button
  const checkForUpdates = useCallback(async (silent = false) => {
    setState({ phase: 'checking' });
    try {
      const update = await check();
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
    const { update } = state;
    let downloaded = 0;
    let total = 0;
    setState({ phase: 'downloading', progress: 0 });
    try {
      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case 'Started':
            total = event.data.contentLength ?? 0;
            break;
          case 'Progress':
            downloaded += event.data.chunkLength;
            setState({ phase: 'downloading', progress: total > 0 ? Math.round((downloaded / total) * 100) : 0 });
            break;
        }
      });
      await relaunch();
    } catch (e) {
      setState({ phase: 'error', message: String(e) });
    }
  }, [state]);

  const dismiss = useCallback(() => setState({ phase: 'idle' }), []);

  // Background auto-check 5s after app starts — silent
  useEffect(() => {
    const t = setTimeout(() => checkForUpdates(true), 5000);
    return () => clearTimeout(t);
  }, []);

  return { state, checkForUpdates, installUpdate, dismiss };
}
