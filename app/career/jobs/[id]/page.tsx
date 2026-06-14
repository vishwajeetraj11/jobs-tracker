import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  getJobById,
  getLatestReportForJob,
  getProfile,
} from '@/lib/career-ops-data';
import { fetchJobDescription } from '@/lib/jd-fetcher';
import JobHeader from '@/app/components/career/job-detail/JobHeader';
import ScoreBreakdown from '@/app/components/career/job-detail/ScoreBreakdown';
import ReportViewer from '@/app/components/career/job-detail/ReportViewer';
import JDViewer from '@/app/components/career/job-detail/JDViewer';
import MarkdownRenderer from '@/app/components/career/shared/MarkdownRenderer';

export const dynamic = 'force-dynamic';

function parseId(raw: string) {
  const id = Number(raw);
  return Number.isFinite(id) ? id : null;
}

function pickSearchParam(value: string | string[] | undefined) {
  return typeof value === 'string' ? value : Array.isArray(value) ? value[0] ?? '' : '';
}

function resolveBackHref(value: string) {
  return value.startsWith('/career/jobs') ? value : '/career/jobs';
}

export default async function CareerJobDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id: idParam }, query] = await Promise.all([params, searchParams]);
  const id = parseId(idParam);
  if (!id) notFound();

  const backHref = resolveBackHref(pickSearchParam(query.from));

  const [job, report, profile] = await Promise.all([
    getJobById(id),
    getLatestReportForJob(id),
    getProfile(),
  ]);

  if (!job) notFound();

  const jdText =
    job.jd_text && job.jd_text.trim()
      ? job.jd_text
      : await fetchJobDescription(job.url)
          .then((result) => result.jdText)
          .catch(() => '');

  return (
    <div className="career-motion-stage space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href={backHref} className="career-muted-link text-sm">
          ← Back to jobs
        </Link>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/career/pipeline?job=${job.id}`}
            className="career-button-secondary min-h-[38px] px-3 py-2 text-xs"
          >
            Run evaluation
          </Link>
          {report ? (
            <a
              href={`/api/evaluate/${job.id}/pdf`}
              className="career-button-primary min-h-[38px] px-3 py-2 text-xs"
            >
              Download report PDF
            </a>
          ) : null}
        </div>
      </div>

      <JobHeader
        id={job.id}
        title={job.title}
        company={job.company}
        url={job.url}
        status={job.status}
        score={job.score}
        grade={job.grade}
        source={job.source}
      />

      {report ? (
        <ScoreBreakdown
          score_cv={report.score_cv}
          score_north={report.score_north}
          score_comp={report.score_comp}
          score_culture={report.score_culture}
          score_flags={report.score_flags}
          score_global={report.score_global}
          recommended={report.recommended}
          archetype={report.archetype}
          remote_policy={report.remote_policy}
          comp_range={report.comp_range}
        />
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <ReportViewer markdown={report?.content ?? null} reportNum={report?.num ?? null} />
        <JDViewer text={jdText} />
      </div>

      <section className="career-panel p-4 md:p-5">
        <h2 className="mb-3 text-lg font-semibold text-[color:var(--career-ink)]">Resume Preview</h2>
        <MarkdownRenderer markdown={profile.cv_md || '_No resume draft saved yet._'} />
      </section>
    </div>
  );
}
