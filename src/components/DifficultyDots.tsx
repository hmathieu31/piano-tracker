export const DIFFICULTY_LABELS = ['', 'Beginner', 'Easy', 'Intermediate', 'Advanced', 'Expert'];

export function DifficultyDots({
  value,
  size = 'sm',
}: {
  value: number | null | undefined;
  size?: 'sm' | 'md';
}) {
  if (!value) return null;
  const dot = size === 'md' ? 'w-2.5 h-2.5' : 'w-1.5 h-1.5';
  return (
    <div className="flex items-center gap-0.5" title={`Difficulty: ${DIFFICULTY_LABELS[value]}`}>
      {[1, 2, 3, 4, 5].map(i => (
        <span
          key={i}
          className={`${dot} rounded-full inline-block ${i <= value ? 'bg-amber-400' : 'bg-white/10'}`}
        />
      ))}
    </div>
  );
}

export function DifficultyPicker({
  value,
  onChange,
}: {
  value: number | null | undefined;
  onChange: (v: number | null) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map(i => (
          <button
            key={i}
            onClick={() => onChange(value === i ? null : i)}
            title={DIFFICULTY_LABELS[i]}
            className={`w-6 h-6 rounded-full transition-all duration-150 border ${
              (value ?? 0) >= i
                ? 'bg-amber-400 border-amber-300 scale-110'
                : 'bg-white/10 border-white/10 hover:bg-amber-400/30 hover:border-amber-400/50'
            }`}
          />
        ))}
      </div>
      {value && (
        <span className="text-[11px] text-amber-400 font-medium">{DIFFICULTY_LABELS[value]}</span>
      )}
    </div>
  );
}
