import { createSseResponse } from '@/lib/sse';
import { evaluateAndPersistJob } from '@/lib/evaluator';
import { listPendingJobs } from '@/lib/career-ops-data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const limit = Math.min(Math.max(Number(body?.limit ?? 200), 1), 1000);

  return createSseResponse(async (send, isCancelled) => {
    const jobs = await listPendingJobs(limit);
    send({ type: 'evaluate:start', total: jobs.length, ts: new Date().toISOString() });

    let success = 0;
    let failed = 0;

    for (const job of jobs) {
      if (isCancelled()) break;

      send({ type: 'job:start', jobId: job.id, title: job.title, company: job.company });

      try {
        const output = await evaluateAndPersistJob(job, {
          onEvent: (event) => {
            if (isCancelled()) return;
            send({ type: 'job:progress', jobId: job.id, event });
          },
        });

        success += 1;
        send({
          type: 'job:done',
          jobId: job.id,
          score: output.job?.score ?? output.result.json.score_global,
          grade: output.job?.grade ?? output.result.json.grade,
          provider: output.result.provider,
          recommended: output.result.json.recommended,
          report_num: output.report.num,
        });
      } catch (error) {
        failed += 1;
        send({
          type: 'job:error',
          jobId: job.id,
          error: error instanceof Error ? error.message : 'Unknown evaluation error',
        });
      }
    }

    send({
      type: 'evaluate:summary',
      success,
      failed,
      total: jobs.length,
      ts: new Date().toISOString(),
    });
  });
}

