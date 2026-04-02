import { pool } from './db';
import { ATS_MAP } from './ats-map';
import { pipelineLog } from './logger';
import type { ScrapedJob, ScraperResult } from './scrapers/types';
import { FRONTEND_RE, PM_RE } from './scrapers/types';
import { run as runHn } from './scrapers/hn';
import { run as runHimalayas } from './scrapers/himalayas';
import { run as runRemotive } from './scrapers/remotive';
import { run as runYc } from './scrapers/yc';

const SEARCH_BASE =
  'https://api.adplist.org/search?disciplines=front-end&expertise=engineering&provider=v2&q=&session_types=mentorship&topic=Frontend%20Development&type=mentors';
const PROFILE_BASE = 'https://api.adplist.org/users/profile/mentor';

function categorise(title: string): ScrapedJob['category'] | null {
  if (FRONTEND_RE.test(title)) return 'frontend';
  if (PM_RE.test(title)) return 'pm';
  return null;
}

interface SearchResult { slug: string; name?: string }

interface MentorProfile {
  slug: string;
  name?: string;
  identity?: { country?: string };
  webLinks?: { linkedIn?: string; website?: string };
  profile?: { organization?: string; title?: string };
  data?: {
    name?: string;
    identity?: { country?: string };
    webLinks?: { linkedIn?: string; website?: string };
    profile?: { organization?: string; title?: string };
  };
}

interface NormalizedMentor {
  slug: string;
  name: string | null;
  title: string | null;
  employer: string | null;
  country: string | null;
  linkedin: string | null;
  website: string | null;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

async function inBatches<T, R>(
  items: T[],
  batchSize: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    results.push(...(await Promise.all(batch.map(fn))));
  }
  return results;
}

// ─── ADPList scraping ─────────────────────────────────────────────────────────

async function fetchAllMentorSlugs(): Promise<SearchResult[]> {
  const all: SearchResult[] = [];
  let page = 1;
  while (true) {
    const res = await fetch(`${SEARCH_BASE}&page=${page}`);
    if (!res.ok) { pipelineLog(`[ERROR] search page ${page} failed: ${res.status}`); break; }
    const body = await res.json();
    const results: SearchResult[] = body.results ?? body ?? [];
    if (!Array.isArray(results) || results.length === 0) break;
    all.push(...results);
    if (results.length < 36) break;
    page++;
  }
  pipelineLog(`[pipeline] fetched ${all.length} mentor slugs across ${page} pages`);
  return all;
}

async function fetchMentorProfile(slug: string): Promise<NormalizedMentor | null> {
  try {
    const res = await fetch(`${PROFILE_BASE}/${slug}`);
    if (!res.ok) return null;
    const body: MentorProfile = await res.json();
    const d = body.data ?? body;
    return {
      slug,
      name: d.name ?? null,
      title: d.profile?.title ?? null,
      employer: d.profile?.organization ?? null,
      country: d.identity?.country ?? null,
      linkedin: d.webLinks?.linkedIn ?? null,
      website: d.webLinks?.website ?? null,
    };
  } catch { return null; }
}

async function upsertMentors(mentors: NormalizedMentor[]) {
  for (const m of mentors) {
    await pool.query(
      `INSERT INTO mentors (slug, name, title, employer, country, linkedin, website, last_seen)
       VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
       ON CONFLICT (slug) DO UPDATE SET
         name=EXCLUDED.name, title=EXCLUDED.title, employer=EXCLUDED.employer,
         country=EXCLUDED.country, linkedin=EXCLUDED.linkedin,
         website=EXCLUDED.website, last_seen=NOW()`,
      [m.slug, m.name, m.title, m.employer, m.country, m.linkedin, m.website]
    );
  }
}

async function upsertCompanies(names: string[]) {
  for (const name of names) {
    const atsEntry = ATS_MAP[name];
    await pool.query(
      `INSERT INTO companies (name, ats, ats_slug, updated_at)
       VALUES ($1,$2,$3,NOW()) ON CONFLICT (name) DO NOTHING`,
      [name, atsEntry?.ats ?? null, atsEntry?.slug ?? null]
    );
  }
}

// ─── ATS job fetching ─────────────────────────────────────────────────────────

