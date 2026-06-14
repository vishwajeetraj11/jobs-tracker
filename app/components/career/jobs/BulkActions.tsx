'use client';

import type { JobStatus } from '@/lib/career-config';

export default function BulkActions({
  selectedCount,
  busy,
  onSetStatus,
  onRecheck,
  onClear,
}: {
  selectedCount: number;
  busy?: boolean;
  onSetStatus: (status: JobStatus) => void;
  onRecheck: () => void;
  onClear: () => void;
}) {
  if (selectedCount === 0) return null;

  return (
    <div className="career-panel flex flex-wrap items-center gap-2 px-3 py-2.5">
      <span className="career-pill-muted">
        {selectedCount} {selectedCount === 1 ? 'job' : 'jobs'} selected
      </span>
      <button
        type="button"
        disabled={busy || selectedCount === 0}
        data-busy={busy ? 'true' : 'false'}
        onClick={() => onSetStatus('applied')}
        className="career-button-secondary min-h-[38px] px-3 py-2 text-xs"
      >
        Mark applied
      </button>
      <button
        type="button"
        disabled={busy || selectedCount === 0}
        data-busy={busy ? 'true' : 'false'}
        onClick={() => onSetStatus('skip')}
        className="career-button-secondary min-h-[38px] px-3 py-2 text-xs"
      >
        Mark not a fit
      </button>
      <button
        type="button"
        disabled={busy || selectedCount === 0}
        data-busy={busy ? 'true' : 'false'}
        onClick={onRecheck}
        className="career-button-secondary min-h-[38px] px-3 py-2 text-xs"
      >
        Recheck listings
      </button>
      <button
        type="button"
        disabled={busy || selectedCount === 0}
        data-busy={busy ? 'true' : 'false'}
        onClick={() => onSetStatus('discarded')}
        className="career-button-danger min-h-[38px] px-3 py-2 text-xs"
      >
        Discard selected
      </button>
      <button
        type="button"
        onClick={onClear}
        disabled={selectedCount === 0}
        className="career-button-ghost ml-auto text-xs"
      >
        Clear selection
      </button>
    </div>
  );
}
