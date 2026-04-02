'use client';

import { useState } from 'react';
import { PipelineStatus } from './LogPanel';

interface Props {
  status: PipelineStatus;
  onRun: () => void;
}

export default function RunPipelineButton({ status, onRun }: Props) {
  const [clicked, setClicked] = useState(false);
  const running = status === 'running' || clicked;

  const handleClick = async () => {
    if (running) return;
    setClicked(true);
    try {
      await fetch('/api/pipeline/run', { method: 'POST' });
    } finally {
      // SSE will flip status to 'running' shortly; reset clicked after a delay
      // so the spinner shows immediately even before SSE confirms
      setTimeout(() => setClicked(false), 5000);
    }
    onRun();
  };

  return (
    <button
      onClick={handleClick}
      disabled={running}
      className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400
        ${running
          ? 'bg-blue-400 text-white cursor-not-allowed'
          : 'bg-blue-600 text-white hover:bg-blue-700'
        }`}
    >
      {running && (
        <span className="w-3 h-3 rounded-full border-2 border-white border-t-transparent animate-spin" />
      )}
      {running ? 'Running…' : 'Run Pipeline'}
    </button>
  );
}