async function fetchGreenhouseJobs(slug: string): Promise<ScrapedJob[]> {
  const res = await fetch(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`);
  if (!res.ok) return [];
  const body = await res.json();
  return ((body.jobs as Array<{ title: string; absolute_url: string }>) ?? [])
    .flatMap((j) => { const cat = categorise(j.title); return cat ? [{ title: j.title, url: j.absolute_url, source: 'greenhouse', category: cat }] : []; });
}

async function fetchLeverJobs(slug: string): Promise<ScrapedJob[]> {
  const res = await fetch(`https://api.lever.co/v0/postings/${slug}?mode=json`);
  if (!res.ok) return [];
  const body: Array<{ text: string; hostedUrl: string }> = await res.json();
  return (Array.isArray(body) ? body : [])
    .flatMap((j) => { const cat = categorise(j.text); return cat ? [{ title: j.text, url: j.hostedUrl, source: 'lever', category: cat }] : []; });
}

async function fetchAshbyJobs(slug: string): Promise<ScrapedJob[]> {
  const res = await fetch(`https://api.ashbyhq.com/posting-api/job-board/${slug}`);
  if (!res.ok) return [];
  const body = await res.json();
  return ((body.jobPostings as Array<{ title: string; jobUrl?: string; externalLink?: string }>) ?? [])
    .flatMap((j) => { const cat = categorise(j.title); return cat ? [{ title: j.title, url: j.jobUrl ?? j.externalLink ?? '', source: 'ashby', category: cat }] : []; });
}

function toAtsSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-');
}

async function detectAts(name: string): Promise<{ ats: string; slug: string } | null> {
  const slug = toAtsSlug(name);
  const [gh, lv, ash] = await Promise.allSettled([
    fetch(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`).then((r) => r.ok ? r.json() : null),
    fetch(`https://api.lever.co/v0/postings/${slug}?mode=json`).then((r) =>
      r.ok ? r.json().then((d: unknown) => ({ ok: true, data: d })) : null),
    fetch(`https://api.ashbyhq.com/posting-api/job-board/${slug}`).then((r) => r.ok ? r.json() : null),
  ]);
  if (gh.status === 'fulfilled' && gh.value?.jobs) return { ats: 'greenhouse', slug };
  if (lv.status === 'fulfilled' && lv.value?.ok) return { ats: 'lever', slug };
  if (ash.status === 'fulfilled' && ash.value?.jobPostings) return { ats: 'ashby', slug };
  return null;
}

async function collectAtsJobs(): Promise<ScraperResult[]> {
  const { rows: companies } = await pool.query<{
    name: string; ats: string | null; ats_slug: string | null;
  }>('SELECT name, ats, ats_slug FROM companies');

  pipelineLog(`[pipeline] checking ${companies.length} companies via ATS…`);
  let processed = 0;
  let detected = 0;

  const results = await inBatches(companies, 10, async (company) => {
    let ats = company.ats;
    let ats_slug = company.ats_slug;

    if (!ats || !ats_slug) {
      const found = await detectAts(company.name);
      if (found) {
        ats = found.ats;
        ats_slug = found.slug;
        await pool.query('UPDATE companies SET ats=$1, ats_slug=$2 WHERE name=$3', [ats, ats_slug, company.name]);
        detected++;
      }
    }

    processed++;
    if (processed % 50 === 0) pipelineLog(`[pipeline] ATS: ${processed}/${companies.length}`);

    if (!ats || !ats_slug) return null;

    let jobs: ScrapedJob[] = [];
    try {
      if (ats === 'greenhouse') jobs = await fetchGreenhouseJobs(ats_slug);
      else if (ats === 'lever') jobs = await fetchLeverJobs(ats_slug);
      else if (ats === 'ashby') jobs = await fetchAshbyJobs(ats_slug);
    } catch (err) {
      pipelineLog(`[ERROR] ${company.name}: ${String(err)}`);
      return null;
    }

    return jobs.length > 0 ? { company: company.name, jobs } : null;
  });

  if (detected > 0) pipelineLog(`[pipeline] auto-detected ATS for ${detected} new companies`);
  return results.filter(Boolean) as ScraperResult[];
}

// ─── merge & save ─────────────────────────────────────────────────────────────

