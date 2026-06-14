'use client';

import { useState } from 'react';
import { PORTAL_TYPE_LABELS, type PortalType } from '@/lib/career-config';

interface PortalItem {
  id: number;
  name: string;
  type: PortalType;
  config: Record<string, unknown>;
  enabled: boolean;
}

export default function PortalList({
  items,
  onEdit,
  onToggle,
  onDelete,
}: {
  items: PortalItem[];
  onEdit: (item: PortalItem) => void;
  onToggle: (item: PortalItem, enabled: boolean) => void;
  onDelete: (id: number) => void;
}) {
  const [expanded, setExpanded] = useState<number[]>([]);

  return (
    <section className="career-panel min-w-0 p-4 md:p-5">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-[color:var(--career-ink)]">Saved Sources</h2>
          <p className="mt-1 text-sm text-[color:var(--career-ink-muted)]">
            {items.length} sources ready to scan. Open the JSON only when you need to inspect or edit the rules.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        {items.length === 0 ? (
          <div className="career-inline-empty">
            No sources yet. Add one to start scanning.
          </div>
        ) : (
          items.map((item) => {
            const isExpanded = expanded.includes(item.id);
            const config = item.config;
            const summary =
              item.type === 'search_query'
                ? summarizeQueryPortal(config)
                : summarizeTrackedPortal(config);

            return (
              <article
                key={item.id}
                className="career-surface career-panel-soft px-4 py-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-medium text-[color:var(--career-ink)]">{item.name}</div>
                      <span className="career-pill-muted">
                        {PORTAL_TYPE_LABELS[item.type]}
                      </span>
                      <span
                        className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                          item.enabled
                            ? 'career-pill-success'
                            : 'career-pill-muted'
                        }`}
                      >
                        {item.enabled ? 'Active' : 'Paused'}
                      </span>
                    </div>
                    <p className="mt-2 line-clamp-2 text-sm text-[color:var(--career-ink-muted)]">{summary}</p>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        setExpanded((current) =>
                          isExpanded
                            ? current.filter((id) => id !== item.id)
                            : [...current, item.id]
                        )
                      }
                      aria-expanded={isExpanded}
                      className="career-button-secondary min-h-[38px] px-3 py-2 text-xs"
                    >
                      {isExpanded ? 'Hide JSON' : 'Show JSON'}
                    </button>
                    <button
                      type="button"
                      onClick={() => onEdit(item)}
                      className="career-button-secondary min-h-[38px] px-3 py-2 text-xs"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => onToggle(item, !item.enabled)}
                      className="career-button-secondary min-h-[38px] px-3 py-2 text-xs"
                    >
                      {item.enabled ? 'Disable' : 'Enable'}
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(item.id)}
                      className="career-button-danger min-h-[38px] px-3 py-2 text-xs"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {isExpanded ? (
                  <pre className="mt-3 max-h-64 overflow-auto rounded-2xl bg-slate-900/95 p-3 text-[11px] leading-6 text-emerald-300">
                    {JSON.stringify(item.config, null, 2)}
                  </pre>
                ) : null}
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}

function summarizeQueryPortal(config: Record<string, unknown>) {
  const query = typeof config.query === 'string' ? config.query : '';
  const maxResults =
    typeof config.max_results === 'number' || typeof config.max_results === 'string'
      ? `Up to ${config.max_results} results`
      : null;

  return [truncate(query || 'No search query added yet.', 120), maxResults].filter(Boolean).join(' · ');
}

function summarizeTrackedPortal(config: Record<string, unknown>) {
  const careersUrl = typeof config.careers_url === 'string' ? config.careers_url : '';
  const scanMethod = typeof config.scan_method === 'string' ? config.scan_method : '';
  const ats = typeof config.ats === 'string' ? config.ats : '';
  const scanQuery = typeof config.scan_query === 'string' ? config.scan_query : '';

  return [
    careersUrl ? truncate(careersUrl, 60) : null,
    ats ? `ATS: ${ats}` : null,
    scanMethod ? `Method: ${scanMethod}` : null,
    scanQuery ? truncate(scanQuery, 88) : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

function truncate(value: string, max: number) {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}...`;
}
