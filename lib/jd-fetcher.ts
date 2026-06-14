import { load } from 'cheerio';

export type AtsType =
  | 'greenhouse'
  | 'ashby'
  | 'lever'
  | 'workable'
  | 'naukri'
  | 'linkedin'
  | 'unknown';

export type JobAvailability = 'active' | 'expired' | 'unknown';

export interface JobDescriptionResult {
  url: string;
  title: string | null;
  company: string | null;
  atsType: AtsType;
  jdText: string;
  availability: JobAvailability;
  httpStatus: number | null;
  unavailableReason: string | null;
}

const ATS_PATTERNS: Record<Exclude<AtsType, 'unknown'>, RegExp> = {
  greenhouse: /greenhouse\.io/i,
  ashby: /ashbyhq\.com/i,
  lever: /lever\.co/i,
  workable: /workable\.com/i,
  naukri: /naukri\.com/i,
  linkedin: /linkedin\.com\/jobs/i,
};

const EXPIRED_STATUSES = new Set([404, 410, 451]);
const EXPIRED_URL_PATTERN = /(?:[?&]error=true\b|\/404(?:\/|$)|\/not-found(?:\/|$))/i;
const EXPIRED_TEXT_PATTERNS = [
  /\bjob no longer available\b/i,
  /\bno longer open\b/i,
  /\bposition has been filled\b/i,
  /\bposition filled\b/i,
  /\bthis job has expired\b/i,
  /\bno longer accepting applications\b/i,
  /\bjob (?:posting|opening|role) (?:has )?(?:expired|closed)\b/i,
  /\bthis role is no longer available\b/i,
  /\bpage not found\b/i,
  /\b404 error\b/i,
  /\bwe can'?t seem to find (?:the )?page\b/i,
];

function classifyAvailability(url: string, status: number, pageText: string, jdText: string) {
  if (EXPIRED_STATUSES.has(status)) {
    return {
      availability: 'expired' as const,
      reason: `Job page returned HTTP ${status}.`,
    };
  }

  if (EXPIRED_URL_PATTERN.test(url)) {
    return {
      availability: 'expired' as const,
      reason: 'Job URL indicates the posting is closed or missing.',
    };
  }

  for (const pattern of EXPIRED_TEXT_PATTERNS) {
    if (pattern.test(pageText)) {
      return {
        availability: 'expired' as const,
        reason: 'Job page content indicates the posting is closed or unavailable.',
      };
    }
  }

  if (status >= 500) {
    return {
      availability: 'unknown' as const,
      reason: `Job page returned HTTP ${status}.`,
    };
  }

  if (jdText.trim().length >= 180) {
    return {
      availability: 'active' as const,
      reason: null,
    };
  }

  return {
    availability: 'unknown' as const,
    reason: jdText.trim().length > 0 ? 'Unable to verify whether the job is still active.' : 'No meaningful JD content extracted.',
  };
}

function normalizeText(value: string) {
  return value
    .replace(/\r/g, '')
    .replace(/\t/g, ' ')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \f\v]+/g, ' ')
    .replace(/\s+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function detectAtsType(url: string, html?: string): AtsType {
  for (const [type, pattern] of Object.entries(ATS_PATTERNS)) {
    if (pattern.test(url)) {
      return type as AtsType;
    }
  }

  if (html) {
    const lower = html.toLowerCase();
    if (lower.includes('greenhouse') || lower.includes('gh_src=')) return 'greenhouse';
    if (lower.includes('ashbyhq')) return 'ashby';
    if (lower.includes('lever.co')) return 'lever';
    if (lower.includes('workable')) return 'workable';
    if (lower.includes('naukri')) return 'naukri';
    if (lower.includes('linkedin') && lower.includes('/jobs')) return 'linkedin';
  }

  return 'unknown';
}

function selectDescription($: ReturnType<typeof load>, atsType: AtsType): string {
  const selectorMap: Record<AtsType, string[]> = {
    greenhouse: ['#content', '.opening', '.job-post', '.job-post-content', 'main'],
    ashby: ['[data-testid="job-description"]', '.ashby-job-posting-description', 'main'],
    lever: ['.section-wrapper', '.posting-page', '.content', 'main'],
    workable: ['[data-ui="job-description"]', '.job-description', '.job-description__text', 'main'],
    naukri: ['.styles_JDC__dang-inner-html__h0K4t', '.jd-container', '#job_description', 'main'],
    linkedin: ['.show-more-less-html__markup', '.description__text', '.jobs-description-content__text', 'main'],
    unknown: ['article', 'main', '.job-description', '#job-description', 'body'],
  };

  const selectors = selectorMap[atsType] ?? selectorMap.unknown;

  for (const selector of selectors) {
    const text = normalizeText($(selector).first().text());
    if (text.length > 250) {
      return text;
    }
  }

  return normalizeText($('body').text());
}

function pickMeta($: ReturnType<typeof load>, selectors: string[]) {
  for (const selector of selectors) {
    const value = $(selector).attr('content') || $(selector).text();
    const cleaned = value?.trim();
    if (cleaned) return cleaned;
  }

  return null;
}

export async function fetchJobDescription(url: string): Promise<JobDescriptionResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
      },
      cache: 'no-store',
    });

    const html = await res.text();
    const $ = load(html);

    $('script, style, noscript, svg').remove();

    const atsType = detectAtsType(url, html);
    const jdText = res.ok ? selectDescription($, atsType).slice(0, 50000) : '';
    const pageText = normalizeText($('body').text()).slice(0, 12000);
    const classification = classifyAvailability(url, res.status, pageText, jdText);

    if (!res.ok && classification.availability !== 'expired') {
      throw new Error(`Failed to fetch JD (${res.status})`);
    }

    const title =
      pickMeta($, ['meta[property="og:title"]', 'meta[name="twitter:title"]']) ||
      $('h1').first().text().trim() ||
      $('title').first().text().trim() ||
      null;

    const company =
      pickMeta($, ['meta[property="og:site_name"]', 'meta[name="author"]']) ||
      $('meta[name="organization"]').attr('content')?.trim() ||
      $('.company, [data-testid="company-name"]').first().text().trim() ||
      null;

    return {
      url,
      title: title && title.length > 240 ? title.slice(0, 240) : title,
      company: company && company.length > 160 ? company.slice(0, 160) : company,
      atsType,
      jdText,
      availability: classification.availability,
      httpStatus: res.status,
      unavailableReason: classification.reason,
    };
  } finally {
    clearTimeout(timeout);
  }
}
