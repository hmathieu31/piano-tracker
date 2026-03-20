import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useSessions } from '../hooks/useData';
import { SessionRecord } from '../types';
import { formatDurationLong, formatTime, formatDate } from '../utils';

function SessionRow({ session, onNoteUpdate }: { session: SessionRecord; onNoteUpdate: () => void }) {
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState(session.note ?? '');
  const [saving, setSaving] = useState(false);

  const saveNote = async () => {
    setSaving(true);
    try {
      await invoke('update_session_note', { id: session.id, note });
      setEditing(false);
      onNoteUpdate();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-[#1e1e28] rounded-xl p-4 border border-white/5 hover:border-white/10 transition-colors">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <div className="w-1 h-12 rounded-full bg-sky-500/60" />
          <div>
            <div className="text-sm font-medium text-white">{formatDate(session.date)}</div>
            <div className="text-xs text-slate-500 mt-0.5">
              {formatTime(session.start_ts)} → {formatTime(session.end_ts)}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-sky-400 font-semibold">{formatDurationLong(session.duration_seconds)}</div>
          <button
            onClick={() => setEditing(!editing)}
            className="text-xs text-slate-500 hover:text-slate-300 mt-1"
          >
            {editing ? 'Cancel' : session.note ? '✏️ Edit note' : '+ Add note'}
          </button>
        </div>
      </div>
      {editing ? (
        <div className="mt-3 flex gap-2">
          <input
            className="flex-1 bg-[#252533] border border-white/10 rounded-lg px-3 py-1.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-sky-500/50"
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="What did you practice?"
            autoFocus
            onKeyDown={e => { if (e.key === 'Enter') saveNote(); if (e.key === 'Escape') setEditing(false); }}
          />
          <button
            onClick={saveNote}
            disabled={saving}
            className="px-3 py-1.5 bg-sky-500 hover:bg-sky-600 text-white text-sm rounded-lg transition-colors"
          >
            Save
          </button>
        </div>
      ) : session.note ? (
        <div className="mt-2 text-xs text-slate-400 ml-5 italic">"{session.note}"</div>
      ) : null}
    </div>
  );
}

export default function History() {
  const { data: sessions, refresh } = useSessions(200);

  // Group by month
  const grouped = sessions.reduce((acc, s) => {
    const month = s.date.slice(0, 7);
    if (!acc[month]) acc[month] = [];
    acc[month].push(s);
    return acc;
  }, {} as Record<string, SessionRecord[]>);

  const months = Object.keys(grouped).sort().reverse();

  return (
    <div className="p-8 fade-in">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-white">History</h1>
        <p className="text-slate-500 text-sm mt-1">{sessions.length} sessions recorded</p>
      </div>

      {months.length === 0 ? (
        <div className="text-center py-20 text-slate-500">
          <div className="text-4xl mb-3">🎹</div>
          <div>No sessions yet. Start playing to record your first session!</div>
        </div>
      ) : (
        <div className="space-y-8">
          {months.map(month => {
            const monthSessions = grouped[month];
            const totalSeconds = monthSessions.reduce((s, x) => s + x.duration_seconds, 0);
            const [year, m] = month.split('-');
            const monthLabel = new Date(parseInt(year), parseInt(m) - 1).toLocaleDateString([], { month: 'long', year: 'numeric' });

            return (
              <div key={month}>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-medium text-slate-400">{monthLabel}</h2>
                  <span className="text-xs text-slate-500">
                    {monthSessions.length} sessions · {formatDurationLong(totalSeconds)}
                  </span>
                </div>
                <div className="space-y-2">
                  {monthSessions.map(s => (
                    <SessionRow key={s.id} session={s} onNoteUpdate={refresh} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
