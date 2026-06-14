import { NextRequest, NextResponse } from 'next/server';
import { createJob, listJobs } from '@/lib/career-ops-data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const minScore = params.get('min_score');
  const maxScore = params.get('max_score');

  const items = await listJobs({
    q: params.get('q') ?? undefined,
    status: params.get('status') ?? undefined,
    source: params.get('source') ?? undefined,
    min_score: minScore ? Number(minScore) : undefined,
    max_score: maxScore ? Number(maxScore) : undefined,
    sort: (params.get('sort') as 'added_at' | 'evaluated_at' | 'score' | 'title' | 'company' | 'status' | null) ??
      undefined,
    order: (params.get('order') as 'asc' | 'desc' | null) ?? undefined,
    limit: params.get('limit') ? Number(params.get('limit')) : undefined,
  });

  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  if (!body?.title || !body?.url || !body?.company) {
    return NextResponse.json({ error: 'title, url, and company are required' }, { status: 400 });
  }

  const result = await createJob({
    title: body.title,
    company: body.company,
    url: body.url,
    status: body.status,
    score: body.score,
    grade: body.grade,
    notes: body.notes,
    source: body.source,
    jd_text: body.jd_text,
  });

  return NextResponse.json(
    { item: result.item, inserted: result.inserted },
    { status: result.inserted ? 201 : 200 }
  );
}