async function mergeAndSave(allResults: ScraperResult[]) {
  // Group by company, deduplicate by URL
  const byCompany = new Map<string, ScrapedJob[]>();
  for (const { company, jobs } of allResults) {
    const existing = byCompany.get(company) ?? [];
    const seenUrls = new Set(existing.map((j) => j.url));
    for (const job of jobs) {
      if (!seenUrls.has(job.url)) {
        existing.push(job);
        seenUrls.add(job.url);
      }
    }
    byCompany.set(company, existing);
  }

  // Upsert companies found only via scrapers (not ADPList mentors)
  for (const name of byCompany.keys()) {
    await pool.query(
      `INSERT INTO companies (name, updated_at) VALUES ($1, NOW()) ON CONFLICT (name) DO NOTHING`,
      [name]
    );
  }

  // Write merged open_roles
  let saved = 0;
  for (const [company, jobs] of byCompany) {
    await pool.query(
      'UPDATE companies SET open_roles=$1, updated_at=NOW() WHERE name=$2',
      [JSON.stringify(jobs), company]
    );
    saved++;
  }

  pipelineLog(`[pipeline] saved roles for ${saved} companies`);
}

// ─── opportunities log ────────────────────────────────────────────────────────

async function logOpportunities() {
  const { rows } = await pool.query<{
    name: string;
    open_roles: ScrapedJob[];
    mentor_linkedins: string[] | null;
  }>(
    `SELECT c.name, c.open_roles,
       array_agg(DISTINCT m.linkedin) FILTER (WHERE m.linkedin IS NOT NULL) AS mentor_linkedins
     FROM companies c
     LEFT JOIN mentors m ON m.employer = c.name
     WHERE c.status = 'new'
       AND c.open_roles IS NOT NULL
       AND jsonb_array_length(c.open_roles) > 0
       AND c.name NOT IN (SELECT DISTINCT company FROM applied WHERE company IS NOT NULL)
     GROUP BY c.name, c.open_roles`
  );

  if (rows.length === 0) { pipelineLog('[pipeline] no new opportunities found'); return; }

  pipelineLog(`[pipeline] === ${rows.length} opportunity(ies) ===`);
  for (const row of rows) {
    const roleCount = Array.isArray(row.open_roles) ? row.open_roles.length : 0;
    const linkedins = (row.mentor_linkedins ?? []).join(', ') || 'n/a';
    pipelineLog(`  • ${row.name} — ${roleCount} open role(s) — mentor LinkedIn: ${linkedins}`);
  }
}

// ─── main ─────────────────────────────────────────────────────────────────────

export async function runPipeline() {
  pipelineLog('__STATUS__:running');

  // 1. ADPList: fetch mentor slugs
  const searchResults = await fetchAllMentorSlugs();

  // 2. Fetch profiles in parallel batches
  pipelineLog(`[pipeline] fetching ${searchResults.length} profiles (10 at a time)…`);
  let fetched = 0;
  const profileResults = await inBatches(searchResults, 10, async (r) => {
    const profile = await fetchMentorProfile(r.slug);
    fetched++;
    if (fetched % 50 === 0) pipelineLog(`[pipeline] profiles: ${fetched}/${searchResults.length}`);
    return profile;
  });
  const mentors = profileResults.filter(Boolean) as NormalizedMentor[];
  pipelineLog(`[pipeline] fetched ${mentors.length} profiles`);

  // 3. Upsert mentors + companies
  await upsertMentors(mentors);
  const employers = [...new Set(mentors.map((m) => m.employer).filter(Boolean) as string[])];
  await upsertCompanies(employers);
  pipelineLog(`[pipeline] ${mentors.length} mentors, ${employers.length} companies upserted`);

  // 4. Run all job sources in parallel
  pipelineLog('[pipeline] running all job sources in parallel…');
  const [atsResults, hnResults, himalayasResults, remotiveResults, ycResults] = await Promise.all([
    collectAtsJobs(),
    runHn(),
    runHimalayas(),
    runRemotive(),
    runYc(),
  ]);

  const totalJobs = [atsResults, hnResults, himalayasResults, remotiveResults, ycResults]
    .map((r) => r.length).reduce((a, b) => a + b, 0);
  pipelineLog(`[pipeline] sources: ATS=${atsResults.length} HN=${hnResults.length} Himalayas=${himalayasResults.length} Remotive=${remotiveResults.length} YC=${ycResults.length} (${totalJobs} companies with roles)`);

  // 5. Merge all results and save
  await mergeAndSave([...atsResults, ...hnResults, ...himalayasResults, ...remotiveResults, ...ycResults]);

  // 6. Log opportunities
  await logOpportunities();

  pipelineLog('[pipeline] done');
  pipelineLog('__STATUS__:idle');
}
