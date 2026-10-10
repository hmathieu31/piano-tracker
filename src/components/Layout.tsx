import { NavLink, Outlet } from 'react-router-dom';
import UpdateBanner from './UpdateBanner';
import SessionToast from './SessionToast';
import DevToolbar from './DevToolbar';
import { getVersion } from '@tauri-apps/api/app';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { onAction } from '@tauri-apps/plugin-notification';
import { useState, useEffect, useRef } from 'react';
import type { AchievementInfo } from '../types';

const ICON_PROPS = {
  width: 20, height: 20, viewBox: '0 0 20 20', fill: 'none', stroke: 'currentColor',
  strokeWidth: 1.6, strokeLinecap: 'round' as const, 'aria-hidden': true,
};

const navItems = [
  {
    to: '/', label: 'Today',
    icon: <svg {...ICON_PROPS}><circle cx="10" cy="10" r="7" /><circle cx="10" cy="10" r="3" /></svg>,
  },
  {
    to: '/songs', label: 'Songs',
    icon: <svg {...ICON_PROPS}><path d="M8 15V4l9-2v11" /><circle cx="5.5" cy="15" r="2.5" /><circle cx="14.5" cy="13" r="2.5" /></svg>,
  },
  {
    to: '/history', label: 'History',
    icon: <svg {...ICON_PROPS}><rect x="3" y="4" width="14" height="13" rx="2" /><path d="M3 8h14M7 2v4M13 2v4" /></svg>,
  },
];

const railItem = ({ isActive }: { isActive: boolean }) =>
  `w-14 py-2 rounded-xl flex flex-col items-center gap-1 text-[10px] font-medium transition-colors ${
    isActive ? 'bg-sky-500/15 text-sky-400' : 'text-slate-500 hover:text-slate-200 hover:bg-white/5'
  }`;

export default function Layout() {
  const [version, setVersion] = useState('');
  const [pendingSession, setPendingSession] = useState<{ id: number; duration: number; unlocked: AchievementInfo[] } | null>(null);
  // Achievements unlocked by the session being saved; the backend emits them
  // just before `session-ended`.
  const unlockedKeys = useRef<string[]>([]);
  useEffect(() => { getVersion().then(setVersion).catch(() => {}); }, []);

  // session-ended → show the after-session toast, replacing any earlier one
  useEffect(() => {
    const unlistenUnlock = listen<string>('achievement-unlocked', e => { unlockedKeys.current.push(e.payload); });
    const unlistenEnd = listen<{ session_id: number; duration_seconds: number }>('session-ended', async e => {
      const keys = unlockedKeys.current;
      unlockedKeys.current = [];
      const all = keys.length > 0 ? await invoke<AchievementInfo[]>('get_achievements').catch(() => []) : [];
      setPendingSession({
        id: e.payload.session_id,
        duration: e.payload.duration_seconds,
        unlocked: all.filter(a => keys.includes(a.key)),
      });
    });
    return () => {
      unlistenUnlock.then(fn => fn());
      unlistenEnd.then(fn => fn());
    };
  }, []);

  useEffect(() => {
    const appWindow = getCurrentWebviewWindow();
    let listener: { unregister: () => Promise<void> } | undefined;
    onAction(async () => {
      await appWindow.show();
      await appWindow.setFocus();
    }).then(l => { listener = l; }).catch(() => {});
    return () => { listener?.unregister(); };
  }, []);

  return (
    <div className="flex h-screen bg-[#0f0f13] text-slate-100 overflow-hidden">
      <UpdateBanner />

      {pendingSession && (
        <SessionToast
          key={pendingSession.id}
          sessionId={pendingSession.id}
          durationSeconds={pendingSession.duration}
          unlocked={pendingSession.unlocked}
          onClose={() => setPendingSession(null)}
        />
      )}
      {import.meta.env.DEV && <DevToolbar />}

      <nav aria-label="Main" className="w-[72px] flex-shrink-0 bg-[#16161d] border-r border-white/5 flex flex-col items-center py-4 gap-2">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center mb-3">
          <span className="text-sm">🎹</span>
        </div>
        {navItems.map(item => (
          <NavLink key={item.to} to={item.to} end={item.to === '/'} className={railItem}>
            {item.icon}
            {item.label}
          </NavLink>
        ))}
        <div className="flex-1" />
        <NavLink to="/settings" className={railItem} title={version ? `Settings · v${version}` : 'Settings'} aria-label="Settings">
          <svg {...ICON_PROPS}><path d="M4 6h12M4 14h12" /><circle cx="8" cy="6" r="2" fill="#16161d" /><circle cx="12" cy="14" r="2" fill="#16161d" /></svg>
        </NavLink>
      </nav>

      <main className="flex-1 overflow-y-auto min-w-0">
        <Outlet />
      </main>
    </div>
  );
}
