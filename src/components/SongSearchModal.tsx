import { useState, useEffect, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { searchRecordings, fetchRecordingGenre, type MBSearchResult } from '../api/musicSearch';
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
  const [tab, setTab] = useState<'search' | 'recent'>('search');
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

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
      const genre = result.recordingId ? await fetchRecordingGenre(result.recordingId) : null;
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div
        className="bg-[#1a1a24] border border-white/10 rounded-2xl w-full max-w-lg mx-4 shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-3 border-b border-white/5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-white">Tag this session</h2>
            <button onClick={onClose} className="text-slate-500 hover:text-slate-200 text-lg leading-none">✕</button>
          </div>
          {/* Tabs */}
          <div className="flex gap-1 bg-[#0f0f18] rounded-lg p-1">
            {(['search', 'recent'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  tab === t ? 'bg-sky-500/20 text-sky-400' : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {t === 'search' ? '🔍 Search Song' : '🕐 Recent Songs'}
              </button>
            ))}
          </div>
        </div>

        <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto">
          {tab === 'search' && (
            <>
              <div className="relative">
                <input
                  ref={inputRef}
                  value={query}
                  onChange={e => handleQueryChange(e.target.value)}
                  placeholder="Search song title…"
                  className="w-full bg-[#252533] border border-white/10 rounded-xl px-4 py-3 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-sky-500/50 pr-10"
                />
                {searching && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs animate-pulse">⏳</div>
                )}
              </div>

              {error && <p className="text-xs text-red-400">{error}</p>}

              {results.length > 0 && (
                <div className="space-y-2">
                  {results.map(r => (
                    <button
                      key={r.recordingId}
                      onClick={() => assignFromSearch(r)}
                      disabled={saving}
                      className="w-full flex items-center gap-3 p-3 rounded-xl bg-[#252533] hover:bg-[#2e2e42] border border-white/5 hover:border-sky-500/20 transition-all text-left disabled:opacity-50"
                    >
                      {r.coverUrl ? (
                        <img
                          src={r.coverUrl}
                          alt={r.title}
                          className="w-10 h-10 rounded-lg object-cover flex-shrink-0 bg-[#1a1a24]"
                          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-[#1a1a24] flex items-center justify-center text-lg flex-shrink-0">🎵</div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-white truncate">{r.title}</div>
                        <div className="text-xs text-slate-400 truncate">{r.artist}{r.album ? ` · ${r.album}` : ''}{r.year ? ` (${r.year})` : ''}</div>
                      </div>
                      <div className="text-xs text-sky-400 flex-shrink-0">Select →</div>
                    </button>
                  ))}
                </div>
              )}

              {query.trim() && results.length === 0 && !searching && (
                <button
                  onClick={assignManual}
                  disabled={saving}
                  className="w-full p-3 rounded-xl border border-dashed border-white/15 hover:border-sky-500/30 text-sm text-slate-400 hover:text-slate-200 transition-colors disabled:opacity-50"
                >
                  Add "{query.trim()}" without metadata
                </button>
              )}
            </>
          )}

          {tab === 'recent' && (
            <>
              {recentSongs.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-4">No songs tagged yet.</p>
              ) : (
                <div className="space-y-2">
                  {recentSongs.map(song => (
                    <button
                      key={song.id}
                      onClick={() => assignRecentSong(song)}
                      disabled={saving}
                      className="w-full flex items-center gap-3 p-3 rounded-xl bg-[#252533] hover:bg-[#2e2e42] border border-white/5 hover:border-sky-500/20 transition-all text-left disabled:opacity-50"
                    >
                      {song.cover_url ? (
                        <img
                          src={song.cover_url}
                          alt={song.title}
                          className="w-10 h-10 rounded-lg object-cover flex-shrink-0 bg-[#1a1a24]"
                          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-[#1a1a24] flex items-center justify-center text-lg flex-shrink-0">🎵</div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-white truncate">{song.title}</div>
                        <div className="text-xs text-slate-400 truncate">
                          {song.artist ?? 'Unknown Artist'}
                          {song.session_count != null ? ` · ${song.session_count} session${song.session_count !== 1 ? 's' : ''}` : ''}
                        </div>
                      </div>
                      <div className="text-xs text-sky-400 flex-shrink-0">Select →</div>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
