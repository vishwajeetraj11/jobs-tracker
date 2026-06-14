const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  nbsp: ' ',
  quot: '"',
};

const URL_IN_TEXT_PATTERN = /\b(?:https?:\/\/|www\.)\S+/gi;
const URL_SEGMENT_PATTERN = /\b(?:https?:\/\/|www\.)\S+/i;
const TITLE_SPLIT_PATTERN = /\s*\|\s*/;
const ROLE_HINT_PATTERN =
  /\b(frontend|front[- ]?end|full[- ]?stack|software|engineer|developer|designer|manager|analyst|scientist|architect|react|next(?:\.js)?|typescript|javascript|web|mobile|ios|android|devops|qa|sre|staff|principal|lead|intern|role|position|opening)\b/i;
const LOCATION_SEGMENT_PATTERN =
  /^[A-Za-z .'-]+,\s*[A-Z]{2,3}(?:\s*;\s*[A-Za-z .'-]+,\s*[A-Za-z]{2,})*$/i;
const GENERIC_LISTING_PATHS = new Set([
  '/career',
  '/careers',
  '/job',
  '/jobs',
  '/about/career',
  '/about/careers',
  '/about/job',
  '/about/jobs',
  '/open-position',
  '/open-positions',
]);

const INDIA_LOCATION_PATTERN =
  /\b(india|bengaluru|bangalore|hyderabad|pune|gurgaon|gurugram|noida|new delhi|delhi|mumbai|chennai|kolkata|ahmedabad|remote india|india remote|anywhere in india|across india|within india)\b/i;

const GLOBAL_REMOTE_PATTERN =
  /\b(work from anywhere|remote(?:\s*[-/]?\s*first)?|anywhere in (?:the )?world|worldwide|globally distributed|global remote)\b/i;

const NON_INDIA_ONLY_PATTERN =
  /\b(?:u\.s\.a?|united states|north america|canada|uk|united kingdom|europe|eu|emea|australia|new zealand|singapore|uae|middle east)\s*(?:only|based|timezone|time zone)\b/i;

const NON_INDIA_BASED_PATTERN =
  /\b(?:must be|only|applicants|candidates|you should be|you must be|based|located|residing|resident|within|from)\b[^\n]{0,36}\b(?:u\.s\.a?|united states|north america|canada|uk|united kingdom|europe|eu|emea|australia|new zealand|singapore|uae|middle east)\b/i;

const INDIA_EXCLUSION_PATTERN =
  /\b(excluding india|except india|outside india only|not in india|cannot hire in india|no india applicants)\b/i;

function decodeCodePoint(match: string, raw: string, radix: 10 | 16) {
  const value = Number.parseInt(raw, radix);
  if (!Number.isFinite(value) || value <= 0 || value > 0x10ffff) {
    return match;
  }

  try {
    return String.fromCodePoint(value);
  } catch {
    return match;
  }
}

export function decodeHtmlEntities(input: string) {
  return input
    .replace(/&#x([0-9a-fA-F]+);/g, (match, hex: string) =>
      decodeCodePoint(match, hex, 16)
    )
    .replace(/&#([0-9]+);/g, (match, decimal: string) =>
      decodeCodePoint(match, decimal, 10)
    )
    .replace(/&([a-zA-Z]+);/g, (match, name: string) => {
      const normalized = NAMED_ENTITIES[name.toLowerCase()];
      return normalized ?? match;
    });
}

export function normalizeWhitespace(input: string) {
  return input.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

function cleanText(input: string) {
  return normalizeWhitespace(decodeHtmlEntities(input || ''));
}

export function sanitizeJobUrl(rawUrl: string) {
  let value = cleanText(rawUrl);
  if (!value) return '';

  if (/^\/\//.test(value)) {
    value = `https:${value}`;
  } else {
    value = value.replace(/^([a-z]+:)(\/)([^/])/i, '$1//$3');
  }

  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value) && /^[\w.-]+\.[a-z]{2,}(?:\/|$)/i.test(value)) {
    value = `https://${value}`;
  }

  value = value.replace(/[),.;]+$/, '');

  try {
    return new URL(value).toString();
  } catch {
    return value;
  }
}

