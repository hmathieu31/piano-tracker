import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { motion, AnimatePresence } from 'framer-motion';
import { Button, Textarea, Image, Chip } from '@heroui/react';
import { searchRecordings, type MBSearchResult } from '../api/musicSearch';
import type { SongRecord, MasterySuggestion } from '../types';
import confetti from 'canvas-confetti';

// ── types ──────────────────────────────────────────────────────────────────

interface Props {
  sessionId: number;
  durationSeconds: number;
  onClose: () => void;
  /** DEV only: open directly on the suggest step with a pre-filled suggestion */
  devSuggestion?: MasterySuggestion;
}

type PracticeType = 'first' | 'section' | 'full' | 'performance';
type Step = 'song' | 'details' | 'suggest' | 'done';

interface PracticeTypeInfo {
  id: PracticeType;
  icon: string;
  label: string;
  desc: string;
}

interface SongContext {
  isNew: boolean;
  isComeback: boolean;
  isStruggling: boolean;
  isFlowing: boolean;
  daysSince: number | null;
  sessionCount: number;
  narrative: string;
  suggestedType: PracticeType;
  headline: string;
  /** Relevance score for each practice type (0–3); 3 = most relevant */
  scores: Record<PracticeType, number>;
}

const ALL_PRACTICE_TYPES: PracticeTypeInfo[] = [
  { id: 'first',       icon: '🌱', label: 'First listen',      desc: 'Getting acquainted — no pressure' },
  { id: 'section',     icon: '🔬', label: 'Drill a section',   desc: 'Isolate and fix the tricky parts' },
  { id: 'full',        icon: '🔄', label: 'Full run-through',  desc: 'Play the whole piece start to finish' },
  { id: 'performance', icon: '✨', label: 'Performance run',   desc: 'Like playing for an audience' },
];

const MOOD_EMOJIS = ['😞', '😐', '🙂', '😊', '🤩'];

const STAGE_LABELS: Record<string, string> = {
  learning:   '🌱 Learning',
  practicing: '🎵 Practicing',
  mastered:   '⭐ Mastered',
};

const STAGE_COLORS: Record<string, string> = {
  learning:   'text-emerald-400',
  practicing: 'text-sky-400',
  mastered:   'text-amber-400',
};

const AUTO_DISMISS_SECS = 45;

// ── context engine ─────────────────────────────────────────────────────────

function getDaysSince(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  return Math.round((today.getTime() - d.getTime()) / 86_400_000);
}

