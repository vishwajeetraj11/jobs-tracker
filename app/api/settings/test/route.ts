import { NextRequest, NextResponse } from 'next/server';
import { testProviderConnection } from '@/lib/evaluator';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const provider =
    body?.provider === 'anthropic' || body?.provider === 'openai'
      ? body.provider
      : undefined;

  const result = await testProviderConnection(provider);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}

