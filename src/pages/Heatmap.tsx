import { useMemo } from 'react';
import { useDailyTotals, useGoalsStatus } from '../hooks/useData';

function getIntensityColor(seconds: number, goalSeconds: number): string {
  if (seconds === 0) return 'rgba(255,255,255,0.05)';
  const pct = seconds / goalSeconds;
  if (pct >= 1.0) return '#16a34a';
  if (pct >= 0.75) return '#22c55e';
  if (pct >= 0.5) return '#86efac';
  if (pct >= 0.25) return '#bbf7d0';
  return '#dcfce7';
}

export default function Heatmap() {
  const { data: dailyRaw } = useDailyTotals(365);
  const { data: goalsStatus } = useGoalsStatus();
  const goalSeconds = (goalsStatus?.config.daily_minutes ?? 30) * 60;

  const { weeks, months } = useMemo(() => {
    const dataMap = new Map(dailyRaw.map(d => [d.date, d.total_seconds]));
    
    // Build a full year grid starting from 52 weeks ago
    const today = new Date();
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - 364);
    // Align to Sunday
    startDate.setDate(startDate.getDate() - startDate.getDay());
    
    const weeks: Array<Array<{ date: string; seconds: number; isCurrentMonth: boolean }>> = [];
    const monthLabels: Array<{ label: string; col: number }> = [];
    let currentMonth = -1;
    
    const cursor = new Date(startDate);
    for (let w = 0; w < 53; w++) {
      const week: typeof weeks[0] = [];
      for (let d = 0; d < 7; d++) {
        const dateStr = cursor.toISOString().slice(0, 10);
        if (cursor.getMonth() !== currentMonth) {
          currentMonth = cursor.getMonth();
          monthLabels.push({
            label: cursor.toLocaleDateString([], { month: 'short' }),
            col: w,
          });
        }
        week.push({
          date: dateStr,
          seconds: dataMap.get(dateStr) ?? 0,
          isCurrentMonth: cursor <= today,
        });
        cursor.setDate(cursor.getDate() + 1);
      }
      weeks.push(week);
    }
    
    return { weeks, months: monthLabels };
  }, [dailyRaw]);

  const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="p-8 fade-in">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-white">Heatmap</h1>
        <p className="text-slate-500 text-sm mt-1">Your practice activity over the past year</p>
      </div>

      <div className="bg-[#1e1e28] rounded-2xl p-6 border border-white/5 overflow-x-auto">
        {/* Month labels */}
        <div className="flex mb-1 ml-8">
          {months.map((m, i) => (
            <div
              key={i}
              className="text-xs text-slate-500 flex-shrink-0"
              style={{ marginLeft: i === 0 ? `${m.col * 14}px` : `${(m.col - (months[i-1]?.col ?? 0)) * 14 - 28}px` }}
            >
              {m.label}
            </div>
          ))}
        </div>

        <div className="flex gap-0.5">
          {/* Day labels */}
          <div className="flex flex-col gap-0.5 mr-1">
            {dayLabels.map((day, i) => (
              <div key={day} className="h-3 flex items-center">
                {i % 2 === 1 && <span className="text-[9px] text-slate-600 w-7">{day}</span>}
                {i % 2 === 0 && <span className="w-7" />}
              </div>
            ))}
          </div>

          {/* Grid */}
          {weeks.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-0.5">
              {week.map((day, di) => (
                <div
                  key={di}
                  className="w-3 h-3 rounded-[2px] cursor-pointer group relative"
                  style={{ backgroundColor: day.isCurrentMonth ? getIntensityColor(day.seconds, goalSeconds) : 'rgba(255,255,255,0.02)' }}
                  title={`${day.date}: ${Math.round(day.seconds / 60)} min`}
                />
              ))}
            </div>
          ))}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-2 mt-4 justify-end">
          <span className="text-xs text-slate-500">Less</span>
          {[0, 0.25, 0.5, 0.75, 1.0].map(pct => (
            <div
              key={pct}
              className="w-3 h-3 rounded-[2px]"
              style={{ backgroundColor: pct === 0 ? 'rgba(255,255,255,0.05)' : getIntensityColor(pct * goalSeconds, goalSeconds) }}
            />
          ))}
          <span className="text-xs text-slate-500">More</span>
        </div>
      </div>
    </div>
  );
}
