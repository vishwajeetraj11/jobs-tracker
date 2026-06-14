import { NextResponse } from 'next/server';
import { getJobById, getLatestReportForJob, markJobPdfGenerated } from '@/lib/career-ops-data';
import { renderReportPdf } from '@/lib/pdf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parseId(raw: string) {
  const id = Number(raw);
  return Number.isFinite(id) ? id : null;
}

function slugify(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

async function handlePdfRequest({ params }: { params: Promise<{ id: string }> }) {
  const { id: idParam } = await params;
  const id = parseId(idParam);

  if (!id) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const [job, report] = await Promise.all([getJobById(id), getLatestReportForJob(id)]);

  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }
  if (!report) {
    return NextResponse.json({ error: 'No report available for this job' }, { status: 404 });
  }

  try {
    const pdfBuffer = await renderReportPdf(
      report.content,
      `${job.title} @ ${job.company} · Career Ops Report #${report.num}`
    );
    await markJobPdfGenerated(job.id, true);

    const filename = `${slugify(job.company)}-${slugify(job.title)}-report-${report.num}.pdf`;

    return new Response(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename=\"${filename}\"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'PDF generation failed' },
      { status: 500 }
    );
  }
}

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  return handlePdfRequest(context);
}

export async function POST(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  return handlePdfRequest(context);
}
