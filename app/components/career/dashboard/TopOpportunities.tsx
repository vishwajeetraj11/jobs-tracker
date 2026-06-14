import Link from 'next/link';
import ScoreBadge from '@/app/components/career/shared/ScoreBadge';
import { JOB_STATUS_LABELS } from '@/lib/career-config';

interface JobItem {
  id: number;
  title: string;
  company: string;
  score: number | null;
  grade: string | null;
  status: string;
  source: string | null;
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

export default function TopOpportunities({ jobs }: { jobs: JobItem[] }) {
  return (
    <section className="career-panel p-4 md:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-[color:var(--career-ink)]">Top Opportunities</h2>
        <Link href="/career/jobs" className="career-muted-link text-sm">
          See all jobs
        </Link>
      </div>

      {jobs.length === 0 ? (
        <div className="career-inline-empty">
          No evaluated jobs yet. Run the queue to turn fresh scan results into a ranked shortlist.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-[color:var(--career-line)] text-left text-[color:var(--career-ink-subtle)]">
                <th className="pb-2 pr-2 font-medium">Role</th>
                <th className="pb-2 pr-2 font-medium">Status</th>
                <th className="pb-2 pr-2 font-medium">Score</th>
                <th className="pb-2 font-medium">Source</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr
                  key={job.id}
                  className="career-surface border-b border-[color:var(--career-line)]/65 last:border-b-0"
                >
                  <td className="py-3 pr-3">
                    <Link
                      href={`/career/jobs/${job.id}`}
                      className="career-action-link line-clamp-2 font-medium text-[color:var(--career-ink)] hover:text-[var(--career-accent)]"
                    >
                      {job.title}
                    </Link>
                    <div className="mt-1 text-xs text-[color:var(--career-ink-muted)]">{job.company}</div>
                  </td>
                  <td className="py-3 pr-2">
                    <span className={STATUS_TONE[job.status] ?? 'career-pill-muted'}>
                      {JOB_STATUS_LABELS[job.status as keyof typeof JOB_STATUS_LABELS] ?? job.status}
                    </span>
                  </td>
                  <td className="py-3 pr-2">
                    <ScoreBadge score={job.score} grade={job.grade} />
                  </td>
                  <td className="py-3 text-xs text-[color:var(--career-ink-muted)]">
                    {job.source ?? 'Direct listing'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
