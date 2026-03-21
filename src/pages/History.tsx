import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useSessions } from '../hooks/useData';
import { useSongs } from '../hooks/useSongs';
import { useMidiEvents } from '../hooks/useSongs';
import { SessionRecord, SongRecord } from '../types';
import { formatDurationLong, formatTime, formatDate } from '../utils';
import PianoRoll from '../components/PianoRoll';
import SongSearchModal from '../components/SongSearchModal';

// ── Session Detail Panel ─────────────────────────────────────────────────────

function SessionDetailPanel({
  session,
  onClose,
  onUpdate,
}: {
  session: SessionRecord;
  onClose: () => void;
  onUpdate: () => void;
}) {
  const { data: events, loading: eventsLoading } = useMidiEvents(session.id);
  const [showSongModal, setShowSongModal] = useState(false);
  const [note, setNote] = useState(session.note ?? '');
  const [editingNote, setEditingNote] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [exportingMidi, setExportingMidi] = useState(false);

  const saveNote = async () => {
    setSavingNote(true);
    try {
      await invoke('update_session_note', { id: session.id, note });
      setEditingNote(false);
      onUpdate();
    } finally {
      setSavingNote(false);
    }
  };

  const exportMidi = async () => {
    setExportingMidi(true);
    try {
      const bytes = await invoke<number[]>('export_midi_file', { sessionId: session.id });
      const blob = new Blob([new Uint8Array(bytes)], { type: 'audio/midi' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `session-${session.date}-${session.id}.mid`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('MIDI export failed', e);
    } finally {
      setExportingMidi(false);
    }
  };

  const unlinkSong = async () => {
    try {
      await invoke('unlink_session_song', { sessionId: session.id });
      onUpdate();
    } catch {}
  };

  const durationMs = (session.end_ts - session.start_ts);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-[#16161d] border border-white/8 rounded-t-2xl w-full max-w-3xl max-h-[85vh] overflow-y-auto shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {showSongModal && (
          <SongSearchModal
            sessionId={session.id}
            recentSongs={[]}
            onAssigned={onUpdate}
            onClose={() => setShowSongModal(false)}
          />
        )}

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
          <div>
            <div className="text-base font-semibold text-white">{formatDate(session.date)}</div>
            <div className="text-xs text-slate-500">{formatTime(session.start_ts)} → {formatTime(session.end_ts)}</div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sky-400 font-semibold">{formatDurationLong(session.duration_seconds)}</span>
            <button onClick={onClose} className="text-slate-500 hover:text-slate-200 text-lg">✕</button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Song card */}
          <div>
            <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">Song</div>
            {session.song ? (
              <div className="flex items-center gap-4 p-3 bg-[#1e1e2c] rounded-xl border border-white/5">
                {session.song.cover_url ? (
                  <img
                    src={session.song.cover_url}
                    alt={session.song.title}
                    className="w-14 h-14 rounded-lg object-cover flex-shrink-0"
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                ) : (
                  <div className="w-14 h-14 rounded-lg bg-[#252535] flex items-center justify-center text-2xl flex-shrink-0">🎵</div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-white truncate">{session.song.title}</div>
                  {session.song.artist && <div className="text-xs text-slate-400 truncate">{session.song.artist}</div>}
                  <div className="flex flex-wrap gap-2 mt-1.5">
                    {session.song.genre && (
                      <span className="px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-400 text-[10px]">{session.song.genre}</span>
                    )}
                    {session.song.album && (
                      <span className="px-2 py-0.5 rounded-full bg-slate-700/50 text-slate-400 text-[10px]">{session.song.album}</span>
                    )}
                    {session.song.year && (
                      <span className="px-2 py-0.5 rounded-full bg-slate-700/50 text-slate-400 text-[10px]">{session.song.year}</span>
                    )}
                    {session.song.spotify_url && (
                      <a
                        href={session.song.spotify_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 text-[10px] hover:bg-green-500/25 transition-colors"
                        onClick={e => e.stopPropagation()}
                      >
                        🎧 Spotify
                      </a>
                    )}
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <button
                    onClick={() => setShowSongModal(true)}
                    className="text-xs text-slate-400 hover:text-white transition-colors"
                  >
                    Change
                  </button>
                  <button
                    onClick={unlinkSong}
                    className="text-xs text-slate-600 hover:text-red-400 transition-colors"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowSongModal(true)}
                className="w-full flex items-center gap-3 p-3 rounded-xl border border-dashed border-white/10 hover:border-sky-500/30 text-sm text-slate-500 hover:text-slate-300 transition-colors"
              >
                <span className="text-lg">🎵</span>
                Tag this session with a song…
              </button>
            )}
          </div>

          {/* Piano Roll */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">Piano Roll</div>
              {events.length > 0 && (
                <button
                  onClick={exportMidi}
                  disabled={exportingMidi}
                  className="flex items-center gap-1.5 px-3 py-1 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/20 hover:border-sky-500/40 rounded-lg text-xs text-sky-400 transition-all disabled:opacity-50"
                >
                  ⬇ Export .mid
                </button>
              )}
            </div>
            {eventsLoading ? (
              <div className="h-32 flex items-center justify-center text-slate-500 text-sm">Loading events…</div>
            ) : events.length === 0 ? (
              <div className="h-32 flex items-center justify-center text-slate-600 text-sm bg-[#1e1e2c] rounded-xl border border-white/5">
                No MIDI events recorded
              </div>
            ) : (
              <PianoRoll events={events} durationMs={durationMs} />
            )}
          </div>

          {/* Note */}
          <div>
            <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">Practice Note</div>
            {editingNote ? (
              <div className="flex gap-2">
                <input
                  autoFocus
                  className="flex-1 bg-[#252533] border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-sky-500/50"
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder="What did you practice?"
                  onKeyDown={e => { if (e.key === 'Enter') saveNote(); if (e.key === 'Escape') setEditingNote(false); }}
                />
                <button
                  onClick={saveNote}
                  disabled={savingNote}
                  className="px-3 py-2 bg-sky-500 hover:bg-sky-600 text-white text-sm rounded-lg transition-colors disabled:opacity-50"
                >
                  Save
                </button>
              </div>
            ) : (
              <button
                onClick={() => setEditingNote(true)}
                className="w-full text-left p-3 rounded-xl bg-[#1e1e2c] border border-white/5 hover:border-white/10 transition-colors"
              >
                {session.note ? (
                  <span className="text-sm text-slate-300 italic">"{session.note}"</span>
                ) : (
                  <span className="text-sm text-slate-600">+ Add a practice note…</span>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Session Row ──────────────────────────────────────────────────────────────

function SessionRow({ session, onUpdate }: { session: SessionRecord; onUpdate: () => void }) {
  const [showDetail, setShowDetail] = useState(false);

  return (
    <>
      {showDetail && (
        <SessionDetailPanel
          session={session}
          onClose={() => setShowDetail(false)}
          onUpdate={() => { onUpdate(); }}
        />
      )}
      <button
        className="w-full text-left bg-[#1e1e28] rounded-xl p-4 border border-white/5 hover:border-white/10 transition-colors"
        onClick={() => setShowDetail(true)}
      >
        <div className="flex items-center gap-4">
          {/* Song cover or color bar */}
          {session.song?.cover_url ? (
            <img
              src={session.song.cover_url}
              alt={session.song.title}
              className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          ) : (
            <div className={`w-1 h-12 rounded-full flex-shrink-0 ${session.song ? 'bg-violet-500/60' : 'bg-sky-500/40'}`} />
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <div className="text-sm font-medium text-white">{formatDate(session.date)}</div>
              {session.song && (
                <span className="text-xs text-violet-400 truncate max-w-[160px]">{session.song.title}</span>
              )}
            </div>
            <div className="text-xs text-slate-500 mt-0.5">
              {formatTime(session.start_ts)} → {formatTime(session.end_ts)}
              {session.song?.artist && <span className="ml-2 text-slate-600">· {session.song.artist}</span>}
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <div className="text-sky-400 font-semibold text-sm">{formatDurationLong(session.duration_seconds)}</div>
            <div className="text-[10px] text-slate-600 mt-0.5">tap for detail →</div>
          </div>
        </div>
        {session.note && (
          <div className="mt-2 text-xs text-slate-500 italic pl-5">"{session.note}"</div>
        )}
      </button>
    </>
  );
}

// ── By Song tab ──────────────────────────────────────────────────────────────

function BySongTab({ songs }: { songs: SongRecord[] }) {
  if (songs.length === 0) {
    return <EmptyState label="No songs tagged yet. Tag a session to see them here." />;
  }
  return (
    <div className="space-y-3">
      {songs.map(song => (
        <div key={song.id} className="bg-[#1e1e28] rounded-xl p-4 border border-white/5 flex items-center gap-4">
          {song.cover_url ? (
            <img
              src={song.cover_url}
              alt={song.title}
              className="w-14 h-14 rounded-xl object-cover flex-shrink-0"
              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          ) : (
            <div className="w-14 h-14 rounded-xl bg-[#252535] flex items-center justify-center text-2xl flex-shrink-0">🎵</div>
          )}
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-white truncate">{song.title}</div>
            <div className="text-xs text-slate-400 truncate">{song.artist ?? 'Unknown Artist'}</div>
            <div className="flex flex-wrap gap-2 mt-1.5">
              {song.genre && (
                <span className="px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-400 text-[10px]">{song.genre}</span>
              )}
              {song.album && (
                <span className="px-2 py-0.5 rounded-full bg-slate-700/50 text-slate-400 text-[10px]">{song.album}</span>
              )}
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <div className="text-sky-400 font-semibold text-sm">
              {formatDurationLong(song.total_seconds ?? 0)}
            </div>
            <div className="text-xs text-slate-500 mt-0.5">
              {song.session_count ?? 0} session{song.session_count !== 1 ? 's' : ''}
            </div>
            {song.last_played_date && (
              <div className="text-[10px] text-slate-600 mt-0.5">Last: {song.last_played_date}</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── By Artist tab ────────────────────────────────────────────────────────────

interface ArtistGroup {
  artist: string;
  totalSeconds: number;
  sessionCount: number;
  songs: SongRecord[];
}

function ByArtistTab({ songs }: { songs: SongRecord[] }) {
  const groups: ArtistGroup[] = Object.values(
    songs.reduce((acc, s) => {
      const key = s.artist ?? 'Unknown Artist';
      if (!acc[key]) acc[key] = { artist: key, totalSeconds: 0, sessionCount: 0, songs: [] };
      acc[key].totalSeconds += s.total_seconds ?? 0;
      acc[key].sessionCount += s.session_count ?? 0;
      acc[key].songs.push(s);
      return acc;
    }, {} as Record<string, ArtistGroup>)
  ).sort((a, b) => b.totalSeconds - a.totalSeconds);

  if (groups.length === 0) return <EmptyState label="No artists yet. Tag sessions with songs to see them grouped by artist." />;

  return (
    <div className="space-y-4">
      {groups.map(g => (
        <div key={g.artist} className="bg-[#1e1e28] rounded-xl border border-white/5 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
            <div className="font-medium text-white text-sm">{g.artist}</div>
            <div className="text-xs text-slate-400">{formatDurationLong(g.totalSeconds)} · {g.sessionCount} sessions</div>
          </div>
          <div className="p-3 flex flex-wrap gap-2">
            {g.songs.map(s => (
              <div key={s.id} className="flex items-center gap-2 px-2.5 py-1 bg-[#252535] rounded-lg text-xs text-slate-300">
                {s.cover_url && (
                  <img src={s.cover_url} alt="" className="w-4 h-4 rounded object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                )}
                {s.title}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── By Genre tab ─────────────────────────────────────────────────────────────

interface GenreGroup {
  genre: string;
  totalSeconds: number;
  sessionCount: number;
  songs: SongRecord[];
}

function ByGenreTab({ songs }: { songs: SongRecord[] }) {
  const groups: GenreGroup[] = Object.values(
    songs.reduce((acc, s) => {
      const key = s.genre ?? 'Unclassified';
      if (!acc[key]) acc[key] = { genre: key, totalSeconds: 0, sessionCount: 0, songs: [] };
      acc[key].totalSeconds += s.total_seconds ?? 0;
      acc[key].sessionCount += s.session_count ?? 0;
      acc[key].songs.push(s);
      return acc;
    }, {} as Record<string, GenreGroup>)
  ).sort((a, b) => b.totalSeconds - a.totalSeconds);

  if (groups.length === 0) return <EmptyState label="No genres yet. Songs with genre data will appear here." />;

  const GENRE_COLORS: Record<string, string> = {
    classical: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
    jazz: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
    pop: 'bg-pink-500/15 text-pink-400 border-pink-500/20',
    rock: 'bg-red-500/15 text-red-400 border-red-500/20',
    electronic: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/20',
    default: 'bg-violet-500/15 text-violet-400 border-violet-500/20',
  };

  const colorFor = (genre: string) => {
    const key = genre.toLowerCase();
    return GENRE_COLORS[key] ?? GENRE_COLORS.default;
  };

  return (
    <div className="space-y-4">
      {groups.map(g => (
        <div key={g.genre} className={`rounded-xl border p-4 ${colorFor(g.genre).replace('text-', 'border-').split(' ')[2]}`}>
          <div className="flex items-center justify-between mb-3">
            <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${colorFor(g.genre)}`}>{g.genre}</span>
            <div className="text-xs text-slate-400">{formatDurationLong(g.totalSeconds)} · {g.sessionCount} sessions</div>
          </div>
          <div className="flex flex-wrap gap-2">
            {g.songs.map(s => (
              <div key={s.id} className="flex items-center gap-2 px-2.5 py-1 bg-[#1a1a28] rounded-lg text-xs text-slate-300">
                {s.cover_url && (
                  <img src={s.cover_url} alt="" className="w-4 h-4 rounded object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                )}
                <span className="truncate max-w-[120px]">{s.title}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Empty State ───────────────────────────────────────────────────────────────

function EmptyState({ label }: { label: string }) {
  return (
    <div className="text-center py-20 text-slate-500">
      <div className="text-4xl mb-3">🎹</div>
      <div className="text-sm max-w-xs mx-auto">{label}</div>
    </div>
  );
}

// ── Main History Page ─────────────────────────────────────────────────────────

type Tab = 'timeline' | 'songs' | 'artists' | 'genres';

export default function History() {
  const { data: sessions, refresh } = useSessions(500);
  const { data: songs } = useSongs();
  const [tab, setTab] = useState<Tab>('timeline');

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'timeline', label: 'Timeline', icon: '📋' },
    { id: 'songs', label: 'By Song', icon: '🎵' },
    { id: 'artists', label: 'By Artist', icon: '🎤' },
    { id: 'genres', label: 'By Genre', icon: '🎼' },
  ];

  // Group timeline sessions by month
  const grouped = sessions.reduce((acc, s) => {
    const month = s.date.slice(0, 7);
    if (!acc[month]) acc[month] = [];
    acc[month].push(s);
    return acc;
  }, {} as Record<string, SessionRecord[]>);
  const months = Object.keys(grouped).sort().reverse();

  return (
    <div className="p-8 fade-in">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white">History</h1>
        <p className="text-slate-500 text-sm mt-1">
          {sessions.length} sessions · {songs.length} songs tagged
        </p>
      </div>

      {/* Tab Bar */}
      <div className="flex gap-1 bg-[#1e1e28] rounded-xl p-1 mb-6 border border-white/5">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded-lg transition-colors ${
              tab === t.id
                ? 'bg-sky-500/20 text-sky-400'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <span>{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === 'timeline' && (
        months.length === 0 ? (
          <EmptyState label="No sessions yet. Start playing to record your first session!" />
        ) : (
          <div className="space-y-8">
            {months.map(month => {
              const monthSessions = grouped[month];
              const totalSeconds = monthSessions.reduce((s, x) => s + x.duration_seconds, 0);
              const [year, m] = month.split('-');
              const monthLabel = new Date(parseInt(year), parseInt(m) - 1)
                .toLocaleDateString([], { month: 'long', year: 'numeric' });

              return (
                <div key={month}>
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-sm font-medium text-slate-400">{monthLabel}</h2>
                    <span className="text-xs text-slate-500">
                      {monthSessions.length} sessions · {formatDurationLong(totalSeconds)}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {monthSessions.map(s => (
                      <SessionRow key={s.id} session={s} onUpdate={refresh} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {tab === 'songs' && <BySongTab songs={songs} />}
      {tab === 'artists' && <ByArtistTab songs={songs} />}
      {tab === 'genres' && <ByGenreTab songs={songs} />}
    </div>
  );
}

