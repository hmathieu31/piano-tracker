import { NavLink, Outlet } from 'react-router-dom';
import { useSessionStatus } from '../hooks/useData';
import UpdateBanner from './UpdateBanner';
import QuickAssociateBanner from './QuickAssociateBanner';
import { getVersion } from '@tauri-apps/api/app';
import { invoke } from '@tauri-apps/api/core';
import { useState, useEffect, useCallback } from 'react';

const navItems = [
  { to: '/', icon: '🏠', label: 'Today' },
  { to: '/goals', icon: '🎯', label: 'Goals' },
  { to: '/charts', icon: '📊', label: 'Charts' },
  { to: '/heatmap', icon: '🗓️', label: 'Heatmap' },
  { to: '/insights', icon: '💡', label: 'Insights' },
  { to: '/achievements', icon: '🏆', label: 'Achievements' },
  { to: '/history', icon: '📋', label: 'History' },
];

export default function Layout() {
  const status = useSessionStatus();
  const [version, setVersion] = useState('');
  const [reconnecting, setReconnecting] = useState(false);
  useEffect(() => { getVersion().then(setVersion).catch(() => {}); }, []);

  const handleReconnect = useCallback(async () => {
    setReconnecting(true);
    await invoke('reconnect_midi').catch(() => {});
    setTimeout(() => setReconnecting(false), 2000);
  }, []);

  return (
    <div className="flex h-screen bg-[#0f0f13] text-slate-100 overflow-hidden">
      <UpdateBanner />
      <QuickAssociateBanner />
      <aside className="w-52 flex-shrink-0 bg-[#16161d] border-r border-white/5 flex flex-col">
        {/* Logo */}
        <div className="p-5 pb-4">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🎹</span>
            <div>
              <div className="font-semibold text-sm text-white">Piano Tracker</div>
              <div className="text-[10px] text-slate-500">Practice Dashboard</div>
            </div>
          </div>
        </div>

        {/* MIDI Status */}
        <div className="mx-3 mb-4 px-3 py-2 rounded-lg bg-[#1e1e28] border border-white/5">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
              status.is_playing ? 'bg-green-400 pulse-ring' :
              status.midi_connected ? 'bg-sky-400' : 'bg-slate-600'
            }`} />
            <div className="text-xs truncate flex-1">
              {status.is_playing ? (
                <span className="text-green-400 font-medium">Playing...</span>
              ) : status.midi_connected ? (
                <span className="text-sky-400">{status.midi_port_name || 'Connected'}</span>
              ) : (
                <span className="text-slate-500">No MIDI device</span>
              )}
            </div>
            <button
              onClick={handleReconnect}
              disabled={reconnecting}
              title="Reconnect MIDI"
              className="text-slate-600 hover:text-slate-300 disabled:opacity-40 transition-colors flex-shrink-0 ml-auto"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 16 16"
                fill="currentColor"
                className={`w-3 h-3 ${reconnecting ? 'animate-spin' : ''}`}
              >
                <path fillRule="evenodd" d="M13.836 2.477a.75.75 0 0 1 .75.75v3.182a.75.75 0 0 1-.75.75h-3.182a.75.75 0 0 1 0-1.5h1.37l-.84-.841a4.5 4.5 0 0 0-7.08.932.75.75 0 0 1-1.3-.75 6 6 0 0 1 9.44-1.242l.842.84V3.227a.75.75 0 0 1 .75-.75Zm-.911 7.5A.75.75 0 0 1 13.199 11a6 6 0 0 1-9.44 1.241l-.84-.84v1.371a.75.75 0 0 1-1.5 0V9.591a.75.75 0 0 1 .75-.75H5.35a.75.75 0 0 1 0 1.5H3.98l.841.841a4.5 4.5 0 0 0 7.08-.932.75.75 0 0 1 1.024-.273Z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        </div>

        {/* Main Nav */}
        <nav className="flex-1 px-2 space-y-0.5">
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-sky-500/15 text-sky-400 font-medium'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-white/5'
                }`
              }
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* Bottom: Settings + version */}
        <div className="px-2 pb-3 pt-2 border-t border-white/5 mt-1">
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                isActive
                  ? 'bg-sky-500/15 text-sky-400 font-medium'
                  : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
              }`
            }
          >
            <span className="text-base">⚙️</span>
            Settings
          </NavLink>
          <div className="px-3 pt-2 text-[10px] text-slate-700">{version ? `v${version}` : ''}</div>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
