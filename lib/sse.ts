export type SseSend = (payload: unknown, event?: string) => void;

function encodeEvent(payload: unknown, event = 'message') {
  const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
  return new TextEncoder().encode(`event: ${event}\ndata: ${body}\n\n`);
}

export function createSseResponse(
  runner: (send: SseSend, isCancelled: () => boolean) => Promise<void>
) {
  let cancelled = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send: SseSend = (payload, event = 'message') => {
        if (cancelled) return;
        controller.enqueue(encodeEvent(payload, event));
      };

      send({ connected: true, ts: new Date().toISOString() }, 'open');

      try {
        await runner(send, () => cancelled);
        send({ done: true, ts: new Date().toISOString() }, 'done');
      } catch (error) {
        send(
          {
            error: error instanceof Error ? error.message : 'Unknown SSE error',
            ts: new Date().toISOString(),
          },
          'error'
        );
      } finally {
        cancelled = true;
        try {
          controller.close();
        } catch {
          // ignored: stream already closed/cancelled
        }
      }
    },
    cancel() {
      cancelled = true;
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
