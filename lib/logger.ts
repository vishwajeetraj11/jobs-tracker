// Store active SSE controllers on globalThis so they survive HMR and are
// shared across all Next.js route/module bundles in the same Node process.
const g = globalThis as typeof globalThis & {
  __sseControllers?: Set<ReadableStreamDefaultController>;
};

if (!g.__sseControllers) {
  g.__sseControllers = new Set();
}

const controllers = g.__sseControllers;

export function addSseController(ctrl: ReadableStreamDefaultController) {
  controllers.add(ctrl);
}

export function removeSseController(ctrl: ReadableStreamDefaultController) {
  controllers.delete(ctrl);
}

export function pipelineLog(message: string) {
  const line = `[${new Date().toISOString()}] ${message}`;
  console.log(line);

  if (controllers.size === 0) return;

  const encoded = new TextEncoder().encode(`data: ${JSON.stringify(line)}\n\n`);
  for (const ctrl of controllers) {
    try {
      ctrl.enqueue(encoded);
    } catch {
      controllers.delete(ctrl);
    }
  }
}
