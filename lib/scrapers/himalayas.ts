import { pipelineLog } from '../logger';
import { ScrapedJob, ScraperResult, FRONTEND_RE, PM_RE } from './types';

interface HimalayasJob {
  title?: string;
  companyName?: string;
  company?: string;
  applicationUrl?: string;
  url?: string;
  applyUrl?: string;
  [key: string]: unknown;
}

interface HimalayasResponse {
  jobs?: HimalayasJob[];
  [key: string]: unknown;
}

const ENDPOINTS = [
  'https://himalayas.app/jobs/api?limit=100&q=frontend',
  'https://himalayas.app/jobs/api?limit=100&q=react',
  'https://himalayas.app/jobs/api?limit=100&q=product+manager',
  'https://himalayas.app/api/jobs?limit=100',
] as const;

function categorise(title: string): ScrapedJob['category'] | null {
  if (FRONTEND_RE.test(title)) return 'frontend';
  if (PM_RE.test(title)) return 'pm';
  return null;
}

async function fetchJobs(): Promise<HimalayasJob[]> {
  for (const endpoint of ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        headers: { Accept: 'application/json' },
      });

      if (!res.ok) {
        pipelineLog(`[himalayas] ${endpoint} responded ${res.status}, trying next endpoint`);
        continue;
      }

      const data = (await res.json()) as HimalayasResponse;
      const jobs = data?.jobs;

      if (Array.isArray(jobs) && jobs.length > 0) {
        pipelineLog(`[himalayas] Fetched ${jobs.length} jobs from ${endpoint}`);
        return jobs;
      }

      pipelineLog(`[himalayas] ${endpoint} returned no jobs, trying next endpoint`);
    } catch (err) {
      pipelineLog(`[himalayas] Error fetching ${endpoint}: ${err}`);
    }
  }

  return [];
}

export async function run(): Promise<ScraperResult[]> {
  try {
    const allJobs = await fetchJobs();

    if (allJobs.length === 0) {
      pipelineLog('[himalayas] No jobs fetched from any endpoint');
      return [];
    }

    const byCompany = new Map<string, ScrapedJob[]>();
    for (const job of allJobs) {
      const title = (job.title ?? '') as string;
      const cat = categorise(title);
      if (!cat) continue;
      const company = (job.companyName ?? job.company ?? 'Unknown') as string;
      const url = (job.applicationUrl ?? job.url ?? job.applyUrl ?? '') as string;
      const scraped: ScrapedJob = { title, url, source: 'himalayas', category: cat };
      const existing = byCompany.get(company) ?? [];
      existing.push(scraped);
      byCompany.set(company, existing);
    }

    pipelineLog(`[himalayas] ${byCompany.size} companies matched`);

    const results: ScraperResult[] = Array.from(byCompany.entries()).map(
      ([company, jobs]) => ({ company, jobs }),
    );

    pipelineLog(`[himalayas] Returning results for ${results.length} companies`);
    return results;
  } catch (err) {
    pipelineLog(`[himalayas] Unexpected error: ${err}`);
    return [];
  }
}
