'use client';

import { useEffect, useState } from 'react';
import { JOB_STATUS_DEFINITIONS } from '@/lib/career-config';

export interface JobFilterState {
  q: string;
  status: string;
  source: string;
  min_score: string;
}

const EMPTY_FILTERS: JobFilterState = {
  q: '',
  status: '',
  source: '',
  min_score: '',
};

export default function JobFilters({
  value,
  onApply,
  loading,
}: {
  value: JobFilterState;
  onApply: (next: JobFilterState) => void;
  loading?: boolean;
}) {
  const [draft, setDraft] = useState<JobFilterState>(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  return (
    <form
      className="career-panel grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-4"
      onSubmit={(event) => {
        event.preventDefault();
        onApply(draft);
      }}
    >
      <div>
        <label className="career-meta-label mb-1.5 block">Search</label>
        <input
          className="career-input"
          placeholder="Role title, company, or URL"
          value={draft.q}
          onChange={(event) => setDraft((prev) => ({ ...prev, q: event.target.value }))}
        />
      </div>

      <div>
        <label className="career-meta-label mb-1.5 block">Stage</label>
        <select
          className="career-select"
          value={draft.status}
          onChange={(event) => setDraft((prev) => ({ ...prev, status: event.target.value }))}
        >
          <option value="">All stages</option>
          {JOB_STATUS_DEFINITIONS.map((status) => (
            <option key={status.id} value={status.id}>
              {status.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="career-meta-label mb-1.5 block">Source</label>
        <input
          className="career-input"
          placeholder="For example: greenhouse"
          value={draft.source}
          onChange={(event) => setDraft((prev) => ({ ...prev, source: event.target.value }))}
        />
      </div>

      <div>
        <label className="career-meta-label mb-1.5 block">Minimum score</label>
        <input
          className="career-input"
          inputMode="decimal"
          placeholder="0 to 5"
          value={draft.min_score}
          onChange={(event) => setDraft((prev) => ({ ...prev, min_score: event.target.value }))}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 md:col-span-2 xl:col-span-4">
        <button
          type="submit"
          data-busy={loading ? 'true' : 'false'}
          className="career-button-primary"
          disabled={loading}
        >
          {loading ? 'Updating...' : 'Apply filters'}
        </button>
        <button
          type="button"
          className="career-button-secondary"
          onClick={() => {
            setDraft(EMPTY_FILTERS);
            onApply(EMPTY_FILTERS);
          }}
        >
          Clear filters
        </button>
        <span className="career-pill-muted sm:ml-auto">
          Filters reload the API results and clear the current selection.
        </span>
      </div>
    </form>
  );
}
