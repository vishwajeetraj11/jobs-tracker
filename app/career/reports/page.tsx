'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import ScoreBadge from '@/app/components/career/shared/ScoreBadge';
import { RECOMMENDATIONS } from '@/lib/career-config';

interface ReportItem {
  id: number;
  job_id: number;
  num: number;
  content: string;
  score_global: number | null;
  recommended: string | null;
  archetype: string | null;
  created_at: string;
  job_title: string | null;
  job_company: string | null;
}

function buildReportPreview(content: string) {
  return content
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '$1')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[#>*_`|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildQuery(filters: {
  q: string;
  recommended: string;
  archetype: string;
  min_score: string;
}) {
  const params = new URLSearchParams();
  if (filters.q.trim()) params.set('q', filters.q.trim());
  if (filters.recommended.trim()) params.set('recommended', filters.recommended.trim());
  if (filters.archetype.trim()) params.set('archetype', filters.archetype.trim());
  if (filters.min_score.trim()) params.set('min_score', filters.min_score.trim());
  params.set('limit', '250');
  return params.toString();
}

export default function CareerReportsPage() {
  const [items, setItems] = useState<ReportItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    q: '',
    recommended: '',
    archetype: '',
    min_score: '',
  });

  async function refresh(next = filters) {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/reports?${buildQuery(next)}`, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`We couldn't load the reports (${response.status}).`);
      }
      const payload = (await response.json()) as { items: ReportItem[] };
      setItems(payload.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't load the reports.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <div className="career-motion-stage min-w-0 space-y-4">
      <div>
        <h1 className="career-page-title">Evaluation Reports</h1>
        <p className="career-page-subtitle">
          Search past evaluations by score, recommendation, and role type.
        </p>
      </div>

      <form
        className="career-panel grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-4"
        onSubmit={(event) => {
          event.preventDefault();
          void refresh(filters);
        }}
      >
        <div>
          <label className="career-meta-label mb-1.5 block">Search</label>
          <input
            className="career-input"
            placeholder="Role title, company, or report text"
            value={filters.q}
            onChange={(event) => setFilters((prev) => ({ ...prev, q: event.target.value }))}
          />
        </div>
        <div>
          <label className="career-meta-label mb-1.5 block">Recommendation</label>
          <select
            className="career-select"
            value={filters.recommended}
            onChange={(event) =>
              setFilters((prev) => ({ ...prev, recommended: event.target.value }))
            }
          >
            <option value="">Any recommendation</option>
            {RECOMMENDATIONS.map((recommendation) => (
              <option key={recommendation} value={recommendation}>
                {recommendation}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="career-meta-label mb-1.5 block">Role type</label>
          <input
            className="career-input"
            placeholder="e.g. design systems"
            value={filters.archetype}
            onChange={(event) => setFilters((prev) => ({ ...prev, archetype: event.target.value }))}
          />
        </div>
        <div>
          <label className="career-meta-label mb-1.5 block">Min score</label>
          <input
            className="career-input"
            placeholder="0 to 5"
            value={filters.min_score}
            onChange={(event) => setFilters((prev) => ({ ...prev, min_score: event.target.value }))}
          />
        </div>
        <div className="flex items-center gap-2 md:col-span-2 xl:col-span-4">
          <button
            type="submit"
            disabled={loading}
            data-busy={loading ? 'true' : 'false'}
            className="career-button-primary"
          >
            {loading ? 'Updating...' : 'Apply filters'}
          </button>
        </div>
      </form>

      {error ? (
        <div className="career-alert career-alert-error">
          {error}
        </div>
      ) : null}

      <div className="grid gap-3">
        {items.map((item) => (
          <article
            key={item.id}
            className="career-panel min-w-0 overflow-hidden p-4"
          >
            <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="break-words text-base font-semibold leading-tight text-[color:var(--career-ink)]">
                  {item.job_title ?? 'Untitled role'} · {item.job_company ?? 'Unknown'}
                </h2>
                <p className="text-xs text-[color:var(--career-ink-muted)]">
                  Report #{item.num} ·{' '}
                  {new Date(item.created_at).toLocaleDateString('en-IN', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  })}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <ScoreBadge score={item.score_global} />
                <span className="career-pill">
                  {item.recommended ?? 'No recommendation'}
                </span>
              </div>
            </div>

            <p className="mt-3 line-clamp-4 max-w-full break-words text-sm leading-6 text-[color:var(--career-ink-muted)] [overflow-wrap:anywhere]">
              {buildReportPreview(item.content)}
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                href={`/career/jobs/${item.job_id}`}
                className="career-button-secondary min-h-0 px-3 py-1.5 text-xs"
              >
                Open job
              </Link>
              <a
                href={`/api/reports/${item.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="career-button-secondary min-h-0 px-3 py-1.5 text-xs"
              >
                Open JSON
              </a>
            </div>
          </article>
        ))}
      </div>

      {!loading && items.length === 0 ? (
        <div className="career-empty-state text-sm text-[color:var(--career-ink-muted)]">
          No reports match these filters. Try removing one or two filters to see more results.
        </div>
      ) : null}
    </div>
  );
}
