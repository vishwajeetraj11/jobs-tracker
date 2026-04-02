import { pipelineLog } from "../logger";
import { ScrapedJob, ScraperResult, FRONTEND_RE, PM_RE } from "./types";

function categorise(title: string): ScrapedJob['category'] | null {
  if (FRONTEND_RE.test(title)) return 'frontend';
  if (PM_RE.test(title)) return 'pm';
  return null;
}

const JSON_HEADERS = {
  Accept: "application/json",
  "User-Agent": "Mozilla/5.0",
};

// Primary REST endpoints
const WAAS_ENDPOINTS = [
  "https://www.workatastartup.com/jobs.json?role=eng&query=frontend",
  "https://www.workatastartup.com/jobs.json?role=eng&remote=true",
  "https://api.workatastartup.com/companies?jobType=fulltime&role=eng&query=frontend",
];

// Algolia fallback
const ALGOLIA_URL =
  "https://45bwzj1sgc-dsn.algolia.net/1/indexes/WaaS_production_jobs/query";
const ALGOLIA_APP_ID = "45BWZJ1SGC";
const ALGOLIA_API_KEY =
  "Zjk5ZGI5OWZlMGI4YWY4NWMzMGNiNDk5OThjNmFiMTM5YjRkMmUyNTc4ZGFhZWZmODYwZmIxMmQ1NDdhNjFiY2ZpbHRlcnM9JTI4cmVtb3RlJTNEdHJ1ZSUyMG9yJTIwbG9jYXRpb24lM0QlMjJTYW4lMjBGcmFuY2lzY28lMjIlMjk=";

// ---------------------------------------------------------------------------
// Types for raw API shapes (defensive — all fields optional)
// ---------------------------------------------------------------------------

interface WaaSJob {
  id?: number | string;
  title?: string;
  role?: string;
  company_name?: string;
  company?: { name?: string };
  url?: string;
}

interface WaaSCompany {
  name?: string;
  jobs?: WaaSJob[];
}

interface AlgoliaHit {
  objectID?: string;
  title?: string;
  role?: string;
  company_name?: string;
  company?: { name?: string };
  url?: string;
}

