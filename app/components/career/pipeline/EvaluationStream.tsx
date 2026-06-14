'use client';

import SSELog from '@/app/components/career/shared/SSELog';

export default function EvaluationStream({ lines }: { lines: string[] }) {
  return <SSELog lines={lines} title="Evaluation Log" />;
}
