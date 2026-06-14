'use client';

import { useEffect, useMemo, useState } from 'react';
import PortalList from '@/app/components/career/scan/PortalList';
import PortalEditor from '@/app/components/career/scan/PortalEditor';
import TitleFilterEditor from '@/app/components/career/scan/TitleFilterEditor';
import ScanRunner from '@/app/components/career/scan/ScanRunner';
import ScanResults from '@/app/components/career/scan/ScanResults';
import SSELog from '@/app/components/career/shared/SSELog';
import { consumeSseResponse } from '@/app/components/career/shared/consumeSse';

interface PortalItem {
  id: number;
  name: string;
  type: 'search_query' | 'tracked_company';
  config: Record<string, unknown>;
  enabled: boolean;
}

interface ScanHistoryItem {
  id: number;
  url: string;
  first_seen: string;
  portal: string | null;
  title: string | null;
  company: string | null;
  scan_status: string | null;
}

interface ScanResultRow {
  portal: string;
  type: string;
  candidates: number;
  added: number;
  duplicates: number;
  skipped_title: number;
  skipped_expired: number;
  status: 'success' | 'failed';
  error?: string;
}

interface ScanSummary {
  added: number;
  duplicates: number;
  totalCandidates: number;
  skippedTitle: number;
  skippedExpired: number;
  results: ScanResultRow[];
}

async function fetchPortals() {
  const response = await fetch('/api/portals', { cache: 'no-store' });
  if (!response.ok) throw new Error(`We couldn't load your saved sources (${response.status}).`);
  const payload = (await response.json()) as { items: PortalItem[] };
  return payload.items ?? [];
}

async function fetchHistory() {
  const response = await fetch('/api/scan/history?limit=180', { cache: 'no-store' });
  if (!response.ok) throw new Error(`We couldn't load scan history (${response.status}).`);
  const payload = (await response.json()) as { items: ScanHistoryItem[] };
  return payload.items ?? [];
}

