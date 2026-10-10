import { useState } from 'react';
import { Modal, ModalContent, ModalHeader, ModalBody, Input, Image } from '@heroui/react';
import { NavLink } from 'react-router-dom';
import { useUpNext } from '../hooks/useData';
import type { SongRecord } from '../types';
import { daysSince } from '../utils';

interface Props {
  songs: SongRecord[];
}

/** Why a song is suggested, and whether that reason is a nudge. */
function reason(song: SongRecord): { text: string; nudge: boolean } {
  const stage = song.status.charAt(0).toUpperCase() + song.status.slice(1);
  const days = daysSince(song.last_played_date);
  if (days == null) return { text: `${stage} · not played yet`, nudge: false };
  if (days === 0) return { text: `${stage} · played today`, nudge: false };
  if (days === 1) return { text: `${stage} · played yesterday`, nudge: false };
  return { text: `${stage} · not played for ${days} days`, nudge: days >= 14 };
}

/**
 * Suggestions for what to play next: songs in progress, most recent first,
 * then mastered songs going stale, oldest first.
 */
function suggestions(songs: SongRecord[], exclude: number | undefined): SongRecord[] {
  const inProgress = songs
    .filter(s => s.status === 'learning' || s.status === 'practicing')
    .sort((a, b) => (b.last_played_date ?? '').localeCompare(a.last_played_date ?? ''));
  const stale = songs
    .filter(s => s.status === 'mastered' && (daysSince(s.last_played_date) ?? 0) >= 14)
    .sort((a, b) => (a.last_played_date ?? '').localeCompare(b.last_played_date ?? ''));
  return [...inProgress.slice(0, 2), ...stale.slice(0, 2), ...inProgress.slice(2)]
    .filter(s => s.id !== exclude)
    .slice(0, 3);
}

function Cover({ song, size }: { song: SongRecord; size: number }) {
  return (
    <div className="rounded-lg overflow-hidden bg-content3 flex-shrink-0" style={{ width: size, height: size }}>
      {song.cover_url
        ? <Image src={song.cover_url} alt={song.title} className="object-cover" style={{ width: size, height: size }} removeWrapper />
        : <div className="w-full h-full flex items-center justify-center text-lg">🎵</div>}
    </div>
  );
}

export default function UpNext({ songs }: Props) {
  const { song, pick } = useUpNext();
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState('');
  const others = suggestions(songs, song?.id);
  const matches = songs.filter(s =>
    `${s.title} ${s.artist ?? ''}`.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <div>
      <h2 className="text-sm font-semibold text-foreground-300 uppercase tracking-wide mb-3">Up next</h2>
      {song ? (
        <div className="p-4 rounded-2xl bg-primary/10 border border-primary/35 flex items-center gap-3.5 mb-4">
          <Cover song={song} size={52} />
          <div className="flex-1 min-w-0">
            <div className="text-base font-semibold text-foreground truncate">{song.title}</div>
            <div className="text-xs text-foreground-400 mt-0.5">Your next session is tagged with this automatically</div>
          </div>
          <button onClick={() => setPicking(true)} className="h-7 px-2.5 rounded-full border border-white/10 bg-content3 hover:bg-content4 text-xs text-foreground-300">Change</button>
          <button onClick={() => pick(null)} className="h-7 px-2.5 rounded-full text-xs text-foreground-500 hover:text-foreground-300">Clear</button>
        </div>
      ) : (
        <div className="p-4 rounded-2xl border border-dashed border-divider flex items-center gap-3 mb-4">
          <div className="flex-1 text-sm text-foreground-400">Pick what you'll play and the session tags itself.</div>
          <button onClick={() => setPicking(true)} className="h-8 px-3 rounded-lg bg-primary/15 text-primary text-xs font-medium">Pick a song</button>
        </div>
      )}

      {others.length > 0 && (
        <>
          <div className="text-xs text-foreground-500 mb-2">{song ? 'Or pick one of these' : 'Suggestions'}</div>
          <div className="space-y-2">
            {others.map(s => {
              const r = reason(s);
              return (
                <div key={s.id} className="flex items-center gap-3 p-3 rounded-xl bg-content2 border border-divider">
                  <Cover song={s} size={40} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground truncate">{s.title}</div>
                    <div className={`text-xs mt-0.5 ${r.nudge ? 'text-warning' : 'text-foreground-500'}`}>{r.text}</div>
                  </div>
                  <button onClick={() => pick(s.id)} className="h-8 px-3 rounded-lg bg-primary/15 text-primary text-xs font-medium flex-shrink-0">Play next</button>
                </div>
              );
            })}
          </div>
        </>
      )}

      {picking && (
        <Modal
          isOpen
          onClose={() => { setPicking(false); setQuery(''); }}
          size="md"
          classNames={{ backdrop: 'bg-black/70', base: 'bg-content1 border border-white/8', body: 'py-4' }}
        >
          <ModalContent>
            <ModalHeader className="text-base font-semibold">What will you play next?</ModalHeader>
            <ModalBody>
              <Input
                autoFocus
                value={query}
                onValueChange={setQuery}
                placeholder="Search your songs"
                variant="bordered"
                classNames={{ input: 'text-sm', inputWrapper: 'bg-content3 border-white/10' }}
              />
              <div className="space-y-1 max-h-80 overflow-y-auto pr-1">
                {matches.map(s => (
                  <button
                    key={s.id}
                    onClick={() => { pick(s.id); setPicking(false); setQuery(''); }}
                    className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-content3 text-left"
                  >
                    <Cover song={s} size={36} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-foreground truncate">{s.title}</div>
                      <div className="text-xs text-foreground-500 truncate">{s.artist ?? 'Unknown artist'}</div>
                    </div>
                  </button>
                ))}
                {matches.length === 0 && (
                  <p className="text-sm text-foreground-400 text-center py-4">
                    No match. <NavLink to="/songs" className="text-primary">Add it in Songs</NavLink>.
                  </p>
                )}
              </div>
            </ModalBody>
          </ModalContent>
        </Modal>
      )}
    </div>
  );
}
