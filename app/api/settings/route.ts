import { NextRequest, NextResponse } from 'next/server';
import {
  getCareerSettingsPublic,
  updateCareerSettings,
  coerceProvider,
} from '@/lib/career-ops-data';
import { getActiveProviderSummary } from '@/lib/evaluator';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const [settings, active] = await Promise.all([
    getCareerSettingsPublic(),
    getActiveProviderSummary(),
  ]);

  return NextResponse.json({
    item: {
      ...settings,
      active_provider: active.provider,
      active_model: active.model,
      active_has_key: active.hasApiKey,
    },
  });
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const updated = await updateCareerSettings({
    provider:
      body.provider === 'anthropic' || body.provider === 'openai'
        ? coerceProvider(body.provider)
        : undefined,
    anthropic_api_key:
      body.anthropic_api_key === undefined
        ? undefined
        : typeof body.anthropic_api_key === 'string'
          ? body.anthropic_api_key.trim() || null
          : null,
    openai_api_key:
      body.openai_api_key === undefined
        ? undefined
        : typeof body.openai_api_key === 'string'
          ? body.openai_api_key.trim() || null
          : null,
    scan_schedule:
      body.scan_schedule === undefined
        ? undefined
        : typeof body.scan_schedule === 'string'
          ? body.scan_schedule.trim() || null
          : null,
  });

  const active = await getActiveProviderSummary(updated.provider);

  return NextResponse.json({
    item: {
      provider: updated.provider,
      has_anthropic_key: Boolean(updated.anthropic_api_key || process.env.ANTHROPIC_API_KEY),
      has_openai_key: Boolean(updated.openai_api_key || process.env.OPENAI_API_KEY),
      active_provider: active.provider,
      active_model: active.model,
      active_has_key: active.hasApiKey,
      updated_at: updated.updated_at,
    },
  });
}

