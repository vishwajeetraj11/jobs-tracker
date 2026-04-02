import { pipelineLog } from '../logger';
import { ScraperResult, ScrapedJob, FRONTEND_RE, PM_RE } from './types';

// ── API endpoints ──────────────────────────────────────────────────────────────

const ALGOLIA_URL =
  'https://hn.algolia.com/api/v1/search?query=Ask+HN%3A+Who+is+hiring%3F&tags=ask_hn,author_whoishiring&hitsPerPage=1';

const HN_ITEM_URL = (id: number | string) =>
  `https://hacker-news.firebaseio.com/v0/item/${id}.json`;

// ── Types mirroring the HN Firebase API ───────────────────────────────────────

interface HnStory {
  id: number;
  kids?: number[];
}

interface HnComment {
  id: number;
  text?: string;
  deleted?: boolean;
  dead?: boolean;
}

interface AlgoliaSearchResponse {
  hits: Array<{ objectID: string }>;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const URL_RE = /https?:\/\/\S+/;

function categorise(text: string): ScrapedJob['category'] | null {
  if (FRONTEND_RE.test(text)) return 'frontend';
  if (PM_RE.test(text)) return 'pm';
  return null;
}

/** Remove all HTML tags from a string. */
function stripHtml(html: string): string {
  // Replace <p>, <br>, block-level tags with newlines first so structure is
  // preserved after tag removal.
  return html
    .replace(/<p>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#x27;/gi, "'")
    .replace(/&#39;/gi, "'")
    .replace(/&nbsp;/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .trim();
}

/** Extract the first URL from a plain-text string. */
function extractUrl(text: string): string | null {
  const m = text.match(URL_RE);
  return m ? m[0].replace(/[.,;)>]+$/, '') : null;
}

/** Derive a clean company name from the first line of a plain-text comment. */
function parseCompanyName(firstLine: string): string {
  return firstLine
    .replace(URL_RE, '')           // remove any inline URLs
    .replace(/^>+/, '')            // strip leading blockquote markers
    .replace(/\|.*$/, '')          // strip pipe-separated metadata
    .replace(/[^\w\s&.,'-]/g, ' ') // collapse special chars
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Run `fn` over every item in `items` in sliding windows of `batchSize`,
 * awaiting each window before starting the next.
 */
async function inBatches<T, R>(
  items: T[],
  batchSize: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
  }
  return results;
}

// ── Main exported function ─────────────────────────────────────────────────────

export async function run(): Promise<ScraperResult[]> {
  // ── Step 1: Find the latest "Ask HN: Who is hiring?" story ──────────────────
  let storyId: string;
  try {
    const algoliaRes = await fetch(ALGOLIA_URL);
    if (!algoliaRes.ok) {
      pipelineLog(`[hn] Algolia API error: HTTP ${algoliaRes.status}`);
      return [];
    }
    const algoliaData: AlgoliaSearchResponse = await algoliaRes.json();
    const firstHit = algoliaData.hits?.[0];
    if (!firstHit?.objectID) {
      pipelineLog('[hn] Algolia returned no hits — aborting');
      return [];
    }
    storyId = firstHit.objectID;
    pipelineLog(`[hn] Found story ID: ${storyId}`);
  } catch (err) {
    pipelineLog(`[hn] Failed to reach Algolia API: ${String(err)}`);
    return [];
  }

  // ── Step 2: Fetch the story to get top-level comment IDs ────────────────────
  let commentIds: number[];
  try {
    const storyRes = await fetch(HN_ITEM_URL(storyId));
    if (!storyRes.ok) {
      pipelineLog(`[hn] HN Firebase story fetch failed: HTTP ${storyRes.status}`);
      return [];
    }
    const story: HnStory = await storyRes.json();
    commentIds = story.kids ?? [];
    pipelineLog(`[hn] Story has ${commentIds.length} top-level comments`);
  } catch (err) {
    pipelineLog(`[hn] Failed to fetch story from Firebase: ${String(err)}`);
    return [];
  }

  if (commentIds.length === 0) {
    pipelineLog('[hn] No comments found — returning empty result');
    return [];
  }

  // ── Step 3: Fetch all top-level comments in batches of 20 ───────────────────
  const fetchComment = async (id: number): Promise<HnComment | null> => {
    try {
      const res = await fetch(HN_ITEM_URL(id));
      if (!res.ok) return null;
      return (await res.json()) as HnComment;
    } catch {
      return null;
    }
  };

  const rawComments = await inBatches(commentIds, 20, fetchComment);
  const comments = rawComments.filter((c): c is HnComment => c !== null);
  pipelineLog(`[hn] Fetched ${comments.length} comments (of ${commentIds.length} IDs)`);

  // ── Step 4 & 5: Filter, parse, build ScraperResults ─────────────────────────
  const companyMap = new Map<string, ScrapedJob[]>();

  let matchCount = 0;

  for (const comment of comments) {
    if (comment.deleted || comment.dead) continue;
    if (!comment.text) continue;
    const cat = categorise(comment.text);
    if (!cat) continue;

    matchCount++;

    const plainText = stripHtml(comment.text);
    const lines = plainText.split('\n').map((l) => l.trim()).filter(Boolean);
    const firstLine = lines[0] ?? '';

    // Company name: split on the first pipe in the raw first line too
    const rawFirstLine = firstLine.split('|')[0];
    const company = parseCompanyName(rawFirstLine) || `HN-${comment.id}`;

    const jobUrl =
      extractUrl(plainText) ??
      `https://news.ycombinator.com/item?id=${comment.id}`;

    const job: ScrapedJob = {
      title: firstLine || (cat === 'pm' ? 'Product Manager' : 'Frontend / React Engineer'),
      url: jobUrl,
      source: 'hn',
      category: cat,
    };

    const existing = companyMap.get(company);
    if (existing) {
      existing.push(job);
    } else {
      companyMap.set(company, [job]);
    }
  }

  pipelineLog(`[hn] Matched ${matchCount} comments — ${companyMap.size} unique companies`);

  // ── Step 6: Build ScraperResult[] ───────────────────────────────────────────
  const results: ScraperResult[] = [];
  for (const [company, jobs] of companyMap) {
    results.push({ company, jobs });
  }

  return results;
}
