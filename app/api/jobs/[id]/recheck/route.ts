import { NextResponse } from 'next/server';
import {
  ACTIVE_JOB_STATUSES,
  CLOSED_JOB_STATUSES,
  type JobStatus,
} from '@/lib/career-config';
import { getJobById, updateJobStatus } from '@/lib/career-ops-data';
import { fetchJobDescription, type JobAvailability } from '@/lib/jd-fetcher';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parseId(raw: string) {
  const id = Number(raw);
  return Number.isFinite(id) ? id : null;
}

function isOneOf(value: JobStatus, set: readonly JobStatus[]) {
  return set.includes(value);
}

function shouldAutoDiscard(status: JobStatus, availability: JobAvailability) {
  if (availability !== 'expired') return false;
  if (isOneOf(status, ACTIVE_JOB_STATUSES)) return false;
  if (isOneOf(status, CLOSED_JOB_STATUSES)) return false;
  return true;
}

function toErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return "We couldn't verify whether the job posting still exists.";
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

  const checkedAt = new Date().toISOString();

  let availability: JobAvailability = 'unknown';
  let httpStatus: number | null = null;
  let unavailableReason: string | null = null;

  try {
    const result = await fetchJobDescription(job.url);
    availability = result.availability;
    httpStatus = result.httpStatus;
    unavailableReason = result.unavailableReason;
  } catch (error) {
    unavailableReason = toErrorMessage(error);
  }

  let item = job;
  let statusChanged = false;

  if (shouldAutoDiscard(job.status, availability)) {
    const updated = await updateJobStatus(job.id, 'discarded');
    if (updated) {
      item = updated;
      statusChanged = updated.status !== job.status;
    }
  }

  return NextResponse.json({
    item,
    check: {
      availability,
      httpStatus,
      unavailableReason,
      checkedAt,
      statusChanged,
    },
  });
}
