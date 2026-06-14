'use client';

interface ScanSummaryLike {
  added: number;
  duplicates: number;
  totalCandidates: number;
  skippedTitle: number;
  skippedExpired: number;
}

export default function ScanRunner({
  running,
  summary,
  onRun,
}: {
  running?: boolean;
  summary: ScanSummaryLike | null;
  onRun: () => void;
}) {
  return (
    <section className="career-panel p-4 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-[color:var(--career-ink)]">Run a Scan</h2>
          <p className="text-sm text-[color:var(--career-ink-muted)]">
            Check every active source and add new roles to your tracker.
          </p>
        </div>
        <button
          type="button"
          onClick={onRun}
          disabled={running}
          data-busy={running ? 'true' : 'false'}
          className="career-button-primary"
        >
          {running ? 'Scanning...' : 'Run scan'}
        </button>
      </div>

      {summary ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-5">
          <Metric label="Found Roles" value={summary.totalCandidates} />
          <Metric label="New Jobs" value={summary.added} />
          <Metric label="Already Saved" value={summary.duplicates} />
          <Metric label="Skipped By Title" value={summary.skippedTitle} />
          <Metric label="Skipped As Expired" value={summary.skippedExpired} />
        </div>
      ) : null}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="career-surface career-panel-soft px-3 py-3">
      <div className="career-meta-label">{label}</div>
      <div className="mt-2 text-base font-semibold text-[color:var(--career-ink)]">{value}</div>
    </div>
  );
}
