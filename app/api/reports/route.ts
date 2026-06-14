import { NextRequest, NextResponse } from 'next/server';
import { listReports } from '@/lib/career-ops-data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const items = await listReports({
    q: params.get('q') ?? undefined,
    recommended: params.get('recommended') ?? undefined,
    archetype: params.get('archetype') ?? undefined,
    min_score: params.get('min_score') ? Number(params.get('min_score')) : undefined,
    max_score: params.get('max_score') ? Number(params.get('max_score')) : undefined,
    job_id: params.get('job_id') ? Number(params.get('job_id')) : undefined,
    limit: params.get('limit') ? Number(params.get('limit')) : undefined,
  });

  return NextResponse.json({ items });
}

