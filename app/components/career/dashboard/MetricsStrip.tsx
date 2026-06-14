interface Totals {
  total_jobs: number;
  pending: number;
  evaluated: number;
  applied: number;
  responded: number;
  interview: number;
  offer: number;
  rejected: number;
  discarded: number;
  skip: number;
  active: number;
  closed: number;
  avg_score: number | null;
}

const CARD_STYLE = 'career-panel relative px-3.5 py-3';

export default function MetricsStrip({ totals }: { totals: Totals }) {
  const items = [
    {
      label: 'Total Jobs',
      value: totals.total_jobs,
      surface: 'var(--career-accent-soft)',
      ink: 'var(--career-accent-strong)',
    },
    {
      label: 'Pending',
      value: totals.pending,
      surface: 'var(--career-warning-soft)',
      ink: 'var(--career-warning-ink)',
    },
    {
      label: 'Evaluated',
      value: totals.evaluated,
      surface: 'var(--career-info-soft)',
      ink: 'var(--career-info-ink)',
    },
    {
      label: 'Active',
      value: totals.active,
      surface: 'var(--career-success-soft)',
      ink: 'var(--career-success-ink)',
    },
    {
      label: 'Closed',
      value: totals.closed,
      surface: 'var(--career-danger-soft)',
      ink: 'var(--career-danger-ink)',
    },
    {
      label: 'Average Fit',
      value: totals.avg_score === null ? 'Not scored' : `${totals.avg_score.toFixed(1)}/5`,
      surface:
        totals.avg_score !== null && totals.avg_score >= 4
          ? 'var(--career-success-soft)'
          : 'var(--career-accent-soft)',
      ink:
        totals.avg_score !== null && totals.avg_score >= 4
          ? 'var(--career-success-ink)'
          : 'var(--career-accent-strong)',
    },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
      {items.map((item) => (
        <div
          key={item.label}
          className={CARD_STYLE}
          style={{
            borderColor: `color-mix(in srgb, ${item.ink} 10%, var(--career-line) 90%)`,
            background: `color-mix(in srgb, var(--career-surface-solid) 90%, ${item.surface} 10%)`,
          }}
        >
          <div className="career-meta-label" style={{ color: item.ink }}>{item.label}</div>
          <div className="mt-1.5 text-xl font-semibold tabular-nums text-[color:var(--career-ink)]">
            {item.value}
          </div>
        </div>
      ))}
    </div>
  );
}
