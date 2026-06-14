'use client';

import Link from 'next/link';
import ScoreBadge from './ScoreBadge';
import StatusDropdown from './StatusDropdown';
import type { JobStatus } from '@/lib/career-config';

export interface JobListItem {
  id: number;
  title: string;
  company: string;
  url: string;
  source: string | null;
  status: string;
  score: number | null;
  grade: string | null;
  added_at: string;
}

const STATUS_TONE: Record<string, string> = {
  pending: 'career-pill-warning',
  evaluated: 'career-pill',
  applied: 'career-pill',
  responded: 'career-pill-success',
  interview: 'career-pill-success',
  offer: 'career-pill-success',
  rejected: 'career-pill-danger',
  discarded: 'career-pill-muted',
  skip: 'career-pill-muted',
};

export default function JobRow({
  item,
  returnTo,
  selected,
  busy,
  onToggle,
  onStatusChange,
}: {
  item: JobListItem;
  returnTo: string;
  selected: boolean;
  busy?: boolean;
  onToggle: (checked: boolean) => void;
  onStatusChange: (status: JobStatus) => void;
}) {
  const sourceLabel = formatSourceLabel(item.source);
  const addedLabel = new Date(item.added_at).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  return (
    <tr className="career-surface border-b border-[color:var(--career-line)]/65 transition-colors hover:bg-[color:var(--career-accent-ghost)] last:border-b-0">
      <td className="px-3 py-4 align-top">
        <input
          type="checkbox"
          aria-label={`Select ${item.title}`}
          checked={selected}
          onChange={(event) => onToggle(event.target.checked)}
          className="career-checkbox mt-1"
        />
      </td>
      <td className="px-3 py-4 align-top">
        <Link
          href={{
            pathname: `/career/jobs/${item.id}`,
            query: { from: returnTo },
          }}
          className="career-action-link line-clamp-2 text-[15px] font-medium leading-6 text-[color:var(--career-ink)] hover:text-[var(--career-accent)]"
        >
          {item.title}
        </Link>
        <div className="mt-1 text-xs text-[color:var(--career-ink-muted)]">{item.company}</div>
      </td>
      <td className="px-3 py-4 align-top">
        <div className="space-y-2">
          <span className={STATUS_TONE[item.status] ?? 'career-pill-muted'}>{item.status}</span>
          <StatusDropdown value={item.status} onChange={onStatusChange} disabled={busy} />
        </div>
      </td>
      <td className="px-3 py-4 align-top">
        <ScoreBadge score={item.score} grade={item.grade} />
      </td>
      <td className="px-3 py-4 align-top">
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="career-action-link inline-flex max-w-full whitespace-nowrap text-xs font-medium text-[var(--career-accent)]"
          title={item.source ?? 'direct'}
        >
          <span className="truncate">{sourceLabel}</span>
        </a>
      </td>
      <td className="px-3 py-4 align-top text-xs font-medium tabular-nums text-[color:var(--career-ink-muted)]">
        <span className="whitespace-nowrap">{addedLabel}</span>
      </td>
    </tr>
  );
}

function formatSourceLabel(source: string | null) {
  if (!source) return 'Direct';

  if (source === 'hn') return 'Hacker News';
  if (source.startsWith('search:')) {
    return `Search / ${source.slice('search:'.length)}`;
  }

  return source
    .split(/[-_:]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
