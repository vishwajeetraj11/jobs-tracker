'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

export type PipelineStatus = 'idle' | 'running';

interface Props {
  onStatusChange?: (status: PipelineStatus) => void;
}

export default function LogPanel({ onStatusChange }: Props) {
  const router = useRouter();
  const [lines, setLines] = useState<string[]>([]);
  const [visible, setVisible] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    function connect() {
      const es = new EventSource('/api/logs');
      esRef.current = es;

      es.onmessage = (e) => {
        const line: string = JSON.parse(e.data);

        if (line.includes('__STATUS__:running')) {
          onStatusChange?.('running');
          setVisible(true);
          setLines((prev) => [...prev, '▶ Pipeline started…']);
          return;
        }
        if (line.includes('__STATUS__:idle')) {
          onStatusChange?.('idle');
          setLines((prev) => [...prev, '✓ Pipeline finished. Refreshing…']);
          router.refresh();
          return;
        }

        setLines((prev) => [...prev, line]);
      };

      es.onerror = () => {
        es.close();
        // Retry after 3 s
        setTimeout(connect, 3000);
      };
    }

    connect();
    return () => {
      esRef.current?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Stable callback ref so onStatusChange changes never restart the SSE
  const onStatusChangeRef = useRef(onStatusChange);
  useEffect(() => { onStatusChangeRef.current = onStatusChange; }, [onStatusChange]);

  // Auto-scroll within the log container only
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  if (!visible) return null;

  return (
    <div className="mb-8 rounded-lg border border-gray-200 overflow-hidden">
      <div className="bg-gray-900 px-4 py-2 flex items-center justify-between">
        <span className="text-xs font-mono text-gray-400">Pipeline logs</span>
        <button
          onClick={() => { setLines([]); setVisible(false); }}
          className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
        >
          clear
        </button>
      </div>
      <div ref={scrollRef} className="bg-gray-950 font-mono text-xs text-green-400 p-4 h-64 overflow-y-auto">
        {lines.map((line, i) => (
          <div key={i} className="leading-5 whitespace-pre-wrap">
            {line}
          </div>
        ))}
      </div>
    </div>
  );
}
