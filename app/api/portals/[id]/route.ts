import { NextRequest, NextResponse } from 'next/server';
import { deletePortal, updatePortal } from '@/lib/career-ops-data';
import { isPortalType } from '@/lib/career-config';

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

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const item = await updatePortal(id, {
    name: typeof body.name === 'string' ? body.name.trim() : undefined,
    type: typeof body.type === 'string' && isPortalType(body.type) ? body.type : undefined,
    config: body.config && typeof body.config === 'object' ? body.config : undefined,
    enabled: body.enabled === undefined ? undefined : Boolean(body.enabled),
  });

  if (!item) {
    return NextResponse.json({ error: 'Portal not found' }, { status: 404 });
  }

  return NextResponse.json({ item });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idParam } = await params;
  const id = parseId(idParam);
  if (!id) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const ok = await deletePortal(id);
  if (!ok) {
    return NextResponse.json({ error: 'Portal not found' }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
