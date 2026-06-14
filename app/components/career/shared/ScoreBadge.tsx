interface ScoreBadgeProps {
  score: number | null | undefined;
  grade?: string | null;
}

function tone(score: number | null | undefined) {
  if (score === null || score === undefined) {
    return {
      borderColor: 'var(--career-line)',
      background: 'var(--career-surface-solid)',
      color: 'var(--career-ink-muted)',
      boxShadow: 'none',
    };
  }
  if (score >= 4.2) {
    return {
      borderColor: 'color-mix(in srgb, var(--career-success-ink) 14%, white)',
      background: 'color-mix(in srgb, var(--career-success-soft) 88%, white 12%)',
      color: 'var(--career-success-ink)',
      boxShadow: 'none',
    };
  }
  if (score >= 3.4) {
    return {
      borderColor: 'color-mix(in srgb, var(--career-warning-ink) 14%, white)',
      background: 'color-mix(in srgb, var(--career-warning-soft) 88%, white 12%)',
      color: 'var(--career-warning-ink)',
      boxShadow: 'none',
    };
  }
  return {
    borderColor: 'color-mix(in srgb, var(--career-danger-ink) 14%, white)',
    background: 'color-mix(in srgb, var(--career-danger-soft) 88%, white 12%)',
    color: 'var(--career-danger-ink)',
    boxShadow: 'none',
  };
}

export default function ScoreBadge({ score, grade }: ScoreBadgeProps) {
  const rendered = score === null || score === undefined ? 'Not scored' : `${score.toFixed(1)}/5`;
  const toneStyle = tone(score);

  return (
    <span
      className="inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1.5 text-xs font-semibold leading-none tabular-nums"
      style={toneStyle}
    >
      <span>{rendered}</span>
      {grade ? <span className="text-[11px] opacity-90">{grade}</span> : null}
    </span>
  );
}
