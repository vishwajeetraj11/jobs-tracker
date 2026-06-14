'use client';

import Link from 'next/link';
import type { JobListItem } from '@/app/components/career/jobs/JobRow';

export default function PendingList({
  items,
  busyId,
  onEvaluateOne,
}: {
  items: JobListItem[];
  busyId?: number | null;
  onEvaluateOne: (id: number) => void;
}) {
  return (
    <section className="career-panel p-4 md:p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-[color:var(--career-ink)]">Pending Evaluations</h2>
        <span className="career-pill-muted">
          {items.length} {items.length === 1 ? 'job' : 'jobs'}
        </span>
      </div>

      <div className="space-y-2">
        {items.length === 0 ? (
          <div className="career-inline-empty">
            No jobs are waiting for evaluation.
          </div>
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              className="career-surface career-panel-soft flex flex-wrap items-center justify-between gap-3 px-4 py-3"
            >
              <div>
                <Link
                  href={`/career/jobs/${item.id}`}
                  title={item.title}
                  className="career-action-link line-clamp-2 max-w-[52ch] font-medium text-[color:var(--career-ink)] hover:text-[var(--career-accent)]"
                >
                  {item.title}
                </Link>
                <div className="text-xs text-[color:var(--career-ink-muted)]">{item.company}</div>
              </div>
              <button
                type="button"
                onClick={() => onEvaluateOne(item.id)}
                disabled={busyId === item.id}
                data-busy={busyId === item.id ? 'true' : 'false'}
                className="career-button-secondary min-h-[38px] px-3 py-2 text-xs"
              >
                {busyId === item.id ? 'Running...' : 'Run evaluation'}
              </button>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
