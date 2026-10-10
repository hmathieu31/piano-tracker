import { useState, type ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useSessionStatus, useStreak, useGoalsStatus, useSessions, useSongsWithStats } from '../hooks/useData';
import { formatDuration, formatDurationLong, formatTime, todayStr } from '../utils';
import FeelingPicker, { feelingEmoji } from '../components/FeelingPicker';
import SongSearchModal from '../components/SongSearchModal';
import UpNext from '../components/UpNext';
import type { SessionRecord, SongRecord } from '../types';

function GoalRing({ progress, met, children }: { progress: number; met: boolean; children: ReactNode }) {
  const deg = Math.min(100, progress) * 3.6;
  const color = met ? '#22c55e' : '#0ea5e9';
  return (
    <div
      className="w-[168px] h-[168px] flex-shrink-0 rounded-full flex items-center justify-center"
      style={{ background: `conic-gradient(${color} 0 ${deg}deg, rgba(255,255,255,0.07) ${deg}deg 360deg)` }}
    >
      <div className="w-[144px] h-[144px] rounded-full bg-[#16161d] flex flex-col items-center justify-center">
        {children}
      </div>
    </div>
  );
}

function MidiPill() {
  const status = useSessionStatus();
  const [reconnecting, setReconnecting] = useState(false);

  const reconnect = async () => {
    setReconnecting(true);
    await invoke('reconnect_midi').catch(() => {});
    setTimeout(() => setReconnecting(false), 2000);
  };

  if (status.is_playing) {
    return (
      <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-500/10 text-green-400 text-xs whitespace-nowrap">
        <i className="w-2 h-2 rounded-full bg-green-400 pulse-ring" />Playing · {formatDuration(status.elapsed_seconds)}
      </span>
    );
  }
  if (status.midi_connected) {
    return (
      <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-sky-500/10 text-sky-400 text-xs whitespace-nowrap" title={status.midi_port_name ?? undefined}>
        <i className="w-2 h-2 rounded-full bg-sky-400" />Piano connected
      </span>
    );
  }
  return (
    <button
      onClick={reconnect}
      disabled={reconnecting}
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 text-slate-400 hover:text-slate-200 text-xs whitespace-nowrap disabled:opacity-50"
    >
      <i className="w-2 h-2 rounded-full bg-slate-600" />{reconnecting ? 'Looking for your piano…' : 'No piano · Reconnect'}
    </button>
  );
}

