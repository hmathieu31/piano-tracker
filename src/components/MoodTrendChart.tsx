import { AreaChart, Area, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { FEELINGS } from './FeelingPicker';

interface DataPoint {
  date: string;
  feeling: number;
}

interface Props {
  sessions: { date: string; feeling: number | null }[];
  height?: number;
}

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const f = payload[0].value as number;
  return (
    <div className="bg-[#252533] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs">
      <span className="text-slate-300 mr-1">{payload[0].payload.date}</span>
      <span className="text-lg">{FEELINGS[f]?.emoji ?? f}</span>
      <span className="text-slate-400 ml-1">{FEELINGS[f]?.label}</span>
    </div>
  );
};

export default function MoodTrendChart({ sessions, height = 80 }: Props) {
  const data: DataPoint[] = sessions
    .filter(s => s.feeling != null)
    .slice()
    .reverse()
    .map(s => ({ date: s.date, feeling: s.feeling! }));

  if (data.length < 2) {
    return (
      <div className="flex items-center justify-center text-foreground-500 text-xs" style={{ height }}>
        {data.length === 0 ? 'No mood data yet' : 'Rate more sessions to see trend'}
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 6, right: 6, bottom: 2, left: 0 }}>
        <defs>
          <linearGradient id="moodGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
          </linearGradient>
        </defs>
        <YAxis domain={[0, 4]} hide />
        <Tooltip content={<CustomTooltip />} />
        <Area
          type="monotone"
          dataKey="feeling"
          stroke="#0ea5e9"
          strokeWidth={2}
          fill="url(#moodGrad)"
          dot={{ r: 3, fill: '#0ea5e9', strokeWidth: 0 }}
          activeDot={{ r: 5 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
