import { useState, useEffect, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Image } from '@heroui/react';
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
  /** Seconds before the toast saves what is selected and closes. */
  autoSaveSecs?: number;
}

const STAGE_NAMES: Record<string, string> = {
  learning: 'Learning',
  practicing: 'Practicing',
  mastered: 'Mastered',
};

/** What the toast saves: the session's song (null for a warm-up), its mood
 *  and whether to accept the suggested mastery step. */
interface Draft {
  songId: number | null;
  feeling: number | null;
  advance: boolean;
}

function SongThumb({ song, size }: { song: SongRecord | null; size: number }) {
  return (
    <div className="rounded-md overflow-hidden bg-[#2e2e40] flex-shrink-0 flex items-center justify-center" style={{ width: size, height: size }}>
      {song?.cover_url
        ? <Image src={song.cover_url} alt="" className="object-cover" style={{ width: size, height: size }} removeWrapper />
        : <span style={{ fontSize: size * 0.5 }}>{song ? '🎵' : '🎹'}</span>}
    </div>
  );
}

/**
 * The one step after a session. It starts on the song the session was tagged
 * with (from Up next); the user can pick another song or a warm-up, rate the
 * session and accept a mastery step. What is selected is saved when the
 * countdown runs out, on Save or ✕, or when a newer session replaces it.
 * Hovering pauses the countdown.
 */
