import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Modal, ModalContent, ModalBody,
  Chip, Image, Button, Input, Spinner,
} from '@heroui/react';
import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import type { SongRecord } from '../types';
import { useSongsWithStats, useSongDetail } from '../hooks/useData';
import { formatDurationLong } from '../utils';
import MasteryBadge from '../components/MasteryBadge';
import MoodTrendChart from '../components/MoodTrendChart';
import FeelingPicker, { feelingEmoji } from '../components/FeelingPicker';
import { DifficultyDots, DifficultyPicker } from '../components/DifficultyDots';

// ── Cover art placeholder gradients ─────────────────────────────────────────
const COVER_GRADIENTS = [
  'from-violet-600 to-indigo-600',
  'from-sky-600 to-cyan-500',
  'from-emerald-600 to-teal-500',
  'from-rose-600 to-pink-500',
  'from-amber-600 to-orange-500',
  'from-fuchsia-600 to-purple-600',
];

function coverGradient(title: string) {
  return COVER_GRADIENTS[title.charCodeAt(0) % COVER_GRADIENTS.length];
}

function CoverArt({
  title, coverUrl, size = 56, rounded = 'rounded-xl', className = '',
}: { title: string; coverUrl: string | null; size?: number; rounded?: string; className?: string }) {
  const grad = coverGradient(title);
  const initials = title.slice(0, 2).toUpperCase();
  return (
    <div
      className={`flex-shrink-0 overflow-hidden ${rounded} ${className}`}
      style={{ width: size, height: size }}
    >
      {coverUrl
        ? <Image src={coverUrl} alt={title} className="w-full h-full object-cover" removeWrapper />
        : (
          <div className={`w-full h-full bg-gradient-to-br ${grad} flex items-center justify-center`}>
            <span className="text-white font-bold select-none" style={{ fontSize: size * 0.28 }}>{initials}</span>
          </div>
        )
      }
    </div>
  );
}

// ── Stage config ─────────────────────────────────────────────────────────────
type StageKey = 'learning' | 'practicing' | 'mastered';

const STAGES: Array<{
  key: StageKey;
  label: string;
  icon: string;
  colorText: string;
  colorBg: string;
  colorBorder: string;
  colorAccent: string;
  emptyMsg: string;
}> = [
  {
    key: 'learning',
    label: 'Learning',
    icon: '🌱',
    colorText: 'text-emerald-400',
    colorBg: 'bg-emerald-500/10',
    colorBorder: 'border-emerald-500/30',
    colorAccent: 'bg-emerald-500',
    emptyMsg: 'Tag sessions with songs to start learning',
  },
  {
    key: 'practicing',
    label: 'Practicing',
    icon: '🎵',
    colorText: 'text-sky-400',
    colorBg: 'bg-sky-500/10',
    colorBorder: 'border-sky-500/30',
    colorAccent: 'bg-sky-500',
    emptyMsg: 'Advance songs from Learning when you\'re actively working on them',
  },
  {
    key: 'mastered',
    label: 'Mastered',
    icon: '⭐',
    colorText: 'text-amber-400',
    colorBg: 'bg-amber-500/10',
    colorBorder: 'border-amber-500/30',
    colorAccent: 'bg-amber-500',
    emptyMsg: 'Your completed masterpieces will shine here',
  },
];

