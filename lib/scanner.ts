import { load } from 'cheerio';
import {
  addScanHistory,
  createJob,
  listPortals,
  type PortalRow,
} from './career-ops-data';
import {
  SCANNER_DEFAULTS,
  SCANNER_HINTS,
  matchesScannerTitle,
} from './career-config';
import { providerWebSearchJobs } from './evaluator';
import { fetchJobDescription } from './jd-fetcher';
import {
  evaluateLocationEligibility,
  isLikelyGenericListingUrl,
  sanitizeCompanyName,
  sanitizeJobTitle,
  sanitizeJobUrl,
} from './job-text';
import type { ScraperResult } from './scrapers/types';
import { run as runHn } from './scrapers/hn';
import { run as runHimalayas } from './scrapers/himalayas';
import { run as runRemotive } from './scrapers/remotive';
import { run as runYc } from './scrapers/yc';

interface CandidateJob {
  title: string;
  url: string;
  company: string;
  source: string;
}

interface EnrichedCandidate extends CandidateJob {
  jd_text: string | null;
  expired: boolean;
  expiredReason: string | null;
}

interface TrackedConfig {
  company?: string;
  careers_url?: string;
  ats?: 'greenhouse' | 'lever' | 'ashby' | 'workable';
  ats_slug?: string;
  scan_method?: 'websearch' | 'careers_page' | 'ats';
  scan_query?: string;
  max_results?: number;
}

interface QueryConfig {
  query?: string;
  scan_query?: string;
  max_results?: number;
}

export interface ScanPortalResult {
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

export interface ScanSummary {
  startedAt: string;
  finishedAt: string;
  portalsScanned: number;
  totalCandidates: number;
  added: number;
  duplicates: number;
  skippedTitle: number;
  skippedExpired: number;
  results: ScanPortalResult[];
}

function asAbsolute(baseUrl: string, maybeUrl: string) {
  try {
    return new URL(maybeUrl, baseUrl).toString();
  } catch {
    return null;
  }
}

function normalizeTitle(raw: string, company?: string) {
  return sanitizeJobTitle(raw, company);
}

function slugifyCompany(company: string) {
  return company
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

function parseAnchorCandidates(html: string, baseUrl: string, company: string, source: string): CandidateJob[] {
  const $ = load(html);
  const jobs: CandidateJob[] = [];
  const normalizedCompany = sanitizeCompanyName(company);

  $('a[href]').each((_, el) => {
    const href = ($(el).attr('href') ?? '').trim();
    const title = normalizeTitle($(el).text(), normalizedCompany);
    const resolved = asAbsolute(baseUrl, href);
    if (!resolved) return;
    const url = sanitizeJobUrl(resolved);
    if (!url) return;

    const haystack = `${title} ${href}`;
    if (!SCANNER_HINTS.job.test(haystack)) return;
    if (url.startsWith('mailto:') || url.startsWith('tel:')) return;

    jobs.push({
      title: title || 'Untitled role',
      url,
      company: normalizedCompany,
      source,
    });
  });

  return jobs;
}

function dedupeCandidates(candidates: CandidateJob[]) {
  const byUrl = new Map<string, CandidateJob>();

  for (const candidate of candidates) {
    if (!byUrl.has(candidate.url)) {
      byUrl.set(candidate.url, candidate);
      continue;
    }

    const existing = byUrl.get(candidate.url)!;
    if (existing.title.length < candidate.title.length) {
      byUrl.set(candidate.url, candidate);
    }
  }

  return Array.from(byUrl.values());
}

async function fetchHtml(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      },
      cache: 'no-store',
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch (${res.status})`);
    }

    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchGreenhouseJobs(slug: string, company: string): Promise<CandidateJob[]> {
  const res = await fetch(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`, {
    cache: 'no-store',
  });
  if (!res.ok) return [];
  const body = await res.json();
  const jobs = Array.isArray(body?.jobs) ? body.jobs : [];

  return jobs
    .map((job: { title?: string; absolute_url?: string }) => ({
      title: normalizeTitle(job.title ?? 'Untitled role', company),
      url: sanitizeJobUrl(String(job.absolute_url ?? '')),
      company: sanitizeCompanyName(company),
      source: 'greenhouse',
    }))
    .filter((job: CandidateJob) => Boolean(job.url));
}

async function fetchLeverJobs(slug: string, company: string): Promise<CandidateJob[]> {
  const res = await fetch(`https://api.lever.co/v0/postings/${slug}?mode=json`, {
    cache: 'no-store',
  });
  if (!res.ok) return [];
  const body = await res.json();
  const jobs = Array.isArray(body) ? body : [];

  return jobs
    .map((job: { text?: string; hostedUrl?: string }) => ({
      title: normalizeTitle(job.text ?? 'Untitled role', company),
      url: sanitizeJobUrl(String(job.hostedUrl ?? '')),
      company: sanitizeCompanyName(company),
      source: 'lever',
    }))
    .filter((job) => Boolean(job.url));
}

