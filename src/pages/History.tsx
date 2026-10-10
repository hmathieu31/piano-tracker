import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { revealItemInDir } from '@tauri-apps/plugin-opener';
import { useSessions, useGoalsStatus, useStreak, useInsights, useAchievements } from '../hooks/useData';
import { useMidiEvents, useRecentSongs } from '../hooks/useSongs';
import { formatDurationLong, formatTime, localDay, todayStr } from '../utils';
import FeelingPicker from '../components/FeelingPicker';
import PianoRoll from '../components/PianoRoll';
import SongSearchModal from '../components/SongSearchModal';
import type { SessionRecord, SongRecord } from '../types';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** The days shown for a month: whole Monday-to-Sunday weeks around it. */
function monthGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - ((first.getDay() + 6) % 7));
  const last = new Date(year, month + 1, 0);
  const days: Date[] = [];
  for (let d = start; d <= last || days.length % 7 !== 0; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    days.push(d);
  }
  return days;
}

function SessionCard({ session, recentSongs, onChange }: { session: SessionRecord; recentSongs: SongRecord[]; onChange: () => void }) {
  const [searching, setSearching] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [editingNote, setEditingNote] = useState(false);
  const [note, setNote] = useState(session.note ?? '');
  const [exportError, setExportError] = useState(false);
  const { data: events, loading } = useMidiEvents(showNotes ? session.id : null);

  const tag = async (songId: number) => {
    await invoke('link_session_song', { sessionId: session.id, songId }).catch(() => {});
    onChange();
  };
  const saveNote = async () => {
    await invoke('update_session_note', { id: session.id, note }).catch(() => {});
    setEditingNote(false);
    onChange();
  };
  const exportMidi = async () => {
    setExportError(false);
    try {
      const path = await invoke<string>('save_midi_file', { sessionId: session.id, date: session.date, songName: session.song?.title });
      await revealItemInDir(path);
    } catch {
      setExportError(true);
    }
  };
  const action = 'h-7 px-2.5 rounded-lg border border-white/10 bg-content3 hover:bg-content4 text-xs text-foreground-300';

  return (
    <div className="p-4 rounded-2xl bg-content2 border border-divider flex flex-col gap-3">
      <div className="flex justify-between items-center gap-3">
        <div className="min-w-0">
          <div className={`text-sm font-medium truncate ${session.song ? 'text-foreground' : 'text-foreground-400'}`}>
            {session.song?.title ?? 'Warm-up or untagged'}
          </div>
          <div className="text-xs text-foreground-500 mt-0.5">{formatTime(session.start_ts)} · {formatDurationLong(session.duration_seconds)}</div>
        </div>
        <FeelingPicker sessionId={session.id} value={session.feeling} onChange={onChange} size="sm" />
      </div>
      {editingNote ? (
        <div className="flex gap-2">
          <input
            autoFocus
            value={note}
            onChange={e => setNote(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') saveNote(); if (e.key === 'Escape') setEditingNote(false); }}
            placeholder="What did you work on?"
            className="flex-1 h-8 px-2.5 rounded-lg bg-content3 border border-white/10 text-sm outline-none focus:border-primary/50"
          />
          <button onClick={saveNote} className="h-8 px-3 rounded-lg bg-primary text-white text-xs">Save</button>
        </div>
      ) : session.note ? (
        <button onClick={() => setEditingNote(true)} className="text-left text-xs italic text-foreground-400">"{session.note}"</button>
      ) : null}
      <div className="flex flex-wrap gap-1.5">
        <button onClick={() => setSearching(true)} className={action}>Change song</button>
        {!session.note && !editingNote && <button onClick={() => setEditingNote(true)} className={action}>Add note</button>}
        <button onClick={() => setShowNotes(v => !v)} className={action}>{showNotes ? 'Hide notes played' : 'Notes played'}</button>
        <button onClick={exportMidi} className={action}>Export MIDI</button>
        {session.song && (
          <button onClick={async () => { await invoke('unlink_session_song', { sessionId: session.id }).catch(() => {}); onChange(); }} className={`${action} text-foreground-500`}>
            Mark as warm-up
          </button>
        )}
      </div>
      {exportError && <div className="text-xs text-danger">Export failed. Check the save folder in Settings.</div>}
      {showNotes && (loading
        ? <div className="text-xs text-foreground-500">Loading…</div>
        : events.length === 0
          ? <div className="text-xs text-foreground-500">No notes were recorded for this session.</div>
          : <PianoRoll events={events} durationMs={session.end_ts - session.start_ts} />)}
      {searching && (
        <SongSearchModal title="What did you play?" recentSongs={recentSongs} onPick={tag} onClose={() => setSearching(false)} />
      )}
    </div>
  );
}

export default function History() {
  const { data: sessions, refresh } = useSessions(10000);
  const { data: goals } = useGoalsStatus();
  const { data: recentSongs } = useRecentSongs(6);
  const streak = useStreak();
  const insights = useInsights();
  const { data: achievements } = useAchievements();
  const now = new Date();
  const [month, setMonth] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const [selected, setSelected] = useState(todayStr());

  const goalSeconds = (goals?.config.daily_minutes ?? 30) * 60;
  const byDay = new Map<string, SessionRecord[]>();
  for (const s of sessions) byDay.set(s.date, [...(byDay.get(s.date) ?? []), s]);
  const total = (day: string) => (byDay.get(day) ?? []).reduce((a, s) => a + s.duration_seconds, 0);

  const prefix = `${month.year}-${String(month.month + 1).padStart(2, '0')}`;
  const monthSessions = sessions.filter(s => s.date.startsWith(prefix));
  const monthSeconds = monthSessions.reduce((a, s) => a + s.duration_seconds, 0);
  const monthDays = [...new Set(monthSessions.map(s => s.date))];
  const daysAtGoal = monthDays.filter(d => total(d) >= goalSeconds).length;
  const songTime = new Map<string, number>();
  for (const s of monthSessions) if (s.song) songTime.set(s.song.title, (songTime.get(s.song.title) ?? 0) + s.duration_seconds);
  const mostPlayed = [...songTime.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

  const today = todayStr();
  const shift = (by: number) => setMonth(m => {
    const d = new Date(m.year, m.month + by, 1);
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const daySessions = [...(byDay.get(selected) ?? [])].sort((a, b) => a.start_ts - b.start_ts);
  const unlockedCount = achievements.filter(a => a.unlocked_at != null).length;
  const navBtn = 'w-8 h-8 rounded-lg border border-white/10 bg-content2 hover:bg-content3 text-foreground-300';

  return (
    <div className="p-8 flex flex-wrap gap-8 fade-in">
      <section className="flex-1 min-w-[560px] flex flex-col gap-5">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">History</h1>
          <div className="flex items-center gap-3 text-[15px] font-semibold">
            <button onClick={() => shift(-1)} className={navBtn} aria-label="Previous month">‹</button>
            <span className="w-36 text-center">{new Date(month.year, month.month, 1).toLocaleDateString([], { month: 'long', year: 'numeric' })}</span>
            <button onClick={() => shift(1)} className={navBtn} aria-label="Next month">›</button>
          </div>
        </div>

        <div className="flex flex-wrap gap-8 px-5 py-4 rounded-2xl bg-[#16161d] border border-white/5">
          {[
            { value: formatDurationLong(monthSeconds), label: 'this month' },
            { value: String(monthSessions.length), label: monthSessions.length === 1 ? 'session' : 'sessions' },
            { value: `${daysAtGoal} of ${monthDays.length}`, label: 'days at goal', green: true },
            { value: mostPlayed ?? '—', label: 'most played' },
          ].map(k => (
            <div key={k.label} className="min-w-0">
              <div className={`text-xl font-bold truncate max-w-[14rem] ${k.green ? 'text-green-400' : 'text-foreground'}`}>{k.value}</div>
              <div className="text-xs text-foreground-500">{k.label}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-2">
          {WEEKDAYS.map(w => <div key={w} className="px-2.5 text-[11px] font-semibold uppercase tracking-wider text-foreground-500">{w}</div>)}
          {monthGrid(month.year, month.month).map(date => {
            const key = localDay(date);
            if (date.getMonth() !== month.month) {
              return <div key={key} className="h-24 p-2.5 text-[13px] text-foreground-600 opacity-40">{date.getDate()}</div>;
            }
            const seconds = total(key);
            const future = key > today;
            const met = seconds >= goalSeconds;
            return (
              <button
                key={key}
                disabled={future}
                onClick={() => setSelected(key)}
                className={`h-24 p-2.5 rounded-xl border text-left flex flex-col gap-1.5 ${
                  key === selected ? 'bg-content2 border-primary/60 ring-1 ring-primary/60'
                    : future ? 'bg-[#16161d]/50 border-white/5' : 'bg-[#16161d] border-white/5 hover:border-white/15'
                }`}
              >
                <span className={`text-[13px] font-semibold ${key === today ? 'text-sky-400' : future ? 'text-foreground-600' : 'text-foreground-300'}`}>{date.getDate()}</span>
                {seconds > 0 && (
                  <>
                    <span className={`mt-auto text-[15px] font-semibold ${met ? 'text-green-400' : 'text-foreground'}`}>{Math.round(seconds / 60)} min</span>
                    <span className="h-1 rounded-full bg-white/[0.07] overflow-hidden">
                      <span className={`block h-full rounded-full ${met ? 'bg-green-500' : 'bg-sky-500'}`} style={{ width: `${Math.min(100, (seconds / goalSeconds) * 100)}%` }} />
                    </span>
                  </>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-5 text-xs text-foreground-500">
          <span className="inline-flex items-center gap-1.5"><i className="w-4 h-1 rounded-full bg-green-500" />Goal met ({goals?.config.daily_minutes ?? 30} min)</span>
          <span className="inline-flex items-center gap-1.5"><i className="w-4 h-1 rounded-full bg-sky-500" />Part of the goal</span>
          <span className="ml-auto">
            Best streak {streak.best_streak} day{streak.best_streak === 1 ? '' : 's'}
            {insights && insights.best_day_seconds > 0 && ` · Best day ${formatDurationLong(insights.best_day_seconds)}`}
            {achievements.length > 0 && ` · ${unlockedCount} of ${achievements.length} badges`}
          </span>
        </div>
      </section>

      <aside className="w-[360px] flex-shrink-0 flex flex-col gap-3.5 pt-1">
        <div>
          <div className="text-sm text-foreground-500">
            {new Date(selected + 'T00:00:00').toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
          </div>
          <div className="text-2xl font-bold text-foreground mt-0.5">
            {daySessions.length === 0
              ? 'No practice'
              : `${formatDurationLong(total(selected))} · ${daySessions.length} session${daySessions.length === 1 ? '' : 's'}`}
          </div>
        </div>
        {daySessions.map(s => <SessionCard key={s.id} session={s} recentSongs={recentSongs} onChange={refresh} />)}
      </aside>
    </div>
  );
}
