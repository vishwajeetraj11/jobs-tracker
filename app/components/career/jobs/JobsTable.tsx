'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import EmptyState from '@/app/components/career/shared/EmptyState';
import ConfirmDialog from '@/app/components/career/shared/ConfirmDialog';
import BulkActions from './BulkActions';
import JobFilters, { type JobFilterState } from './JobFilters';
import JobRow, { type JobListItem } from './JobRow';
import type { JobStatus } from '@/lib/career-config';
import type { JobAvailability } from '@/lib/jd-fetcher';

const DEFAULT_FILTERS: JobFilterState = {
  q: '',
  status: '',
  source: '',
  min_score: '',
};

interface JobsTableProps {
  initialItems: JobListItem[];
  initialFilters?: JobFilterState;
}

interface RecheckResponse {
  item: JobListItem;
  check: {
    availability: JobAvailability;
    httpStatus: number | null;
    unavailableReason: string | null;
    checkedAt: string;
    statusChanged: boolean;
  };
}

function toQuery(params: JobFilterState) {
  const search = new URLSearchParams();
  if (params.q.trim()) search.set('q', params.q.trim());
  if (params.status.trim()) search.set('status', params.status.trim());
  if (params.source.trim()) search.set('source', params.source.trim());
  if (params.min_score.trim()) search.set('min_score', params.min_score.trim());
  search.set('sort', 'added_at');
  search.set('order', 'desc');
  return search.toString();
}

function toFilterQuery(params: JobFilterState) {
  const search = new URLSearchParams();
  if (params.q.trim()) search.set('q', params.q.trim());
  if (params.status.trim()) search.set('status', params.status.trim());
  if (params.source.trim()) search.set('source', params.source.trim());
  if (params.min_score.trim()) search.set('min_score', params.min_score.trim());
  return search.toString();
}

