import { useState, useEffect, useCallback } from 'react';
import { check, Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

export type UpdaterState =
  | { phase: 'idle' }
  | { phase: 'checking' }
  | { phase: 'available'; update: Update }
  | { phase: 'downloading'; progress: number }
  | { phase: 'error'; message: string };

export function useUpdater() {
  const [state, setState] = useState<UpdaterState>({ phase: 'idle' });

  const checkForUpdates = useCallback(async () => {
    setState({ phase: 'checking' });
    try {
      const update = await check();
      setState(update ? { phase: 'available', update } : { phase: 'idle' });
    } catch (e) {
      // In dev mode the endpoint won't exist — fail silently
      setState({ phase: 'idle' });
      console.debug('Update check skipped:', e);
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

  // Auto-check 5s after app starts
  useEffect(() => {
    const t = setTimeout(checkForUpdates, 5000);
    return () => clearTimeout(t);
  }, []);

  return { state, checkForUpdates, installUpdate, dismiss };
}
