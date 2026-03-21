import { useGoalsStatus } from '../hooks/useData';
import { NavLink } from 'react-router-dom';
import { formatDurationLong } from '../utils';

function ProgressCard({ label, current, goal, color, textColor }: {
  label: string; current: number; goal: number;
  color: string; textColor: string;
}) {
  const pct = goal > 0 ? Math.min(100, (current / goal) * 100) : 0;
  const met = current >= goal;
  const remaining = Math.max(0, goal - current);

  return (
    <div className={`bg-[#1e1e28] rounded-2xl p-6 border ${met ? 'border-green-500/25' : 'border-white/5'}`}>
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">{label}</div>
          <div className={`text-3xl font-bold ${met ? 'text-green-400' : textColor}`}>
            {formatDurationLong(current * 60)}
          </div>
          <div className="text-slate-500 text-sm mt-1">of {goal} min goal</div>
        </div>
        {met ? (
          <div className="text-2xl">✅</div>
        ) : (
          <div className="text-right">
            <div className="text-slate-400 text-sm font-medium">{remaining} min</div>
            <div className="text-slate-600 text-xs">remaining</div>
          </div>
        )}
      </div>
      <div className="w-full bg-white/5 rounded-full h-2.5">
        <div
          className={`${met ? 'bg-green-500' : color} h-2.5 rounded-full transition-all duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="text-xs text-slate-500 mt-2">{Math.round(pct)}% complete</div>
    </div>
  );
}

export default function Goals() {
  const { data } = useGoalsStatus();

  const todayMins = Math.round((data?.today_seconds ?? 0) / 60);
  const dailyGoal = data?.config.daily_minutes ?? 30;

  return (
    <div className="p-4 md:p-6 lg:p-8 fade-in">
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-white">Goals</h1>
          <p className="text-slate-500 text-sm mt-1">Your practice progress against targets</p>
        </div>
        <NavLink
          to="/settings"
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-slate-200 text-sm transition-colors"
        >
          <span>⚙️</span> Edit goals
        </NavLink>
      </div>

      {/* Progress cards */}
      <div className="grid grid-cols-1 gap-4 mb-8">
        <ProgressCard label="Today" current={todayMins} goal={dailyGoal}
          color="bg-sky-500" textColor="text-sky-400" />
      </div>

      {/* Past 7 days */}
      {data && data.past_week_days.length > 0 && (
        <div className="bg-[#1e1e28] rounded-2xl p-6 border border-white/5">
          <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-5">Past 7 Days</h2>
          <div className="grid grid-cols-7 gap-2">
            {data.past_week_days.map(day => {
              const pct = dailyGoal > 0 ? Math.min(100, (day.minutes / dailyGoal) * 100) : 0;
              const isToday = day.date === new Date().toISOString().slice(0, 10);
              return (
                <div key={day.date} className="flex flex-col items-center gap-2">
                  <div className={`text-xs ${isToday ? 'text-sky-400 font-medium' : 'text-slate-500'}`}>
                    {new Date(day.date + 'T00:00:00').toLocaleDateString([], { weekday: 'short' })}
                  </div>
                  {/* Bar */}
                  <div className="w-full flex flex-col items-center gap-1">
                    <div className="text-[10px] text-slate-600">{day.minutes}m</div>
                    <div className="w-8 h-20 bg-white/5 rounded-md overflow-hidden flex flex-col justify-end">
                      <div
                        className={`w-full rounded-md transition-all ${
                          day.goal_met ? 'bg-green-500' : day.minutes > 0 ? 'bg-sky-600' : ''
                        }`}
                        style={{ height: `${Math.max(0, pct * 0.8)}%` }}
                      />
                    </div>
                  </div>
                  <div className="text-lg">
                    {day.goal_met ? '✅' : day.minutes > 0 ? '🔸' : <span className="text-slate-700">·</span>}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex items-center gap-4 text-xs text-slate-600">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-green-500 inline-block"/>Goal met</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-sky-600 inline-block"/>Practiced</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-white/10 inline-block"/>No practice</span>
          </div>
        </div>
      )}
    </div>
  );
}

