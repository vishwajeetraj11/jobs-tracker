import { createSseResponse } from '@/lib/sse';
import { runPortalScan } from '@/lib/scanner';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  return createSseResponse(async (send, isCancelled) => {
    send({ type: 'scan:start', ts: new Date().toISOString() });

    const summary = await runPortalScan(async (event) => {
      if (isCancelled()) return;
      send(event);
    });

    if (!isCancelled()) {
      send({ type: 'scan:complete', summary });
    }
  });
}