async function fetchAshbyJobs(slug: string, company: string): Promise<CandidateJob[]> {
  const res = await fetch(`https://api.ashbyhq.com/posting-api/job-board/${slug}`, {
    cache: 'no-store',
  });
  if (!res.ok) return [];
  const body = await res.json();
  const postings = Array.isArray(body?.jobPostings) ? body.jobPostings : [];

  return postings
    .map((job: { title?: string; jobUrl?: string; externalLink?: string }) => ({
      title: normalizeTitle(job.title ?? 'Untitled role', company),
      url: sanitizeJobUrl(String(job.jobUrl ?? job.externalLink ?? '')),
      company: sanitizeCompanyName(company),
      source: 'ashby',
    }))
    .filter((job: CandidateJob) => Boolean(job.url));
}

async function detectAts(company: string) {
  const slug = slugifyCompany(company);

  const checks = await Promise.allSettled([
    fetch(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`).then((r) => r.ok),
    fetch(`https://api.lever.co/v0/postings/${slug}?mode=json`).then((r) => r.ok),
    fetch(`https://api.ashbyhq.com/posting-api/job-board/${slug}`).then((r) => r.ok),
  ]);

  if (checks[0].status === 'fulfilled' && checks[0].value) {
    return { ats: 'greenhouse' as const, slug };
  }
  if (checks[1].status === 'fulfilled' && checks[1].value) {
    return { ats: 'lever' as const, slug };
  }
  if (checks[2].status === 'fulfilled' && checks[2].value) {
    return { ats: 'ashby' as const, slug };
  }
  return null;
}

async function scanTrackedCompany(portal: PortalRow) {
  const config = portal.config as TrackedConfig;
  const company = (config.company || portal.name).trim();
  const maxResults = Math.min(
    Math.max(Number(config.max_results ?? SCANNER_DEFAULTS.maxResults.tracked_company), 1),
    SCANNER_DEFAULTS.maxResults.max
  );
  let candidates: CandidateJob[] = [];

  const ats = config.ats;
  const atsSlug = config.ats_slug;
  const scanQuery = config.scan_query?.trim();

  if (ats && atsSlug) {
    if (ats === 'greenhouse') candidates = await fetchGreenhouseJobs(atsSlug, company);
    else if (ats === 'lever') candidates = await fetchLeverJobs(atsSlug, company);
    else if (ats === 'ashby') candidates = await fetchAshbyJobs(atsSlug, company);
  }

  if (candidates.length === 0 && config.careers_url) {
    const html = await fetchHtml(config.careers_url);
    candidates = parseAnchorCandidates(html, config.careers_url, company, 'careers-page');
  }

  if (candidates.length === 0) {
    const detected = await detectAts(company);
    if (detected) {
      if (detected.ats === 'greenhouse') candidates = await fetchGreenhouseJobs(detected.slug, company);
      else if (detected.ats === 'lever') candidates = await fetchLeverJobs(detected.slug, company);
      else if (detected.ats === 'ashby') candidates = await fetchAshbyJobs(detected.slug, company);
    }
  }

  if (candidates.length === 0) {
    const search = await providerWebSearchJobs(scanQuery || `${company} careers jobs`, maxResults);
    const normalizedCompany = sanitizeCompanyName(company);
    candidates = search.results
      .map((entry) => ({
        title: sanitizeJobTitle(entry.title, normalizedCompany),
        url: sanitizeJobUrl(entry.url),
        company: normalizedCompany,
        source: `search:${search.provider}`,
      }))
      .filter((candidate) => Boolean(candidate.url));
  }

  return dedupeCandidates(candidates).slice(0, maxResults);
}

async function scanSearchQuery(portal: PortalRow) {
  const config = portal.config as QueryConfig;
  const query = config.query?.trim() || config.scan_query?.trim();
  if (!query) {
    throw new Error(`Portal "${portal.name}" missing config.query or config.scan_query`);
  }

  const maxResults = Math.min(
    Math.max(Number(config.max_results ?? SCANNER_DEFAULTS.maxResults.search_query), 1),
    SCANNER_DEFAULTS.maxResults.max
  );
  const searched = await providerWebSearchJobs(query, maxResults);

  return dedupeCandidates(
    searched.results
      .map((entry) => ({
        title: sanitizeJobTitle(entry.title, portal.name),
        url: sanitizeJobUrl(entry.url),
        company: sanitizeCompanyName(portal.name),
        source: `search:${searched.provider}`,
      }))
      .filter((candidate) => Boolean(candidate.url))
  ).slice(0, maxResults);
}

function flattenSharedResults(source: string, rows: ScraperResult[]) {
  const flattened: CandidateJob[] = [];

  for (const row of rows) {
    const company = sanitizeCompanyName(row.company);
    for (const job of row.jobs) {
      const url = sanitizeJobUrl(job.url);
      if (!url) continue;

      flattened.push({
        title: sanitizeJobTitle(job.title, company),
        url,
        company,
        source: source || job.source || 'shared',
      });
    }
  }

  return dedupeCandidates(flattened);
}

async function enrichCandidate(candidate: CandidateJob) {
  try {
    const fetched = await fetchJobDescription(candidate.url);
    const company = sanitizeCompanyName(fetched.company?.trim() || candidate.company);
    const title = sanitizeJobTitle(fetched.title?.trim() || candidate.title, company);
    return {
      ...candidate,
      title,
      url: sanitizeJobUrl(candidate.url),
      company,
      source: fetched.atsType === 'unknown' ? candidate.source : fetched.atsType,
      jd_text: fetched.jdText || null,
      expired: fetched.availability === 'expired',
      expiredReason: fetched.unavailableReason,
    };
  } catch {
    return {
      ...candidate,
      title: sanitizeJobTitle(candidate.title, candidate.company),
      url: sanitizeJobUrl(candidate.url),
      company: sanitizeCompanyName(candidate.company),
      jd_text: null,
      expired: false,
      expiredReason: null,
    };
  }
}

async function persistCandidate(candidate: CandidateJob, portalName: string) {
  const company = sanitizeCompanyName(candidate.company);
  const title = sanitizeJobTitle(candidate.title, company);
  const url = sanitizeJobUrl(candidate.url);

  if (!title || !url) {
    await addScanHistory({
      url: url || candidate.url,
      portal: portalName,
      title: null,
      company,
      scan_status: 'skipped_title',
    });
    return { added: 0, dup: 0, skippedTitle: 1, skippedExpired: 0 };
  }

  if (!matchesScannerTitle(title, url)) {
    await addScanHistory({
      url,
      portal: portalName,
      title,
      company,
      scan_status: 'skipped_title',
    });
    return { added: 0, dup: 0, skippedTitle: 1, skippedExpired: 0 };
  }

  if (isLikelyGenericListingUrl(url)) {
    await addScanHistory({
      url,
      portal: portalName,
      title,
      company,
      scan_status: 'skipped_title',
    });
    return { added: 0, dup: 0, skippedTitle: 1, skippedExpired: 0 };
  }

  if (SCANNER_HINTS.expired.test(`${title} ${url}`)) {
    await addScanHistory({
      url,
      portal: portalName,
      title,
      company,
      scan_status: 'skipped_expired',
    });
    return { added: 0, dup: 0, skippedTitle: 0, skippedExpired: 1 };
  }

  const enriched: EnrichedCandidate = await enrichCandidate({ ...candidate, title, company, url });

  if (enriched.expired) {
    await addScanHistory({
      url: enriched.url,
      portal: portalName,
      title: enriched.title,
      company: enriched.company,
      scan_status: 'skipped_expired',
    });
    return { added: 0, dup: 0, skippedTitle: 0, skippedExpired: 1 };
  }

  const location = evaluateLocationEligibility(
    `${enriched.title}\n${enriched.company}\n${enriched.jd_text ?? ''}`,
    enriched.url
  );

  if (!location.eligible) {
    await addScanHistory({
      url: enriched.url,
      portal: portalName,
      title: enriched.title,
      company: enriched.company,
      scan_status: 'skipped_location',
    });
    return { added: 0, dup: 0, skippedTitle: 1, skippedExpired: 0 };
  }

  const created = await createJob({
    url: enriched.url,
    title: enriched.title,
    company: enriched.company,
    source: enriched.source,
    status: 'pending',
    jd_text: enriched.jd_text,
  });

  if (created.inserted) {
    await addScanHistory({
      url: enriched.url,
      portal: portalName,
      title: enriched.title,
      company: enriched.company,
      scan_status: 'added',
    });
    return { added: 1, dup: 0, skippedTitle: 0, skippedExpired: 0 };
  }

  await addScanHistory({
    url: enriched.url,
    portal: portalName,
    title: enriched.title,
    company: enriched.company,
    scan_status: 'skipped_dup',
  });
  return { added: 0, dup: 1, skippedTitle: 0, skippedExpired: 0 };
}

async function scanOnePortal(portal: PortalRow) {
  let candidates: CandidateJob[] = [];

  if (portal.type === 'search_query') {
    candidates = await scanSearchQuery(portal);
  } else {
    candidates = await scanTrackedCompany(portal);
  }

  let added = 0;
  let duplicates = 0;
  let skippedTitle = 0;
  let skippedExpired = 0;

  for (const candidate of candidates) {
    const persisted = await persistCandidate(candidate, portal.name);
    added += persisted.added;
    duplicates += persisted.dup;
    skippedTitle += persisted.skippedTitle;
    skippedExpired += persisted.skippedExpired;
  }

  return {
    candidates: candidates.length,
    added,
    duplicates,
    skippedTitle,
    skippedExpired,
  };
}

export async function runCareerScan(
  onEvent?: (event: Record<string, unknown>) => Promise<void> | void
): Promise<ScanSummary> {
  const startedAt = new Date().toISOString();
  const results: ScanPortalResult[] = [];
  let totalCandidates = 0;
  let added = 0;
  let duplicates = 0;
  let skippedTitle = 0;
  let skippedExpired = 0;

  const sharedScanners: Array<{ name: string; fn: () => Promise<ScraperResult[]> }> = [
    { name: 'hn', fn: runHn },
    { name: 'himalayas', fn: runHimalayas },
    { name: 'remotive', fn: runRemotive },
    { name: 'yc', fn: runYc },
  ];

  for (const scanner of sharedScanners) {
    onEvent?.({ type: 'shared:start', source: scanner.name });

    try {
      const rows = await scanner.fn();
      const candidates = flattenSharedResults(scanner.name, rows).slice(
        0,
        SCANNER_DEFAULTS.maxResults.sharedScrapers
      );

      let scannerAdded = 0;
      let scannerDup = 0;
      let scannerSkippedTitle = 0;
      let scannerSkippedExpired = 0;

      for (const candidate of candidates) {
        const persisted = await persistCandidate(candidate, `shared:${scanner.name}`);
        scannerAdded += persisted.added;
        scannerDup += persisted.dup;
        scannerSkippedTitle += persisted.skippedTitle;
        scannerSkippedExpired += persisted.skippedExpired;
      }

      totalCandidates += candidates.length;
      added += scannerAdded;
      duplicates += scannerDup;
      skippedTitle += scannerSkippedTitle;
      skippedExpired += scannerSkippedExpired;

      const result: ScanPortalResult = {
        portal: `shared:${scanner.name}`,
        type: 'shared_scraper',
        candidates: candidates.length,
        added: scannerAdded,
        duplicates: scannerDup,
        skipped_title: scannerSkippedTitle,
        skipped_expired: scannerSkippedExpired,
        status: 'success',
      };

      results.push(result);
      onEvent?.({ type: 'shared:done', source: scanner.name, result });
    } catch (error) {
      const result: ScanPortalResult = {
        portal: `shared:${scanner.name}`,
        type: 'shared_scraper',
        candidates: 0,
        added: 0,
        duplicates: 0,
        skipped_title: 0,
        skipped_expired: 0,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown shared scanner error',
      };
      results.push(result);
      onEvent?.({ type: 'shared:error', source: scanner.name, result });
    }
  }

  const portals = (await listPortals()).filter((entry) => entry.enabled);

  for (const portal of portals) {
    onEvent?.({ type: 'portal:start', portalId: portal.id, portalName: portal.name, portalType: portal.type });

    try {
      const scanned = await scanOnePortal(portal);
      totalCandidates += scanned.candidates;
      added += scanned.added;
      duplicates += scanned.duplicates;
      skippedTitle += scanned.skippedTitle;
      skippedExpired += scanned.skippedExpired;

      const result: ScanPortalResult = {
        portal: portal.name,
        type: portal.type,
        candidates: scanned.candidates,
        added: scanned.added,
        duplicates: scanned.duplicates,
        skipped_title: scanned.skippedTitle,
        skipped_expired: scanned.skippedExpired,
        status: 'success',
      };

      results.push(result);
      onEvent?.({ type: 'portal:done', portalId: portal.id, result });
    } catch (error) {
      const result: ScanPortalResult = {
        portal: portal.name,
        type: portal.type,
        candidates: 0,
        added: 0,
        duplicates: 0,
        skipped_title: 0,
        skipped_expired: 0,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown portal scan error',
      };

      results.push(result);
      onEvent?.({ type: 'portal:error', portalId: portal.id, result });
    }
  }

  const finishedAt = new Date().toISOString();

  const summary: ScanSummary = {
    startedAt,
    finishedAt,
    portalsScanned: portals.length + sharedScanners.length,
    totalCandidates,
    added,
    duplicates,
    skippedTitle,
    skippedExpired,
    results,
  };

  onEvent?.({ type: 'scan:summary', summary });
  return summary;
}

// Backward-compatible export used by existing route file.
export const runPortalScan = runCareerScan;