interface AlgoliaResponse {
  hits?: AlgoliaHit[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Normalise a raw job object (from any endpoint) into a { company, title, url } triple. */
function normaliseJob(
  job: WaaSJob | AlgoliaHit,
  fallbackCompany?: string
): { company: string; title: string; url: string } | null {
  const title = (job.title ?? job.role ?? "").trim();
  if (!title) return null;

  const company =
    (job.company_name?.trim() ||
      job.company?.name?.trim() ||
      fallbackCompany?.trim() ||
      "").trim();

  const id = (job as WaaSJob).id ?? (job as AlgoliaHit).objectID;
  const url =
    (job.url?.trim() ||
      (id != null ? `https://www.workatastartup.com/jobs/${id}` : "")).trim();

  if (!url) return null;

  return { company: company || "Unknown", title, url };
}

/**
 * Attempt to parse a Response as JSON.
 * Returns null (instead of throwing) if the body is HTML or unparseable.
 */
async function tryParseJson(res: Response): Promise<unknown> {
  const text = await res.text();
  // A quick sniff: JSON always starts with { or [
  const trimmed = text.trimStart();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Endpoint fetchers — each returns a flat list of { company, title, url }
// ---------------------------------------------------------------------------

async function fetchWaaSEndpoint(
  url: string
): Promise<{ company: string; title: string; url: string }[]> {
  pipelineLog(`[yc] trying endpoint: ${url}`);

  let res: Response;
  try {
    res = await fetch(url, { headers: JSON_HEADERS });
  } catch (err) {
    pipelineLog(
      `[yc] network error on ${url} — ${err instanceof Error ? err.message : String(err)}`
    );
    return [];
  }

  if (!res.ok) {
    pipelineLog(`[yc] HTTP ${res.status} from ${url}`);
    return [];
  }

  const data = await tryParseJson(res);
  if (data === null) {
    pipelineLog(`[yc] non-JSON response from ${url} (likely HTML)`);
    return [];
  }

  const results: { company: string; title: string; url: string }[] = [];

  // Shape 1 – top-level array of job objects: Job[]
  if (Array.isArray(data)) {
    for (const item of data as WaaSJob[]) {
      const normalised = normaliseJob(item);
      if (normalised) results.push(normalised);
    }
    pipelineLog(`[yc] ${results.length} jobs from ${url} (job-array shape)`);
    return results;
  }

  // Shape 2 – { jobs: Job[] }
  if (
    data !== null &&
    typeof data === "object" &&
    Array.isArray((data as Record<string, unknown>).jobs)
  ) {
    const jobs = (data as { jobs: WaaSJob[] }).jobs;
    for (const item of jobs) {
      const normalised = normaliseJob(item);
      if (normalised) results.push(normalised);
    }
    pipelineLog(`[yc] ${results.length} jobs from ${url} (jobs-key shape)`);
    return results;
  }

  // Shape 3 – { companies: Company[] }  (the /companies endpoint)
  if (
    data !== null &&
    typeof data === "object" &&
    Array.isArray((data as Record<string, unknown>).companies)
  ) {
    const companies = (data as { companies: WaaSCompany[] }).companies;
    for (const company of companies) {
      const companyName = company.name ?? "";
      for (const job of company.jobs ?? []) {
        const normalised = normaliseJob(job, companyName);
        if (normalised) results.push(normalised);
      }
    }
    pipelineLog(
      `[yc] ${results.length} jobs from ${url} (companies-key shape)`
    );
    return results;
  }

  pipelineLog(`[yc] unrecognised JSON shape from ${url}`);
  return [];
}

async function fetchAlgolia(): Promise<
  { company: string; title: string; url: string }[]
> {
  pipelineLog("[yc] trying Algolia fallback");

  let res: Response;
  try {
    res = await fetch(ALGOLIA_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-algolia-application-id": ALGOLIA_APP_ID,
        "x-algolia-api-key": ALGOLIA_API_KEY,
      },
      body: JSON.stringify({ query: "frontend react", hitsPerPage: 100 }),
    });
  } catch (err) {
    pipelineLog(
      `[yc] Algolia network error — ${err instanceof Error ? err.message : String(err)}`
    );
    return [];
  }

  if (!res.ok) {
    pipelineLog(`[yc] Algolia HTTP ${res.status}`);
    return [];
  }

  const data = await tryParseJson(res);
  if (data === null) {
    pipelineLog("[yc] Algolia returned non-JSON");
    return [];
  }

  const hits = (data as AlgoliaResponse).hits ?? [];
  const results: { company: string; title: string; url: string }[] = [];

  for (const hit of hits) {
    const normalised = normaliseJob(hit);
    if (normalised) results.push(normalised);
  }

  pipelineLog(`[yc] Algolia returned ${results.length} hits`);
  return results;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function run(): Promise<ScraperResult[]> {
  pipelineLog("[yc] scraper started");

  let rawJobs: { company: string; title: string; url: string }[] = [];

  // Try the primary REST endpoints in order; stop as soon as one yields data.
  for (const endpoint of WAAS_ENDPOINTS) {
    const jobs = await fetchWaaSEndpoint(endpoint);
    if (jobs.length > 0) {
      rawJobs = jobs;
      break;
    }
  }

  // If all REST endpoints came up empty, fall back to Algolia.
  if (rawJobs.length === 0) {
    rawJobs = await fetchAlgolia();
  }

  if (rawJobs.length === 0) {
    pipelineLog("[yc] all endpoints failed or returned no data — giving up");
    return [];
  }

  const byCompany = new Map<string, ScrapedJob[]>();
  for (const job of rawJobs) {
    const cat = categorise(job.title);
    if (!cat) continue;
    const entry: ScrapedJob = { title: job.title, url: job.url, source: 'yc', category: cat };
    const existing = byCompany.get(job.company) ?? [];
    existing.push(entry);
    byCompany.set(job.company, existing);
  }
  pipelineLog(`[yc] ${byCompany.size} companies matched (from ${rawJobs.length} total)`);

  const results: ScraperResult[] = Array.from(byCompany.entries()).map(
    ([company, jobs]) => ({ company, jobs })
  );

  pipelineLog(`[yc] returning ${results.length} company result(s)`);
  return results;
}