export default function JobsTable({
  initialItems,
  initialFilters = DEFAULT_FILTERS,
}: JobsTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [items, setItems] = useState<JobListItem[]>(initialItems);
  const [filters, setFilters] = useState<JobFilterState>(initialFilters);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);
  const [isRouting, startRouting] = useTransition();

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const filterKey = JSON.stringify(initialFilters);
  const currentListHref = useMemo(() => {
    const query = toFilterQuery(filters);
    return query ? `${pathname}?${query}` : pathname;
  }, [filters, pathname]);

  useEffect(() => {
    setFilters(initialFilters);
  }, [filterKey, initialFilters]);

  useEffect(() => {
    setItems(initialItems);
    setSelected([]);
  }, [initialItems]);

  function navigateWithFilters(nextFilters: JobFilterState) {
    const query = toFilterQuery(nextFilters);
    const nextUrl = query ? `${pathname}?${query}` : pathname;
    startRouting(() => {
      router.push(nextUrl, { scroll: false });
    });
  }

  async function refresh(nextFilters = filters) {
    setLoading(true);
    setError(null);
    setNotice(null);

    try {
      const query = toQuery(nextFilters);
      const response = await fetch(`/api/jobs?${query}`, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`Failed to fetch jobs (${response.status})`);
      }
      const payload = (await response.json()) as { items: JobListItem[] };
      setItems(payload.items || []);
      setSelected([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh jobs');
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus(id: number, status: JobStatus) {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/jobs/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) {
        throw new Error(`Status update failed (${response.status})`);
      }
      setItems((prev) => prev.map((row) => (row.id === id ? { ...row, status } : row)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update status');
    } finally {
      setSaving(false);
    }
  }

  async function bulkSetStatus(status: JobStatus) {
    if (selected.length === 0) return;
    if (status === 'discarded') {
      setConfirmDiscardOpen(true);
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await Promise.all(
        selected.map((id) =>
          fetch(`/api/jobs/${id}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status }),
          }).then(async (response) => {
            if (!response.ok) {
              throw new Error(`Bulk update failed for job ${id}`);
            }
          })
        )
      );
      setItems((prev) =>
        prev.map((row) => (selectedSet.has(row.id) ? { ...row, status } : row))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bulk update failed');
    } finally {
      setSaving(false);
      setSelected([]);
    }
  }

  async function confirmDiscard() {
    setConfirmDiscardOpen(false);
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await Promise.all(
        selected.map((id) =>
          fetch(`/api/jobs/${id}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'discarded' }),
          }).then(async (response) => {
            if (!response.ok) {
              throw new Error(`Bulk discard failed for job ${id}`);
            }
          })
        )
      );
      setItems((prev) =>
        prev.map((row) => (selectedSet.has(row.id) ? { ...row, status: 'discarded' } : row))
      );
      setSelected([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bulk discard failed');
    } finally {
      setSaving(false);
    }
  }

  async function recheckSelected() {
    if (selected.length === 0) return;

    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      const results = await Promise.all(
        selected.map(async (id) => {
          const response = await fetch(`/api/jobs/${id}/recheck`, {
            method: 'POST',
          });
          const payload = (await response.json().catch(() => null)) as RecheckResponse | { error?: string } | null;

          if (!response.ok || !payload || !('item' in payload) || !('check' in payload)) {
            throw new Error(
              (payload && 'error' in payload && payload.error) || `Recheck failed for job ${id}.`
            );
          }

          return payload;
        })
      );

      const byId = new Map(results.map((result) => [result.item.id, result.item]));
      setItems((prev) => prev.map((row) => byId.get(row.id) ?? row));

      const activeCount = results.filter((result) => result.check.availability === 'active').length;
      const unavailableCount = results.filter((result) => result.check.availability === 'expired').length;
      const unknownCount = results.length - activeCount - unavailableCount;
      const discardedCount = results.filter((result) => result.check.statusChanged).length;

      const fragments = [
        activeCount > 0 ? `${activeCount} live` : null,
        unavailableCount > 0 ? `${unavailableCount} unavailable` : null,
        unknownCount > 0 ? `${unknownCount} inconclusive` : null,
      ].filter(Boolean);

      const summary = fragments.length > 0 ? fragments.join(', ') : `${results.length} checked`;
      const statusNote =
        discardedCount > 0
          ? ` ${discardedCount} ${discardedCount === 1 ? 'job was' : 'jobs were'} auto-discarded.`
          : '';

      setNotice(`Recheck complete: ${summary}.${statusNote}`);
      setSelected([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to recheck selected jobs');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="career-motion-stage space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="career-page-title">Jobs</h1>
          <p className="career-page-subtitle">
            Review roles, update their stage, and keep the queue clean.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="career-pill-muted">{items.length} jobs loaded</span>
          <button
            type="button"
            onClick={() => refresh()}
            data-busy={loading ? 'true' : 'false'}
            className="career-button-secondary"
          >
            {loading ? 'Refreshing...' : 'Refresh jobs'}
          </button>
        </div>
      </div>

      <JobFilters
        value={filters}
        loading={loading || isRouting}
        onApply={(next) => {
          setFilters(next);
          setNotice(null);
          setError(null);
          navigateWithFilters(next);
        }}
      />

      <BulkActions
        selectedCount={selected.length}
        busy={saving}
        onSetStatus={(status) => void bulkSetStatus(status)}
        onRecheck={() => void recheckSelected()}
        onClear={() => setSelected([])}
      />

      {error ? (
        <div className="career-alert career-alert-error">
          {error}
        </div>
      ) : null}

      {notice ? (
        <div className="career-alert career-alert-success">
          {notice}
        </div>
      ) : null}

      <div className="career-table-shell overflow-x-auto">
        <table className="min-w-[980px] w-full table-fixed text-sm">
          <thead>
            <tr className="border-b border-[color:var(--career-line)] bg-[color:var(--career-accent-ghost)] text-left text-[color:var(--career-ink-muted)]">
              <th className="w-12 px-3 py-3">
                <input
                  type="checkbox"
                  aria-label="Select all jobs"
                  checked={items.length > 0 && selected.length === items.length}
                  onChange={(event) =>
                    setSelected(event.target.checked ? items.map((item) => item.id) : [])
                  }
                  className="career-checkbox"
                />
              </th>
              <th className="px-3 py-3 font-medium">Role</th>
              <th className="w-[13rem] px-3 py-3 font-medium">Status</th>
              <th className="w-[10rem] px-3 py-3 font-medium">Score</th>
              <th className="w-[10rem] px-3 py-3 font-medium">Source</th>
              <th className="w-[9rem] px-3 py-3 font-medium">Added</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <JobRow
                key={item.id}
                item={item}
                returnTo={currentListHref}
                selected={selectedSet.has(item.id)}
                busy={saving}
                onToggle={(checked) =>
                  setSelected((prev) =>
                    checked ? [...new Set([...prev, item.id])] : prev.filter((id) => id !== item.id)
                  )
                }
                onStatusChange={(status) => void updateStatus(item.id, status)}
              />
            ))}
          </tbody>
        </table>
      </div>

      {!loading && items.length === 0 ? (
        <EmptyState
          title="No jobs found"
          description="Try broader filters, run a scan, or add a job through the API."
        />
      ) : null}

      <ConfirmDialog
        open={confirmDiscardOpen}
        title="Discard selected jobs?"
        description="This marks the selected jobs as discarded. You can still change their status later."
        confirmLabel="Discard Selected"
        busy={saving}
        onCancel={() => setConfirmDiscardOpen(false)}
        onConfirm={() => void confirmDiscard()}
      />
    </div>
  );
}
