import { useMemo } from 'react';
import type { MidiEventRecord } from '../types';

interface Props {
  events: MidiEventRecord[];
  durationMs?: number;
}

const NOTE_MIN = 21; // A0
const NOTE_MAX = 108; // C8

const BLACK_NOTES = new Set([1, 3, 6, 8, 10]); // semitones within octave

function isBlack(note: number): boolean {
  return BLACK_NOTES.has(note % 12);
}

interface NoteBar {
  note: number;
  startMs: number;
  durationMs: number;
  velocity: number;
  channel: number;
}

function buildNoteBars(events: MidiEventRecord[]): NoteBar[] {
  const openNotes = new Map<string, MidiEventRecord>();
  const bars: NoteBar[] = [];

  for (const ev of events) {
    const key = `${ev.channel}-${ev.note}`;
    if (ev.velocity > 0) {
      openNotes.set(key, ev);
    } else {
      const on = openNotes.get(key);
      if (on) {
        bars.push({
          note: ev.note,
          startMs: on.relative_ms,
          durationMs: Math.max(ev.relative_ms - on.relative_ms, 30),
          velocity: on.velocity,
          channel: on.channel,
        });
        openNotes.delete(key);
      }
    }
  }
  // Close any still-open notes at last event time
  const lastMs = events[events.length - 1]?.relative_ms ?? 0;
  for (const [, on] of openNotes) {
    bars.push({
      note: on.note,
      startMs: on.relative_ms,
      durationMs: Math.max(lastMs - on.relative_ms, 30),
      velocity: on.velocity,
      channel: on.channel,
    });
  }

  return bars;
}

const CHANNEL_COLORS = [
  '#38bdf8', // sky
  '#a78bfa', // violet
  '#34d399', // emerald
  '#fb923c', // orange
  '#f472b6', // pink
];

export default function PianoRoll({ events, durationMs }: Props) {
  const bars = useMemo(() => buildNoteBars(events), [events]);
  const totalMs = durationMs ?? (events[events.length - 1]?.relative_ms ?? 0) + 500;

  const width = 800;
  const height = 200;
  const keyWidth = 32;
  const rollWidth = width - keyWidth;

  // Determine visible note range
  const notesUsed = bars.map(b => b.note);
  const minNote = notesUsed.length ? Math.max(NOTE_MIN, Math.min(...notesUsed) - 4) : 48;
  const maxNote = notesUsed.length ? Math.min(NOTE_MAX, Math.max(...notesUsed) + 4) : 84;
  const visibleRange = maxNote - minNote + 1;
  const noteHeight = height / visibleRange;

  function noteY(note: number): number {
    return height - (note - minNote + 1) * noteHeight;
  }

  function noteX(ms: number): number {
    return keyWidth + (ms / totalMs) * rollWidth;
  }

  // Octave grid lines
  const gridLines: number[] = [];
  for (let n = minNote; n <= maxNote; n++) {
    if (n % 12 === 0) gridLines.push(n); // C notes
  }

  return (
    <div className="rounded-xl overflow-hidden border border-white/10 bg-[#0d0d14]">
      <svg width="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ display: 'block' }}>
        {/* Background */}
        <rect width={width} height={height} fill="#0d0d14" />

        {/* Alternating row tinting for black keys */}
        {Array.from({ length: visibleRange }, (_, i) => {
          const note = minNote + i;
          const y = noteY(note);
          return isBlack(note) ? (
            <rect key={note} x={keyWidth} y={y} width={rollWidth} height={noteHeight} fill="rgba(255,255,255,0.03)" />
          ) : null;
        })}

        {/* Vertical time grid lines every 5 seconds */}
        {Array.from({ length: Math.ceil(totalMs / 5000) }, (_, i) => {
          const x = keyWidth + ((i * 5000) / totalMs) * rollWidth;
          return (
            <line key={i} x1={x} y1={0} x2={x} y2={height} stroke="rgba(255,255,255,0.04)" strokeWidth={1} />
          );
        })}

        {/* Horizontal C note grid lines */}
        {gridLines.map(n => (
          <line
            key={n}
            x1={keyWidth}
            y1={noteY(n)}
            x2={width}
            y2={noteY(n)}
            stroke="rgba(255,255,255,0.08)"
            strokeWidth={1}
          />
        ))}

        {/* Note bars */}
        {bars.map((bar, i) => {
          if (bar.note < minNote || bar.note > maxNote) return null;
          const x = noteX(bar.startMs);
          const w = Math.max((bar.durationMs / totalMs) * rollWidth, 2);
          const y = noteY(bar.note) + noteHeight * 0.1;
          const h = noteHeight * 0.8;
          const alpha = 0.5 + (bar.velocity / 127) * 0.5;
          const color = CHANNEL_COLORS[bar.channel % CHANNEL_COLORS.length];

          return (
            <rect
              key={i}
              x={x}
              y={y}
              width={w}
              height={Math.max(h, 1.5)}
              rx={2}
              fill={color}
              opacity={alpha}
            />
          );
        })}

        {/* Piano keyboard */}
        {Array.from({ length: visibleRange }, (_, i) => {
          const note = minNote + i;
          const y = noteY(note);
          const black = isBlack(note);
          return (
            <rect
              key={note}
              x={0}
              y={y}
              width={black ? keyWidth * 0.65 : keyWidth}
              height={noteHeight}
              fill={black ? '#1e1e2e' : '#e2e8f0'}
              stroke="rgba(0,0,0,0.3)"
              strokeWidth={0.5}
            />
          );
        })}

        {/* C note labels */}
        {gridLines.map(n => (
          <text
            key={n}
            x={keyWidth - 2}
            y={noteY(n) + noteHeight * 0.75}
            textAnchor="end"
            fontSize={noteHeight * 0.7}
            fill="#64748b"
          >
            C{Math.floor(n / 12) - 1}
          </text>
        ))}
      </svg>
    </div>
  );
}
