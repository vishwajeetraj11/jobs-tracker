import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';

const VALID_STATUSES = new Set(['new', 'watching', 'applied', 'closed']);

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params;
  const body = await req.json();
  const { status } = body;

  if (!VALID_STATUSES.has(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  const { rowCount } = await pool.query(
    'UPDATE companies SET status = $1 WHERE name = $2',
    [status, decodeURIComponent(name)]
  );

  if (rowCount === 0) {
    return NextResponse.json({ error: 'Company not found' }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