function formatLabel(value: string | null | undefined, fallback: string) {
  if (!value) return fallback;

  return value
    .replace(/[_:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function CareerScanPage() {
  const [portals, setPortals] = useState<PortalItem[]>([]);
  const [history, setHistory] = useState<ScanHistoryItem[]>([]);
  const [editing, setEditing] = useState<PortalItem | null>(null);
  const [running, setRunning] = useState(false);
  const [lines, setLines] = useState<string[]>([]);
  const [summary, setSummary] = useState<ScanSummary | null>(null);
  const [results, setResults] = useState<ScanResultRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [titleFilters, setTitleFilters] = useState<{ include: string[]; exclude: string[] }>({
    include: [],
    exclude: [],
  });

  const filteredHistory = useMemo(() => {
    if (titleFilters.include.length === 0 && titleFilters.exclude.length === 0) {
      return history;
    }

    return history.filter((item) => {
      const title = (item.title || '').toLowerCase();
      if (!title && titleFilters.include.length > 0) return false;

      const hasInclude =
        titleFilters.include.length === 0 ||
        titleFilters.include.some((token) => title.includes(token.toLowerCase()));
      const hasExclude = titleFilters.exclude.some((token) => title.includes(token.toLowerCase()));

      return hasInclude && !hasExclude;
    });
  }, [history, titleFilters]);

  function appendLine(line: string) {
    setLines((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${line}`].slice(-500));
  }

  async function refreshAll() {
    const [portalsData, historyData] = await Promise.all([fetchPortals(), fetchHistory()]);
    setPortals(portalsData);
    setHistory(historyData);
  }

  async function savePortal(payload: {
    id?: number;
    name: string;
    type: 'search_query' | 'tracked_company';
    config: Record<string, unknown>;
    enabled: boolean;
  }) {
    setError(null);
    try {
      const response = await fetch(payload.id ? `/api/portals/${payload.id}` : '/api/portals', {
        method: payload.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error(`We couldn't save this source (${response.status}).`);
      }
      await refreshAll();
      setEditing(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't save this source.");
    }
  }

  async function togglePortal(item: PortalItem, enabled: boolean) {
    setError(null);
    try {
      const response = await fetch(`/api/portals/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      if (!response.ok) throw new Error(`We couldn't update this source (${response.status}).`);
      await refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't update this source.");
    }
  }

  async function deletePortal(id: number) {
    setError(null);
    try {
      const response = await fetch(`/api/portals/${id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error(`We couldn't delete this source (${response.status}).`);
      await refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't delete this source.");
    }
  }

  async function runScan() {
    setRunning(true);
    setError(null);
    appendLine('Starting scan...');

    try {
      const response = await fetch('/api/scan/run', { method: 'POST' });
      if (!response.ok) {
        throw new Error(`We couldn't start the scan (${response.status}).`);
      }

      await consumeSseResponse(response, ({ event, data }) => {
        try {
          const payload = JSON.parse(data) as Record<string, unknown>;
          appendLine(`${String(payload.type ?? event)} ${JSON.stringify(payload)}`);

          if (payload.type === 'scan:complete' && payload.summary && typeof payload.summary === 'object') {
            const nextSummary = payload.summary as ScanSummary;
            setSummary(nextSummary);
            setResults(nextSummary.results ?? []);
          } else if (payload.type === 'scan:summary' && payload.summary && typeof payload.summary === 'object') {
            const nextSummary = payload.summary as ScanSummary;
            setSummary(nextSummary);
            setResults(nextSummary.results ?? []);
          }
        } catch {
          appendLine(`${event} ${data}`);
        }
      });

      appendLine('Scan completed.');
      await refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The scan didn't finish. Try again.");
      appendLine('Scan failed.');
    } finally {
      setRunning(false);
    }
  }

  useEffect(() => {
    void refreshAll().catch((err) => {
      setError(err instanceof Error ? err.message : "We couldn't load your scan data.");
    });
  }, []);

  return (
    <div className="career-motion-stage space-y-4">
      <div>
        <h1 className="career-page-title">Job Scans</h1>
        <p className="career-page-subtitle">
          Manage sources, run scans, and review which roles were added or skipped.
        </p>
      </div>

      {error ? (
        <div className="career-alert career-alert-error">
          {error}
        </div>
      ) : null}

      <ScanRunner running={running} summary={summary} onRun={() => void runScan()} />

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(21rem,24rem)_minmax(0,1fr)]">
        <div className="xl:sticky xl:top-6">
          <PortalEditor
            editing={editing}
            onSave={(payload) => void savePortal(payload)}
            onCancelEdit={() => setEditing(null)}
          />
        </div>
        <div className="min-w-0">
          <PortalList
            items={portals}
            onEdit={setEditing}
            onToggle={(item, enabled) => void togglePortal(item, enabled)}
            onDelete={(id) => void deletePortal(id)}
          />
        </div>
      </div>

      <TitleFilterEditor onChange={setTitleFilters} />

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <ScanResults rows={results} />
        <SSELog lines={lines} title="Scan Log" />
      </div>

      <section className="career-panel p-4 md:p-5">
        <h2 className="career-section-title mb-3">Recent Scan History</h2>
        <div className="max-h-80 overflow-y-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-[color:var(--career-line)] text-left text-[color:var(--career-ink-subtle)]">
                <th className="pb-2 pr-2 font-medium">Seen On</th>
                <th className="pb-2 pr-2 font-medium">Result</th>
                <th className="pb-2 pr-2 font-medium">Job Title</th>
                <th className="pb-2 font-medium">Source</th>
              </tr>
            </thead>
            <tbody>
              {filteredHistory.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-5 text-center text-[color:var(--career-ink-muted)]">
                    No saved results match the current title filters.
                  </td>
                </tr>
              ) : (
                filteredHistory.slice(0, 180).map((item) => (
                  <tr key={item.id} className="career-surface border-b border-[color:var(--career-line)]/65 last:border-b-0">
                    <td className="py-2 pr-2 text-xs text-[color:var(--career-ink-muted)]">
                      {new Date(item.first_seen).toLocaleDateString('en-IN')}
                    </td>
                    <td className="py-2 pr-2">
                      <span className="career-pill-muted">
                        {formatLabel(item.scan_status, 'Unknown result')}
                      </span>
                    </td>
                    <td className="py-2 pr-2 text-[color:var(--career-ink)]">{item.title ?? item.url}</td>
                    <td className="py-2 text-xs text-[color:var(--career-ink-muted)]">
                      {item.portal ?? 'Source unavailable'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
