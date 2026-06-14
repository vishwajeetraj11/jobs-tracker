import { NextRequest, NextResponse } from 'next/server';
import { getProfile, updateProfileData } from '@/lib/career-ops-data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const item = await getProfile();
  return NextResponse.json({ item });
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Profile payload must be an object' }, { status: 400 });
  }

  const data = body.data && typeof body.data === 'object' ? body.data : body;
  const item = await updateProfileData(data as Record<string, unknown>);
  return NextResponse.json({ item });
}

