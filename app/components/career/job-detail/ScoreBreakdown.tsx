interface ScoreBreakdownProps {
  score_cv: number | null;
  score_north: number | null;
  score_comp: number | null;
  score_culture: number | null;
  score_flags: number | null;
  score_global: number | null;
  recommended: string | null;
  archetype: string | null;
  remote_policy: string | null;
  comp_range: string | null;
}

type ScoreKey =
  | 'score_cv'
  | 'score_north'
  | 'score_comp'
  | 'score_culture'
  | 'score_flags'
  | 'score_global';

const rows: Array<{ key: ScoreKey; label: string }> = [
  { key: 'score_cv', label: 'Resume Match' },
  { key: 'score_north', label: 'Role Direction' },
  { key: 'score_comp', label: 'Compensation Fit' },
  { key: 'score_culture', label: 'Team Fit' },
  { key: 'score_flags', label: 'Risk Check' },
  { key: 'score_global', label: 'Overall Fit' },
];

function scoreTone(value: number | null) {
  if (value === null) {
    return {
      borderColor: 'var(--career-line)',
      background:
        'linear-gradient(180deg, color-mix(in srgb, var(--career-surface-solid) 92%, white 8%) 0%, color-mix(in srgb, var(--career-surface-soft) 88%, white 12%) 100%)',
      color: 'var(--career-ink-muted)',
    };
  }
  if (value >= 4.2) {
    return {
      borderColor: 'color-mix(in srgb, var(--career-success-ink) 18%, white)',
      background:
        'linear-gradient(180deg, var(--career-success-soft) 0%, color-mix(in srgb, var(--career-success-soft) 72%, white 28%) 100%)',
      color: 'var(--career-success-ink)',
    };
  }
  if (value >= 3.4) {
    return {
      borderColor: 'color-mix(in srgb, var(--career-warning-ink) 18%, white)',
      background:
        'linear-gradient(180deg, var(--career-warning-soft) 0%, color-mix(in srgb, var(--career-warning-soft) 72%, white 28%) 100%)',
      color: 'var(--career-warning-ink)',
    };
  }
  return {
    borderColor: 'color-mix(in srgb, var(--career-danger-ink) 18%, white)',
    background:
      'linear-gradient(180deg, var(--career-danger-soft) 0%, color-mix(in srgb, var(--career-danger-soft) 72%, white 28%) 100%)',
    color: 'var(--career-danger-ink)',
  };
}

function formatScore(value: number | null) {
  return value === null ? 'Not scored' : `${value}/5`;
}

function formatValue(value: string | null, fallback = 'Not available') {
  if (!value) return fallback;
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export default function ScoreBreakdown(props: ScoreBreakdownProps) {
  return (
    <section className="career-panel p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-[color:var(--career-ink)]">Score Breakdown</h2>
        <div className="career-panel-soft px-3 py-2 text-sm">
          <span className="career-meta-label mr-2">Overall</span>
          <span className="font-semibold tabular-nums text-[color:var(--career-ink)]">
            {formatScore(props.score_global)}
          </span>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map((row) => (
          <div
            key={row.key}
            className="rounded-xl border px-3.5 py-2.5"
            style={scoreTone(props[row.key])}
          >
            <div className="text-[11px] uppercase tracking-[0.14em] opacity-70">{row.label}</div>
            <div className="mt-1.5 text-sm font-semibold tabular-nums">
              {formatScore(props[row.key])}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        <div className="career-panel-soft rounded-[14px] px-4 py-3 text-sm text-[color:var(--career-ink-muted)]">
          <div className="career-meta-label">Recommendation</div>
          <div className="mt-2 font-medium capitalize text-[color:var(--career-ink)]">
            {formatValue(props.recommended)}
          </div>
        </div>
        <div className="career-panel-soft rounded-[14px] px-4 py-3 text-sm text-[color:var(--career-ink-muted)]">
          <div className="career-meta-label">Role Type</div>
          <div className="mt-2 font-medium text-[color:var(--career-ink)]">{formatValue(props.archetype)}</div>
        </div>
        <div className="career-panel-soft rounded-[14px] px-4 py-3 text-sm text-[color:var(--career-ink-muted)]">
          <div className="career-meta-label">Remote Policy</div>
          <div className="mt-2 font-medium text-[color:var(--career-ink)]">{formatValue(props.remote_policy)}</div>
        </div>
      </div>

      <div className="career-panel-soft mt-3 rounded-[14px] px-4 py-3 text-sm text-[color:var(--career-ink-muted)]">
        <div className="career-meta-label">Compensation Range</div>
        <div className="mt-2 font-medium text-[color:var(--career-ink)]">{formatValue(props.comp_range)}</div>
      </div>
    </section>
  );
}
