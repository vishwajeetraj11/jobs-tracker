import { NextResponse } from 'next/server';
import { createSseResponse } from '@/lib/sse';
import { evaluateAndPersistJob } from '@/lib/evaluator';
import { getJobById } from '@/lib/career-ops-data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parseId(raw: string) {
  const id = Number(raw);
  return Number.isFinite(id) ? id : null;
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idParam } = await params;
  const id = parseId(idParam);

  if (!id) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const job = await getJobById(id);
  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  return createSseResponse(async (send, isCancelled) => {
    send({
      type: 'evaluate:start',
      jobId: job.id,
      title: job.title,
      company: job.company,
      ts: new Date().toISOString(),
    });

    try {
      const output = await evaluateAndPersistJob(job, {
        onEvent: (event) => {
          if (isCancelled()) return;
          send({ type: 'evaluate:progress', jobId: job.id, event });
        },
      });

      if (!isCancelled()) {
        send({
          type: 'evaluate:done',
          jobId: job.id,
          score: output.job?.score ?? output.result.json.score_global,
          grade: output.job?.grade ?? output.result.json.grade,
          recommended: output.result.json.recommended,
          provider: output.result.provider,
          report_num: output.report.num,
          report_id: output.report.id,
          ts: new Date().toISOString(),
        });
      }
    } catch (error) {
      send({
        type: 'evaluate:error',
        jobId: job.id,
        error: error instanceof Error ? error.message : 'Unknown evaluation error',
      });
    }
  });
}

