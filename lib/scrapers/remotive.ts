import { pipelineLog } from '../logger';
import { ScrapedJob, ScraperResult, FRONTEND_RE, PM_RE } from './types';

const API_URL = 'https://remotive.com/api/remote-jobs?category=software-dev&limit=100';

interface RemotiveJob {
  id: number;
  url: string;
  title: string;
  company_name: string;
  category: string;
  tags: string[];
  job_type: string;
  publication_date: string;
  candidate_required_location: string;
  salary: string;
  description: string;
}

interface RemotiveResponse {
  'job-count': number;
  jobs: RemotiveJob[];
}

function categorise(title: string): ScrapedJob['category'] | null {
  if (FRONTEND_RE.test(title)) return 'frontend';
  if (PM_RE.test(title)) return 'pm';
  return null;
}

export async function run(): Promise<ScraperResult[]> {
  try {
    const response = await fetch(API_URL);
    if (!response.ok) {
      pipelineLog(`[remotive] fetch failed — HTTP ${response.status}`);
      return [];
    }

    const data = (await response.json()) as RemotiveResponse;
    const allJobs = data.jobs ?? [];
    pipelineLog(`[remotive] fetched ${allJobs.length} total jobs`);

    const byCompany = new Map<string, ScrapedJob[]>();
    for (const job of allJobs) {
      const cat = categorise(job.title);
      if (!cat) continue;
      const entry: ScrapedJob = { title: job.title, url: job.url, source: 'remotive', category: cat };
      const existing = byCompany.get(job.company_name) ?? [];
      existing.push(entry);
      byCompany.set(job.company_name, existing);
    }

    pipelineLog(`[remotive] ${byCompany.size} companies with matched jobs`);
    return Array.from(byCompany.entries()).map(([company, jobs]) => ({ company, jobs }));
  } catch (err) {
    pipelineLog(`[remotive] error — ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}