function SessionCard({ session, recentSongs, onChange }: { session: SessionRecord; recentSongs: SongRecord[]; onChange: () => void }) {
  const [searching, setSearching] = useState(false);
  const tag = async (songId: number) => {
    await invoke('link_session_song', { sessionId: session.id, songId }).catch(() => {});
    onChange();
  };
  const tagged = session.song != null;

  return (
    <div className={`p-4 rounded-2xl bg-content2 border ${tagged ? 'border-divider' : 'border-warning/35'}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className={`text-sm font-medium truncate ${tagged ? 'text-foreground' : 'text-warning'}`}>
            {session.song?.title ?? 'Warm-up or untagged'}
          </div>
          <div className="text-xs text-foreground-500 mt-0.5">
            {formatTime(session.start_ts)} · {formatDurationLong(session.duration_seconds)}
          </div>
        </div>
        {session.feeling != null
          ? <span className="text-xl" title="Mood">{feelingEmoji(session.feeling)}</span>
          : <FeelingPicker sessionId={session.id} value={null} onChange={onChange} size="sm" />}
      </div>
      {!tagged && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {recentSongs.slice(0, 3).map(s => (
            <button key={s.id} onClick={() => tag(s.id)} className="h-7 max-w-[10rem] truncate px-2.5 rounded-full border border-white/10 bg-content3 hover:bg-content4 text-xs text-foreground-300">
              {s.title}
            </button>
          ))}
          <button onClick={() => setSearching(true)} className="h-7 px-2.5 rounded-full border border-white/10 bg-content3 hover:bg-content4 text-xs text-foreground-500">
            Other…
          </button>
        </div>
      )}
      {searching && (
        <SongSearchModal title="What did you play?" recentSongs={recentSongs} onPick={tag} onClose={() => setSearching(false)} />
      )}
    </div>
  );
}

export default function Today() {
  const streak = useStreak();
  const { data: goals } = useGoalsStatus();
  const { data: sessions, refresh: refreshSessions } = useSessions(30);
  const { data: songs, refresh: refreshSongs } = useSongsWithStats();

  const goalMinutes = goals?.config.daily_minutes ?? 30;
  const todaySeconds = goals?.today_seconds ?? 0;
  const todayMinutes = Math.floor(todaySeconds / 60);
  const goalMet = todaySeconds >= goalMinutes * 60;
  const minutesLeft = Math.max(1, Math.ceil((goalMinutes * 60 - todaySeconds) / 60));
  const today = todayStr();
  const todaysSessions = sessions.filter(s => s.date === today);
  const recentSongs = songs
    .filter(s => s.last_played_date)
    .sort((a, b) => (b.last_played_date ?? '').localeCompare(a.last_played_date ?? ''));
  const refresh = () => { refreshSessions(); refreshSongs(); };

  return (
    <div className="p-6 lg:p-10 fade-in flex flex-col gap-8 max-w-[1200px]">
      <section className="p-7 rounded-3xl bg-[#16161d] border border-white/5 flex flex-wrap gap-10 items-center">
        <GoalRing progress={(todaySeconds / (goalMinutes * 60)) * 100} met={goalMet}>
          <span className="text-4xl font-bold leading-10">{todayMinutes}</span>
          <span className="text-xs text-foreground-400">of {goalMinutes} min</span>
        </GoalRing>
        <div className="flex-1 min-w-[280px] flex flex-col gap-5">
          <div className="flex justify-between items-start gap-4">
            <div>
              <div className="text-sm text-foreground-500">
                {new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
              </div>
              <h1 className="mt-1 text-3xl font-bold text-foreground">
                {goalMet
                  ? "Today's goal is done"
                  : todaySeconds === 0
                    ? `Play ${goalMinutes} minutes today`
                    : `${minutesLeft} more minute${minutesLeft === 1 ? '' : 's'} to hit today's goal`}
              </h1>
            </div>
            <MidiPill />
          </div>
          <div className="flex flex-wrap items-center gap-8">
            <div>
              <div className="text-3xl font-bold text-warning">{streak.current_streak} day{streak.current_streak === 1 ? '' : 's'}</div>
              <div className="text-xs text-foreground-500">streak · best {streak.best_streak}</div>
            </div>
            <div className="flex gap-3.5">
              {(goals?.past_week_days ?? []).map((d, i, all) => {
                const isToday = i === all.length - 1;
                const share = Math.min(1, d.minutes / goalMinutes);
                return (
                  <div key={d.date} className="flex flex-col items-center gap-1.5 text-[11px] text-foreground-500" title={`${d.minutes} min`}>
                    <i
                      className="w-7 h-7 rounded-full block"
                      style={{
                        background: d.goal_met ? '#22c55e' : d.minutes > 0 ? `rgba(14,165,233,${0.3 + share * 0.6})` : 'rgba(255,255,255,0.06)',
                        boxShadow: isToday ? '0 0 0 2px #16161d, 0 0 0 3px #38bdf8' : undefined,
                      }}
                    />
                    <span className={isToday ? 'text-sky-400' : ''}>
                      {new Date(d.date + 'T00:00:00').toLocaleDateString([], { weekday: 'narrow' })}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <div className="flex flex-wrap gap-8 items-start">
        <section className="flex-1 min-w-[320px]">
          <UpNext songs={songs} />
        </section>
        <section className="w-full lg:w-[400px] flex-shrink-0">
          <h2 className="text-sm font-semibold text-foreground-300 uppercase tracking-wide mb-3">Today's sessions</h2>
          {todaysSessions.length === 0 ? (
            <div className="p-4 rounded-2xl border border-dashed border-divider text-sm text-foreground-500">
              Nothing yet. Start playing and your session is saved on its own.
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {todaysSessions.map(s => (
                <SessionCard key={s.id} session={s} recentSongs={recentSongs} onChange={refresh} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
