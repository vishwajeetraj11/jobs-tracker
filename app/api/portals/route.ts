import { NextRequest, NextResponse } from 'next/server';
import { createPortal, listPortals } from '@/lib/career-ops-data';
import { isPortalType } from '@/lib/career-config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const items = await listPortals();
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  if (!body.name || typeof body.name !== 'string') {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  if (typeof body.type !== 'string' || !isPortalType(body.type)) {
    return NextResponse.json({ error: 'type must be search_query or tracked_company' }, { status: 400 });
  }

  const item = await createPortal({
    name: body.name.trim(),
    type: body.type,
    config: body.config && typeof body.config === 'object' ? body.config : {},
    enabled: body.enabled === undefined ? true : Boolean(body.enabled),
  });

  return NextResponse.json({ item }, { status: 201 });
}
