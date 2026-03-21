import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Card, CardBody, Chip, Image, Button, Spinner, Tabs, Tab, Input,
} from '@heroui/react';
import { openUrl } from '@tauri-apps/plugin-opener';
import type { SongRecord } from '../types';
import { useSongsWithStats, useSongDetail } from '../hooks/useData';
import { formatDurationLong } from '../utils';
import MasteryBadge from '../components/MasteryBadge';
import MoodTrendChart from '../components/MoodTrendChart';
import FeelingPicker, { feelingEmoji } from '../components/FeelingPicker';

// ── Mini Practice Calendar ───────────────────────────────────────────────────

function MiniCalendar({ dates }: { dates: string[] }) {
  const dateSet = new Set(dates);

  // Build last 12 weeks (Mon-Sun)
  const today = new Date();
  const weeks: string[][] = [];
  let day = new Date(today);
  day.setDate(day.getDate() - ((day.getDay() + 6) % 7)); // last Monday
  day.setDate(day.getDate() - 11 * 7); // go back 11 more weeks

  for (let w = 0; w < 12; w++) {
    const week: string[] = [];
    for (let d = 0; d < 7; d++) {
      week.push(day.toISOString().slice(0, 10));
      day.setDate(day.getDate() + 1);
    }
    weeks.push(week);
  }

  return (
    <div>
      <div className="flex gap-0.5">
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-0.5">
            {week.map(dateStr => {
              const practiced = dateSet.has(dateStr);
              const isFuture = dateStr > today.toISOString().slice(0, 10);
              return (
                <div
                  key={dateStr}
                  title={dateStr}
                  className={`w-3 h-3 rounded-[2px] transition-colors ${
                    isFuture ? 'bg-content3/30' :
                    practiced ? 'bg-primary' : 'bg-content3'
                  }`}
                />
              );
            })}
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

// ── Song Detail Panel ────────────────────────────────────────────────────────

function SongDetailPanel({
  songId,
  onClose,
  onSongUpdated,
}: {
  songId: number;
  onClose: () => void;
  onSongUpdated: () => void;
}) {
  const { data: detail, loading, refresh } = useSongDetail(songId);
  const [currentStatus, setCurrentStatus] = useState<string | null>(null);

  useEffect(() => {
    if (detail) setCurrentStatus(detail.song.status ?? 'learning');
  }, [detail]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner color="primary" />
      </div>
    );
  }
  if (!detail) return null;

  const { song, sessions } = detail;
  const practicedDates = sessions.map(s => s.date);
  const avgFeeling = sessions.filter(s => s.feeling != null).reduce((a, s, _, arr) =>
    a + s.feeling! / arr.length, 0);
  const avgFeelingDisplay = sessions.some(s => s.feeling != null)
    ? feelingEmoji(Math.round(avgFeeling))
    : '—';

  const handleStatusChange = async (next: string) => {
    setCurrentStatus(next);
    onSongUpdated();
  };

  const handleFeelingChange = () => {
    refresh();
    onSongUpdated();
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-5 pt-5 pb-4 border-b border-divider">
        <div className="flex items-start gap-4">
          <div className="w-16 h-16 rounded-xl overflow-hidden bg-content3 flex-shrink-0">
            {song.cover_url
              ? <Image src={song.cover_url} alt={song.title} className="w-16 h-16 object-cover" removeWrapper />
              : <div className="w-16 h-16 flex items-center justify-center text-3xl">🎵</div>
            }
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-lg font-semibold text-foreground truncate">{song.title}</div>
                <div className="text-sm text-foreground-400 truncate">{song.artist ?? 'Unknown Artist'}</div>
                {song.genre && <div className="text-xs text-foreground-500 mt-0.5">{song.genre}</div>}
              </div>
              <button
                onClick={onClose}
                className="text-foreground-500 hover:text-foreground flex-shrink-0 p-1"
              >
                ✕
              </button>
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
                  color="success"
                  onPress={() => openUrl(song.spotify_url!)}
                  className="h-6 text-[11px] px-2"
                >
                  🎧 Spotify
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-4 gap-2 mt-4">
          {[
            { label: 'Total Time', value: formatDurationLong(song.total_seconds ?? 0) },
            { label: 'Sessions', value: String(song.session_count ?? 0) },
            { label: 'Avg Session', value: song.session_count ? formatDurationLong(Math.round((song.total_seconds ?? 0) / song.session_count)) : '—' },
            { label: 'Avg Mood', value: avgFeelingDisplay },
          ].map(stat => (
            <div key={stat.label} className="bg-content2 rounded-xl p-2.5 text-center">
              <div className="text-sm font-semibold text-foreground">{stat.value}</div>
              <div className="text-[10px] text-foreground-500 mt-0.5">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        {/* Mood trend */}
        {sessions.some(s => s.feeling != null) && (
          <div>
            <div className="text-xs font-medium text-foreground-400 uppercase tracking-wide mb-2">Mood Trend</div>
            <MoodTrendChart sessions={sessions} height={80} />
          </div>
        )}

        {/* Practice calendar */}
        <div>
          <div className="text-xs font-medium text-foreground-400 uppercase tracking-wide mb-2">Practice Calendar</div>
          <MiniCalendar dates={practicedDates} />
        </div>

        {/* Session list */}
        <div>
          <div className="text-xs font-medium text-foreground-400 uppercase tracking-wide mb-2">
            Sessions ({sessions.length})
          </div>
          {sessions.length === 0 ? (
            <div className="text-foreground-500 text-sm text-center py-4">No sessions yet</div>
          ) : (
            <div className="space-y-2">
              {sessions.map(s => (
                <div key={s.id} className="bg-content2 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="text-sm font-medium text-foreground">{s.date}</div>
                    <Chip color="primary" variant="flat" size="sm">{formatDurationLong(s.duration_seconds)}</Chip>
                  </div>
                  {s.note && (
                    <div className="text-xs text-foreground-400 italic mb-2">"{s.note}"</div>
                  )}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-foreground-500">How did it feel?</span>
                    <FeelingPicker
                      sessionId={s.id}
                      value={s.feeling}
                      onChange={handleFeelingChange}
                      size="sm"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Song Card ────────────────────────────────────────────────────────────────

function SongCard({ song, onSelect }: { song: SongRecord; onSelect: (id: number) => void }) {
  return (
    <Card
      isPressable
      onPress={() => onSelect(song.id)}
      classNames={{ base: 'bg-content2 border border-divider hover:border-primary/40 transition-colors', body: 'p-4' }}
    >
      <CardBody>
        <div className="flex items-start gap-3">
          <div className="w-14 h-14 rounded-xl overflow-hidden bg-content3 flex-shrink-0">
            {song.cover_url
              ? <Image src={song.cover_url} alt={song.title} className="w-14 h-14 object-cover" removeWrapper />
              : <div className="w-14 h-14 flex items-center justify-center text-2xl">🎵</div>
            }
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-foreground truncate">{song.title}</div>
            <div className="text-xs text-foreground-400 truncate">{song.artist ?? 'Unknown Artist'}</div>
            <div className="mt-1.5">
              <MasteryBadge status={song.status} />
            </div>
          </div>
          <div className="text-right flex-shrink-0 ml-2">
            <div className="text-primary text-sm font-semibold">{formatDurationLong(song.total_seconds ?? 0)}</div>
            <div className="text-[11px] text-foreground-500 mt-0.5">{song.session_count ?? 0} sessions</div>
            {song.avg_feeling != null && (
              <div className="text-lg mt-1">{feelingEmoji(Math.round(song.avg_feeling))}</div>
            )}
          </div>
        </div>
        {song.last_played_date && (
          <div className="text-[11px] text-foreground-500 mt-2 pl-[68px]">
            Last played: {song.last_played_date}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

// ── Library Page ─────────────────────────────────────────────────────────────

const STATUS_TABS = [
  { key: 'all',        label: 'All' },
  { key: 'learning',   label: '🌱 Learning' },
  { key: 'practicing', label: '🎵 Practicing' },
  { key: 'mastered',   label: '⭐ Mastered' },
];

const SORT_OPTIONS = [
  { key: 'recent',   label: 'Recently played' },
  { key: 'most',     label: 'Most practiced' },
  { key: 'alpha',    label: 'A–Z' },
];

export default function Library() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState('all');
  const [sort, setSort] = useState('recent');
  const [search, setSearch] = useState('');
  const [selectedSongId, setSelectedSongId] = useState<number | null>(
    searchParams.get('song') ? Number(searchParams.get('song')) : null
  );
  const { data: songs, refresh: refreshSongs } = useSongsWithStats();

  // Sync ?song= query param
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

  const filtered = useMemo(() => {
    let list = songs;
    if (activeTab !== 'all') list = list.filter(s => (s.status ?? 'learning') === activeTab);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(s =>
        s.title.toLowerCase().includes(q) || (s.artist ?? '').toLowerCase().includes(q)
      );
    }
    switch (sort) {
      case 'most':   return [...list].sort((a, b) => (b.total_seconds ?? 0) - (a.total_seconds ?? 0));
      case 'alpha':  return [...list].sort((a, b) => a.title.localeCompare(b.title));
      default:       return [...list].sort((a, b) => (b.last_played_date ?? '').localeCompare(a.last_played_date ?? ''));
    }
  }, [songs, activeTab, sort, search]);

  const counts = {
    all:        songs.length,
    learning:   songs.filter(s => (s.status ?? 'learning') === 'learning').length,
    practicing: songs.filter(s => s.status === 'practicing').length,
    mastered:   songs.filter(s => s.status === 'mastered').length,
  };

  return (
    <div className="flex h-full overflow-hidden fade-in">
      {/* Left: Song list */}
      <div className={`flex flex-col overflow-hidden transition-all ${selectedSongId ? 'w-0 lg:w-[55%] opacity-0 lg:opacity-100' : 'w-full'}`}>
        <div className="flex-shrink-0 px-5 pt-6 pb-4 border-b border-divider">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-semibold text-foreground">Library</h1>
              <p className="text-foreground-400 text-sm mt-0.5">{songs.length} songs in your collection</p>
            </div>
          </div>
          <Input
            size="sm"
            placeholder="Search songs or artists…"
            value={search}
            onValueChange={setSearch}
            startContent={<span className="text-foreground-500 text-sm">🔍</span>}
            classNames={{ inputWrapper: 'bg-content3 border-divider', input: 'text-sm' }}
            className="mb-3"
          />
          <div className="flex items-center justify-between">
            <Tabs
              selectedKey={activeTab}
              onSelectionChange={k => setActiveTab(String(k))}
              size="sm"
              variant="underlined"
              classNames={{ tabList: 'gap-3 p-0', tab: 'px-0 h-8 text-xs' }}
            >
              {STATUS_TABS.map(t => (
                <Tab
                  key={t.key}
                  title={
                    <span className="flex items-center gap-1">
                      {t.label}
                      <span className="text-[10px] text-foreground-500">
                        {counts[t.key as keyof typeof counts]}
                      </span>
                    </span>
                  }
                />
              ))}
            </Tabs>
            <div className="flex gap-1">
              {SORT_OPTIONS.map(o => (
                <button
                  key={o.key}
                  onClick={() => setSort(o.key)}
                  className={`text-[11px] px-2 py-1 rounded-lg transition-colors ${
                    sort === o.key ? 'bg-primary/20 text-primary' : 'text-foreground-500 hover:text-foreground hover:bg-content3'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-foreground-500">
              <div className="text-4xl mb-3">🎵</div>
              <div className="text-sm">
                {search ? 'No songs match your search' : 'No songs in this category'}
              </div>
              {!search && activeTab === 'all' && (
                <div className="text-xs mt-2 text-foreground-600">
                  Tag sessions with songs to build your library
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map(song => (
                <SongCard
                  key={song.id}
                  song={song}
                  onSelect={handleSelect}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right: Song detail panel */}
      {selectedSongId && (
        <div className="flex-1 lg:flex-none lg:w-[45%] border-l border-divider bg-content1 overflow-hidden flex flex-col">
          <SongDetailPanel
            key={selectedSongId}
            songId={selectedSongId}
            onClose={handleClose}
            onSongUpdated={refreshSongs}
          />
        </div>
      )}
    </div>
  );
}