function getSongContext(song: SongRecord): SongContext {
  const sessionCount = song.session_count ?? 0;
  const avgFeeling = song.avg_feeling ?? null; // stored as 1-5
  const daysSince = getDaysSince(song.last_played_date);
  const status = song.status ?? 'learning';

  const isNew = sessionCount <= 1;
  const isComeback = !isNew && daysSince !== null && daysSince >= 21;
  const isStruggling = !isNew && avgFeeling !== null && avgFeeling < 2.5;
  const isFlowing = !isNew && avgFeeling !== null && avgFeeling >= 3.5 && sessionCount >= 3;
  const isReadyToShine = isFlowing && sessionCount >= 5 && status !== 'learning';

  // Build narrative string for the song meta row
  const parts: string[] = [];
  if (sessionCount > 0) {
    parts.push(`${sessionCount} session${sessionCount !== 1 ? 's' : ''}`);
  }
  if (daysSince !== null) {
    if (daysSince === 0) parts.push('played today');
    else if (daysSince === 1) parts.push('yesterday');
    else if (daysSince < 7) parts.push(`${daysSince} days ago`);
    else if (daysSince < 21) parts.push(`${Math.floor(daysSince / 7)}w ago`);
    else if (daysSince < 60) parts.push(`${Math.floor(daysSince / 7)} weeks ago`);
    else parts.push(`${Math.floor(daysSince / 30)} months ago`);
  }
  const narrative = parts.join(' · ');

  // Score each option 0-3 based on context
  let scores: Record<PracticeType, number> = { first: 0, section: 1, full: 2, performance: 1 };
  let suggestedType: PracticeType = 'full';
  let headline = 'Keep building on your momentum 🎵';

  if (isNew) {
    scores = { first: 3, section: 1, full: 2, performance: 0 };
    suggestedType = 'first';
    headline = "First time with this song — let's just explore it 🌱";
  } else if (isComeback && daysSince! > 60) {
    scores = { first: 1, section: 1, full: 3, performance: 0 };
    suggestedType = 'full';
    headline = `Back after ${Math.floor(daysSince! / 30)} months — reconnect with a full run 🔄`;
  } else if (isComeback) {
    scores = { first: 0, section: 2, full: 3, performance: 1 };
    suggestedType = 'full';
    headline = `${daysSince} days away — warm up with a complete run-through 🔄`;
  } else if (isStruggling) {
    scores = { first: 0, section: 3, full: 2, performance: 0 };
    suggestedType = 'section';
    headline = 'This one is fighting back — pinpoint what to fix 🔬';
  } else if (isReadyToShine) {
    scores = { first: 0, section: 1, full: 2, performance: 3 };
    suggestedType = 'performance';
    headline = "You're in great shape with this — time to perform it ✨";
  } else if (isFlowing) {
    scores = { first: 0, section: 1, full: 3, performance: 2 };
    suggestedType = 'full';
    headline = 'Flowing nicely — another solid run-through will lock it in 🎶';
  } else if (sessionCount >= 10) {
    scores = { first: 0, section: 2, full: 2, performance: 3 };
    suggestedType = 'performance';
    headline = `${sessionCount} sessions in — push it to performance level 🚀`;
  }

  return { isNew, isComeback, isStruggling, isFlowing, daysSince, sessionCount, narrative, suggestedType, headline, scores };
}

// ── sub-components ─────────────────────────────────────────────────────────

function SongCover({ song, size = 36 }: { song: SongRecord; size?: number }) {
  const style = { width: size, height: size };
  if (song.cover_url) {
    return (
      <div className="flex-shrink-0 rounded-lg overflow-hidden" style={style}>
        <Image src={song.cover_url} alt={song.title} className="w-full h-full object-cover" removeWrapper />
      </div>
    );
  }
  // Gradient placeholder from song title initials
  const hue = (song.title.charCodeAt(0) * 37) % 360;
  return (
    <div
      className="flex-shrink-0 rounded-lg flex items-center justify-center text-white/80 font-bold text-sm"
      style={{ ...style, background: `hsl(${hue},50%,25%)` }}
    >
      {song.title.slice(0, 2).toUpperCase()}
    </div>
  );
}

function SongContextBadge({ context }: { context: SongContext }) {
  if (context.isNew) return <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-full">New song</span>;
  if (context.isComeback) return <span className="text-[10px] text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded-full">Comeback</span>;
  if (context.isStruggling) return <span className="text-[10px] text-rose-400 bg-rose-500/10 px-1.5 py-0.5 rounded-full">Challenging</span>;
  if (context.isFlowing) return <span className="text-[10px] text-sky-400 bg-sky-500/10 px-1.5 py-0.5 rounded-full">Flowing ✦</span>;
  return null;
}

// ── main component ─────────────────────────────────────────────────────────

