import { useUpdater } from '../hooks/useUpdater';

export default function UpdateBanner() {
  const { state, installUpdate, dismiss } = useUpdater();

  if (state.phase === 'idle' || state.phase === 'checking' || state.phase === 'up-to-date') return null;

  if (state.phase === 'error') {
    return (
      <div className="fixed top-0 left-0 right-0 z-50 bg-red-600/90 backdrop-blur text-white px-4 py-2.5 flex items-center justify-between gap-4 text-sm">
        <span>⚠️ Update check failed: {state.message}</span>
        <button onClick={dismiss} className="text-white/70 hover:text-white transition-colors text-xs">Dismiss</button>
      </div>
    );
  }

  if (state.phase === 'downloading') {
    return (
      <div className="fixed top-0 left-0 right-0 z-50 bg-sky-700 text-white px-4 py-2.5 flex items-center gap-4 text-sm">
        <span className="shrink-0">⬇️ Downloading update…</span>
        <div className="flex-1 h-1.5 bg-white/20 rounded-full overflow-hidden">
          <div className="h-full bg-white rounded-full transition-all duration-300" style={{ width: `${state.progress}%` }} />
        </div>
        <span className="shrink-0 tabular-nums text-xs text-white/70">{state.progress}%</span>
      </div>
    );
  }

  if (state.phase !== 'available') return null;
  const { info } = state;
  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-sky-600 text-white px-4 py-2.5 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3 min-w-0">
        <span className="shrink-0 text-sm font-medium">🆕 Piano Tracker v{info.version} is available</span>
        {info.notes && (
          <span className="text-xs text-white/60 truncate hidden md:block">
            {info.notes.split('\n').find((l: string) => l.trim()) ?? ''}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button onClick={installUpdate} className="bg-white text-sky-700 text-xs font-semibold px-3 py-1 rounded-full hover:bg-sky-50 transition-colors">
          Install &amp; Restart
        </button>
        <button onClick={dismiss} className="text-white/60 hover:text-white text-xs transition-colors px-1">Later</button>
      </div>
    </div>
  );
}
