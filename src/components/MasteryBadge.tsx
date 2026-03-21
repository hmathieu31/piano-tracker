import { invoke } from '@tauri-apps/api/core';
import { Chip } from '@heroui/react';

const STATUS_CONFIG: Record<string, { label: string; color: 'warning' | 'primary' | 'success' }> = {
  learning:   { label: '🌱 Learning',   color: 'warning'  },
  practicing: { label: '🎵 Practicing', color: 'primary'  },
  mastered:   { label: '⭐ Mastered',   color: 'success'  },
};

const CYCLE = ['learning', 'practicing', 'mastered'];

interface Props {
  status: string | null | undefined;
  songId?: number;
  onChanged?: (newStatus: string) => void;
}

export default function MasteryBadge({ status, songId, onChanged }: Props) {
  const key = (status ?? 'learning') as keyof typeof STATUS_CONFIG;
  const cfg = STATUS_CONFIG[key] ?? STATUS_CONFIG.learning;

  const handleClick = async () => {
    if (!songId) return;
    const idx = CYCLE.indexOf(key);
    const next = CYCLE[(idx + 1) % CYCLE.length];
    try {
      await invoke('set_song_status', { songId, status: next });
      onChanged?.(next);
    } catch {}
  };

  return (
    <Chip
      color={cfg.color}
      variant="flat"
      size="sm"
      onClick={songId ? handleClick : undefined}
      className={songId ? 'cursor-pointer select-none' : ''}
      title={songId ? 'Click to advance stage' : undefined}
    >
      {cfg.label}
    </Chip>
  );
}
