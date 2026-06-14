import { listJobs } from '@/lib/career-ops-data';
import JobsTable from '@/app/components/career/jobs/JobsTable';

export const dynamic = 'force-dynamic';

interface JobsPageFilterState {
  q: string;
  status: string;
  source: string;
  min_score: string;
}

function pickSearchParam(
  value: string | string[] | undefined
): string {
  return typeof value === 'string' ? value : Array.isArray(value) ? value[0] ?? '' : '';
}

export default async function CareerJobsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const initialFilters: JobsPageFilterState = {
    q: pickSearchParam(params.q).trim(),
    status: pickSearchParam(params.status).trim(),
    source: pickSearchParam(params.source).trim(),
    min_score: pickSearchParam(params.min_score).trim(),
  };

  const rows = await listJobs({
    q: initialFilters.q || undefined,
    status: initialFilters.status || undefined,
    source: initialFilters.source || undefined,
    min_score: initialFilters.min_score ? Number(initialFilters.min_score) : undefined,
    sort: 'added_at',
    order: 'desc',
    limit: 300,
  });

  const initialItems = rows.map((row) => ({
    id: row.id,
    title: row.title,
    company: row.company,
    url: row.url,
    source: row.source,
    status: row.status,
    score: row.score,
    grade: row.grade,
    added_at: row.added_at,
  }));

  return <JobsTable initialItems={initialItems} initialFilters={initialFilters} />;
}
