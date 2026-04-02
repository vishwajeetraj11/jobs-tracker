import { NextResponse } from 'next/server';
import { runPipeline } from '@/lib/pipeline';

export async function POST() {
  runPipeline().catch((err) => console.error('[api/pipeline/run]', err));
  return NextResponse.json({ ok: true });
}
