import { NextRequest, NextResponse } from 'next/server';
import { updateCvMarkdown } from '@/lib/career-ops-data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const cvMd =
    typeof body?.cv_md === 'string'
      ? body.cv_md
      : typeof body?.markdown === 'string'
        ? body.markdown
        : null;

  if (cvMd === null) {
    return NextResponse.json({ error: 'cv_md (string) is required' }, { status: 400 });
  }

  const item = await updateCvMarkdown(cvMd);
  return NextResponse.json({ item });
}

