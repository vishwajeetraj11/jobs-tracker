export interface ParsedSseMessage {
  event: string;
  data: string;
}

export async function consumeSseResponse(
  response: Response,
  onMessage: (msg: ParsedSseMessage) => void
) {
  if (!response.body) {
    throw new Error('Missing response body');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split('\n\n');
    buffer = chunks.pop() ?? '';

    for (const chunk of chunks) {
      const lines = chunk.split('\n');
      let event = 'message';
      let data = '';

      for (const line of lines) {
        if (line.startsWith('event:')) {
          event = line.replace('event:', '').trim();
        } else if (line.startsWith('data:')) {
          data += line.replace('data:', '').trim();
        }
      }

      if (data) {
        onMessage({ event, data });
      }
    }
  }
}

