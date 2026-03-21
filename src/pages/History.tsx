import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { openUrl, revealItemInDir } from '@tauri-apps/plugin-opener';
import {
  Tabs, Tab, Card, CardBody, Button, Chip, Modal, ModalContent,
  ModalHeader, ModalBody, Image, Spinner,
} from '@heroui/react';
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
      const path = await invoke<string>('save_midi_file', { sessionId: session.id, date: session.date });
      await revealItemInDir(path);
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
    <Modal
      isOpen
      onClose={onClose}
      size="2xl"
      scrollBehavior="inside"
      classNames={{
        backdrop: 'bg-black/70',
        base: 'bg-content1 border border-white/8',
        header: 'border-b border-divider py-3',
        body: 'py-5',
      }}
    >
      <ModalContent>
        <ModalHeader>
          <div className="flex items-center justify-between w-full pr-2">
            <div>
              <div className="text-base font-semibold text-foreground">{formatDate(session.date)}</div>
              <div className="text-xs text-foreground-400">{formatTime(session.start_ts)} → {formatTime(session.end_ts)}</div>
            </div>
            <Chip color="primary" variant="flat" size="sm" className="font-semibold">{formatDurationLong(session.duration_seconds)}</Chip>
          </div>
        </ModalHeader>
        <ModalBody>
          {showSongModal && (
            <SongSearchModal
              sessionId={session.id}
              recentSongs={[]}
              onAssigned={onUpdate}
              onClose={() => setShowSongModal(false)}
            />
          )}

          <div className="space-y-6">
            {/* Song card */}
            <div>
              <p className="text-xs font-medium text-foreground-400 uppercase tracking-wide mb-2">Song</p>
              {session.song ? (
                <Card classNames={{ base: 'bg-content2 border border-divider' }}>
                  <CardBody className="p-3">
                    <div className="flex items-center gap-3">
                      <div className="w-14 h-14 rounded-xl overflow-hidden bg-content3 flex-shrink-0">
                        {session.song.cover_url
                          ? <Image src={session.song.cover_url} alt={session.song.title} className="w-14 h-14 object-cover" removeWrapper />
                          : <div className="w-14 h-14 flex items-center justify-center text-2xl">🎵</div>
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-foreground truncate">{session.song.title}</div>
                        {session.song.artist && <div className="text-xs text-foreground-400 truncate">{session.song.artist}</div>}
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {session.song.genre && <Chip size="sm" variant="flat" color="secondary" className="h-5 text-[10px]">{session.song.genre}</Chip>}
                          {session.song.album && <Chip size="sm" variant="flat" className="h-5 text-[10px] bg-content3 text-foreground-400">{session.song.album}</Chip>}
                          {session.song.year && <Chip size="sm" variant="flat" className="h-5 text-[10px] bg-content3 text-foreground-400">{session.song.year}</Chip>}
                          {session.song.spotify_url && (
                            <Chip
                              size="sm" variant="flat" color="success"
                              className="h-5 text-[10px] cursor-pointer hover:opacity-80"
                              onClick={(e) => { e.stopPropagation(); openUrl(session.song!.spotify_url!); }}
                            >🎧 Spotify</Chip>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col gap-1 flex-shrink-0">
                        <Button size="sm" variant="light" onPress={() => setShowSongModal(true)} className="text-foreground-400 h-7 min-w-unit-16">Change</Button>
                        <Button size="sm" variant="light" color="danger" onPress={unlinkSong} className="h-7 min-w-unit-16">Remove</Button>
                      </div>
                    </div>
                  </CardBody>
                </Card>
              ) : (
                <button
                  onClick={() => setShowSongModal(true)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl border border-dashed border-white/10 hover:border-primary/30 text-sm text-foreground-500 hover:text-foreground transition-colors"
                >
                  <span className="text-lg">🎵</span>
                  Tag this session with a song…
                </button>
              )}
            </div>

            {/* Piano Roll */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-foreground-400 uppercase tracking-wide">Piano Roll</p>
                {events.length > 0 && (
                  <Button size="sm" variant="flat" color="primary" onPress={exportMidi} isLoading={exportingMidi} className="h-7 text-xs">
                    ⬇ Export .mid
                  </Button>
                )}
              </div>
              {eventsLoading ? (
                <div className="h-32 flex items-center justify-center"><Spinner color="primary" /></div>
              ) : events.length === 0 ? (
                <Card classNames={{ base: 'bg-content2 border border-divider' }}>
                  <CardBody className="h-24 flex items-center justify-center text-foreground-500 text-sm">No MIDI events recorded</CardBody>
                </Card>
              ) : (
                <PianoRoll events={events} durationMs={durationMs} />
              )}
            </div>

            {/* Practice Note */}
            <div>
              <p className="text-xs font-medium text-foreground-400 uppercase tracking-wide mb-2">Practice Note</p>
              {editingNote ? (
                <div className="flex gap-2">
                  <input
                    autoFocus
                    className="flex-1 bg-content3 border border-divider rounded-xl px-3 py-2 text-sm text-foreground placeholder-foreground-500 focus:outline-none focus:border-primary/50"
                    value={note}
                    onChange={e => setNote(e.target.value)}
                    placeholder="What did you practice?"
                    onKeyDown={e => { if (e.key === 'Enter') saveNote(); if (e.key === 'Escape') setEditingNote(false); }}
                  />
                  <Button color="primary" size="sm" onPress={saveNote} isLoading={savingNote}>Save</Button>
                </div>
              ) : (
                <button
                  onClick={() => setEditingNote(true)}
                  className="w-full text-left p-3 rounded-xl bg-content2 border border-divider hover:border-white/15 transition-colors"
                >
                  {session.note
                    ? <span className="text-sm text-foreground-300 italic">"{session.note}"</span>
                    : <span className="text-sm text-foreground-500">+ Add a practice note…</span>
                  }
                </button>
              )}
            </div>
          </div>
        </ModalBody>
      </ModalContent>
    </Modal>
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
          onUpdate={onUpdate}
        />
      )}
      <Card
        isPressable
        onPress={() => setShowDetail(true)}
        classNames={{ base: 'bg-content2 border border-white/5 hover:border-white/10 w-full', body: 'p-4' }}
      >
        <CardBody>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl overflow-hidden flex-shrink-0 bg-content3">
              {session.song?.cover_url
                ? <Image src={session.song.cover_url} alt={session.song.title ?? ''} className="w-10 h-10 object-cover" removeWrapper />
                : <div className={`w-10 h-10 flex items-center justify-center ${session.song ? 'text-secondary' : 'text-primary/40'} text-lg`}>
                    {session.song ? '🎵' : '🎹'}
                  </div>
              }
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-foreground">{formatDate(session.date)}</span>
                {session.song && (
                  <Chip size="sm" variant="flat" color="secondary" className="h-5 text-[10px]">{session.song.title}</Chip>
                )}
              </div>
              <div className="text-xs text-foreground-400 mt-0.5">
                {formatTime(session.start_ts)} → {formatTime(session.end_ts)}
                {session.song?.artist && <span className="ml-2 text-foreground-500">· {session.song.artist}</span>}
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <div className="text-primary font-semibold text-sm">{formatDurationLong(session.duration_seconds)}</div>
              <div className="text-[10px] text-foreground-500 mt-0.5">details →</div>
            </div>
          </div>
          {session.note && (
            <div className="mt-2 text-xs text-foreground-400 italic pl-14">"{session.note}"</div>
          )}
        </CardBody>
      </Card>
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
        <Card key={song.id} classNames={{ base: 'bg-content2 border border-divider', body: 'p-3' }}>
          <CardBody>
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-xl overflow-hidden bg-content3 flex-shrink-0">
                {song.cover_url
                  ? <Image src={song.cover_url} alt={song.title} className="w-14 h-14 object-cover" removeWrapper />
                  : <div className="w-14 h-14 flex items-center justify-center text-2xl">🎵</div>
                }
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-foreground truncate">{song.title}</div>
                <div className="text-xs text-foreground-400 truncate">{song.artist ?? 'Unknown Artist'}</div>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {song.genre && <Chip size="sm" variant="flat" color="secondary" className="h-5 text-[10px]">{song.genre}</Chip>}
                  {song.album && <Chip size="sm" variant="flat" className="h-5 text-[10px] bg-content3 text-foreground-400">{song.album}</Chip>}
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-primary font-semibold text-sm">{formatDurationLong(song.total_seconds ?? 0)}</div>
                <div className="text-xs text-foreground-500 mt-0.5">
                  {song.session_count ?? 0} session{song.session_count !== 1 ? 's' : ''}
                </div>
                {song.last_played_date && (
                  <div className="text-[10px] text-foreground-500 mt-0.5">Last: {song.last_played_date}</div>
                )}
              </div>
            </div>
          </CardBody>
        </Card>
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
        <Card key={g.artist} classNames={{ base: 'bg-content2 border border-divider', body: 'p-0' }}>
          <CardBody>
            <div className="flex items-center justify-between px-4 py-3 border-b border-divider">
              <div className="font-medium text-foreground text-sm">{g.artist}</div>
              <div className="text-xs text-foreground-400">{formatDurationLong(g.totalSeconds)} · {g.sessionCount} sessions</div>
            </div>
            <div className="p-3 flex flex-wrap gap-2">
              {g.songs.map(s => (
                <div key={s.id} className="flex items-center gap-2 px-2.5 py-1 bg-content3 rounded-lg text-xs text-foreground-300">
                  {s.cover_url && (
                    <Image src={s.cover_url} alt="" className="w-4 h-4 rounded object-cover" removeWrapper />
                  )}
                  {s.title}
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
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

  const GENRE_CHIP_COLOR: Record<string, 'warning' | 'primary' | 'danger' | 'success' | 'secondary' | 'default'> = {
    classical: 'warning',
    jazz: 'primary',
    pop: 'danger',
    rock: 'danger',
    electronic: 'secondary',
  };

  const colorFor = (genre: string) => GENRE_CHIP_COLOR[genre.toLowerCase()] ?? 'secondary';

  return (
    <div className="space-y-4">
      {groups.map(g => (
        <Card key={g.genre} classNames={{ base: 'bg-content2 border border-divider', body: 'p-4' }}>
          <CardBody>
            <div className="flex items-center justify-between mb-3">
              <Chip size="sm" variant="flat" color={colorFor(g.genre)} className="font-medium">{g.genre}</Chip>
              <span className="text-xs text-foreground-400">{formatDurationLong(g.totalSeconds)} · {g.sessionCount} sessions</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {g.songs.map(s => (
                <div key={s.id} className="flex items-center gap-1.5 px-2.5 py-1 bg-content3 rounded-lg text-xs text-foreground-300">
                  {s.cover_url && (
                    <Image src={s.cover_url} alt="" className="w-4 h-4 rounded object-cover" removeWrapper />
                  )}
                  <span className="truncate max-w-[120px]">{s.title}</span>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      ))}
    </div>
  );
}

// ── Empty State ───────────────────────────────────────────────────────────────

function EmptyState({ label }: { label: string }) {
  return (
    <div className="text-center py-20 text-foreground-500">
      <div className="text-4xl mb-3">🎹</div>
      <div className="text-sm max-w-xs mx-auto">{label}</div>
    </div>
  );
}

// ── Main History Page ─────────────────────────────────────────────────────────

export default function History() {
  const { data: sessions, refresh } = useSessions(500);
  const { data: songs } = useSongs();

  // Group timeline sessions by month
  const grouped = sessions.reduce((acc, s) => {
    const month = s.date.slice(0, 7);
    if (!acc[month]) acc[month] = [];
    acc[month].push(s);
    return acc;
  }, {} as Record<string, SessionRecord[]>);
  const months = Object.keys(grouped).sort().reverse();

  return (
    <div className="p-4 md:p-6 lg:p-8 fade-in">
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-2xl font-semibold text-foreground">History</h1>
        <p className="text-foreground-400 text-sm mt-1">
          {sessions.length} sessions · {songs.length} songs tagged
        </p>
      </div>

      <Tabs
        aria-label="History tabs"
        color="primary"
        variant="underlined"
        classNames={{
          tabList: 'gap-4 w-full border-b border-divider mb-5 overflow-x-auto',
          cursor: 'bg-primary',
          tab: 'min-w-max',
        }}
      >
        <Tab key="timeline" title={<span className="flex items-center gap-1.5 text-sm">📋 Timeline</span>}>
          {months.length === 0 ? (
            <EmptyState label="No sessions yet. Start playing to record your first session!" />
          ) : (
            <div className="space-y-8 pt-2">
              {months.map(month => {
                const monthSessions = grouped[month];
                const totalSeconds = monthSessions.reduce((s, x) => s + x.duration_seconds, 0);
                const [year, m] = month.split('-');
                const monthLabel = new Date(parseInt(year), parseInt(m) - 1)
                  .toLocaleDateString([], { month: 'long', year: 'numeric' });
                return (
                  <div key={month}>
                    <div className="flex items-center justify-between mb-3">
                      <h2 className="text-sm font-medium text-foreground-400">{monthLabel}</h2>
                      <span className="text-xs text-foreground-500">
                        {monthSessions.length} sessions · {formatDurationLong(totalSeconds)}
                      </span>
                    </div>
                    <div className="space-y-2">
                      {monthSessions.map(s => <SessionRow key={s.id} session={s} onUpdate={refresh} />)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Tab>

        <Tab key="songs" title={<span className="flex items-center gap-1.5 text-sm">🎵 By Song</span>}>
          <div className="pt-2"><BySongTab songs={songs} /></div>
        </Tab>

        <Tab key="artists" title={<span className="flex items-center gap-1.5 text-sm">🎤 By Artist</span>}>
          <div className="pt-2"><ByArtistTab songs={songs} /></div>
        </Tab>

        <Tab key="genres" title={<span className="flex items-center gap-1.5 text-sm">🎼 By Genre</span>}>
          <div className="pt-2"><ByGenreTab songs={songs} /></div>
        </Tab>
      </Tabs>
    </div>
  );
}