export default function SessionToast({ sessionId, durationSeconds, unlocked, onClose, autoSaveSecs = 20 }: Props) {
  const [session, setSession] = useState<SessionRecord | null>(null);
  const [recentSongs, setRecentSongs] = useState<SongRecord[]>([]);
  const [picked, setPicked] = useState<SongRecord | null>(null);
  const [suggestion, setSuggestion] = useState<MasterySuggestion | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [searching, setSearching] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [remaining, setRemaining] = useState(autoSaveSecs);
  const [leaving, setLeaving] = useState(false);
  const draftRef = useRef<Draft | null>(null);
  const saved = useRef(false);
  draftRef.current = draft;

  useEffect(() => {
    (async () => {
      try {
        const s = await invoke<SessionRecord | null>('get_session', { id: sessionId });
        setSession(s);
        setDraft({ songId: s?.song_id ?? null, feeling: s?.feeling ?? null, advance: false });
        if (s?.song_id != null) {
          setSuggestion(await invoke<MasterySuggestion | null>('get_mastery_suggestion', { songId: s.song_id }));
        }
      } catch {}
    })();
    invoke<SongRecord[]>('get_recent_songs', { limit: 6 }).then(setRecentSongs).catch(() => {});
  }, [sessionId]);

  const save = useCallback(async () => {
    const d = draftRef.current;
    if (saved.current || !d) return;
    saved.current = true;
    try {
      await invoke('tag_session', { sessionId, songId: d.songId, feeling: d.feeling, practiceType: null, note: null });
      if (d.advance && suggestion && d.songId === suggestion.song_id) {
        await invoke('confirm_mastery_advance', { songId: suggestion.song_id, newStatus: suggestion.suggested_status });
        confetti({ particleCount: 80, spread: 70, origin: { y: 0.85 }, colors: ['#0ea5e9', '#f59e0b', '#a855f7'] });
      }
    } catch {}
  }, [sessionId, suggestion]);

  const saveAndClose = useCallback(() => {
    save();
    setLeaving(true);
    setTimeout(onClose, 250);
  }, [save, onClose]);

  // A newer session replaces this toast: keep what was selected.
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => () => { saveRef.current(); }, []);

  useEffect(() => {
    if (hovered || searching || leaving) return;
    if (remaining <= 0) { saveAndClose(); return; }
    const t = setTimeout(() => setRemaining(r => r - 1), 1000);
    return () => clearTimeout(t);
  }, [remaining, hovered, searching, leaving, saveAndClose]);

  const update = (change: Partial<Draft>) => setDraft(d => d && { ...d, ...change });

  // Choices: the session's own song first, then one picked from search,
  // then recent songs.
  const sessionSong = session?.song ?? null;
  const choices: SongRecord[] = [];
  for (const s of [sessionSong, picked, ...recentSongs]) {
    if (s && !choices.some(c => c.id === s.id) && choices.length < 4) choices.push(s);
  }
  const selected = choices.find(c => c.id === draft?.songId) ?? null;
  const showSuggestion = suggestion && draft?.songId === suggestion.song_id;

  const chip = (active: boolean) =>
    `h-9 max-w-[13rem] pl-1 pr-3 rounded-full border flex items-center gap-2 text-xs transition-colors ${
      active
        ? 'bg-sky-500/15 border-sky-500/50 text-sky-200'
        : 'bg-[#252533] border-white/10 text-slate-300 hover:bg-[#2e2e40]'
    }`;

  return (
    <>
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[min(480px,calc(100vw-2rem))] transition-all duration-200 ${
          leaving ? 'opacity-0 translate-y-3' : 'opacity-100'
        }`}
        style={{ animation: 'toast-slide-up 0.3s ease-out' }}
        role="dialog"
        aria-label="Session saved"
      >
        <div className="bg-[#1a1a26] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
          <div className="p-4 flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <SongThumb song={selected} size={44} />
              <div className="flex-1 min-w-0">
                <div className="text-xs text-slate-500">Session saved · {formatDurationLong(durationSeconds)}</div>
                <div className="text-base font-semibold text-white truncate">
                  {draft == null ? '…' : selected?.title ?? 'Warm-up'}
                </div>
              </div>
              <button onClick={saveAndClose} className="text-slate-500 hover:text-slate-300 transition-colors p-1.5" aria-label="Close" title="Close (keeps what's selected)">
                <svg className="w-3.5 h-3.5" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M2 2l10 10M12 2L2 12" />
                </svg>
              </button>
            </div>

            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">What did you play?</div>
              <div className="flex flex-wrap gap-1.5">
                {choices.map(s => (
                  <button key={s.id} onClick={() => update({ songId: s.id })} className={chip(draft?.songId === s.id)} aria-pressed={draft?.songId === s.id}>
                    <SongThumb song={s} size={28} />
                    <span className="truncate">{s.title}</span>
                  </button>
                ))}
                <button onClick={() => update({ songId: null })} className={chip(draft != null && draft.songId == null)} aria-pressed={draft != null && draft.songId == null}>
                  <SongThumb song={null} size={28} />
                  Warm-up
                </button>
                <button onClick={() => setSearching(true)} className="h-9 px-3 rounded-full border border-dashed border-white/15 text-xs text-slate-400 hover:text-slate-200">
                  Other…
                </button>
              </div>
            </div>

            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">How did it go?</div>
              <div className="flex gap-1.5">
                {FEELINGS.map(f => {
                  const active = draft?.feeling === f.value;
                  return (
                    <button
                      key={f.value}
                      onClick={() => update({ feeling: active ? null : f.value })}
                      aria-pressed={active}
                      className={`flex-1 py-1.5 rounded-xl border flex flex-col items-center gap-0.5 transition-all ${
                        active ? 'bg-sky-500/15 border-sky-500/50' : 'bg-white/[0.03] border-white/5 hover:bg-white/[0.06]'
                      }`}
                    >
                      <span className={`text-xl ${active || draft?.feeling == null ? '' : 'opacity-50'}`}>{f.emoji}</span>
                      <span className={`text-[10px] ${active ? 'text-sky-300' : 'text-slate-500'}`}>{f.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {showSuggestion && (
              <button
                onClick={() => update({ advance: !draft?.advance })}
                aria-pressed={draft?.advance}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-left transition-colors ${
                  draft?.advance ? 'bg-amber-500/15 border-amber-500/50' : 'bg-amber-500/5 border-amber-500/20 hover:bg-amber-500/10'
                }`}
              >
                <span className={`w-4 h-4 rounded flex items-center justify-center text-[10px] border ${
                  draft?.advance ? 'bg-amber-500 border-amber-500 text-stone-900' : 'border-amber-500/50'
                }`}>{draft?.advance ? '✓' : ''}</span>
                <span className="text-sm text-amber-300">
                  Move it to {STAGE_NAMES[suggestion.suggested_status] ?? suggestion.suggested_status}
                </span>
              </button>
            )}

            {unlocked.map(a => (
              <div key={a.key} className="text-sm text-slate-300">
                <span className="mr-1.5">{a.icon}</span>Badge unlocked: <span className="font-medium text-white">{a.title}</span>
              </div>
            ))}
          </div>

          <div className="px-4 py-2.5 bg-black/20 border-t border-white/5 flex items-center gap-3">
            <span className="text-xs text-slate-500 flex-1">
              {hovered || searching ? 'Paused while you choose' : `Saving in ${remaining}s`}
            </span>
            <button onClick={saveAndClose} className="h-8 px-4 rounded-lg bg-sky-500 hover:bg-sky-400 text-white text-xs font-semibold transition-colors">
              Save
            </button>
          </div>
          <div className="h-[2px] bg-white/5">
            <div className="h-full bg-sky-500 transition-all duration-1000 ease-linear" style={{ width: `${(remaining / autoSaveSecs) * 100}%` }} />
          </div>
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
          title="What did you play?"
          recentSongs={recentSongs}
          onPick={async songId => {
            const detail = await invoke<{ song: SongRecord } | null>('get_song_with_sessions', { songId }).catch(() => null);
            if (detail) setPicked(detail.song);
            update({ songId });
          }}
          onClose={() => setSearching(false)}
        />
      )}
    </>
  );
}
