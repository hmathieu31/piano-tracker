import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import { useSearchParams } from 'react-router-dom';
import { Image } from '@heroui/react';
import { useSongsWithStats, useSongDetail, useUpNext } from '../hooks/useData';
import { daysSince, formatDate, formatDurationLong, formatTime, spotifySearchUrl } from '../utils';
import FeelingPicker, { feelingEmoji } from '../components/FeelingPicker';
import SongSearchModal from '../components/SongSearchModal';
import type { SongRecord, SongStatus } from '../types';

const STAGES: { id: SongStatus; label: string; pill: string }[] = [
  { id: 'wishlist',   label: 'Wishlist',   pill: 'bg-white/5 text-slate-400' },
  { id: 'learning',   label: 'Learning',   pill: 'bg-emerald-500/15 text-emerald-400' },
  { id: 'practicing', label: 'Practicing', pill: 'bg-sky-500/15 text-sky-400' },
  { id: 'mastered',   label: 'Mastered',   pill: 'bg-amber-500/15 text-amber-400' },
];

function stage(id: SongStatus) {
  return STAGES.find(s => s.id === id) ?? STAGES[1];
}

function lastPlayed(date: string | null): { text: string; stale: boolean } {
  const days = daysSince(date);
  if (days == null) return { text: 'never', stale: false };
  if (days === 0) return { text: 'today', stale: false };
  if (days === 1) return { text: 'yesterday', stale: false };
  return { text: `${days} days`, stale: days >= 14 };
}

function Cover({ song, size, className = '' }: { song: SongRecord; size: number; className?: string }) {
  return (
    <div className={`overflow-hidden bg-content3 flex-shrink-0 flex items-center justify-center ${className}`} style={{ width: size, height: size }}>
      {song.cover_url
        ? <Image src={song.cover_url} alt={song.title} className="object-cover" style={{ width: size, height: size }} removeWrapper />
        : <span style={{ fontSize: size * 0.4 }}>🎵</span>}
    </div>
  );
}

