'use client';

import { useEffect, useState } from 'react';
import PendingList from '@/app/components/career/pipeline/PendingList';
import EvaluationStream from '@/app/components/career/pipeline/EvaluationStream';
import EvaluateAllButton from '@/app/components/career/pipeline/EvaluateAllButton';
import type { JobListItem } from '@/app/components/career/jobs/JobRow';
import { consumeSseResponse } from '@/app/components/career/shared/consumeSse';
import { isLikelyGenericListingUrl } from '@/lib/job-text';

async function fetchPendingJobs() {
  const response = await fetch('/api/jobs?status=pending&sort=added_at&order=asc&limit=300', {
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new Error(`We couldn't load the evaluation queue (${response.status}).`);
  }
  const payload = (await response.json()) as { items: JobListItem[] };
  return (payload.items ?? []).filter((item) => !isLikelyGenericListingUrl(item.url));
}

export default function CareerPipelinePage() {
  const [targetJob, setTargetJob] = useState<number | null>(null);

  const [pending, setPending] = useState<JobListItem[]>([]);
  const [lines, setLines] = useState<string[]>([]);
  const [runningAll, setRunningAll] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [autoTriggered, setAutoTriggered] = useState(false);

  async function refreshPending() {
    const items = await fetchPendingJobs();
    setPending(items);
  }

  function appendLine(line: string) {
    setLines((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${line}`].slice(-500));
  }

  async function streamPost(url: string, body?: Record<string, unknown>) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    });
    if (!response.ok) {
      throw new Error(`We couldn't start that evaluation (${response.status}).`);
    }

    await consumeSseResponse(response, ({ event, data }) => {
      try {
        const payload = JSON.parse(data) as Record<string, unknown>;
        const type = String(payload.type ?? event);
        appendLine(`${type} ${JSON.stringify(payload)}`);

        if (type === 'job:done' || type === 'evaluate:done') {
          const jobId = Number(payload.jobId);
          if (Number.isFinite(jobId)) {
            setPending((prev) => prev.filter((item) => item.id !== jobId));
          }
        }
      } catch {
        appendLine(`${event} ${data}`);
      }
    });
  }

  async function runEvaluateAll() {
    setRunningAll(true);
    setError(null);
    appendLine('Starting evaluate-all run...');
    try {
      await streamPost('/api/evaluate/run', {});
      await refreshPending();
      appendLine('Evaluate-all run completed.');
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't evaluate the pending jobs.");
      appendLine('Evaluate-all run failed.');
    } finally {
      setRunningAll(false);
    }
  }

  async function runEvaluateOne(id: number) {
    setBusyId(id);
    setError(null);
    appendLine(`Starting evaluation for job ${id}...`);
    try {
      await streamPost(`/api/evaluate/${id}`, {});
      await refreshPending();
      appendLine(`Finished evaluation for job ${id}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't evaluate that job.");
      appendLine(`Evaluation failed for job ${id}.`);
    } finally {
      setBusyId(null);
    }
  }

  useEffect(() => {
    void refreshPending().catch((err) => {
      setError(err instanceof Error ? err.message : "We couldn't load the evaluation queue.");
    });
  }, []);

  useEffect(() => {
    const parsed = Number(new URLSearchParams(window.location.search).get('job'));
    setTargetJob(Number.isFinite(parsed) && parsed > 0 ? parsed : null);
  }, []);

  useEffect(() => {
    if (autoTriggered) return;
    if (!targetJob || !pending.some((item) => item.id === targetJob)) return;

    setAutoTriggered(true);
    void runEvaluateOne(targetJob);
  }, [autoTriggered, pending, targetJob]);

  return (
    <div className="career-motion-stage space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="career-page-title">Evaluation Queue</h1>
          <p className="career-page-subtitle">
            Review pending roles with AI and follow progress live.
          </p>
        </div>
        <EvaluateAllButton
          running={runningAll}
          disabled={busyId !== null}
          onClick={() => void runEvaluateAll()}
        />
      </div>

      {error ? (
        <div className="career-alert career-alert-error">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
        <PendingList items={pending} busyId={busyId} onEvaluateOne={(id) => void runEvaluateOne(id)} />
        <EvaluationStream lines={lines} />
      </div>
    </div>
  );
}
