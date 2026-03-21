import { useState, useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import SongSearchModal from './SongSearchModal';
import type { SongRecord } from '../types';

export default function QuickAssociateBanner() {
  const [lastSessionId, setLastSessionId] = useState<number | null>(null);
  const [visible, setVisible] = useState(false);
  const [recentSongs, setRecentSongs] = useState<SongRecord[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [assigned, setAssigned] = useState(false);

  useEffect(() => {
    const unlisten = listen<number>('session-ended', async (e) => {
      const id = e.payload;
      setLastSessionId(id);
      setAssigned(false);
      setVisible(true);
      try {
        const songs = await invoke<SongRecord[]>('get_recent_songs', { limit: 5 });
        setRecentSongs(songs);
      } catch {}
    });
    return () => { unlisten.then(fn => fn()); };
  }, []);

  const assignRecent = async (song: SongRecord) => {
    if (lastSessionId == null) return;
    try {
      await invoke('link_session_song', { sessionId: lastSessionId, songId: song.id });
      setAssigned(true);
      setTimeout(() => setVisible(false), 2000);
    } catch {}
  };

  const dismiss = () => setVisible(false);

  if (!visible) return null;

  return (
    <>
      {showModal && lastSessionId != null && (
        <SongSearchModal
          sessionId={lastSessionId}
          recentSongs={recentSongs}
          onAssigned={() => { setAssigned(true); setTimeout(() => setVisible(false), 2000); }}
          onClose={() => setShowModal(false)}
        />
      )}

      <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-40 w-[calc(100%-2rem)] max-w-xl animate-slide-up">
        <div className="bg-[#1a1a28] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
          {assigned ? (
            <div className="flex items-center gap-3 px-4 py-3">
              <span className="text-green-400 text-lg">✓</span>
              <span className="text-sm text-slate-300">Session tagged!</span>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
                <div className="flex items-center gap-2">
                  <span className="text-sky-400 text-sm">🎵</span>
                  <span className="text-sm font-medium text-white">What did you practice?</span>
                </div>
                <button onClick={dismiss} className="text-slate-600 hover:text-slate-300 text-sm">✕</button>
              </div>

              <div className="px-4 py-3 flex flex-wrap gap-2 items-center">
                {recentSongs.slice(0, 4).map(song => (
                  <button
                    key={song.id}
                    onClick={() => assignRecent(song)}
                    className="flex items-center gap-2 px-3 py-1.5 bg-[#252535] hover:bg-sky-500/15 border border-white/8 hover:border-sky-500/30 rounded-full text-xs text-slate-300 hover:text-white transition-all"
                  >
                    {song.cover_url && (
                      <img
                        src={song.cover_url}
                        alt=""
                        className="w-4 h-4 rounded-full object-cover"
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    )}
                    {song.title}
                  </button>
                ))}
                <button
                  onClick={() => setShowModal(true)}
                  className="flex items-center gap-1 px-3 py-1.5 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/20 hover:border-sky-500/40 rounded-full text-xs text-sky-400 transition-all"
                >
                  + Other song
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
