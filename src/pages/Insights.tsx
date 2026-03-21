import { useInsights, useStreak } from '../hooks/useData';
import { formatDurationLong } from '../utils';

function StatCard({ icon, label, value, sub }: { icon: string; label: string; value: string; sub?: string }) {
  return (
    <div className="bg-[#1e1e28] rounded-xl p-5 border border-white/5">
      <div className="text-2xl mb-2">{icon}</div>
      <div className="text-xl font-bold text-white">{value}</div>
      <div className="text-sm text-slate-400 mt-0.5">{label}</div>
      {sub && <div className="text-xs text-slate-600 mt-1">{sub}</div>}
    </div>
  );
}

export default function Insights() {
  const data = useInsights();
  const streak = useStreak();

  if (!data) return (
    <div className="p-8 flex items-center justify-center text-slate-500">
      Loading insights...
    </div>
  );

  const totalHours = (data.total_seconds_alltime / 3600).toFixed(1);
  const avgMins = Math.round(data.avg_session_seconds / 60);

  const timeOfDay = [
    { label: 'Morning', sublabel: '5am – 12pm', seconds: data.morning_seconds, color: 'bg-yellow-400' },
    { label: 'Afternoon', sublabel: '12pm – 5pm', seconds: data.afternoon_seconds, color: 'bg-orange-400' },
    { label: 'Evening', sublabel: '5pm – midnight', seconds: data.evening_seconds, color: 'bg-indigo-400' },
  ];
  const maxTod = Math.max(...timeOfDay.map(t => t.seconds), 1);

  return (
    <div className="p-4 md:p-6 lg:p-8 fade-in">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-white">Insights</h1>
        <p className="text-slate-500 text-sm mt-1">Your practice patterns and records</p>
      </div>

      {/* Key stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard icon="⏱️" label="Total Practice" value={`${totalHours}h`} sub="all time" />
        <StatCard icon="📅" label="Sessions" value={`${data.total_sessions}`} sub="total sessions" />
        <StatCard icon="⚡" label="Avg Session" value={`${avgMins} min`} sub="per session" />
        <StatCard icon="🔥" label="Best Streak" value={`${streak.best_streak} days`} sub="consecutive days" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Personal Records */}
        <div className="bg-[#1e1e28] rounded-2xl p-6 border border-white/5">
          <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-5">Personal Records</h2>
          <div className="space-y-4">
            <div className="flex justify-between items-center py-3 border-b border-white/5">
              <div className="flex items-center gap-3">
                <span className="text-xl">🏆</span>
                <div>
                  <div className="text-sm text-white">Longest Session</div>
                  <div className="text-xs text-slate-500">single session record</div>
                </div>
              </div>
              <div className="text-sky-400 font-semibold">{formatDurationLong(data.longest_session_seconds)}</div>
            </div>
            <div className="flex justify-between items-center py-3 border-b border-white/5">
              <div className="flex items-center gap-3">
                <span className="text-xl">📆</span>
                <div>
                  <div className="text-sm text-white">Best Day</div>
                  <div className="text-xs text-slate-500">{data.best_day_date ?? '—'}</div>
                </div>
              </div>
              <div className="text-purple-400 font-semibold">{formatDurationLong(data.best_day_seconds)}</div>
            </div>
            <div className="flex justify-between items-center py-3">
              <div className="flex items-center gap-3">
                <span className="text-xl">🔥</span>
                <div>
                  <div className="text-sm text-white">Best Streak</div>
                  <div className="text-xs text-slate-500">consecutive days</div>
                </div>
              </div>
              <div className="text-orange-400 font-semibold">{streak.best_streak} days</div>
            </div>
          </div>
        </div>

        {/* Time of day */}
        <div className="bg-[#1e1e28] rounded-2xl p-6 border border-white/5">
          <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-5">Best Time to Practice</h2>
          <div className="space-y-4">
            {timeOfDay.map(tod => (
              <div key={tod.label}>
                <div className="flex justify-between text-sm mb-1.5">
                  <div>
                    <span className="text-slate-200">{tod.label}</span>
                    <span className="text-slate-500 text-xs ml-2">{tod.sublabel}</span>
                  </div>
                  <span className="text-slate-400">{formatDurationLong(tod.seconds)}</span>
                </div>
                <div className="w-full bg-white/5 rounded-full h-2">
                  <div
                    className={`${tod.color} h-2 rounded-full transition-all`}
                    style={{ width: `${(tod.seconds / maxTod) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
