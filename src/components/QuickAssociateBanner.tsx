import { useState, useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { Card, CardBody, Button, Chip, Image } from '@heroui/react';
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
        <Card classNames={{ base: 'bg-content1 border border-white/10 shadow-2xl', body: 'p-0' }}>
          <CardBody>
            {assigned ? (
              <div className="flex items-center gap-3 px-4 py-3">
                <Chip color="success" variant="flat" size="sm">✓ Session tagged!</Chip>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between px-4 py-3 border-b border-divider">
                  <div className="flex items-center gap-2">
                    <span className="text-primary text-sm">🎵</span>
                    <span className="text-sm font-medium text-foreground">What did you practice?</span>
                  </div>
                  <Button isIconOnly size="sm" variant="light" onPress={() => setVisible(false)} className="text-foreground-400 min-w-unit-6 h-unit-6">✕</Button>
                </div>
                <div className="px-4 py-3 flex flex-wrap gap-2 items-center">
                  {recentSongs.slice(0, 4).map(song => (
                    <Button
                      key={song.id}
                      size="sm"
                      variant="flat"
                      onPress={() => assignRecent(song)}
                      className="h-8 gap-1.5 text-foreground-300"
                      startContent={song.cover_url
                        ? <Image src={song.cover_url} alt="" className="w-4 h-4 rounded-full object-cover" removeWrapper />
                        : undefined
                      }
                    >
                      {song.title}
                    </Button>
                  ))}
                  <Button
                    size="sm"
                    color="primary"
                    variant="flat"
                    onPress={() => setShowModal(true)}
                  >
                    + Other song
                  </Button>
                </div>
              </>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
