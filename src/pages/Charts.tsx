import { useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, ReferenceLine
} from 'recharts';
import { useDailyTotals, useGoalsStatus } from '../hooks/useData';
import { formatDurationLong, formatDateShort } from '../utils';

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#252533] border border-white/10 rounded-lg px-3 py-2 text-sm">
      <div className="text-slate-400 text-xs mb-1">{label}</div>
      <div className="text-white font-medium">{formatDurationLong(payload[0].value)}</div>
    </div>
  );
};

export default function Charts() {
  const [period, setPeriod] = useState(30);
  const { data: dailyRaw } = useDailyTotals(period);
  const { data: goalsStatus } = useGoalsStatus();

  const dailyGoalSeconds = (goalsStatus?.config.daily_minutes ?? 30) * 60;

  const dailyData = dailyRaw.map(d => ({
    date: formatDateShort(d.date),
    seconds: d.total_seconds,
    minutes: Math.round(d.total_seconds / 60),
  }));

  // Aggregate into weekly buckets
  const weeklyData: { week: string; seconds: number }[] = [];
  for (let i = 0; i < dailyRaw.length; i += 7) {
    const chunk = dailyRaw.slice(i, i + 7);
    const total = chunk.reduce((s, d) => s + d.total_seconds, 0);
    const startDate = chunk[0]?.date ?? '';
    weeklyData.push({ week: formatDateShort(startDate), seconds: total });
  }

  return (
    <div className="p-8 fade-in">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-white">Charts</h1>
          <p className="text-slate-500 text-sm mt-1">Practice time over time</p>
        </div>
        <div className="flex gap-2">
          {[30, 90, 365].map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                period === p ? 'bg-sky-500 text-white' : 'bg-white/5 text-slate-400 hover:bg-white/10'
              }`}
            >
              {p}d
            </button>
          ))}
        </div>
      </div>

      {/* Daily bar chart */}
      <div className="bg-[#1e1e28] rounded-2xl p-6 border border-white/5 mb-6">
        <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-5">Daily Practice</h2>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={dailyData} barSize={period > 90 ? 4 : 8}>
            <XAxis
              dataKey="date"
              tick={{ fill: '#64748b', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              interval={period === 30 ? 4 : period === 90 ? 13 : 30}
            />
            <YAxis
              tickFormatter={v => `${Math.round(v/60)}m`}
              tick={{ fill: '#64748b', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
            <ReferenceLine
              y={dailyGoalSeconds}
              stroke="#0ea5e9"
              strokeDasharray="4 4"
              strokeOpacity={0.5}
              label={{ value: 'Goal', fill: '#0ea5e9', fontSize: 11, position: 'right' }}
            />
            <Bar
              dataKey="seconds"
              fill="#0369a1"
              radius={[3, 3, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Weekly line chart */}
      <div className="bg-[#1e1e28] rounded-2xl p-6 border border-white/5">
        <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-5">Weekly Totals</h2>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={weeklyData}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
            <XAxis dataKey="week" tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} />
            <YAxis tickFormatter={v => `${Math.round(v/60)}m`} tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} />
            <Tooltip content={<CustomTooltip />} />
            <Line
              type="monotone"
              dataKey="seconds"
              stroke="#0ea5e9"
              strokeWidth={2}
              dot={{ fill: '#0ea5e9', r: 3 }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