export function sanitizeCompanyName(rawCompany: string) {
  const cleaned = cleanText(rawCompany).replace(URL_IN_TEXT_PATTERN, '').trim();
  if (!cleaned) return 'Unknown';
  const [firstSegment] = cleaned.split(TITLE_SPLIT_PATTERN);
  return normalizeWhitespace(firstSegment || cleaned) || 'Unknown';
}

export function isLikelyGenericListingUrl(rawUrl: string) {
  const normalized = sanitizeJobUrl(rawUrl);
  if (!normalized) return true;

  try {
    const parsed = new URL(normalized);
    const path = parsed.pathname.replace(/\/+$/, '').toLowerCase() || '/';
    return GENERIC_LISTING_PATHS.has(path);
  } catch {
    return false;
  }
}

export interface LocationEligibility {
  eligible: boolean;
  reason: string;
}

export function evaluateLocationEligibility(rawText: string, rawUrl = ''): LocationEligibility {
  const context = cleanText(`${rawText}\n${rawUrl}`).toLowerCase();

  const excludesIndia = INDIA_EXCLUSION_PATTERN.test(context);
  const hasIndiaSignal = INDIA_LOCATION_PATTERN.test(context);
  const hasGlobalRemoteSignal = GLOBAL_REMOTE_PATTERN.test(context);
  const hasNonIndiaOnlySignal =
    NON_INDIA_ONLY_PATTERN.test(context) || NON_INDIA_BASED_PATTERN.test(context);

  if (excludesIndia) {
    return {
      eligible: false,
      reason: 'Location explicitly excludes India.',
    };
  }

  if (hasIndiaSignal) {
    return {
      eligible: true,
      reason: 'Location indicates India-based hiring.',
    };
  }

  if (hasNonIndiaOnlySignal) {
    return {
      eligible: false,
      reason: 'Location appears restricted to non-India regions.',
    };
  }

  if (hasGlobalRemoteSignal && !excludesIndia) {
    return {
      eligible: true,
      reason: 'Location indicates remote/global hiring.',
    };
  }

  return {
    eligible: false,
    reason: 'No clear India or remote-global location eligibility found.',
  };
}

function scoreTitleSegment(segment: string, company: string) {
  const normalized = segment.toLowerCase();
  if (!normalized) return -100;
  if (company && normalized === company.toLowerCase()) return -40;

  let score = 0;
  if (ROLE_HINT_PATTERN.test(segment)) score += 6;
  if (URL_SEGMENT_PATTERN.test(segment) || /&#x?[0-9a-f]+;/i.test(segment)) score -= 10;
  if ((segment.match(/;/g)?.length ?? 0) >= 2 && segment.includes(',')) score -= 5;
  if (LOCATION_SEGMENT_PATTERN.test(segment)) score -= 4;
  if (segment.length < 3) score -= 3;
  if (segment.length > 140) score -= 2;

  return score;
}

export function sanitizeJobTitle(rawTitle: string, company?: string | null) {
  const decoded = cleanText(rawTitle);
  if (!decoded) return 'Untitled role';

  const withoutUrlFragments = normalizeWhitespace(decoded.replace(URL_IN_TEXT_PATTERN, ' '));
  const cleanCompany = company ? sanitizeCompanyName(company) : '';

  const segments = withoutUrlFragments
    .split(TITLE_SPLIT_PATTERN)
    .map((segment) => normalizeWhitespace(segment.replace(/^[-,:;]+|[-,:;]+$/g, '')))
    .filter(Boolean)
    .filter((segment) => !cleanCompany || segment.toLowerCase() !== cleanCompany.toLowerCase())
    .filter((segment) => !URL_SEGMENT_PATTERN.test(segment));

  const pool = segments.length > 0 ? segments : [withoutUrlFragments];

  let best = pool[0];
  let bestScore = scoreTitleSegment(best, cleanCompany);

  for (const segment of pool.slice(1)) {
    const score = scoreTitleSegment(segment, cleanCompany);
    if (score > bestScore) {
      best = segment;
      bestScore = score;
    }
  }

  const fallback = pool.find((segment) => scoreTitleSegment(segment, cleanCompany) >= 0);
  const chosen = bestScore >= 0 ? best : fallback ?? withoutUrlFragments;
  const normalized = normalizeWhitespace(chosen);

  return normalized || 'Untitled role';
}
