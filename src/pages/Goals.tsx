import { Card, CardBody, Progress, Chip } from '@heroui/react';
import { useGoalsStatus } from '../hooks/useData';
import { NavLink } from 'react-router-dom';
import { formatDurationLong } from '../utils';

function ProgressCard({ label, current, goal, color }: {
  label: string; current: number; goal: number;
  color: 'primary' | 'success';
}) {
  const pct = goal > 0 ? Math.min(100, (current / goal) * 100) : 0;
  const met = current >= goal;
  const remaining = Math.max(0, goal - current);

  return (
    <Card classNames={{ base: `border ${met ? 'border-success/25 bg-success/5' : 'bg-content2 border-divider'}`, body: 'p-6' }}>
      <CardBody>
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="text-xs text-foreground-400 uppercase tracking-wider mb-1">{label}</div>
            <div className={`text-3xl font-bold ${met ? 'text-success' : 'text-primary'}`}>
              {formatDurationLong(current * 60)}
            </div>
            <div className="text-foreground-400 text-sm mt-1">of {goal} min goal</div>
          </div>
          {met
            ? <Chip color="success" variant="flat" size="sm">✅ Done</Chip>
            : <div className="text-right">
                <div className="text-foreground-300 text-sm font-medium">{remaining} min</div>
                <div className="text-foreground-500 text-xs">remaining</div>
              </div>
          }
        </div>
        <Progress value={pct} color={met ? 'success' : color} size="sm" className="mb-2" />
        <div className="text-xs text-foreground-500">{Math.round(pct)}% complete</div>
      </CardBody>
    </Card>
  );
}

export default function Goals() {
  const { data } = useGoalsStatus();

  const todayMins = Math.round((data?.today_seconds ?? 0) / 60);
  const dailyGoal = data?.config.daily_minutes ?? 30;

  return (
    <div className="p-4 md:p-6 lg:p-8 fade-in">
      <div className="flex items-start justify-between mb-7">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Goals</h1>
          <p className="text-foreground-400 text-sm mt-1">Your practice progress against targets</p>
        </div>
        <NavLink
          to="/settings"
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-content3 hover:bg-content4 text-foreground-400 hover:text-foreground text-sm transition-colors"
        >
          <span>⚙️</span> Edit goals
        </NavLink>
      </div>

      <div className="grid grid-cols-1 gap-4 mb-7">
        <ProgressCard label="Today" current={todayMins} goal={dailyGoal} color="primary" />
      </div>

      {/* Past 7 days */}
      {data && data.past_week_days.length > 0 && (
        <Card classNames={{ base: 'bg-content2 border border-divider', body: 'p-6' }}>
          <CardBody>
            <h2 className="text-xs font-medium text-foreground-400 uppercase tracking-wider mb-5">Past 7 Days</h2>
            <div className="grid grid-cols-7 gap-2">
              {data.past_week_days.map(day => {
                const pct = dailyGoal > 0 ? Math.min(100, (day.minutes / dailyGoal) * 100) : 0;
                const isToday = day.date === new Date().toISOString().slice(0, 10);
                return (
                  <div key={day.date} className="flex flex-col items-center gap-2">
                    <div className={`text-xs ${isToday ? 'text-primary font-medium' : 'text-foreground-500'}`}>
                      {new Date(day.date + 'T00:00:00').toLocaleDateString([], { weekday: 'short' })}
                    </div>
                    <div className="w-full flex flex-col items-center gap-1">
                      <div className="text-[10px] text-foreground-500">{day.minutes}m</div>
                      <div className="w-8 h-20 bg-content3 rounded-md overflow-hidden flex flex-col justify-end">
                        <div
                          className={`w-full rounded-md transition-all ${
                            day.goal_met ? 'bg-success' : day.minutes > 0 ? 'bg-primary/70' : ''
                          }`}
                          style={{ height: `${Math.max(0, pct * 0.8)}%` }}
                        />
                      </div>
                    </div>
                    <div className="text-lg">
                      {day.goal_met ? '✅' : day.minutes > 0 ? '🔸' : <span className="text-foreground-600">·</span>}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 flex items-center gap-4 text-xs text-foreground-500">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-success inline-block"/>Goal met</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-primary/70 inline-block"/>Practiced</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-content3 inline-block"/>No practice</span>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}