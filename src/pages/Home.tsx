import { CircularProgressbar, buildStyles } from 'react-circular-progressbar';
import 'react-circular-progressbar/dist/styles.css';
import { useSessionStatus, useStreak, useGoalsStatus, useDailyTotals } from '../hooks/useData';
import { formatDuration, formatDurationLong } from '../utils';

export default function Home() {
  const status = useSessionStatus();
  const streak = useStreak();
  const { data: goalsStatus } = useGoalsStatus();
  const { data: daily } = useDailyTotals(7);

  const todaySeconds = goalsStatus?.today_seconds ?? 0;
  const dailyGoalSeconds = (goalsStatus?.config.daily_minutes ?? 30) * 60;
  const goalProgress = Math.min(100, (todaySeconds / dailyGoalSeconds) * 100);
  const goalMet = todaySeconds >= dailyGoalSeconds;

  return (
    <div className="p-4 md:p-6 lg:p-8 fade-in">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-white">Today</h1>
        <p className="text-slate-500 text-sm mt-1">
          {new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Today's time + goal ring */}
        <div className="lg:col-span-1 bg-[#1e1e28] rounded-2xl p-6 border border-white/5 flex flex-col items-center">
          <div className="w-44 h-44 mb-4">
            <CircularProgressbar
              value={goalProgress}
              text={`${Math.round(goalProgress)}%`}
              styles={buildStyles({
                pathColor: goalMet ? '#22c55e' : '#0ea5e9',
                textColor: goalMet ? '#22c55e' : '#0ea5e9',
                trailColor: 'rgba(255,255,255,0.07)',
                textSize: '18px',
              })}
            />
          </div>
          <div className="text-3xl font-bold text-white">
            {formatDurationLong(todaySeconds)}
          </div>
          <div className="text-slate-500 text-sm mt-1">
            of {goalsStatus?.config.daily_minutes ?? 30} min goal
          </div>
          {goalMet && (
            <div className="mt-3 px-3 py-1 bg-green-500/20 text-green-400 rounded-full text-xs font-medium">
              ✅ Goal reached!
            </div>
          )}
        </div>

        {/* Status + streak */}
        <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Currently Playing */}
          <div className={`bg-[#1e1e28] rounded-2xl p-5 border transition-colors ${
            status.is_playing ? 'border-green-500/30 bg-green-500/5' : 'border-white/5'
          }`}>
            <div className="text-slate-400 text-xs uppercase tracking-wider mb-3">Live Status</div>
            {status.is_playing ? (
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-3 h-3 bg-green-400 rounded-full pulse-ring" />
                  <span className="text-green-400 font-semibold">Currently Playing</span>
                </div>
                <div className="text-2xl font-bold text-white">
                  {formatDuration(status.elapsed_seconds)}
                </div>
                <div className="text-slate-500 text-xs mt-1">this session</div>
              </div>
            ) : (
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-3 h-3 bg-slate-600 rounded-full" />
                  <span className="text-slate-400">Not playing</span>
                </div>
                <div className="text-slate-600 text-sm mt-2">
                  {status.midi_connected
                    ? 'Piano connected — waiting for notes'
                    : 'No MIDI device detected'}
                </div>
              </div>
            )}
          </div>

          {/* Streak */}
          <div className="bg-[#1e1e28] rounded-2xl p-5 border border-white/5">
            <div className="text-slate-400 text-xs uppercase tracking-wider mb-3">Streak</div>
            <div className="text-4xl font-bold text-orange-400">
              {streak.current_streak}
              <span className="text-2xl ml-1">🔥</span>
            </div>
            <div className="text-slate-500 text-xs mt-1">days in a row</div>
            <div className="mt-3 text-xs text-slate-500">
              Best: <span className="text-slate-300">{streak.best_streak} days</span>
            </div>
          </div>

          {/* Goal progress today */}
          <div className="bg-[#1e1e28] rounded-2xl p-5 border border-white/5 sm:col-span-2">
            <div className="text-slate-400 text-xs uppercase tracking-wider mb-3">Today's Progress</div>
            <div className="flex items-center justify-between mb-2">
              <span className={`text-xl font-bold ${goalMet ? 'text-green-400' : 'text-sky-400'}`}>
                {formatDurationLong(todaySeconds)}
              </span>
              <span className="text-slate-500 text-sm">
                of {formatDurationLong((goalsStatus?.config.daily_minutes ?? 30) * 60)} goal
              </span>
            </div>
            <div className="w-full bg-white/5 rounded-full h-3">
              <div
                className={`${goalMet ? 'bg-green-500' : 'bg-sky-500'} h-3 rounded-full transition-all duration-500`}
                style={{ width: `${goalProgress}%` }}
              />
            </div>
            <div className="text-xs text-slate-500 mt-2">
              {goalMet
                ? `🎉 Goal reached! ${formatDurationLong(todaySeconds - (goalsStatus?.config.daily_minutes ?? 30) * 60)} over target`
                : `${formatDurationLong(Math.max(0, (goalsStatus?.config.daily_minutes ?? 30) * 60 - todaySeconds))} remaining`
              }
            </div>
          </div>
        </div>
      </div>

      {/* Last 7 days mini chart */}
      {daily.length > 0 && (
        <div className="bg-[#1e1e28] rounded-2xl p-6 border border-white/5">
          <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-4">Last 7 Days</h2>
          <div className="flex items-end gap-2 h-20">
            {daily.slice(-7).map((d) => {
              const pct = dailyGoalSeconds > 0 ? Math.min(100, (d.total_seconds / dailyGoalSeconds) * 100) : 0;
              const isToday = d.date === new Date().toISOString().slice(0, 10);
              return (
                <div key={d.date} className="flex-1 flex flex-col items-center gap-1 group">
                  <div className="text-[9px] text-slate-600 group-hover:text-slate-400">
                    {formatDuration(d.total_seconds)}
                  </div>
                  <div className="w-full rounded-sm transition-all" style={{
                    height: `${Math.max(4, pct * 0.6)}px`,
                    backgroundColor: d.total_seconds >= dailyGoalSeconds
                      ? '#22c55e'
                      : isToday
                      ? '#0ea5e9'
                      : d.total_seconds > 0
                      ? '#0369a1'
                      : 'rgba(255,255,255,0.07)'
                  }} />
                  <div className={`text-[9px] ${isToday ? 'text-sky-400' : 'text-slate-600'}`}>
                    {new Date(d.date + 'T00:00:00').toLocaleDateString([], { weekday: 'short' })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