function SongDetailPane({ songId, onChanged }: { songId: number; onChanged: () => void }) {
  const { data, refresh } = useSongDetail(songId);
  const upNext = useUpNext();
  const [showAll, setShowAll] = useState(false);
  if (!data) return null;
  const { song, sessions } = data;
  const rated = sessions.filter(s => s.feeling != null);
  const usualMood = rated.length > 0
    ? Math.round(rated.reduce((a, s) => a + s.feeling!, 0) / rated.length)
    : null;
  const spotify = spotifySearchUrl(song);
  const isUpNext = upNext.song?.id === song.id;

  const setStage = async (status: SongStatus) => {
    await invoke('set_song_status', { songId: song.id, status }).catch(() => {});
    refresh();
    onChanged();
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex gap-5 items-center">
        <Cover song={song} size={96} className="rounded-2xl" />
        <div className="flex-1 min-w-0">
          <h2 className="text-2xl font-bold text-foreground">{song.title}</h2>
          <div className="text-sm text-foreground-400 mt-1">
            {[song.artist ?? 'Unknown artist', song.album, song.year].filter(Boolean).join(' · ')}
          </div>
          {spotify && (
            <button onClick={() => openUrl(spotify)} className="text-xs text-foreground-500 hover:text-foreground-300 mt-1.5">Listen on Spotify</button>
          )}
        </div>
        <button
          onClick={() => upNext.pick(isUpNext ? null : song.id)}
          className={`h-10 px-4 rounded-xl text-sm font-medium whitespace-nowrap ${isUpNext ? 'bg-primary/15 text-primary' : 'bg-primary text-white'}`}
        >
          {isUpNext ? 'Up next ✓' : 'Play next'}
        </button>
      </div>

      <div className="flex gap-1 p-1 rounded-xl bg-content2" role="radiogroup" aria-label="Stage">
        {STAGES.map(s => (
          <button
            key={s.id}
            role="radio"
            aria-checked={song.status === s.id}
            onClick={() => setStage(s.id)}
            className={`flex-1 h-9 rounded-lg text-sm ${song.status === s.id ? 'bg-content4 text-foreground' : 'text-foreground-400 hover:text-foreground-200'}`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-4 gap-2.5">
        {[
          { value: formatDurationLong(song.total_seconds), label: 'total' },
          { value: String(song.session_count), label: song.session_count === 1 ? 'session' : 'sessions' },
          { value: lastPlayed(song.last_played_date).text, label: 'last played' },
          { value: usualMood != null ? feelingEmoji(usualMood) : '—', label: 'usual mood' },
        ].map(k => (
          <div key={k.label} className="p-3 rounded-xl bg-content2">
            <div className="text-lg font-bold text-foreground">{k.value}</div>
            <div className="text-[11px] text-foreground-500">{k.label}</div>
          </div>
        ))}
      </div>

      <div>
        <div className="text-xs font-semibold tracking-widest uppercase text-foreground-400 mb-1">Sessions</div>
        {sessions.length === 0 && <div className="text-sm text-foreground-500 py-3">Not played yet. Press Play next, then start playing.</div>}
        {(showAll ? sessions : sessions.slice(0, 8)).map(s => (
          <div key={s.id} className="flex justify-between items-center py-2.5 border-b border-white/5 text-sm">
            <span className="text-foreground-300">{formatDate(s.date)}, {formatTime(s.start_ts)}</span>
            <span className="flex items-center gap-3 text-foreground-400">
              {formatDurationLong(s.duration_seconds)}
              <FeelingPicker sessionId={s.id} value={s.feeling} onChange={refresh} size="sm" />
            </span>
          </div>
        ))}
        {!showAll && sessions.length > 8 && (
          <button onClick={() => setShowAll(true)} className="text-sm text-primary pt-2.5">Show all {sessions.length}</button>
        )}
      </div>
    </div>
  );
}

export default function Songs() {
  const { data: songs, refresh } = useSongsWithStats();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<SongStatus | 'all'>('all');
  const [adding, setAdding] = useState(false);

  const sorted = [...songs].sort((a, b) =>
    (b.last_played_date ?? '').localeCompare(a.last_played_date ?? '') || a.title.localeCompare(b.title));
  const q = query.trim().toLowerCase();
  const shown = sorted.filter(s =>
    (filter === 'all' || s.status === filter) &&
    (!q || `${s.title} ${s.artist ?? ''}`.toLowerCase().includes(q)));
  const selectedId = Number(params.get('song')) || shown[0]?.id || null;
  const select = (id: number) => setParams({ song: String(id) }, { replace: true });

  return (
    <div className="flex h-full fade-in">
      <section className="w-[440px] flex-shrink-0 p-7 pr-5 border-r border-white/5 flex flex-col gap-4 overflow-y-auto">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">Songs</h1>
          <button onClick={() => setAdding(true)} className="h-8 px-3 rounded-lg bg-primary text-white text-sm font-medium">Add song</button>
        </div>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search your songs"
          aria-label="Search your songs"
          className="h-10 px-3 rounded-xl bg-content2 border border-white/5 text-sm outline-none focus:border-primary/50"
        />
        <div className="flex flex-wrap gap-1.5">
          {[{ id: 'all' as const, label: 'All' }, ...STAGES].map(f => {
            const count = f.id === 'all' ? songs.length : songs.filter(s => s.status === f.id).length;
            return (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`h-7 px-2.5 rounded-full border text-xs ${
                  filter === f.id ? 'bg-primary/15 border-primary/40 text-sky-400' : 'border-white/10 text-foreground-400'
                }`}
              >
                {f.label} {count}
              </button>
            );
          })}
        </div>
        <div className="flex flex-col gap-0.5">
          {shown.map(s => {
            const lp = lastPlayed(s.last_played_date);
            return (
              <button
                key={s.id}
                onClick={() => select(s.id)}
                className={`flex items-center gap-3 p-2.5 rounded-xl text-left ${
                  s.id === selectedId ? 'bg-content2 ring-1 ring-primary/40' : 'hover:bg-white/[0.03]'
                }`}
              >
                <Cover song={s} size={40} className="rounded-lg" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground truncate">{s.title}</div>
                  <div className="text-xs text-foreground-500 truncate">{s.artist ?? 'Unknown artist'}</div>
                </div>
                <span className={`text-[11px] px-2 py-0.5 rounded-full whitespace-nowrap ${stage(s.status).pill}`}>{stage(s.status).label}</span>
                <span className={`w-16 text-right text-[11px] whitespace-nowrap ${lp.stale ? 'text-warning' : 'text-foreground-500'}`}>{lp.text}</span>
              </button>
            );
          })}
          {shown.length === 0 && (
            <div className="text-sm text-foreground-500 py-6 text-center">
              {songs.length === 0 ? 'No songs yet. Add the first one you are working on.' : 'No song matches.'}
            </div>
          )}
        </div>
      </section>

      <section className="flex-1 min-w-0 p-8 overflow-y-auto">
        {selectedId != null
          ? <SongDetailPane key={selectedId} songId={selectedId} onChanged={refresh} />
          : <div className="text-sm text-foreground-500">Pick a song to see its sessions.</div>}
      </section>

      {adding && (
        <SongSearchModal
          title="Add a song"
          subtitle="Search by title or artist"
          recentSongs={[]}
          onPick={async id => { await refresh(); select(id); }}
          onClose={() => setAdding(false)}
        />
      )}
    </div>
  );
}
