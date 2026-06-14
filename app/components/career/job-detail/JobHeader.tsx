'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import ScoreBadge from '@/app/components/career/shared/ScoreBadge';
import StatusDropdown from '@/app/components/career/jobs/StatusDropdown';
import { JOB_STATUS_LABELS, type JobStatus } from '@/lib/career-config';
import type { JobAvailability } from '@/lib/jd-fetcher';

interface JobDetailHeaderProps {
  id: number;
  title: string;
  company: string;
  url: string;
  status: string;
  score: number | null;
  grade: string | null;
  source: string | null;
}

interface RecheckResponse {
  item?: {
    status?: string;
  };
  check?: {
    availability: JobAvailability;
    unavailableReason: string | null;
    statusChanged: boolean;
  };
  error?: string;
}

function formatSourceLabel(source: string | null) {
  if (!source) return 'Direct listing';
  if (source === 'hn') return 'Hacker News';
  if (source.startsWith('search:')) {
    return `Search: ${source.slice('search:'.length)}`;
  }

  return source
    .split(/[-_:]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export default function JobHeader(props: JobDetailHeaderProps) {
  const router = useRouter();
  const [status, setStatus] = useState<JobStatus>(props.status as JobStatus);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);
  const [isSavingStatus, setIsSavingStatus] = useState(false);
  const [isRechecking, setIsRechecking] = useState(false);
  const [isPending, startTransition] = useTransition();
  const busy = isPending || isSavingStatus || isRechecking;

  async function updateStatus(nextStatus: JobStatus) {
    if (nextStatus === status) return;

    const previous = status;
    setStatus(nextStatus);
    setError(null);
    setNotice(null);
    setIsSavingStatus(true);

    try {
      const response = await fetch(`/api/jobs/${props.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });

      if (!response.ok) {
        throw new Error(`We couldn't update the job status (${response.status}).`);
      }

      startTransition(() => {
        router.refresh();
      });
    } catch (err) {
      setStatus(previous);
      setError(err instanceof Error ? err.message : "We couldn't update the job status.");
    } finally {
      setIsSavingStatus(false);
    }
  }

  async function recheckListing() {
    setError(null);
    setNotice(null);
    setIsRechecking(true);

    try {
      const response = await fetch(`/api/jobs/${props.id}/recheck`, {
        method: 'POST',
      });
      const payload = (await response.json().catch(() => null)) as RecheckResponse | null;

      if (!response.ok) {
        throw new Error(payload?.error || `We couldn't recheck the job listing (${response.status}).`);
      }

      const nextStatus = payload?.item?.status;
      if (nextStatus) {
        setStatus(nextStatus as JobStatus);
      }

      setNotice(describeRecheckResult(payload?.check));
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't recheck the job listing.");
    } finally {
      setIsRechecking(false);
    }
  }

  return (
    <section className="career-panel p-5">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold tracking-tight text-[color:var(--career-ink)]">
            {props.title}
          </h1>
          <p className="mt-1 text-sm font-medium text-[color:var(--career-ink-muted)]">{props.company}</p>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
            <span className="career-pill">
              Status · {JOB_STATUS_LABELS[status] ?? status}
            </span>
            <span className="career-pill-muted">
              Source · {formatSourceLabel(props.source)}
            </span>
            <span className="career-pill-muted">
              Job #{props.id}
            </span>
          </div>
        </div>

        <div className="flex w-full max-w-[22rem] flex-col gap-3 sm:w-auto">
          <div className="career-panel-soft px-4 py-3">
            <div className="career-meta-label">Overall Fit</div>
            <div className="mt-2 flex items-center justify-between gap-3">
              <div className="text-lg font-semibold tabular-nums text-[color:var(--career-ink)]">
                {props.score === null ? 'Not scored' : `${props.score.toFixed(1)}/5`}
              </div>
              <ScoreBadge score={props.score} grade={props.grade} />
            </div>
          </div>

          <div className="career-panel-soft px-4 py-3">
            <div className="career-meta-label">Stage</div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StatusDropdown value={status} onChange={updateStatus} disabled={busy} />
              <button
                type="button"
                onClick={() => void recheckListing()}
                disabled={busy}
                className="career-button-secondary"
              >
                {isRechecking ? 'Checking...' : 'Recheck listing'}
              </button>
              <button
                type="button"
                onClick={() => void updateStatus('discarded')}
                disabled={busy || status === 'discarded'}
                className="career-button-danger"
              >
                Discard
              </button>
            </div>
            {busy ? (
              <span className="mt-2 block text-xs text-[color:var(--career-ink-muted)]">
                {isRechecking ? 'Checking the live job posting...' : 'Saving...'}
              </span>
            ) : null}
          </div>

          <a
            href={props.url}
            target="_blank"
            rel="noopener noreferrer"
            className="career-button-primary"
          >
            Open job posting
          </a>
        </div>
      </div>

      {error ? (
        <div className="career-alert career-alert-error mt-4">
          {error}
        </div>
      ) : null}

      {notice ? (
        <div
          className={`career-alert mt-4 ${
            notice.tone === 'success' ? 'career-alert-success' : 'career-alert-error'
          }`}
        >
          {notice.message}
        </div>
      ) : null}
    </section>
  );
}

function describeRecheckResult(
  check: RecheckResponse['check']
): { tone: 'success' | 'error'; message: string } {
  if (!check) {
    return {
      tone: 'error',
      message: "We couldn't confirm whether the posting is still live.",
    };
  }

  if (check.availability === 'active') {
    return {
      tone: 'success',
      message: 'The job posting is still live.',
    };
  }

  if (check.availability === 'expired') {
    return {
      tone: 'error',
      message: check.statusChanged
        ? 'The job posting looks unavailable, so it was marked as discarded.'
        : check.unavailableReason || 'The job posting looks unavailable.',
    };
  }

  return {
    tone: 'error',
    message: check.unavailableReason || "We couldn't confirm whether the posting is still live.",
  };
}
