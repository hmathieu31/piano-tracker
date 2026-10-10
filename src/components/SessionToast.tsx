import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import confetti from 'canvas-confetti';
import SongSearchModal from './SongSearchModal';
import { FEELINGS } from './FeelingPicker';
import { formatDurationLong } from '../utils';
import type { AchievementInfo, MasterySuggestion, SessionRecord, SongRecord } from '../types';

interface Props {
  sessionId: number;
  durationSeconds: number;
  /** Achievements this session unlocked. */
  unlocked: AchievementInfo[];
  onClose: () => void;
}

const STAGE_NAMES: Record<string, string> = {
  learning: 'Learning',
  practicing: 'Practicing',
  mastered: 'Mastered',
};

/**
 * The one step after a session: it shows which song the session was tagged
 * with (from Up next), lets the user fix it, rate the session and accept a
 * mastery step. It has no countdown; ignoring it keeps the session as tagged.
 */
export default function SessionToast({ sessionId, durationSeconds, unlocked, onClose }: Props) {
  const [session, setSession] = useState<SessionRecord | null>(null);
  const [recentSongs, setRecentSongs] = useState<SongRecord[]>([]);
  const [suggestion, setSuggestion] = useState<MasterySuggestion | null>(null);
  const [advancedTo, setAdvancedTo] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

  const load = useCallback(async () => {
    try {
      const s = await invoke<SessionRecord | null>('get_session', { id: sessionId });
      setSession(s);
      setSuggestion(s?.song_id != null
        ? await invoke<MasterySuggestion | null>('get_mastery_suggestion', { songId: s.song_id })
        : null);
    } catch {}
  }, [sessionId]);

  useEffect(() => {
    load();
    invoke<SongRecord[]>('get_recent_songs', { limit: 6 }).then(setRecentSongs).catch(() => {});
  }, [load]);

  const tag = async (songId: number | null) => {
    try {
      await invoke(songId == null ? 'unlink_session_song' : 'link_session_song', { sessionId, songId });
      setAdvancedTo(null);
      await load();
    } catch {}
  };

  const rate = async (value: number) => {
    const feeling = session?.feeling === value ? null : value;
    setSession(s => s && { ...s, feeling });
    try {
      await invoke('set_session_feeling', { sessionId, feeling });
      // Mood counts towards mastery, so the suggestion may have changed.
      if (session?.song_id != null) {
        setSuggestion(await invoke<MasterySuggestion | null>('get_mastery_suggestion', { songId: session.song_id }));
      }
    } catch {}
  };

  const advance = async () => {
    if (!suggestion) return;
    try {
      await invoke('confirm_mastery_advance', { songId: suggestion.song_id, newStatus: suggestion.suggested_status });
      setAdvancedTo(suggestion.suggested_status);
      setSuggestion(null);
      confetti({ particleCount: 80, spread: 70, origin: { y: 0.85 }, colors: ['#0ea5e9', '#f59e0b', '#a855f7'] });
    } catch {}
  };

  const song = session?.song ?? null;
  const alternatives = recentSongs.filter(s => s.id !== song?.id).slice(0, 3);

  return (
    <>
      <div
        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[min(440px,calc(100vw-2rem))]"
        style={{ animation: 'toast-slide-up 0.3s ease-out' }}
      >
        <div className="bg-[#1a1a26] border border-white/10 rounded-2xl shadow-2xl p-4 flex flex-col gap-3.5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs text-slate-500">Session saved · {formatDurationLong(durationSeconds)}</div>
              <div className={`text-base font-semibold mt-0.5 truncate ${song ? 'text-white' : 'text-amber-400'}`}>
                {song?.title ?? (session ? 'Warm-up or untagged' : '…')}
              </div>
            </div>
            <button onClick={onClose} className="text-slate-600 hover:text-slate-400 transition-colors p-1" aria-label="Close">
              <svg className="w-3.5 h-3.5" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M2 2l10 10M12 2L2 12"/>
              </svg>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-slate-500 mr-0.5">{song ? 'Not this?' : 'What did you play?'}</span>
            {song && <Chip onClick={() => tag(null)}>Warm-up</Chip>}
            {alternatives.map(s => (
              <Chip key={s.id} onClick={() => tag(s.id)}>{s.title}</Chip>
            ))}
            <Chip onClick={() => setSearching(true)} muted>Search…</Chip>
          </div>

          <div className="flex gap-1.5">
            {FEELINGS.map(f => (
              <button
                key={f.value}
                onClick={() => rate(f.value)}
                title={f.label}
                aria-label={f.label}
                aria-pressed={session?.feeling === f.value}
                className={`flex-1 h-10 rounded-xl border text-xl transition-all ${
                  session?.feeling === f.value
                    ? 'bg-sky-500/15 border-sky-500/45'
                    : 'bg-white/[0.03] border-white/5 opacity-55 hover:opacity-100'
                }`}
              >
                {f.emoji}
              </button>
            ))}
          </div>

          {suggestion && (
            <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25">
              <span className="flex-1 text-sm text-amber-300">
                Ready to call it {STAGE_NAMES[suggestion.suggested_status] ?? suggestion.suggested_status}?
              </span>
              <button
                onClick={advance}
                className="h-7 px-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-stone-900 text-xs font-semibold transition-colors"
              >
                Yes
              </button>
            </div>
          )}
          {advancedTo && (
            <div className="text-sm text-amber-300">🎉 Moved to {STAGE_NAMES[advancedTo] ?? advancedTo}</div>
          )}
          {unlocked.map(a => (
            <div key={a.key} className="text-sm text-slate-300">
              <span className="mr-1.5">{a.icon}</span>Badge unlocked: <span className="font-medium text-white">{a.title}</span>
            </div>
          ))}
        </div>

        <style>{`
          @keyframes toast-slide-up {
            from { opacity: 0; transform: translateX(-50%) translateY(12px); }
            to   { opacity: 1; transform: translateX(-50%) translateY(0); }
          }
        `}</style>
      </div>

      {searching && (
        <SongSearchModal
          sessionId={sessionId}
          recentSongs={recentSongs}
          onAssigned={load}
          onClose={() => setSearching(false)}
        />
      )}
    </>
  );
}

function Chip({ children, onClick, muted }: { children: ReactNode; onClick: () => void; muted?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`h-7 max-w-[11rem] truncate px-2.5 rounded-full border border-white/10 bg-[#252533] hover:bg-[#2e2e40] text-xs transition-colors ${
        muted ? 'text-slate-500' : 'text-slate-300'
      }`}
    >
      {children}
    </button>
  );
}
