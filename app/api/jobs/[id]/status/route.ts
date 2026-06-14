import { NextRequest, NextResponse } from 'next/server';
import { updateJobStatus } from '@/lib/career-ops-data';
import { normalizeJobStatusInput } from '@/lib/career-config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parseId(raw: string) {
  const id = Number(raw);
  return Number.isFinite(id) ? id : null;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idParam } = await params;
  const id = parseId(idParam);

  if (!id) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const body = await req.json();
  if (!body?.status) {
    return NextResponse.json({ error: 'status is required' }, { status: 400 });
  }

  const status = typeof body.status === 'string' ? normalizeJobStatusInput(body.status) : null;
  if (!status) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  const item = await updateJobStatus(id, status);
  if (!item) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  return NextResponse.json({ item });
}
