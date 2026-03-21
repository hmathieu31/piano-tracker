import { NavLink, Outlet } from 'react-router-dom';
import { useSessionStatus } from '../hooks/useData';
import UpdateBanner from './UpdateBanner';
import SessionToast from './SessionToast';
import SessionTagModal from './SessionTagModal';
import DevToolbar from './DevToolbar';
import { getVersion } from '@tauri-apps/api/app';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { onAction } from '@tauri-apps/plugin-notification';
import { useState, useEffect, useCallback } from 'react';
import type { MasterySuggestion } from '../types';

type NavSection = {
  label: string;
  items: { to: string; icon: string; label: string; soon?: boolean }[];
};

const navSections: NavSection[] = [
  {
    label: 'Practice',
    items: [
      { to: '/',           icon: '🏠', label: 'Dashboard' },
      { to: '/repertoire', icon: '🎹', label: 'Repertoire' },
    ],
  },
  {
    label: 'Progress',
    items: [
      { to: '/sessions',     icon: '🎵', label: 'Sessions' },
      { to: '/stats',        icon: '📊', label: 'Stats' },
      { to: '/achievements', icon: '🏆', label: 'Achievements' },
    ],
  },
  {
    label: 'Discover',
    items: [
      { to: '/coach',     icon: '🤖', label: 'Coach',     soon: true },
      { to: '/exercises', icon: '🎼', label: 'Exercises', soon: true },
    ],
  },
];

export default function Layout() {
  const status = useSessionStatus();
  const [version, setVersion] = useState('');
  const [reconnecting, setReconnecting] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [pendingSession, setPendingSession] = useState<{ id: number; duration: number } | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [devSuggestion, setDevSuggestion] = useState<MasterySuggestion | null>(null);
  useEffect(() => { getVersion().then(setVersion).catch(() => {}); }, []);

  // session-ended → show the in-app toast (always, even when focused)
  useEffect(() => {
    const unlisten = listen<{ session_id: number; duration_seconds: number }>('session-ended', e => {
      setPendingSession({ id: e.payload.session_id, duration: e.payload.duration_seconds });
      setShowModal(false); // always show toast first
    });
    return () => { unlisten.then(fn => fn()); };
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

  const handleReconnect = useCallback(async () => {
    setReconnecting(true);
    await invoke('reconnect_midi').catch(() => {});
    setTimeout(() => setReconnecting(false), 2000);
  }, []);

  return (
    <div className="flex h-screen bg-[#0f0f13] text-slate-100 overflow-hidden">
      <UpdateBanner />

      {/* Toast — always shown first after a session */}
      {pendingSession && !showModal && (
        <SessionToast
          durationSeconds={pendingSession.duration}
          onTag={() => setShowModal(true)}
          onDismiss={() => setPendingSession(null)}
        />
      )}

      {/* Modal — only opens after user clicks "Tag it" in the toast */}
      {pendingSession && showModal && (
        <SessionTagModal
          sessionId={pendingSession.id}
          durationSeconds={pendingSession.duration}
          onClose={() => { setPendingSession(null); setShowModal(false); }}
        />
      )}
      {devSuggestion && (
        <SessionTagModal
          sessionId={-1}
          durationSeconds={0}
          devSuggestion={devSuggestion}
          onClose={() => setDevSuggestion(null)}
        />
      )}
      {import.meta.env.DEV && (
        <DevToolbar onSimulateSuggest={s => setDevSuggestion(s)} />
      )}

      {/* Sidebar */}
      <aside className={`flex-shrink-0 bg-[#16161d] border-r border-white/5 flex flex-col transition-all duration-200 ${collapsed ? 'w-14' : 'w-52'}`}>
        {/* Logo */}
        <div className={`flex items-center border-b border-white/5 ${collapsed ? 'justify-center p-3' : 'justify-between px-4 py-3'}`}>
          {!collapsed && (
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center flex-shrink-0">
                <span className="text-sm">🎹</span>
              </div>
              <div className="min-w-0">
                <div className="font-bold text-xs text-white leading-tight tracking-wide">IVORY</div>
                <div className="text-[9px] text-slate-500 tracking-widest uppercase">Piano Tracker</div>
              </div>
            </div>
          )}
          {collapsed && (
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center">
              <span className="text-sm">🎹</span>
            </div>
          )}
          {!collapsed && (
            <button
              onClick={() => setCollapsed(true)}
              className="text-slate-600 hover:text-slate-300 transition-colors flex-shrink-0"
              title="Collapse sidebar"
            >
              <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                <path d="M6 2l-4 6 4 6M10 2l4 6-4 6" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          )}
        </div>

        {/* MIDI status pill */}
        {!collapsed && (
          <div className="mx-3 my-2 px-3 py-2 rounded-xl bg-[#1e1e28] border border-white/5">
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
        {collapsed && (
          <div className="flex justify-center my-2">
            <div className={`w-2 h-2 rounded-full ${
              status.is_playing ? 'bg-green-400 pulse-ring' :
              status.midi_connected ? 'bg-sky-400' : 'bg-slate-600'
            }`} />
          </div>
        )}

        {/* Sectioned nav */}
        <nav className="flex-1 px-2 py-1 overflow-y-auto space-y-3">
          {navSections.map(section => (
            <div key={section.label}>
              {!collapsed && (
                <div className="px-2 pb-1 text-[9px] font-semibold text-slate-600 uppercase tracking-widest">
                  {section.label}
                </div>
              )}
              <div className="space-y-0.5">
                {section.items.map(item => (
                  item.soon ? (
                    <div
                      key={item.to}
                      title={collapsed ? item.label : undefined}
                      className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm opacity-40 cursor-default select-none ${collapsed ? 'justify-center' : ''}`}
                    >
                      <span className="text-base flex-shrink-0">{item.icon}</span>
                      {!collapsed && (
                        <span className="truncate flex-1 text-slate-500">{item.label}</span>
                      )}
                      {!collapsed && (
                        <span className="text-[9px] bg-slate-700 text-slate-400 px-1.5 py-0.5 rounded-full flex-shrink-0">soon</span>
                      )}
                    </div>
                  ) : (
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
                  )
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Bottom: expand toggle + Settings */}
        <div className="px-2 pb-3 pt-2 border-t border-white/5">
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
          {!collapsed && <div className="px-2.5 pt-1.5 text-[10px] text-slate-700">{version ? `v${version}` : ''}</div>}
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto min-w-0">
        <Outlet />
      </main>
    </div>
  );
}