// ── Mini Practice Calendar ───────────────────────────────────────────────────
function MiniCalendar({ dates }: { dates: string[] }) {
  const dateSet = new Set(dates);
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const weeks: string[][] = [];
  const start = new Date(today);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7) - 11 * 7);
  for (let w = 0; w < 12; w++) {
    const week: string[] = [];
    for (let d = 0; d < 7; d++) {
      week.push(start.toISOString().slice(0, 10));
      start.setDate(start.getDate() + 1);
    }
    weeks.push(week);
  }
  return (
    <div>
      <div className="flex gap-0.5">
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-0.5">
            {week.map(dateStr => (
              <div
                key={dateStr}
                title={dateStr}
                className={`w-3 h-3 rounded-[2px] transition-colors ${
                  dateStr > todayStr ? 'bg-content3/30' :
                  dateSet.has(dateStr) ? 'bg-primary' : 'bg-content3'
                }`}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 mt-2 text-[10px] text-foreground-500">
        <span className="w-2.5 h-2.5 rounded-[2px] bg-content3 inline-block" /> No practice
        <span className="w-2.5 h-2.5 rounded-[2px] bg-primary inline-block ml-1" /> Practiced
      </div>
    </div>
  );
}

// ── Song Detail Modal ────────────────────────────────────────────────────────
function SongDetailModal({
  songId,
  onClose,
  onSongUpdated,
}: { songId: number | null; onClose: () => void; onSongUpdated: () => void }) {
  const { data: detail, loading, refresh } = useSongDetail(songId);
  const [currentStatus, setCurrentStatus] = useState<string | null>(null);
  const [currentDifficulty, setCurrentDifficulty] = useState<number | null>(null);

  useEffect(() => {
    if (detail) {
      setCurrentStatus(detail.song.status ?? 'learning');
      setCurrentDifficulty(detail.song.difficulty ?? null);
    }
  }, [detail]);

  const handleStatusChange = (next: string) => {
    setCurrentStatus(next);
    onSongUpdated();
  };

  const handleDifficultyChange = async (val: number | null) => {
    if (!songId) return;
    setCurrentDifficulty(val);
    await invoke('update_song_difficulty', { songId, difficulty: val });
    onSongUpdated();
  };

  const handleFeelingChange = () => {
    refresh();
    onSongUpdated();
  };

  const song = detail?.song;
  const sessions = detail?.sessions ?? [];
  const practicedDates = sessions.map(s => s.date);
  const ratedSessions = sessions.filter(s => s.feeling != null);
  const avgFeeling = ratedSessions.length > 0
    ? Math.round(ratedSessions.reduce((a, s) => a + s.feeling!, 0) / ratedSessions.length)
    : null;

  const stage = STAGES.find(st => st.key === (currentStatus ?? 'learning'))!;
  const grad = song ? coverGradient(song.title) : COVER_GRADIENTS[0];

  return (
    <Modal
      isOpen={!!songId}
      onOpenChange={open => { if (!open) onClose(); }}
      size="3xl"
      scrollBehavior="inside"
      classNames={{
        base: 'bg-content1 border border-divider max-h-[90vh]',
        closeButton: 'top-3 right-3 z-20 text-white/80 hover:text-white hover:bg-white/10',
      }}
    >
      <ModalContent>
        {loading || !song ? (
          <div className="flex items-center justify-center h-48">
            <Spinner color="primary" />
          </div>
        ) : (
          <>
            {/* ── Cover header ── */}
            <div className="relative overflow-hidden rounded-t-xl" style={{ minHeight: 140 }}>
              {/* Blurred cover bg */}
              {song.cover_url
                ? <img src={song.cover_url} className="absolute inset-0 w-full h-full object-cover scale-110 blur-xl opacity-30" alt="" />
                : <div className={`absolute inset-0 bg-gradient-to-br ${grad} opacity-40`} />
              }
              <div className="absolute inset-0 bg-gradient-to-b from-transparent via-content1/60 to-content1" />

              {/* Content over bg */}
              <div className="relative z-10 flex items-end gap-4 px-6 pt-6 pb-5">
                <CoverArt title={song.title} coverUrl={song.cover_url} size={80} rounded="rounded-2xl" className="shadow-2xl shadow-black/50 ring-2 ring-white/10" />
                <div className="flex-1 min-w-0 pb-1">
                  <h2 className="text-xl font-bold text-white truncate leading-tight">{song.title}</h2>
                  <div className="text-sm text-white/70 truncate mt-0.5">
                    {song.artist ?? 'Unknown Artist'}
                    {song.genre && <span className="text-white/40"> · {song.genre}</span>}
                  </div>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <MasteryBadge
                      status={currentStatus}
                      songId={song.id}
                      onChanged={handleStatusChange}
                    />
                    {song.spotify_url && (
                      <Button
                        size="sm"
                        variant="flat"
                        onPress={() => openUrl(song.spotify_url!)}
                        className="h-6 px-2.5 text-[11px] bg-[#1DB954]/20 text-[#1DB954] border-[#1DB954]/30 border"
                      >
                        ♪ Open in Spotify
                      </Button>
                    )}
                  </div>
                  <div className="mt-2">
                    <DifficultyPicker value={currentDifficulty} onChange={handleDifficultyChange} />
                  </div>
                </div>
              </div>
            </div>

            <ModalBody className="px-6 py-4 space-y-5">
              {/* Stats row */}
              <div className={`grid grid-cols-4 gap-2 p-1 rounded-xl ${stage.colorBg} border ${stage.colorBorder}`}>
                {[
                  { label: 'Total Time', value: formatDurationLong(song.total_seconds ?? 0) },
                  { label: 'Sessions',   value: String(song.session_count ?? 0) },
                  { label: 'Avg Session', value: song.session_count ? formatDurationLong(Math.round((song.total_seconds ?? 0) / song.session_count)) : '—' },
                  { label: 'Avg Mood',   value: avgFeeling != null ? feelingEmoji(avgFeeling) : '—' },
                ].map(stat => (
                  <div key={stat.label} className="bg-content1/60 rounded-lg p-2.5 text-center">
                    <div className={`text-sm font-bold ${stat.label === 'Avg Mood' ? 'text-xl leading-none pt-0.5' : 'text-foreground'}`}>{stat.value}</div>
                    <div className="text-[10px] text-foreground-500 mt-1">{stat.label}</div>
                  </div>
                ))}
              </div>

              {/* Mood trend */}
              {sessions.some(s => s.feeling != null) && (
                <div>
                  <SectionLabel>Mood Trend</SectionLabel>
                  <MoodTrendChart sessions={sessions} height={80} />
                </div>
              )}

              {/* Practice calendar */}
              <div>
                <SectionLabel>Practice Calendar</SectionLabel>
                <MiniCalendar dates={practicedDates} />
              </div>

              {/* Session list */}
              <div>
                <SectionLabel>Sessions ({sessions.length})</SectionLabel>
                {sessions.length === 0 ? (
                  <div className="text-foreground-500 text-sm text-center py-6">
                    No sessions recorded for this song yet
                  </div>
                ) : (
                  <div className="space-y-2 pb-2">
                    {sessions.map(s => (
                      <div key={s.id} className="bg-content2 rounded-xl p-3 border border-divider/50">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-sm font-medium text-foreground">{s.date}</span>
                          <Chip color="primary" variant="flat" size="sm">{formatDurationLong(s.duration_seconds)}</Chip>
                        </div>
                        {s.note && (
                          <p className="text-xs text-foreground-400 italic mb-2">"{s.note}"</p>
                        )}
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-foreground-500">Mood:</span>
                          <FeelingPicker sessionId={s.id} value={s.feeling} onChange={handleFeelingChange} size="sm" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </ModalBody>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-xs font-semibold text-foreground-400 uppercase tracking-wider mb-2">{children}</div>;
}

// ── Kanban Card ──────────────────────────────────────────────────────────────
function KanbanCard({ song, onSelect }: { song: SongRecord; onSelect: (id: number) => void }) {
  const daysSince = song.last_played_date
    ? Math.floor((Date.now() - new Date(song.last_played_date).getTime()) / 86400000)
    : null;

  const recencyLabel = daysSince === null ? null
    : daysSince === 0 ? 'Today'
    : daysSince === 1 ? 'Yesterday'
    : `${daysSince}d ago`;

  return (
    <button
      onClick={() => onSelect(song.id)}
      className="w-full text-left group bg-content2 hover:bg-content2/80 border border-divider/60 hover:border-primary/40 rounded-xl p-3 transition-all duration-150 hover:shadow-lg hover:shadow-black/20 active:scale-[0.99]"
    >
      <div className="flex items-center gap-3">
        <CoverArt title={song.title} coverUrl={song.cover_url} size={48} rounded="rounded-lg" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-foreground truncate leading-tight group-hover:text-primary transition-colors">
            {song.title}
          </div>
          <div className="text-[11px] text-foreground-500 truncate mt-0.5">
            {song.artist ?? 'Unknown Artist'}
          </div>
          <div className="flex items-center gap-2 mt-1.5">
            {song.session_count != null && song.session_count > 0 && (
              <span className="text-[10px] text-foreground-500 bg-content3 px-1.5 py-0.5 rounded-full">
                {song.session_count} {song.session_count === 1 ? 'session' : 'sessions'}
              </span>
            )}
            {recencyLabel && (
              <span className="text-[10px] text-foreground-600">{recencyLabel}</span>
            )}
            <DifficultyDots value={song.difficulty} />
          </div>
        </div>
        {song.avg_feeling != null && (
          <div className="flex-shrink-0 text-lg leading-none opacity-80">
            {feelingEmoji(Math.round(song.avg_feeling))}
          </div>
        )}
      </div>
    </button>
  );
}

// ── Kanban Column ────────────────────────────────────────────────────────────
function KanbanColumn({
  stage, songs, onSelect, searching,
}: {
  stage: typeof STAGES[number];
  songs: SongRecord[];
  onSelect: (id: number) => void;
  searching: boolean;
}) {
  const totalTime = songs.reduce((a, s) => a + (s.total_seconds ?? 0), 0);

  return (
    <div className="flex flex-col flex-1 min-w-0 bg-content2/30 rounded-2xl border border-divider overflow-hidden">
      {/* Column header */}
      <div className={`flex-shrink-0 px-4 py-3 border-b ${stage.colorBorder} bg-content2/50`}>
        <div className="flex items-center gap-2">
          <span className="text-base">{stage.icon}</span>
          <span className={`text-sm font-semibold ${stage.colorText}`}>{stage.label}</span>
          <Chip
            size="sm"
            variant="flat"
            classNames={{ base: `${stage.colorBg} ${stage.colorBorder} border ml-auto`, content: `text-[11px] font-semibold ${stage.colorText}` }}
          >
            {songs.length}
          </Chip>
        </div>
        {totalTime > 0 && (
          <div className="text-[10px] text-foreground-500 mt-1 pl-6">
            {formatDurationLong(totalTime)} total
          </div>
        )}
        {/* Stage accent bar */}
        <div className={`h-0.5 mt-2 rounded-full ${stage.colorAccent} opacity-50`} />
      </div>

      {/* Cards */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-2 min-h-0">
        {songs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
            <div className="text-3xl mb-3 opacity-40">{stage.icon}</div>
            <div className="text-xs text-foreground-600 leading-relaxed">
              {searching ? 'No matching songs' : stage.emptyMsg}
            </div>
          </div>
        ) : (
          songs.map(song => <KanbanCard key={song.id} song={song} onSelect={onSelect} />)
        )}
      </div>
    </div>
  );
}

// ── Collection Card (album-art style, large square) ──────────────────────────
function CollectionCard({ song, onSelect }: { song: SongRecord; onSelect: (id: number) => void }) {
  const grad = coverGradient(song.title);
  const initials = song.title.slice(0, 2).toUpperCase();
  const stage = STAGES.find(s => s.key === (song.status ?? 'learning')) ?? STAGES[0];

  return (
    <button
      onClick={() => onSelect(song.id)}
      className="group text-left w-full"
    >
      {/* Square cover art */}
      <div className="relative aspect-square rounded-2xl overflow-hidden shadow-md ring-1 ring-white/5 group-hover:ring-primary/50 group-hover:scale-[1.03] group-hover:shadow-xl group-hover:shadow-black/40 transition-all duration-200">
        {song.cover_url
          ? <img src={song.cover_url} alt={song.title} className="w-full h-full object-cover" />
          : (
            <div className={`w-full h-full bg-gradient-to-br ${grad} flex items-center justify-center`}>
              <span className="text-white font-bold select-none" style={{ fontSize: 'clamp(1.5rem, 5cqi, 2.5rem)' }}>{initials}</span>
            </div>
          )
        }
        {/* Stage badge */}
        <div className="absolute bottom-2 right-2 text-xl leading-none drop-shadow-lg filter">{stage.icon}</div>
        {/* Mood emoji top-left */}
        {song.avg_feeling != null && (
          <div className="absolute top-2 left-2 text-base leading-none drop-shadow-lg">{feelingEmoji(Math.round(song.avg_feeling))}</div>
        )}
        {/* Hover overlay */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-all flex items-center justify-center">
          <div className="w-10 h-10 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center text-white text-sm opacity-0 group-hover:opacity-100 transition-opacity">
            ▶
          </div>
        </div>
      </div>

      {/* Text below */}
      <div className="mt-2.5 px-0.5 space-y-0.5">
        <div className="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors leading-snug">
          {song.title}
        </div>
        <div className="text-[11px] text-foreground-500 truncate">{song.artist ?? 'Unknown Artist'}</div>
        {(song.total_seconds ?? 0) > 0 && (
          <div className="text-[10px] text-foreground-600">{formatDurationLong(song.total_seconds ?? 0)}</div>
        )}
        <DifficultyDots value={song.difficulty} />
      </div>
    </button>
  );
}

// ── Collection View ───────────────────────────────────────────────────────────
type GroupBy = 'genre' | 'artist' | 'stage' | 'none';

const GROUP_OPTIONS: { key: GroupBy; label: string }[] = [
  { key: 'genre',  label: '🎼 Genre' },
  { key: 'artist', label: '🎹 Artist' },
  { key: 'stage',  label: '🌱 Stage' },
  { key: 'none',   label: 'All' },
];

function CollectionView({
  songs, onSelect, searching,
}: { songs: SongRecord[]; onSelect: (id: number) => void; searching: boolean }) {
  const [groupBy, setGroupBy] = useState<GroupBy>('genre');

  const grouped = useMemo(() => {
    const buildMap = (key: (s: SongRecord) => string) => {
      const map = new Map<string, SongRecord[]>();
      for (const s of songs) {
        const k = key(s);
        if (!map.has(k)) map.set(k, []);
        map.get(k)!.push(s);
      }
      return [...map.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([label, list]) => ({
          key: label,
          label,
          songs: [...list].sort((a, b) => a.title.localeCompare(b.title)),
        }));
    };

    switch (groupBy) {
      case 'genre':  return buildMap(s => s.genre ?? 'Unknown Genre');
      case 'artist': return buildMap(s => s.artist ?? 'Unknown Artist');
      case 'stage':
        return STAGES
          .map(st => ({ key: st.key, label: `${st.icon} ${st.label}`, songs: songs.filter(s => (s.status ?? 'learning') === st.key).sort((a, b) => a.title.localeCompare(b.title)) }))
          .filter(g => g.songs.length > 0);
      default:
        return [{ key: 'all', label: 'All Songs', songs: [...songs].sort((a, b) => a.title.localeCompare(b.title)) }];
    }
  }, [songs, groupBy]);

  return (
    <div className="flex-1 overflow-hidden flex flex-col min-h-0">
      {/* Controls bar */}
      <div className="flex-shrink-0 px-6 py-2.5 border-b border-divider/50 flex items-center gap-1.5">
        <span className="text-[11px] text-foreground-500 mr-1">Group by</span>
        {GROUP_OPTIONS.map(opt => (
          <button
            key={opt.key}
            onClick={() => setGroupBy(opt.key)}
            className={`text-xs px-2.5 py-1 rounded-lg transition-colors ${
              groupBy === opt.key
                ? 'bg-primary/20 text-primary font-medium'
                : 'text-foreground-500 hover:text-foreground hover:bg-content3'
            }`}
          >
            {opt.label}
          </button>
        ))}
        <span className="ml-auto text-[11px] text-foreground-600">{songs.length} songs</span>
      </div>

      {/* Scrollable grid */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-8 min-h-0">
        {songs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-foreground-500">
            <div className="text-4xl mb-3">🎵</div>
            <div className="text-sm">{searching ? 'No songs match your search' : 'No songs yet'}</div>
          </div>
        ) : (
          grouped.map(group => (
            <div key={group.key}>
              <div className="flex items-center gap-3 mb-4">
                <h2 className="text-sm font-bold text-foreground tracking-wide">{group.label}</h2>
                <Chip size="sm" variant="flat" classNames={{ base: 'bg-content3', content: 'text-foreground-500 text-[10px]' }}>
                  {group.songs.length}
                </Chip>
                <div className="flex-1 h-px bg-divider/60" />
              </div>
              <div
                className="grid gap-x-4 gap-y-6"
                style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))' }}
              >
                {group.songs.map(song => (
                  <CollectionCard key={song.id} song={song} onSelect={onSelect} />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ── Repertoire Page ──────────────────────────────────────────────────────────
export default function Library() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'board' | 'collection'>('board');
  const [selectedSongId, setSelectedSongId] = useState<number | null>(
    searchParams.get('song') ? Number(searchParams.get('song')) : null
  );
  const { data: songs, refresh: refreshSongs } = useSongsWithStats();

  useEffect(() => {
    const id = searchParams.get('song');
    if (id) setSelectedSongId(Number(id));
  }, [searchParams]);

  const handleSelect = (id: number) => {
    setSelectedSongId(id);
    setSearchParams({ song: String(id) });
  };

  const handleClose = () => {
    setSelectedSongId(null);
    setSearchParams({});
  };

  const filteredSongs = useMemo(() => {
    if (!search.trim()) return songs;
    const q = search.toLowerCase();
    return songs.filter(s =>
      s.title.toLowerCase().includes(q) || (s.artist ?? '').toLowerCase().includes(q)
    );
  }, [songs, search]);

  const byStage = useMemo(() => {
    const sorted = [...filteredSongs].sort((a, b) =>
      (b.last_played_date ?? '').localeCompare(a.last_played_date ?? '')
    );
    return {
      learning:   sorted.filter(s => (s.status ?? 'learning') === 'learning'),
      practicing: sorted.filter(s => s.status === 'practicing'),
      mastered:   sorted.filter(s => s.status === 'mastered'),
    };
  }, [filteredSongs]);

  const totalTime = songs.reduce((a, s) => a + (s.total_seconds ?? 0), 0);
  const masteredCount = songs.filter(s => s.status === 'mastered').length;
  const isSearching = search.trim().length > 0;

  return (
    <div className="flex flex-col h-full overflow-hidden fade-in">
      {/* ── Page header ── */}
      <div className="flex-shrink-0 px-6 pt-6 pb-4 space-y-4 border-b border-divider">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Repertoire</h1>
            <p className="text-sm text-foreground-400 mt-0.5">
              {songs.length === 0
                ? 'Tag your sessions with songs to start your collection'
                : `${songs.length} songs · ${formatDurationLong(totalTime)} practiced · ${masteredCount} mastered`
              }
            </p>
          </div>

          <div className="flex items-center gap-3 flex-shrink-0">
            {/* View toggle */}
            <div className="flex bg-content3 rounded-xl p-1 gap-0.5">
              {([
                { key: 'board',      icon: '⊟', label: 'Board' },
                { key: 'collection', icon: '⊞', label: 'Collection' },
              ] as const).map(v => (
                <button
                  key={v.key}
                  onClick={() => setView(v.key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    view === v.key
                      ? 'bg-content1 text-foreground shadow-sm'
                      : 'text-foreground-500 hover:text-foreground'
                  }`}
                >
                  <span>{v.icon}</span>
                  {v.label}
                </button>
              ))}
            </div>

            <Input
              size="sm"
              placeholder="Search…"
              value={search}
              onValueChange={setSearch}
              startContent={<span className="text-foreground-500 text-sm">🔍</span>}
              classNames={{
                base: 'w-44',
                inputWrapper: 'bg-content3 border-divider h-9',
                input: 'text-sm',
              }}
            />
          </div>
        </div>

        {/* Journey progress bar */}
        {songs.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex gap-px rounded-full h-1.5 overflow-hidden bg-content3">
              {byStage.learning.length > 0 && (
                <div className="bg-emerald-500 transition-all duration-500" style={{ flexBasis: `${(byStage.learning.length / songs.length) * 100}%` }} />
              )}
              {byStage.practicing.length > 0 && (
                <div className="bg-sky-500 transition-all duration-500" style={{ flexBasis: `${(byStage.practicing.length / songs.length) * 100}%` }} />
              )}
              {byStage.mastered.length > 0 && (
                <div className="bg-amber-500 transition-all duration-500" style={{ flexBasis: `${(byStage.mastered.length / songs.length) * 100}%` }} />
              )}
            </div>
            <div className="flex items-center gap-4 text-[10px] text-foreground-500">
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />🌱 {byStage.learning.length} Learning</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-sky-500 inline-block" />🎵 {byStage.practicing.length} Practicing</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />⭐ {byStage.mastered.length} Mastered</span>
            </div>
          </div>
        )}
      </div>

      {/* ── Views ── */}
      {view === 'board' ? (
        <div className="flex-1 flex gap-4 min-h-0 px-6 py-4 overflow-hidden">
          {STAGES.map(stage => (
            <KanbanColumn
              key={stage.key}
              stage={stage}
              songs={byStage[stage.key]}
              onSelect={handleSelect}
              searching={isSearching}
            />
          ))}
        </div>
      ) : (
        <CollectionView
          songs={filteredSongs}
          onSelect={handleSelect}
          searching={isSearching}
        />
      )}

      {/* ── Song detail modal ── */}
      <SongDetailModal
        songId={selectedSongId}
        onClose={handleClose}
        onSongUpdated={refreshSongs}
      />
    </div>
  );
}
