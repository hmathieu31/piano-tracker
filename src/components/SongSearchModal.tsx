import { useState, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  Modal, ModalContent, ModalHeader, ModalBody,
  Button, Input, Tabs, Tab, Chip, Spinner, Image,
} from '@heroui/react';
import { searchRecordings, type MBSearchResult } from '../api/musicSearch';
import type { SongRecord } from '../types';

interface Props {
  sessionId: number;
  recentSongs: SongRecord[];
  onAssigned: () => void;
  onClose: () => void;
}

export default function SongSearchModal({ sessionId, recentSongs, onAssigned, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MBSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return; }
    setSearching(true);
    setError(null);
    try {
      const res = await searchRecordings(q);
      setResults(res);
    } catch {
      setError('Search failed. Check your internet connection.');
    } finally {
      setSearching(false);
    }
  }, []);

  const handleQueryChange = (v: string) => {
    setQuery(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(v), 600);
  };

  const assignFromSearch = async (result: MBSearchResult) => {
    setSaving(true);
    try {
      // iTunes already returns genre — no extra fetch needed
      const genre = result.genre;
      const songId = await invoke<number>('create_song', {
        title: result.title,
        artist: result.artist,
        genre,
        album: result.album,
        year: result.year,
        coverUrl: result.coverUrl,
        spotifyUrl: result.spotifyUrl,
        mbRecordingId: result.recordingId,
        mbReleaseId: result.releaseId,
        difficulty: null,
      });
      await invoke('link_session_song', { sessionId, songId });
      onAssigned();
      onClose();
    } catch {
      setError('Failed to save song. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const assignRecentSong = async (song: SongRecord) => {
    setSaving(true);
    try {
      await invoke('link_session_song', { sessionId, songId: song.id });
      onAssigned();
      onClose();
    } catch {
      setError('Failed to assign song.');
    } finally {
      setSaving(false);
    }
  };

  const assignManual = async () => {
    if (!query.trim()) return;
    setSaving(true);
    try {
      const songId = await invoke<number>('create_song', {
        title: query.trim(),
        artist: null, genre: null, album: null, year: null,
        coverUrl: null, spotifyUrl: null, mbRecordingId: null, mbReleaseId: null,
        difficulty: null,
      });
      await invoke('link_session_song', { sessionId, songId });
      onAssigned();
      onClose();
    } catch {
      setError('Failed to save song.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      size="lg"
      classNames={{
        backdrop: 'bg-black/70',
        base: 'bg-content1 border border-white/8',
        header: 'border-b border-divider',
        body: 'py-4',
      }}
    >
      <ModalContent>
        <ModalHeader className="flex flex-col gap-1">
          <span className="text-base font-semibold">Tag this session</span>
          <span className="text-xs text-foreground-400 font-normal">Search for a song or pick from recent</span>
        </ModalHeader>
        <ModalBody>
          <Tabs
            aria-label="Song search tabs"
            color="primary"
            variant="underlined"
            classNames={{ tabList: 'gap-4 w-full border-b border-divider', cursor: 'bg-primary' }}
          >
            <Tab key="search" title={<span className="flex items-center gap-1.5 text-sm">🔍 Search Song</span>}>
              <div className="pt-3 space-y-3">
                <Input
                  autoFocus
                  value={query}
                  onValueChange={handleQueryChange}
                  placeholder="Artist or song title…"
                  variant="bordered"
                  classNames={{ input: 'text-sm', inputWrapper: 'bg-content3 border-white/10 hover:border-primary/50 focus-within:!border-primary/70' }}
                  endContent={searching ? <Spinner size="sm" color="primary" /> : null}
                />

                {error && <p className="text-xs text-danger">{error}</p>}

                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {results.map(r => (
                    <button
                      key={r.recordingId}
                      onClick={() => assignFromSearch(r)}
                      disabled={saving}
                      className="w-full flex items-center gap-3 p-3 rounded-xl bg-content2 hover:bg-content3 border border-white/5 hover:border-primary/20 transition-all text-left disabled:opacity-50"
                    >
                      <div className="w-10 h-10 flex-shrink-0 rounded-lg overflow-hidden bg-content3">
                        {r.coverUrl
                          ? <Image src={r.coverUrl} alt={r.title} className="w-10 h-10 object-cover" removeWrapper />
                          : <div className="w-10 h-10 flex items-center justify-center text-lg">&#x1F3B5;</div>
                        }
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-foreground truncate">{r.title}</div>
                        <div className="text-xs text-foreground-400 truncate">
                          {r.artist}{r.album ? ` · ${r.album}` : ''}{r.year ? ` (${r.year})` : ''}
                        </div>
                        {r.genre && (
                          <Chip size="sm" variant="flat" color="secondary" className="mt-1 h-4 text-[10px]">{r.genre}</Chip>
                        )}
                      </div>
                      <span className="text-xs text-primary flex-shrink-0">Select &#x2192;</span>
                    </button>
                  ))}
                </div>

                {query.trim() && results.length === 0 && !searching && (
                  <Button
                    variant="bordered"
                    onPress={assignManual}
                    isLoading={saving}
                    className="w-full border-dashed border-white/15 text-foreground-400"
                  >
                    Add "{query.trim()}" without metadata
                  </Button>
                )}
              </div>
            </Tab>

            <Tab key="recent" title={<span className="flex items-center gap-1.5 text-sm">&#x1F550; Recent Songs</span>}>
              <div className="pt-3 space-y-2 max-h-80 overflow-y-auto pr-1">
                {recentSongs.length === 0 ? (
                  <p className="text-sm text-foreground-400 text-center py-6">No songs tagged yet.</p>
                ) : (
                  recentSongs.map(song => (
                    <button
                      key={song.id}
                      onClick={() => assignRecentSong(song)}
                      disabled={saving}
                      className="w-full flex items-center gap-3 p-3 rounded-xl bg-content2 hover:bg-content3 border border-white/5 hover:border-primary/20 transition-all text-left disabled:opacity-50"
                    >
                      <div className="w-10 h-10 flex-shrink-0 rounded-lg overflow-hidden bg-content3">
                        {song.cover_url
                          ? <Image src={song.cover_url} alt={song.title} className="w-10 h-10 object-cover" removeWrapper />
                          : <div className="w-10 h-10 flex items-center justify-center text-lg">&#x1F3B5;</div>
                        }
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-foreground truncate">{song.title}</div>
                        <div className="text-xs text-foreground-400 truncate">
                          {song.artist ?? 'Unknown Artist'}
                          {song.session_count != null ? ` · ${song.session_count} session${song.session_count !== 1 ? 's' : ''}` : ''}
                        </div>
                      </div>
                      <span className="text-xs text-primary flex-shrink-0">Select &#x2192;</span>
                    </button>
                  ))
                )}
              </div>
            </Tab>
          </Tabs>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
