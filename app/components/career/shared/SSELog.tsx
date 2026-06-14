'use client';

import type { CSSProperties } from 'react';
import { useEffect, useMemo, useRef } from 'react';

interface SSELogProps {
  lines: string[];
  title?: string;
}

export default function SSELog({ lines, title = 'Live Log' }: SSELogProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const rendered = useMemo(
    () =>
      lines
        .filter((line) => !/adplist dashboard is unchanged/i.test(line))
        .slice(-300),
    [lines]
  );
  const hotStart = Math.max(0, rendered.length - 10);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [rendered.length]);

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-950 shadow-sm">
      <div className="border-b border-slate-800 px-4 py-2 text-xs font-medium text-slate-400">
        {title}
      </div>
      <div ref={viewportRef} className="h-64 overflow-y-auto px-4 py-3 font-mono text-xs text-emerald-300">
        {rendered.length === 0 ? (
          <div className="text-slate-500">Nothing yet. Start a run to see live updates.</div>
        ) : (
          rendered.map((line, idx) => (
            <div
              key={`${line}-${idx}`}
              className={[
                'whitespace-pre-wrap py-0.5 leading-5',
                idx >= hotStart ? 'career-stream-line' : '',
              ].join(' ')}
              style={
                { ['--career-stream-order' as string]: Math.max(0, idx - hotStart) } as CSSProperties
              }
            >
              {line}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
