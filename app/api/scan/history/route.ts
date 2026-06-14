import { NextRequest, NextResponse } from 'next/server';
import { listScanHistory } from '@/lib/career-ops-data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const limitRaw = req.nextUrl.searchParams.get('limit');
  const limit = limitRaw ? Number(limitRaw) : 100;
  const rows = await listScanHistory(Number.isFinite(limit) ? limit : 100);

  return NextResponse.json({ items: rows });
}
