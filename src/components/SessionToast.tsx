import { useState, useEffect, useRef } from 'react';

interface Props {
  durationSeconds: number;
  onTag: () => void;
  onDismiss: () => void;
  autoDismissSecs?: number;
}

export default function SessionToast({ durationSeconds, onTag, onDismiss, autoDismissSecs = 20 }: Props) {
  const [countdown, setCountdown] = useState(autoDismissSecs);
  const [leaving, setLeaving] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const dismiss = (cb: () => void) => {
    setLeaving(true);
    setTimeout(cb, 280);
  };

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) { dismiss(onDismiss); return 0; }
        return c - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [onDismiss]);

  const stopTimer = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  };

  const mins = Math.floor(durationSeconds / 60);
  const secs = durationSeconds % 60;
  const durationLabel = mins > 0
    ? (secs > 0 ? `${mins}m ${secs}s` : `${mins}m`)
    : `${secs}s`;

  return (
    <div
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[min(420px,calc(100vw-2rem))]
        transition-all duration-280 ease-out
        ${leaving ? 'opacity-0 translate-y-3' : 'opacity-100 translate-y-0'}`}
      style={{ animation: leaving ? undefined : 'toast-slide-up 0.3s ease-out' }}
    >
      {/* Glow rim */}
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-sky-500/20 via-indigo-500/10 to-sky-500/20 blur-sm -z-10" />

      <div className="relative bg-[#1a1a26] border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
        {/* Progress bar */}
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-white/5">
          <div
            className="h-full bg-gradient-to-r from-sky-500 to-indigo-500 transition-all duration-1000 ease-linear"
            style={{ width: `${(countdown / autoDismissSecs) * 100}%` }}
          />
        </div>

        <div className="px-4 py-3.5 flex items-center gap-4">
          {/* Icon + duration */}
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <div className="w-9 h-9 flex-shrink-0 rounded-xl bg-gradient-to-br from-sky-500/30 to-indigo-600/30 border border-sky-500/20 flex items-center justify-center">
              <span className="text-base">🎹</span>
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-white leading-tight">
                Nice session!{' '}
                <span className="text-sky-400">{durationLabel}</span>
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                What did you play?
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => { stopTimer(); dismiss(onDismiss); }}
              className="text-slate-600 hover:text-slate-400 transition-colors p-1"
              title="Dismiss"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M2 2l10 10M12 2L2 12"/>
              </svg>
            </button>
            <button
              onClick={() => { stopTimer(); dismiss(onTag); }}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-white text-xs font-semibold transition-colors shadow-[0_0_16px_rgba(14,165,233,0.3)]"
            >
              Tag it
              <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M2 6h8M7 3l3 3-3 3"/></svg>
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes toast-slide-up {
          from { opacity: 0; transform: translateX(-50%) translateY(12px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>
    </div>
  );
}
