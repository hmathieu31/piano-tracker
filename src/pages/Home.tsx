import { CircularProgressbar, buildStyles } from 'react-circular-progressbar';
import 'react-circular-progressbar/dist/styles.css';
import { Card, CardBody, Progress, Chip } from '@heroui/react';
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
      <div className="mb-7">
        <h1 className="text-2xl font-semibold text-foreground">Today</h1>
        <p className="text-foreground-400 text-sm mt-1">
          {new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-6">
        {/* Today's time + goal ring */}
        <Card classNames={{ base: 'bg-content2 border border-divider lg:col-span-1', body: 'p-6 flex flex-col items-center' }}>
          <CardBody>
            <div className="w-40 h-40 mb-4">
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
            <div className="text-3xl font-bold text-foreground">{formatDurationLong(todaySeconds)}</div>
            <div className="text-foreground-400 text-sm mt-1">of {goalsStatus?.config.daily_minutes ?? 30} min goal</div>
            {goalMet && (
              <Chip color="success" variant="flat" size="sm" className="mt-3">✅ Goal reached!</Chip>
            )}
          </CardBody>
        </Card>

        {/* Status + streak */}
        <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Currently Playing */}
          <Card classNames={{ base: `border transition-colors ${status.is_playing ? 'border-success/30 bg-success/5' : 'bg-content2 border-divider'}`, body: 'p-5' }}>
            <CardBody>
              <div className="text-foreground-400 text-xs uppercase tracking-wider mb-3">Live Status</div>
              {status.is_playing ? (
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-3 h-3 bg-success rounded-full pulse-ring" />
                    <span className="text-success font-semibold">Currently Playing</span>
                  </div>
                  <div className="text-2xl font-bold text-foreground">{formatDuration(status.elapsed_seconds)}</div>
                  <div className="text-foreground-500 text-xs mt-1">this session</div>
                </div>
              ) : (
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-3 h-3 bg-content4 rounded-full" />
                    <span className="text-foreground-400">Not playing</span>
                  </div>
                  <div className="text-foreground-500 text-sm mt-2">
                    {status.midi_connected ? 'Piano connected — waiting for notes' : 'No MIDI device detected'}
                  </div>
                </div>
              )}
            </CardBody>
          </Card>

          {/* Streak */}
          <Card classNames={{ base: 'bg-content2 border border-divider', body: 'p-5' }}>
            <CardBody>
              <div className="text-foreground-400 text-xs uppercase tracking-wider mb-3">Streak</div>
              <div className="text-4xl font-bold text-warning">
                {streak.current_streak}
                <span className="text-2xl ml-1">🔥</span>
              </div>
              <div className="text-foreground-500 text-xs mt-1">days in a row</div>
              <div className="mt-3 text-xs text-foreground-500">
                Best: <span className="text-foreground-300">{streak.best_streak} days</span>
              </div>
            </CardBody>
          </Card>

          {/* Goal progress today */}
          <Card classNames={{ base: 'bg-content2 border border-divider sm:col-span-2', body: 'p-5' }}>
            <CardBody>
              <div className="text-foreground-400 text-xs uppercase tracking-wider mb-3">Today's Progress</div>
              <div className="flex items-center justify-between mb-3">
                <span className={`text-xl font-bold ${goalMet ? 'text-success' : 'text-primary'}`}>
                  {formatDurationLong(todaySeconds)}
                </span>
                <span className="text-foreground-500 text-sm">
                  of {formatDurationLong((goalsStatus?.config.daily_minutes ?? 30) * 60)} goal
                </span>
              </div>
              <Progress
                value={goalProgress}
                color={goalMet ? 'success' : 'primary'}
                size="sm"
                className="mb-2"
              />
              <div className="text-xs text-foreground-500">
                {goalMet
                  ? `🎉 Goal reached! ${formatDurationLong(todaySeconds - (goalsStatus?.config.daily_minutes ?? 30) * 60)} over target`
                  : `${formatDurationLong(Math.max(0, (goalsStatus?.config.daily_minutes ?? 30) * 60 - todaySeconds))} remaining`
                }
              </div>
            </CardBody>
          </Card>
        </div>
      </div>

      {/* Last 7 days mini chart */}
      {daily.length > 0 && (
        <Card classNames={{ base: 'bg-content2 border border-divider', body: 'p-6' }}>
          <CardBody>
            <h2 className="text-xs font-medium text-foreground-400 uppercase tracking-wider mb-4">Last 7 Days</h2>
            <div className="flex items-end gap-2 h-20">
              {daily.slice(-7).map((d) => {
                const pct = dailyGoalSeconds > 0 ? Math.min(100, (d.total_seconds / dailyGoalSeconds) * 100) : 0;
                const isToday = d.date === new Date().toISOString().slice(0, 10);
                return (
                  <div key={d.date} className="flex-1 flex flex-col items-center gap-1 group">
                    <div className="text-[9px] text-foreground-500 group-hover:text-foreground-300">
                      {formatDuration(d.total_seconds)}
                    </div>
                    <div className="w-full rounded-sm transition-all" style={{
                      height: `${Math.max(4, pct * 0.6)}px`,
                      backgroundColor: d.total_seconds >= dailyGoalSeconds
                        ? '#22c55e'
                        : isToday ? '#0ea5e9'
                        : d.total_seconds > 0 ? '#0369a1'
                        : 'rgba(255,255,255,0.07)'
                    }} />
                    <div className={`text-[9px] ${isToday ? 'text-primary' : 'text-foreground-500'}`}>
                      {new Date(d.date + 'T00:00:00').toLocaleDateString([], { weekday: 'short' })}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
