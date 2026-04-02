export type JobCategory = 'frontend' | 'pm';

export interface ScrapedJob {
  title: string;
  url: string;
  source: string; // 'hn' | 'himalayas' | 'remotive' | 'yc' | 'greenhouse' | 'lever' | 'ashby'
  category: JobCategory;
}

export const FRONTEND_RE = /frontend|front-end|react/i;
export const PM_RE = /product manager|product management|\bpm\b/i;

export interface ScraperResult {
  company: string;
  jobs: ScrapedJob[];
}
