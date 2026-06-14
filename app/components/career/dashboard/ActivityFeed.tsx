interface ActivityItem {
  ts: string;
  type: 'report' | 'scan' | 'job';
  label: string;
}

const TONE: Record<ActivityItem['type'], string> = {
  report: 'career-pill',
  scan: 'career-pill-success',
  job: 'career-pill-warning',
};

export default function ActivityFeed({ items }: { items: ActivityItem[] }) {
  return (
    <section className="career-panel p-4 md:p-5">
      <h2 className="mb-4 text-lg font-semibold text-[color:var(--career-ink)]">Recent Activity</h2>
      <div className="space-y-2">
        {items.length === 0 ? (
          <div className="career-inline-empty">
            No activity yet. Run a scan or evaluate a job to start the timeline.
          </div>
        ) : (
          items.map((item, idx) => (
            <div
              key={`${item.ts}-${idx}`}
              className="career-surface career-panel-soft px-4 py-3"
            >
              <div className="flex items-center gap-2 text-xs">
                <span className={`${TONE[item.type]} px-2.5 py-1`}>
                  {item.type.charAt(0).toUpperCase() + item.type.slice(1)}
                </span>
                <span className="text-[color:var(--career-ink-subtle)]">
                  {new Date(item.ts).toLocaleString('en-IN', {
                    day: '2-digit',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
              <p className="mt-2 text-sm text-[color:var(--career-ink-muted)]">{item.label}</p>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
