import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getVersion } from '@tauri-apps/api/app';
import { relaunch } from '@tauri-apps/plugin-process';

export interface UpdateInfo {
  version: string;
  notes?: string;
  url: string;
  signature: string;
}

export type UpdaterState =
  | { phase: 'idle' }
  | { phase: 'checking' }
  | { phase: 'up-to-date' }
  | { phase: 'available'; info: UpdateInfo }
  | { phase: 'downloading'; progress: number }
  | { phase: 'error'; message: string };

function parseVersion(v: string): number[] {
  return v.replace(/^v/, '').split('.').map(Number);
}

function isNewer(remote: string, current: string): boolean {
  const r = parseVersion(remote);
  const c = parseVersion(current);
  for (let i = 0; i < 3; i++) {
    if ((r[i] ?? 0) > (c[i] ?? 0)) return true;
    if ((r[i] ?? 0) < (c[i] ?? 0)) return false;
  }
  return false;
}

export function useUpdater() {
  const [state, setState] = useState<UpdaterState>({ phase: 'idle' });

  const checkForUpdates = useCallback(async (silent = false) => {
    setState({ phase: 'checking' });
    try {
      const manifest = await invoke<string>('fetch_update_manifest');
      const data = JSON.parse(manifest);
      const version: string = data.version;
      const platform = data.platforms?.['windows-x86_64'];
      if (!platform) throw new Error('No Windows platform entry in manifest');

      const currentVersion = await getVersion().catch(() => '0.0.0');

      if (isNewer(version, currentVersion)) {
        setState({ phase: 'available', info: { version, notes: data.notes, url: platform.url, signature: platform.signature } });
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
    const { info } = state;
    setState({ phase: 'downloading', progress: 0 });
    try {
      // Use Tauri plugin for signature-verified download+install
      const { check } = await import('@tauri-apps/plugin-updater');
      const update = await check();
      if (!update) throw new Error('Update no longer available from plugin');
      let downloaded = 0, total = 0;
      await update.downloadAndInstall((event) => {
        if (event.event === 'Started') total = event.data.contentLength ?? 0;
        if (event.event === 'Progress') {
          downloaded += event.data.chunkLength;
          setState({ phase: 'downloading', progress: total > 0 ? Math.round((downloaded / total) * 100) : 0 });
        }
      });
      await relaunch();
    } catch {
      setState({ phase: 'error', message: `Auto-install failed — download v${info.version} manually from GitHub Releases.` });
    }
  }, [state]);

  const dismiss = useCallback(() => setState({ phase: 'idle' }), []);

  // Background auto-check 8s after app starts — silent (no errors shown)
  useEffect(() => {
    const t = setTimeout(() => checkForUpdates(true), 8000);
    return () => clearTimeout(t);
  }, []);

  return { state, checkForUpdates, installUpdate, dismiss };
}
