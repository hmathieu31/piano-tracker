import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { MasterySuggestion } from '../types';

interface Props {
  onSimulateSuggest: (suggestion: MasterySuggestion) => void;
}

const DEV_SUGGESTIONS: MasterySuggestion[] = [
  {
    song_id: -1,
    song_title: 'Clair de Lune',
    current_status: 'learning',
    suggested_status: 'practicing',
  },
  {
    song_id: -1,
    song_title: 'Nocturne Op. 9 No. 2',
    current_status: 'practicing',
    suggested_status: 'mastered',
  },
];

export default function DevToolbar({ onSimulateSuggest }: Props) {
  const [open, setOpen] = useState(false);
  const [duration, setDuration] = useState(30);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  const flash = (m: string) => {
    setMsg(m);
    setTimeout(() => setMsg(''), 2500);
  };

  const simulateSession = async () => {
    setLoading(true);
    try {
      await invoke('dev_simulate_session_ended', { durationSeconds: duration });
      flash(`✓ Session (${duration}s) fired`);
    } catch (e) {
      flash(`✗ ${e}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex flex-col items-end gap-2">
      {/* Expanded panel */}
      {open && (
        <div className="bg-[#1a1a24] border border-amber-500/30 rounded-2xl p-4 w-72 shadow-2xl space-y-4 text-xs">
          <div className="flex items-center gap-2 text-amber-400 font-semibold">
            <span>🛠️</span>
            <span>Dev Simulator</span>
            <button onClick={() => setOpen(false)} className="ml-auto text-slate-500 hover:text-slate-300 text-base leading-none">✕</button>
          </div>

          {/* Simulate session end */}
          <div className="space-y-2">
            <div className="text-slate-400">Simulate session end</div>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={5}
                max={300}
                step={5}
                value={duration}
                onChange={e => setDuration(Number(e.target.value))}
                className="flex-1 accent-sky-500"
              />
              <span className="text-slate-300 w-12 text-right">
                {duration >= 60 ? `${Math.floor(duration / 60)}m${duration % 60 > 0 ? ` ${duration % 60}s` : ''}` : `${duration}s`}
              </span>
            </div>
            <button
              onClick={simulateSession}
              disabled={loading}
              className="w-full py-2 rounded-xl bg-sky-500/15 border border-sky-500/30 text-sky-400 hover:bg-sky-500/25 transition-all disabled:opacity-50 font-medium"
            >
              {loading ? '…' : '▶ Fire session-ended event'}
            </button>
          </div>

          {/* Simulate mastery suggestion */}
          <div className="space-y-2">
            <div className="text-slate-400">Simulate level-up prompt</div>
            <div className="space-y-1">
              {DEV_SUGGESTIONS.map((s, i) => (
                <button
                  key={i}
                  onClick={() => { onSimulateSuggest(s); flash('✓ Level-up modal opened'); }}
                  className="w-full flex items-center gap-2 py-2 px-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500/20 transition-all text-left"
                >
                  <span>🎖️</span>
                  <span className="truncate">{s.song_title}</span>
                  <span className="ml-auto text-[10px] text-slate-500 flex-shrink-0">{s.current_status} → {s.suggested_status}</span>
                </button>
              ))}
            </div>
          </div>

          {msg && (
            <div className="text-center text-slate-400 py-1 border-t border-white/5 pt-2">{msg}</div>
          )}
        </div>
      )}

      {/* Toggle button */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-10 h-10 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-400 hover:bg-amber-500/30 transition-all shadow-lg flex items-center justify-center text-lg"
        title="Dev Simulator"
      >
        🛠️
      </button>
    </div>
  );
}
