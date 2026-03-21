import { useState, useEffect, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Modal, ModalContent, ModalBody, Button, Textarea, Image, Chip } from '@heroui/react';
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

const PRACTICE_TYPES: { id: PracticeType; icon: string; label: string; desc: string }[] = [
  { id: 'first',       icon: '🎯', label: 'First listen',      desc: 'Just getting familiar' },
  { id: 'section',     icon: '📖', label: 'Learning sections', desc: 'Focused on a specific part' },
  { id: 'full',        icon: '🔄', label: 'Run-through',       desc: 'Playing the whole song' },
  { id: 'performance', icon: '✨', label: 'Polish run',        desc: 'Confident, performance quality' },
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

// ── component ──────────────────────────────────────────────────────────────

export default function SessionTagModal({ sessionId, durationSeconds, onClose, devSuggestion }: Props) {
  const [step, setStep] = useState<Step>(devSuggestion ? 'suggest' : 'song');
  const [selectedSong, setSelectedSong] = useState<SongRecord | null>(null);
  const [practiceType, setPracticeType] = useState<PracticeType | null>(null);
  const [feeling, setFeeling] = useState<number | null>(null);
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

  // Load recent songs
  useEffect(() => {
    invoke<SongRecord[]>('get_recent_songs', { limit: 5 }).then(setRecentSongs).catch(() => {});
  }, []);

  // Countdown auto-dismiss (only on the song step)
  useEffect(() => {
    if (step !== 'song') return;
    timerRef.current = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) { onClose(); return 0; }
        return c - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [step, onClose]);

  const stopCountdown = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  };

  const handlePickSong = (song: SongRecord) => {
    stopCountdown();
    setSelectedSong(song);
    setStep('details');
  };

  const handleSkip = async () => {
    stopCountdown();
    // Save with no song, no feeling
    await saveTag(null, null, null, null);
  };

  const saveTag = async (
    songId: number | null,
    f: number | null,
    pt: PracticeType | null,
    n: string | null,
  ) => {
    setSaving(true);
    try {
      const result = await invoke<MasterySuggestion | null>('tag_session', {
        sessionId,
        songId,
        feeling: f,
        practiceType: pt,
        note: n && n.trim() ? n.trim() : null,
      });
      if (result) {
        setSuggestion(result);
        setStep('suggest');
      } else {
        setStep('done');
        setTimeout(onClose, 1200);
      }
    } catch { /* silently ignore */ } finally {
      setSaving(false);
    }
  };

  const handleSave = () => {
    saveTag(selectedSong?.id ?? null, feeling, practiceType, note);
  };

  const handleConfirmLevelUp = async () => {
    if (!suggestion) return;
    setSaving(true);
    try {
      await invoke('confirm_mastery_advance', {
        songId: suggestion.song_id,
        newStatus: suggestion.suggested_status,
      });
      setCelebrating(true);
      fireConfetti();
      setTimeout(() => { setCelebrating(false); setStep('done'); setTimeout(onClose, 1500); }, 3000);
    } catch { } finally {
      setSaving(false);
    }
  };

  const handleDeclineLevelUp = () => {
    setStep('done');
    setTimeout(onClose, 1200);
  };

  // MusicBrainz / iTunes search
  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const res = await searchRecordings(q);
      setSearchResults(res);
    } catch { } finally { setSearching(false); }
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
        spotifyUrl: result.spotifyUrl, mbRecordingId: result.recordingId,
        mbReleaseId: result.releaseId,
      });
      const songs = await invoke<SongRecord[]>('get_recent_songs', { limit: 20 });
      const song = songs.find(s => s.id === songId) ?? {
        id: songId, title: result.title, artist: result.artist, genre: result.genre,
        album: result.album, year: result.year, cover_url: result.coverUrl,
        spotify_url: result.spotifyUrl, musicbrainz_recording_id: result.recordingId,
        musicbrainz_release_id: result.releaseId, created_at: Date.now(),
      } as SongRecord;
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
      const song: SongRecord = {
        id: songId, title: searchQuery.trim(), artist: null, genre: null, album: null,
        year: null, cover_url: null, spotify_url: null,
        musicbrainz_recording_id: null, musicbrainz_release_id: null, created_at: Date.now(),
      };
      handlePickSong(song);
    } catch { } finally { setSaving(false); }
  };

  const durationLabel = (() => {
    const m = Math.floor(durationSeconds / 60);
    const s = durationSeconds % 60;
    if (m > 0 && s > 0) return `${m}m ${s}s`;
    if (m > 0) return `${m}m`;
    return `${s}s`;
  })();

  return (
    <Modal
      isOpen
      onClose={onClose}
      size="md"
      isDismissable={step === 'song'}
      classNames={{
        backdrop: 'bg-black/75',
        base: 'bg-[#16161d] border border-white/8 shadow-2xl',
        body: 'p-0',
      }}
    >
      <ModalContent>
        <ModalBody>
          {/* Header */}
          <div className="px-5 pt-5 pb-4 border-b border-white/5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center">
                  <span className="text-lg">🎹</span>
                </div>
                <div>
                  <div className="text-sm font-semibold text-white">
                    {step === 'song' && 'Great session!'}
                    {step === 'details' && 'How did it go?'}
                    {step === 'suggest' && 'Level up? 🎉'}
                    {step === 'done' && (celebrating ? '🎉 Level up!' : '✓ Session saved!')}
                  </div>
                  <div className="text-xs text-slate-500">{durationLabel} of practice</div>
                </div>
              </div>
              {step === 'song' && (
                <div className="text-xs text-slate-600">
                  {countdown}s
                </div>
              )}
            </div>
            {/* countdown bar */}
            {step === 'song' && (
              <div className="mt-3 h-0.5 bg-white/5 rounded-full overflow-hidden">
                <div
                  className="h-full bg-sky-500/50 rounded-full transition-all duration-1000"
                  style={{ width: `${(countdown / AUTO_DISMISS_SECS) * 100}%` }}
                />
              </div>
            )}
          </div>

          {/* ── Step: Song picker ── */}
          {step === 'song' && (
            <div className="px-5 py-4 space-y-4">
              <p className="text-xs text-slate-400">What did you practice? Pick a song or skip.</p>

              {!showSearch ? (
                <>
                  {/* Recent songs */}
                  {recentSongs.length > 0 && (
                    <div className="space-y-1.5">
                      {recentSongs.slice(0, 5).map(song => (
                        <button
                          key={song.id}
                          onClick={() => handlePickSong(song)}
                          className="w-full flex items-center gap-3 p-2.5 rounded-xl bg-white/3 hover:bg-sky-500/10 border border-white/5 hover:border-sky-500/30 transition-all text-left"
                        >
                          <div className="w-9 h-9 flex-shrink-0 rounded-lg overflow-hidden bg-white/5">
                            {song.cover_url
                              ? <Image src={song.cover_url} alt={song.title} className="w-9 h-9 object-cover" removeWrapper />
                              : <div className="w-9 h-9 flex items-center justify-center text-base">🎵</div>
                            }
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm text-white truncate font-medium">{song.title}</div>
                            <div className="text-xs text-slate-500 truncate">{song.artist ?? 'Unknown Artist'}</div>
                          </div>
                          <svg className="w-4 h-4 text-slate-600 flex-shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M6 4l4 4-4 4"/></svg>
                        </button>
                      ))}
                    </div>
                  )}

                  <button
                    onClick={() => { stopCountdown(); setShowSearch(true); }}
                    className="w-full flex items-center justify-center gap-2 p-2.5 rounded-xl border border-dashed border-white/10 hover:border-sky-500/30 text-slate-400 hover:text-sky-400 text-sm transition-all"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="6.5" cy="6.5" r="4"/><path d="M14 14l-3-3"/></svg>
                    Search for a different song
                  </button>

                  <button
                    onClick={handleSkip}
                    className="w-full text-xs text-slate-600 hover:text-slate-400 py-1 transition-colors"
                  >
                    Skip for now
                  </button>
                </>
              ) : (
                /* Inline search */
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => { setShowSearch(false); setSearchQuery(''); setSearchResults([]); }}
                      className="text-slate-500 hover:text-slate-300 transition-colors"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M10 12L6 8l4-4"/></svg>
                    </button>
                    <input
                      autoFocus
                      value={searchQuery}
                      onChange={e => handleSearchChange(e.target.value)}
                      placeholder="Artist or title…"
                      className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 outline-none focus:border-sky-500/50"
                    />
                    {searching && <div className="w-4 h-4 border-2 border-sky-500/30 border-t-sky-500 rounded-full animate-spin flex-shrink-0" />}
                  </div>

                  <div className="space-y-1.5 max-h-56 overflow-y-auto">
                    {searchResults.map(r => (
                      <button
                        key={r.recordingId}
                        onClick={() => assignFromSearch(r)}
                        disabled={saving}
                        className="w-full flex items-center gap-3 p-2.5 rounded-xl bg-white/3 hover:bg-sky-500/10 border border-white/5 hover:border-sky-500/30 transition-all text-left disabled:opacity-50"
                      >
                        <div className="w-9 h-9 flex-shrink-0 rounded-lg overflow-hidden bg-white/5">
                          {r.coverUrl
                            ? <Image src={r.coverUrl} alt={r.title} className="w-9 h-9 object-cover" removeWrapper />
                            : <div className="w-9 h-9 flex items-center justify-center text-base">🎵</div>
                          }
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm text-white truncate font-medium">{r.title}</div>
                          <div className="text-xs text-slate-500 truncate">{r.artist}{r.year ? ` · ${r.year}` : ''}</div>
                        </div>
                      </button>
                    ))}
                    {searchQuery.trim() && searchResults.length === 0 && !searching && (
                      <button
                        onClick={assignManual}
                        disabled={saving}
                        className="w-full p-2.5 rounded-xl border border-dashed border-white/10 text-slate-400 text-sm hover:border-sky-500/30 hover:text-sky-400 transition-all disabled:opacity-50"
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
          {step === 'details' && selectedSong && (
            <div className="px-5 py-4 space-y-5">
              {/* Selected song pill */}
              <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-sky-500/8 border border-sky-500/20">
                <div className="w-8 h-8 flex-shrink-0 rounded-lg overflow-hidden bg-white/5">
                  {selectedSong.cover_url
                    ? <Image src={selectedSong.cover_url} alt={selectedSong.title} className="w-8 h-8 object-cover" removeWrapper />
                    : <div className="w-8 h-8 flex items-center justify-center text-sm">🎵</div>
                  }
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-white truncate">{selectedSong.title}</div>
                  <div className="text-xs text-slate-500">{selectedSong.artist ?? ''}</div>
                </div>
                <button
                  onClick={() => { setSelectedSong(null); setStep('song'); setCountdown(AUTO_DISMISS_SECS); }}
                  className="text-slate-600 hover:text-slate-400 text-xs flex-shrink-0"
                >
                  Change
                </button>
              </div>

              {/* Practice type */}
              <div>
                <div className="text-xs text-slate-500 mb-2">What kind of practice was this?</div>
                <div className="grid grid-cols-2 gap-2">
                  {PRACTICE_TYPES.map(pt => (
                    <button
                      key={pt.id}
                      onClick={() => setPracticeType(pt.id)}
                      className={`flex flex-col items-start gap-1 p-3 rounded-xl border transition-all text-left ${
                        practiceType === pt.id
                          ? 'bg-sky-500/15 border-sky-500/40 text-sky-300'
                          : 'bg-white/3 border-white/5 text-slate-300 hover:bg-white/6 hover:border-white/10'
                      }`}
                    >
                      <span className="text-xl">{pt.icon}</span>
                      <span className="text-xs font-medium leading-tight">{pt.label}</span>
                      <span className="text-[10px] text-slate-500 leading-tight">{pt.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Mood */}
              <div>
                <div className="text-xs text-slate-500 mb-2">How did it feel?</div>
                <div className="flex gap-2">
                  {MOOD_EMOJIS.map((emoji, i) => (
                    <button
                      key={i}
                      onClick={() => setFeeling(feeling === i ? null : i)}
                      className={`flex-1 py-2 rounded-xl border text-xl transition-all ${
                        feeling === i
                          ? 'bg-sky-500/15 border-sky-500/40 scale-110'
                          : 'bg-white/3 border-white/5 hover:bg-white/6 opacity-60 hover:opacity-100'
                      }`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>

              {/* Note */}
              <div>
                <Textarea
                  value={note}
                  onValueChange={setNote}
                  placeholder="Any notes? (optional)"
                  minRows={2}
                  maxRows={3}
                  variant="bordered"
                  classNames={{
                    input: 'text-sm text-white bg-transparent resize-none',
                    inputWrapper: 'bg-white/3 border-white/10 hover:border-white/20 focus-within:!border-sky-500/50',
                  }}
                />
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-1">
                <Button
                  variant="flat"
                  size="sm"
                  className="flex-1 bg-white/5 text-slate-300"
                  onPress={() => { setStep('song'); setCountdown(AUTO_DISMISS_SECS); }}
                >
                  Back
                </Button>
                <Button
                  color="primary"
                  size="sm"
                  className="flex-1"
                  isLoading={saving}
                  onPress={handleSave}
                >
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
                <p className="text-sm text-slate-400">
                  Based on your recent sessions with{' '}
                  <span className="text-white font-medium">{suggestion.song_title}</span>,
                  you look ready to move from{' '}
                  <span className={STAGE_COLORS[suggestion.current_status]}>
                    {STAGE_LABELS[suggestion.current_status]}
                  </span>{' '}
                  to{' '}
                  <span className={STAGE_COLORS[suggestion.suggested_status]}>
                    {STAGE_LABELS[suggestion.suggested_status]}
                  </span>.
                </p>
              </div>

              {/* Stage visual */}
              <div className="flex items-center justify-center gap-3">
                <Chip
                  variant="flat"
                  size="sm"
                  className={`${STAGE_COLORS[suggestion.current_status]} bg-white/5 border border-white/10`}
                >
                  {STAGE_LABELS[suggestion.current_status]}
                </Chip>
                <svg className="w-4 h-4 text-slate-500" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M4 8h8M9 5l3 3-3 3"/></svg>
                <Chip
                  variant="flat"
                  size="sm"
                  className={`${STAGE_COLORS[suggestion.suggested_status]} bg-white/5 border border-white/10`}
                >
                  {STAGE_LABELS[suggestion.suggested_status]}
                </Chip>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="flat"
                  size="sm"
                  className="flex-1 bg-white/5 text-slate-400"
                  onPress={handleDeclineLevelUp}
                >
                  Not yet
                </Button>
                <Button
                  size="sm"
                  className="flex-1 bg-gradient-to-r from-sky-500 to-indigo-500 text-white font-medium"
                  isLoading={saving}
                  onPress={handleConfirmLevelUp}
                >
                  Yes, level up! 🚀
                </Button>
              </div>
            </div>
          )}

          {/* ── Step: Done / celebration ── */}
          {step === 'done' && (
            <div className="px-5 py-8 text-center space-y-3">
              {celebrating ? (
                <>
                  <div className="text-5xl animate-bounce">🎉</div>
                  <div className="text-base font-semibold text-white">
                    {suggestion?.song_title} levelled up to{' '}
                    <span className={STAGE_COLORS[suggestion?.suggested_status ?? 'learning']}>
                      {STAGE_LABELS[suggestion?.suggested_status ?? 'learning']}
                    </span>!
                  </div>
                  <p className="text-sm text-slate-400">Keep up the amazing work 🎹</p>
                </>
              ) : (
                <>
                  <div className="text-4xl">✓</div>
                  <div className="text-sm text-slate-300">Session saved!</div>
                </>
              )}
            </div>
          )}
        </ModalBody>
      </ModalContent>
    </Modal>
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