export default function SessionTagModal({ sessionId, durationSeconds, onClose, devSuggestion }: Props) {
  const [step, setStep] = useState<Step>(devSuggestion ? 'suggest' : 'song');
  const [selectedSong, setSelectedSong] = useState<SongRecord | null>(null);
  const [practiceType, setPracticeType] = useState<PracticeType | null>(null);
  const [feeling, setFeeling] = useState<number | null>(null); // 1-5
  const [note, setNote] = useState('');
  const [recentSongs, setRecentSongs] = useState<SongRecord[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<MBSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [countdown, setCountdown] = useState(AUTO_DISMISS_SECS);
  const [suggestion, setSuggestion] = useState<MasterySuggestion | null>(devSuggestion ?? null);
  const [celebrating, setCelebrating] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Compute context whenever selected song changes
  const songContext = useMemo(
    () => selectedSong ? getSongContext(selectedSong) : null,
    [selectedSong],
  );

  // Load recent songs
  useEffect(() => {
    invoke<SongRecord[]>('get_recent_songs', { limit: 6 }).then(setRecentSongs).catch(() => {});
  }, []);

  // Countdown auto-dismiss (song step only)
  useEffect(() => {
    if (step !== 'song') return;
    timerRef.current = setInterval(() => {
      setCountdown(c => { if (c <= 1) { onClose(); return 0; } return c - 1; });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [step, onClose]);

  const stopCountdown = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  };

  const handlePickSong = (song: SongRecord) => {
    stopCountdown();
    setSelectedSong(song);
    // Auto-select the suggested practice type
    const ctx = getSongContext(song);
    setPracticeType(ctx.suggestedType);
    setStep('details');
  };

  const handleSkip = async () => {
    stopCountdown();
    await saveTag(null, null, null, null);
  };

  const saveTag = async (songId: number | null, f: number | null, pt: PracticeType | null, n: string | null) => {
    setSaving(true);
    try {
      const result = await invoke<MasterySuggestion | null>('tag_session', {
        sessionId,
        songId,
        feeling: f,
        practiceType: pt,
        note: n && n.trim() ? n.trim() : null,
      });
      if (result) { setSuggestion(result); setStep('suggest'); }
      else { setStep('done'); setTimeout(onClose, 1200); }
    } catch { /* silently ignore */ } finally { setSaving(false); }
  };

  const handleSave = () => saveTag(selectedSong?.id ?? null, feeling, practiceType, note);

  const handleConfirmLevelUp = async () => {
    if (!suggestion) return;
    setSaving(true);
    try {
      await invoke('confirm_mastery_advance', { songId: suggestion.song_id, newStatus: suggestion.suggested_status });
      setCelebrating(true);
      fireConfetti();
      setTimeout(() => { setCelebrating(false); setStep('done'); setTimeout(onClose, 1500); }, 3000);
    } catch { } finally { setSaving(false); }
  };

  const handleDeclineLevelUp = () => { setStep('done'); setTimeout(onClose, 1200); };

  // Search
  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setSearchResults([]); return; }
    setSearching(true);
    try { const res = await searchRecordings(q); setSearchResults(res); }
    catch { } finally { setSearching(false); }
  }, []);

  const handleSearchChange = (v: string) => {
    setSearchQuery(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(v), 600);
  };

  const assignFromSearch = async (result: MBSearchResult) => {
    setSaving(true);
    try {
      const songId = await invoke<number>('create_song', {
        title: result.title, artist: result.artist, genre: result.genre,
        album: result.album, year: result.year, coverUrl: result.coverUrl,
        spotifyUrl: result.spotifyUrl, mbRecordingId: result.recordingId, mbReleaseId: result.releaseId,
      });
      const song: SongRecord = {
        id: songId, title: result.title, artist: result.artist, genre: result.genre,
        album: result.album, year: result.year, cover_url: result.coverUrl,
        spotify_url: result.spotifyUrl, musicbrainz_recording_id: result.recordingId,
        musicbrainz_release_id: result.releaseId, created_at: Date.now(),
        session_count: 0,
      };
      handlePickSong(song);
    } catch { } finally { setSaving(false); }
  };

  const assignManual = async () => {
    if (!searchQuery.trim()) return;
    setSaving(true);
    try {
      const songId = await invoke<number>('create_song', {
        title: searchQuery.trim(), artist: null, genre: null, album: null,
        year: null, coverUrl: null, spotifyUrl: null, mbRecordingId: null, mbReleaseId: null,
      });
      handlePickSong({ id: songId, title: searchQuery.trim(), artist: null, genre: null, album: null, year: null, cover_url: null, spotify_url: null, musicbrainz_recording_id: null, musicbrainz_release_id: null, created_at: Date.now(), session_count: 0 });
    } catch { } finally { setSaving(false); }
  };

  const durationLabel = (() => {
    const m = Math.floor(durationSeconds / 60), s = durationSeconds % 60;
    if (m > 0 && s > 0) return `${m}m ${s}s`;
    return m > 0 ? `${m}m` : `${s}s`;
  })();

  // For step 2: sort practice types by score desc
  const sortedPracticeTypes = useMemo(() => {
    if (!songContext) return ALL_PRACTICE_TYPES;
    return [...ALL_PRACTICE_TYPES].sort((a, b) => songContext.scores[b.id] - songContext.scores[a.id]);
  }, [songContext]);

  const featuredType = sortedPracticeTypes[0];
  const altTypes = sortedPracticeTypes.slice(1);

  return (
    <>
      {/* Backdrop */}
      <motion.div
        className="fixed inset-0 bg-black/70 z-50"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={step === 'song' ? onClose : undefined}
      />

      {/* Card */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <motion.div
          className="bg-[#16161d] border border-white/8 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden pointer-events-auto"
          initial={{ opacity: 0, scale: 0.96, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97, y: 12 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        >
          {/* ── Header ── */}
          <div className="px-5 pt-5 pb-4 border-b border-white/5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center">
                  <span className="text-lg">🎹</span>
                </div>
                <div>
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={step + (celebrating ? '-celebrate' : '')}
                      className="text-sm font-semibold text-white"
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.15 }}
                    >
                      {step === 'song' && 'Great session!'}
                      {step === 'details' && 'How did it go?'}
                      {step === 'suggest' && 'Level up? 🎉'}
                      {step === 'done' && (celebrating ? '🎉 Level up!' : 'Session saved!')}
                    </motion.div>
                  </AnimatePresence>
                  <div className="text-xs text-slate-500">
                    {durationSeconds > 0 ? `${durationLabel} of practice` : 'Practice session'}
                  </div>
                </div>
              </div>
              {step === 'song' && <span className="text-xs text-slate-600">{countdown}s</span>}
            </div>
            {step === 'song' && (
              <div className="mt-3 h-0.5 bg-white/5 rounded-full overflow-hidden">
                <div className="h-full bg-sky-500/40 rounded-full transition-all duration-1000" style={{ width: `${(countdown / AUTO_DISMISS_SECS) * 100}%` }} />
              </div>
            )}
          </div>

          {/* ── Step content (animated) ── */}
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
            >

          {/* ── Step: Song picker ── */}
          {step === 'song' && (
            <div className="px-5 py-4 space-y-3">
              {!showSearch ? (
                <>
                  <p className="text-xs text-slate-500">What did you practice?</p>

                  {recentSongs.length > 0 && (
                    <div className="space-y-1">
                      {recentSongs.slice(0, 5).map(song => {
                        const ctx = getSongContext(song);
                        return (
                          <button
                            key={song.id}
                            onClick={() => handlePickSong(song)}
                            className="w-full flex items-center gap-3 p-2.5 rounded-xl bg-white/3 hover:bg-sky-500/8 border border-white/5 hover:border-sky-500/20 transition-all text-left group"
                          >
                            <SongCover song={song} size={38} />
                            <div className="min-w-0 flex-1">
                              <div className="text-sm text-white truncate font-medium">{song.title}</div>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                {ctx.narrative && (
                                  <span className="text-[11px] text-slate-500 truncate">{ctx.narrative}</span>
                                )}
                                <SongContextBadge context={ctx} />
                              </div>
                            </div>
                            {/* avg mood emoji */}
                            {song.avg_feeling != null && (
                              <span className="text-base flex-shrink-0 opacity-70">
                                {MOOD_EMOJIS[Math.round(song.avg_feeling) - 1] ?? ''}
                              </span>
                            )}
                            <svg className="w-3.5 h-3.5 text-slate-700 group-hover:text-slate-500 flex-shrink-0 transition-colors" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M6 4l4 4-4 4"/></svg>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  <button
                    onClick={() => { stopCountdown(); setShowSearch(true); }}
                    className="w-full flex items-center justify-center gap-2 p-2.5 rounded-xl border border-dashed border-white/8 hover:border-sky-500/25 text-slate-500 hover:text-sky-400 text-sm transition-all"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="6.5" cy="6.5" r="4"/><path d="M14 14l-3-3"/></svg>
                    Search for another song
                  </button>

                  <button onClick={handleSkip} className="w-full text-[11px] text-slate-700 hover:text-slate-500 py-1 transition-colors">
                    Skip — I'll tag it later
                  </button>
                </>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <button onClick={() => { setShowSearch(false); setSearchQuery(''); setSearchResults([]); }} className="text-slate-500 hover:text-slate-300 transition-colors flex-shrink-0">
                      <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M10 12L6 8l4-4"/></svg>
                    </button>
                    <input
                      autoFocus value={searchQuery}
                      onChange={e => handleSearchChange(e.target.value)}
                      placeholder="Artist or title…"
                      className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 outline-none focus:border-sky-500/40"
                    />
                    {searching && <div className="w-4 h-4 border-2 border-sky-500/30 border-t-sky-500 rounded-full animate-spin flex-shrink-0" />}
                  </div>

                  <div className="space-y-1.5 max-h-56 overflow-y-auto">
                    {searchResults.map(r => (
                      <button key={r.recordingId} onClick={() => assignFromSearch(r)} disabled={saving}
                        className="w-full flex items-center gap-3 p-2.5 rounded-xl bg-white/3 hover:bg-sky-500/8 border border-white/5 hover:border-sky-500/20 transition-all text-left disabled:opacity-50"
                      >
                        <div className="w-9 h-9 flex-shrink-0 rounded-lg overflow-hidden bg-white/5">
                          {r.coverUrl ? <Image src={r.coverUrl} alt={r.title} className="w-9 h-9 object-cover" removeWrapper /> : <div className="w-9 h-9 flex items-center justify-center">🎵</div>}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm text-white truncate font-medium">{r.title}</div>
                          <div className="text-xs text-slate-500 truncate">{r.artist}{r.year ? ` · ${r.year}` : ''}</div>
                        </div>
                      </button>
                    ))}
                    {searchQuery.trim() && searchResults.length === 0 && !searching && (
                      <button onClick={assignManual} disabled={saving}
                        className="w-full p-2.5 rounded-xl border border-dashed border-white/10 text-slate-400 text-sm hover:border-sky-500/25 hover:text-sky-400 transition-all disabled:opacity-50"
                      >
                        Add "{searchQuery.trim()}" without metadata
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Step: Practice details ── */}
          {step === 'details' && selectedSong && songContext && (
            <div className="px-5 py-4 space-y-4">

              {/* Song context card */}
              <div className="flex items-center gap-3 p-3 rounded-xl bg-white/3 border border-white/5">
                <SongCover song={selectedSong} size={40} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-white truncate">{selectedSong.title}</div>
                  <div className="text-xs text-slate-500 truncate">{songContext.narrative || (selectedSong.artist ?? 'New song')}</div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <SongContextBadge context={songContext} />
                  <button
                    onClick={() => { setSelectedSong(null); setPracticeType(null); setStep('song'); setCountdown(AUTO_DISMISS_SECS); }}
                    className="text-[10px] text-slate-600 hover:text-slate-400 ml-1"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Smart headline */}
              <p className="text-xs text-slate-400 leading-relaxed">{songContext.headline}</p>

              {/* Practice type — featured + alternatives */}
              <div className="space-y-2">
                {/* Featured (suggested) tile — full width, prominent */}
                <button
                  onClick={() => setPracticeType(featuredType.id)}
                  className={`w-full flex items-center gap-4 p-3.5 rounded-xl border-2 transition-all text-left ${
                    practiceType === featuredType.id
                      ? 'border-sky-500/50 bg-sky-500/12 shadow-[0_0_20px_rgba(14,165,233,0.1)]'
                      : 'border-sky-500/15 bg-sky-500/4 hover:border-sky-500/30 hover:bg-sky-500/8'
                  }`}
                >
                  <span className="text-3xl flex-shrink-0">{featuredType.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-white">{featuredType.label}</span>
                      <span className="text-[9px] font-medium uppercase tracking-wider bg-sky-500/20 text-sky-400 px-1.5 py-0.5 rounded-full flex-shrink-0">Suggested</span>
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">{featuredType.desc}</div>
                  </div>
                  <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 transition-all ${
                    practiceType === featuredType.id ? 'bg-sky-500 border-sky-500' : 'border-slate-600'
                  }`} />
                </button>

                {/* Alt tiles — compact row */}
                <div className="grid grid-cols-3 gap-1.5">
                  {altTypes.map(pt => (
                    <button
                      key={pt.id}
                      onClick={() => setPracticeType(pt.id)}
                      className={`flex flex-col items-center gap-1 py-2.5 px-2 rounded-xl border transition-all text-center ${
                        practiceType === pt.id
                          ? 'border-sky-500/40 bg-sky-500/12 text-sky-300'
                          : 'border-white/5 bg-white/3 text-slate-400 hover:bg-white/6 hover:border-white/10 hover:text-slate-200'
                      }`}
                    >
                      <span className="text-lg">{pt.icon}</span>
                      <span className="text-[10px] font-medium leading-tight">{pt.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Mood */}
              <div>
                <div className="text-xs text-slate-500 mb-2">How did it feel?</div>
                <div className="flex gap-1.5">
                  {MOOD_EMOJIS.map((emoji, i) => (
                    <button
                      key={i}
                      onClick={() => setFeeling(feeling === i + 1 ? null : i + 1)}
                      title={['Rough', 'Meh', 'Okay', 'Good', 'Great!'][i]}
                      className={`flex-1 py-2 rounded-xl border text-xl transition-all ${
                        feeling === i + 1
                          ? 'bg-sky-500/15 border-sky-500/40 scale-110 shadow-[0_0_12px_rgba(14,165,233,0.2)]'
                          : 'bg-white/3 border-white/5 hover:bg-white/6 opacity-50 hover:opacity-90'
                      }`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>

              {/* Note */}
              <Textarea
                value={note}
                onValueChange={setNote}
                placeholder="Quick note? (optional — what went well, what to focus on next…)"
                minRows={2}
                maxRows={3}
                variant="bordered"
                classNames={{
                  input: 'text-sm text-white bg-transparent resize-none placeholder:text-slate-700',
                  inputWrapper: 'bg-white/3 border-white/8 hover:border-white/15 focus-within:!border-sky-500/40',
                }}
              />

              {/* Actions */}
              <div className="flex gap-2 pt-1">
                <Button variant="flat" size="sm" className="bg-white/5 text-slate-400"
                  onPress={() => { setStep('song'); setCountdown(AUTO_DISMISS_SECS); }}
                >Back</Button>
                <Button color="primary" size="sm" className="flex-1" isLoading={saving} onPress={handleSave}>
                  Save session
                </Button>
              </div>
            </div>
          )}

          {/* ── Step: Mastery suggestion ── */}
          {step === 'suggest' && suggestion && (
            <div className="px-5 py-6 space-y-5 text-center">
              <div className="text-4xl">🎖️</div>
              <div>
                <div className="text-base font-semibold text-white mb-1">You're making great progress!</div>
                <p className="text-sm text-slate-400 leading-relaxed">
                  Based on your recent sessions with{' '}
                  <span className="text-white font-medium">{suggestion.song_title}</span>,
                  you look ready to move from{' '}
                  <span className={STAGE_COLORS[suggestion.current_status]}>{STAGE_LABELS[suggestion.current_status]}</span>{' '}
                  to{' '}
                  <span className={STAGE_COLORS[suggestion.suggested_status]}>{STAGE_LABELS[suggestion.suggested_status]}</span>.
                </p>
              </div>
              <div className="flex items-center justify-center gap-3">
                <Chip variant="flat" size="sm" className={`${STAGE_COLORS[suggestion.current_status]} bg-white/5 border border-white/10`}>
                  {STAGE_LABELS[suggestion.current_status]}
                </Chip>
                <svg className="w-4 h-4 text-slate-500" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M4 8h8M9 5l3 3-3 3"/></svg>
                <Chip variant="flat" size="sm" className={`${STAGE_COLORS[suggestion.suggested_status]} bg-white/5 border border-white/10`}>
                  {STAGE_LABELS[suggestion.suggested_status]}
                </Chip>
              </div>
              <div className="flex gap-2">
                <Button variant="flat" size="sm" className="flex-1 bg-white/5 text-slate-400" onPress={handleDeclineLevelUp}>Not yet</Button>
                <Button size="sm" className="flex-1 bg-gradient-to-r from-sky-500 to-indigo-500 text-white font-medium" isLoading={saving} onPress={handleConfirmLevelUp}>
                  Yes, level up! 🚀
                </Button>
              </div>
            </div>
          )}

          {/* ── Step: Done / celebration ── */}
          {step === 'done' && (
            <div className="px-5 py-10 text-center space-y-4">
              {celebrating ? (
                <>
                  <motion.div
                    className="text-5xl mx-auto"
                    initial={{ scale: 0, rotate: -20 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: 'spring', stiffness: 260, damping: 16 }}
                  >🎉</motion.div>
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 }}
                  >
                    <div className="text-base font-semibold text-white">
                      {suggestion?.song_title} levelled up to{' '}
                      <span className={STAGE_COLORS[suggestion?.suggested_status ?? 'learning']}>
                        {STAGE_LABELS[suggestion?.suggested_status ?? 'learning']}
                      </span>!
                    </div>
                    <p className="text-sm text-slate-400 mt-1">Keep up the amazing work 🎹</p>
                  </motion.div>
                </>
              ) : (
                <>
                  <AnimatedCheck />
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.55 }}
                    className="text-sm text-slate-300"
                  >
                    Session saved!
                  </motion.div>
                </>
              )}
            </div>
          )}

            </motion.div>
          </AnimatePresence>

        </motion.div>
      </div>
    </>
  );
}

// ── Animated SVG checkmark ─────────────────────────────────────────────────

function AnimatedCheck() {
  return (
    <div className="w-16 h-16 mx-auto">
      <svg viewBox="0 0 64 64" className="w-full h-full" fill="none">
        {/* Track ring */}
        <circle cx="32" cy="32" r="26" stroke="rgba(255,255,255,0.06)" strokeWidth="3" />
        {/* Animated ring — rotate so it starts at 12 o'clock */}
        <motion.circle
          cx="32" cy="32" r="26"
          stroke="#0ea5e9"
          strokeWidth="3"
          strokeLinecap="round"
          fill="none"
          transform="rotate(-90 32 32)"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.45, ease: 'easeOut' }}
        />
        {/* Checkmark */}
        <motion.path
          d="M20 33 L28 41 L44 25"
          stroke="#0ea5e9"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.25, ease: 'easeOut', delay: 0.4 }}
        />
      </svg>
    </div>
  );
}

function fireConfetti() {
  const end = Date.now() + 2500;
  const colors = ['#0ea5e9', '#6366f1', '#a78bfa', '#34d399', '#fbbf24'];
  const frame = () => {
    confetti({ particleCount: 3, angle: 60, spread: 55, origin: { x: 0 }, colors });
    confetti({ particleCount: 3, angle: 120, spread: 55, origin: { x: 1 }, colors });
    if (Date.now() < end) requestAnimationFrame(frame);
  };
  frame();
}
