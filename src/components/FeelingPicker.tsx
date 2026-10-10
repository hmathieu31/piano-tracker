import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

/** Session moods, stored 1 (rough) to 5 (great). */
export const FEELINGS = [
  { value: 1, emoji: '😞', label: 'Rough' },
  { value: 2, emoji: '😐', label: 'Meh' },
  { value: 3, emoji: '🙂', label: 'Okay' },
  { value: 4, emoji: '😊', label: 'Good' },
  { value: 5, emoji: '🤩', label: 'Great' },
];

export function feelingInfo(value: number | null | undefined) {
  return FEELINGS.find(f => f.value === value);
}

export function feelingEmoji(value: number | null | undefined): string {
  return feelingInfo(value)?.emoji ?? '·';
}

export function feelingLabel(value: number | null | undefined): string {
  return feelingInfo(value)?.label ?? '—';
}

interface Props {
  sessionId: number;
  value: number | null | undefined;
  onChange?: (newValue: number | null) => void;
  size?: 'sm' | 'md';
}

export default function FeelingPicker({ sessionId, value, onChange, size = 'md' }: Props) {
  const [current, setCurrent] = useState<number | null>(value ?? null);

  const pick = async (v: number) => {
    const newVal = current === v ? null : v; // toggle off if same
    setCurrent(newVal);
    try {
      await invoke('set_session_feeling', { sessionId, feeling: newVal });
      onChange?.(newVal);
    } catch {}
  };

  const emojiClass = size === 'sm' ? 'text-base px-1 py-0.5' : 'text-xl px-1.5 py-0.5';

  return (
    <div className="flex items-center gap-0.5">
      {FEELINGS.map(f => (
        <button
          key={f.value}
          onClick={() => pick(f.value)}
          title={f.label}
          className={`${emojiClass} rounded-lg transition-all duration-150 ${
            current === f.value
              ? 'bg-primary/25 scale-125 shadow-sm'
              : 'opacity-35 hover:opacity-80 hover:scale-110'
          }`}
        >
          {f.emoji}
        </button>
      ))}
    </div>
  );
}
