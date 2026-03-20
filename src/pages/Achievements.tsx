import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import confetti from 'canvas-confetti';
import { useAchievements } from '../hooks/useData';
import { AchievementInfo } from '../types';

function AchievementBadge({ ach }: { ach: AchievementInfo }) {
  const unlocked = ach.unlocked_at !== null;
  return (
    <div className={`bg-[#1e1e28] rounded-xl p-5 border transition-all ${
      unlocked ? 'border-sky-500/30 hover:border-sky-500/50' : 'border-white/5 opacity-50'
    }`}>
      <div className={`text-3xl mb-3 ${unlocked ? '' : 'grayscale'}`}>{ach.icon}</div>
      <div className={`text-sm font-semibold mb-1 ${unlocked ? 'text-white' : 'text-slate-400'}`}>
        {ach.title}
      </div>
      <div className="text-xs text-slate-500">{ach.description}</div>
      {unlocked && ach.unlocked_at && (
        <div className="mt-2 text-[10px] text-sky-600">
          Unlocked {new Date(ach.unlocked_at).toLocaleDateString()}
        </div>
      )}
      {!unlocked && (
        <div className="mt-2 text-[10px] text-slate-600">🔒 Locked</div>
      )}
    </div>
  );
}

export default function Achievements() {
  const { data: achievements, refresh } = useAchievements();

  useEffect(() => {
    const unlisten = listen('achievement-unlocked', () => {
      refresh();
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#0ea5e9', '#22c55e', '#f59e0b'],
      });
    });
    return () => { unlisten.then(fn => fn()); };
  }, [refresh]);

  const unlocked = achievements.filter(a => a.unlocked_at !== null);
  const locked = achievements.filter(a => a.unlocked_at === null);

  return (
    <div className="p-8 fade-in">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-white">Achievements</h1>
        <p className="text-slate-500 text-sm mt-1">
          {unlocked.length} / {achievements.length} unlocked
        </p>
      </div>

      {unlocked.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-4">Unlocked</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {unlocked.map(ach => <AchievementBadge key={ach.key} ach={ach} />)}
          </div>
        </div>
      )}

      {locked.length > 0 && (
        <div>
          <h2 className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-4">Locked</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {locked.map(ach => <AchievementBadge key={ach.key} ach={ach} />)}
          </div>
        </div>
      )}

      {achievements.length === 0 && (
        <div className="text-center py-20 text-slate-500">
          <div className="text-4xl mb-3">🏆</div>
          <div>Play your first session to start earning achievements!</div>
        </div>
      )}
    </div>
  );
}
