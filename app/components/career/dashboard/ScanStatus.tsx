interface ScanSnapshot {
  id: number;
  url: string;
  first_seen: string;
  portal: string | null;
  title: string | null;
  company: string | null;
  scan_status: string | null;
}

function statusTone(value: string | null) {
  if (!value) return 'career-pill-muted';
  if (value.toLowerCase().includes('success') || value.toLowerCase().includes('added')) {
    return 'career-pill-success';
  }
  if (value.toLowerCase().includes('fail') || value.toLowerCase().includes('error')) {
    return 'career-pill-danger';
  }
  return 'career-pill';
}

export default function ScanStatus({ latest }: { latest: ScanSnapshot | null }) {
  return (
    <section className="career-panel p-4 md:p-5">
      <h2 className="mb-4 text-lg font-semibold text-[color:var(--career-ink)]">Latest Scan Result</h2>
      {!latest ? (
        <div className="career-inline-empty">
          No scan results yet. Run a scan to start building your history.
        </div>
      ) : (
        <div className="career-surface career-panel-soft px-4 py-4">
          <div className="flex flex-wrap items-center gap-2 text-xs text-[color:var(--career-ink-muted)]">
            <span className={statusTone(latest.scan_status)}>
              {latest.scan_status ?? 'Status unavailable'}
            </span>
            <span className="career-pill">{latest.portal ?? 'Source unavailable'}</span>
            <span className="text-[color:var(--career-ink-subtle)]">
              {new Date(latest.first_seen).toLocaleDateString('en-IN', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
              })}
            </span>
          </div>
          <a
            href={latest.url}
            target="_blank"
            rel="noopener noreferrer"
            className="career-action-link mt-3 block text-sm font-medium text-[color:var(--career-ink)] hover:text-[var(--career-accent)]"
          >
            {latest.title ?? latest.url}
          </a>
          <div className="mt-1 text-xs text-[color:var(--career-ink-muted)]">
            {latest.company ?? 'Company unavailable'}
          </div>
        </div>
      )}
    </section>
  );
}
