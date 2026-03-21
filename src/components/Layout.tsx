import { NavLink, Outlet } from 'react-router-dom';
import { useSessionStatus } from '../hooks/useData';
import UpdateBanner from './UpdateBanner';
import QuickAssociateBanner from './QuickAssociateBanner';
import { getVersion } from '@tauri-apps/api/app';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { onAction } from '@tauri-apps/plugin-notification';
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
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => { getVersion().then(setVersion).catch(() => {}); }, []);

  // When a notification is clicked (e.g. session-ended toast), bring the window to focus
  useEffect(() => {
    const appWindow = getCurrentWebviewWindow();
    let listener: { unregister: () => Promise<void> } | undefined;
    onAction(async () => {
      await appWindow.show();
      await appWindow.setFocus();
    }).then(l => { listener = l; }).catch(() => {});
    return () => { listener?.unregister(); };
  }, []);

  const handleReconnect = useCallback(async () => {
    setReconnecting(true);
    await invoke('reconnect_midi').catch(() => {});
    setTimeout(() => setReconnecting(false), 2000);
  }, []);

  return (
    <div className="flex h-screen bg-[#0f0f13] text-slate-100 overflow-hidden">
      <UpdateBanner />
      <QuickAssociateBanner />

      {/* Sidebar */}
      <aside className={`flex-shrink-0 bg-[#16161d] border-r border-white/5 flex flex-col transition-all duration-200 ${collapsed ? 'w-14' : 'w-48'}`}>
        {/* Logo + collapse toggle */}
        <div className={`flex items-center border-b border-white/5 ${collapsed ? 'justify-center p-3' : 'justify-between px-4 py-3'}`}>
          {!collapsed && (
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xl flex-shrink-0">🎹</span>
              <div className="min-w-0">
                <div className="font-semibold text-xs text-white leading-tight">Piano Tracker</div>
                <div className="text-[9px] text-slate-500 truncate">Practice Dashboard</div>
              </div>
            </div>
          )}
          {collapsed && <span className="text-xl">🎹</span>}
          <button
            onClick={() => setCollapsed(c => !c)}
            className={`text-slate-600 hover:text-slate-300 transition-colors flex-shrink-0 ${collapsed ? 'hidden' : ''}`}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
              <path d="M6 2l-4 6 4 6M10 2l4 6-4 6" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>

        {/* MIDI Status */}
        {!collapsed && (
          <div className="mx-2 my-2 px-3 py-2 rounded-lg bg-[#1e1e28] border border-white/5">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                status.is_playing ? 'bg-green-400 pulse-ring' :
                status.midi_connected ? 'bg-sky-400' : 'bg-slate-600'
              }`} />
              <div className="text-xs truncate flex-1 min-w-0">
                {status.is_playing ? (
                  <span className="text-green-400 font-medium">Playing…</span>
                ) : status.midi_connected ? (
                  <span className="text-sky-400 truncate block">{status.midi_port_name || 'Connected'}</span>
                ) : (
                  <span className="text-slate-500">No MIDI</span>
                )}
              </div>
              <button
                onClick={handleReconnect}
                disabled={reconnecting}
                title="Reconnect MIDI"
                className="text-slate-600 hover:text-slate-300 disabled:opacity-40 transition-colors flex-shrink-0"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className={`w-3 h-3 ${reconnecting ? 'animate-spin' : ''}`}>
                  <path fillRule="evenodd" d="M13.836 2.477a.75.75 0 0 1 .75.75v3.182a.75.75 0 0 1-.75.75h-3.182a.75.75 0 0 1 0-1.5h1.37l-.84-.841a4.5 4.5 0 0 0-7.08.932.75.75 0 0 1-1.3-.75 6 6 0 0 1 9.44-1.242l.842.84V3.227a.75.75 0 0 1 .75-.75Zm-.911 7.5A.75.75 0 0 1 13.199 11a6 6 0 0 1-9.44 1.241l-.84-.84v1.371a.75.75 0 0 1-1.5 0V9.591a.75.75 0 0 1 .75-.75H5.35a.75.75 0 0 1 0 1.5H3.98l.841.841a4.5 4.5 0 0 0 7.08-.932.75.75 0 0 1 1.024-.273Z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Collapsed MIDI dot */}
        {collapsed && (
          <div className="flex justify-center my-2">
            <div className={`w-2 h-2 rounded-full ${
              status.is_playing ? 'bg-green-400 pulse-ring' :
              status.midi_connected ? 'bg-sky-400' : 'bg-slate-600'
            }`} />
          </div>
        )}

        {/* Main Nav */}
        <nav className="flex-1 px-1.5 space-y-0.5 overflow-y-auto">
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              title={collapsed ? item.label : undefined}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors ${
                  collapsed ? 'justify-center' : ''
                } ${
                  isActive
                    ? 'bg-sky-500/15 text-sky-400 font-medium'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-white/5'
                }`
              }
            >
              <span className="text-base flex-shrink-0">{item.icon}</span>
              {!collapsed && <span className="truncate">{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* Bottom: collapse toggle (when collapsed) + Settings + version */}
        <div className="px-1.5 pb-3 pt-2 border-t border-white/5">
          {collapsed && (
            <button
              onClick={() => setCollapsed(false)}
              className="w-full flex justify-center py-2 text-slate-600 hover:text-slate-300 transition-colors"
              title="Expand sidebar"
            >
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                <path d="M6 2l4 6-4 6"/>
              </svg>
            </button>
          )}
          <NavLink
            to="/settings"
            title={collapsed ? 'Settings' : undefined}
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors ${
                collapsed ? 'justify-center' : ''
              } ${
                isActive
                  ? 'bg-sky-500/15 text-sky-400 font-medium'
                  : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
              }`
            }
          >
            <span className="text-base flex-shrink-0">⚙️</span>
            {!collapsed && <span>Settings</span>}
          </NavLink>
          {!collapsed && <div className="px-2.5 pt-2 text-[10px] text-slate-700">{version ? `v${version}` : ''}</div>}
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto min-w-0">
        <Outlet />
      </main>
    </div>
  );
}