const CAREER_STATUS_DEFINITIONS = [
  {
    id: 'pending',
    label: 'Pending',
    aliases: ['new', 'queued'],
    description: 'Job captured but not yet evaluated.',
    dashboard_group: 'pending',
  },
  {
    id: 'evaluated',
    label: 'Evaluated',
    aliases: ['evaluada'],
    description: 'Offer evaluated with report, pending decision.',
    dashboard_group: 'evaluated',
  },
  {
    id: 'applied',
    label: 'Applied',
    aliases: ['aplicado', 'enviada', 'aplicada', 'sent'],
    description: 'Application submitted.',
    dashboard_group: 'applied',
  },
  {
    id: 'responded',
    label: 'Responded',
    aliases: ['respondido'],
    description: 'Company has responded, not yet interview stage.',
    dashboard_group: 'responded',
  },
  {
    id: 'interview',
    label: 'Interview',
    aliases: ['entrevista'],
    description: 'Active interview process.',
    dashboard_group: 'interview',
  },
  {
    id: 'offer',
    label: 'Offer',
    aliases: ['oferta'],
    description: 'Offer received.',
    dashboard_group: 'offer',
  },
  {
    id: 'rejected',
    label: 'Rejected',
    aliases: ['rechazado', 'rechazada'],
    description: 'Rejected by company.',
    dashboard_group: 'rejected',
  },
  {
    id: 'discarded',
    label: 'Discarded',
    aliases: ['descartado', 'descartada', 'cerrada', 'cancelada'],
    description: 'Discarded by candidate or offer closed.',
    dashboard_group: 'discarded',
  },
  {
    id: 'skip',
    label: 'Skip',
    aliases: ['no_aplicar', 'no aplicar', 'monitor'],
    description: "Doesn't fit, don't apply.",
    dashboard_group: 'skip',
  },
] as const;

export type JobStatus = (typeof CAREER_STATUS_DEFINITIONS)[number]['id'];

export const JOB_STATUS_DEFINITIONS = CAREER_STATUS_DEFINITIONS;
export const JOB_STATUSES = CAREER_STATUS_DEFINITIONS.map((status) => status.id) as readonly JobStatus[];

const STATUS_META = Object.fromEntries(
  CAREER_STATUS_DEFINITIONS.map((status) => [status.id, status])
) as Record<JobStatus, (typeof CAREER_STATUS_DEFINITIONS)[number]>;

export const JOB_STATUS_LABELS = Object.fromEntries(
  CAREER_STATUS_DEFINITIONS.map((status) => [status.id, status.label])
) as Record<JobStatus, string>;

export const ACTIVE_JOB_STATUSES = ['applied', 'responded', 'interview', 'offer'] as const satisfies readonly JobStatus[];
export const CLOSED_JOB_STATUSES = ['rejected', 'discarded', 'skip'] as const satisfies readonly JobStatus[];

export const RECOMMENDATIONS = ['apply', 'watch', 'skip'] as const;
export type Recommendation = (typeof RECOMMENDATIONS)[number];

export const PROVIDERS = ['anthropic', 'openai'] as const;
export type Provider = (typeof PROVIDERS)[number];

export const PORTAL_TYPES = ['search_query', 'tracked_company'] as const;
export type PortalType = (typeof PORTAL_TYPES)[number];

export const PORTAL_TYPE_LABELS: Record<PortalType, string> = {
  search_query: 'Search Query',
  tracked_company: 'Tracked Company',
};

export const CAREER_SCORING = {
  recommendationBands: {
    apply_immediately: 4.5,
    apply: 4.0,
    watch: 3.5,
    pdf: 3.0,
  },
  gradeBands: [
    { min: 4.6, grade: 'A' },
    { min: 4.2, grade: 'A-' },
    { min: 3.8, grade: 'B+' },
    { min: 3.3, grade: 'B' },
    { min: 2.8, grade: 'C+' },
    { min: 2.3, grade: 'C' },
    { min: 0, grade: 'D' },
  ] as const,
} as const;

export const SCANNER_TITLE_FILTERS = {
  positive: [
    'Frontend',
    'Front-end',
    'Front End',
    'React',
    'Next.js',
    'Next',
    'Svelte',
    'SvelteKit',
    'UI Engineer',
    'UI Developer',
    'Web Engineer',
    'Web Developer',
    'JavaScript Engineer',
    'TypeScript Engineer',
    'Full Stack',
    'Fullstack',
    'Full-Stack',
    'Web3',
    'DeFi',
    'Blockchain',
    'Crypto',
    'dApp',
    'Ethereum',
    'Solidity',
    'On-chain',
    'Software Engineer',
    'Software Developer',
  ],
  negative: [
    'Junior',
    'Intern',
    '.NET',
    'Java ',
    'iOS',
    'Android',
    'PHP',
    'Ruby',
    'Embedded',
    'Firmware',
    'FPGA',
    'ASIC',
    'Salesforce Admin',
    'SAP ',
    'Oracle EBS',
    'Mainframe',
    'COBOL',
    'Backend',
    'DevOps',
    'Data Engineer',
    'Data Scientist',
    'Machine Learning',
  ],
  seniority_boost: ['Senior', 'Staff', 'Principal', 'Lead', 'Head', 'Director'],
} as const;

export const SCANNER_HINTS = {
  job: /(job|career|position|vacan|opening|opportunit)/i,
  expired: /(expired|closed|position filled|hiring complete|no longer accepting)/i,
} as const;

export const SCANNER_DEFAULTS = {
  maxResults: {
    tracked_company: 25,
    search_query: 20,
    max: 100,
    sharedScrapers: 120,
  },
  defaultPortalConfigs: {
    search_query: {
      query:
        'site:jobs.ashbyhq.com "Senior Frontend Engineer" OR "Staff Frontend Engineer" OR "Frontend Developer" remote',
      max_results: 20,
    },
    tracked_company: {
      company: 'OpenAI',
      careers_url: 'https://openai.com/careers',
      scan_method: 'websearch',
      scan_query: 'site:openai.com/careers "Solutions" OR "Forward Deployed" OR "AI Engineer"',
      max_results: 25,
    },
  },
} as const;

function normalizeToken(value: string) {
  return value
    .toLowerCase()
    .replace(/\*\*/g, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const STATUS_ALIAS_MAP = new Map<string, JobStatus>();
for (const status of CAREER_STATUS_DEFINITIONS) {
  STATUS_ALIAS_MAP.set(normalizeToken(status.id), status.id);
  for (const alias of status.aliases) {
    STATUS_ALIAS_MAP.set(normalizeToken(alias), status.id);
  }
}
STATUS_ALIAS_MAP.set(normalizeToken('apply-now'), 'evaluated');

export function isJobStatus(value: string): value is JobStatus {
  return JOB_STATUSES.includes(value as JobStatus);
}

export function isPortalType(value: string): value is PortalType {
  return PORTAL_TYPES.includes(value as PortalType);
}

export function normalizeJobStatusInput(value: string | null | undefined): JobStatus | null {
  if (!value) return null;
  return STATUS_ALIAS_MAP.get(normalizeToken(value)) ?? null;
}

export function getStatusMeta(status: JobStatus) {
  return STATUS_META[status];
}

export function gradeFromScore(score: number | null) {
  if (score === null) return 'C';

  for (const band of CAREER_SCORING.gradeBands) {
    if (score >= band.min) {
      return band.grade;
    }
  }

  return 'D';
}

export function recommendationFromScore(score: number | null): Recommendation {
  if (score === null) return 'watch';
  if (score >= CAREER_SCORING.recommendationBands.apply) return 'apply';
  if (score >= CAREER_SCORING.recommendationBands.watch) return 'watch';
  return 'skip';
}

export function matchesScannerTitle(title: string, url = '') {
  const normalizedTitle = title.toLowerCase();
  const normalizedContext = `${title} ${url}`.toLowerCase();
  const hasPositive = SCANNER_TITLE_FILTERS.positive.some((token) =>
    normalizedContext.includes(token.toLowerCase())
  );
  const hasNegative = SCANNER_TITLE_FILTERS.negative.some((token) =>
    normalizedContext.includes(token.toLowerCase())
  );

  if (!hasPositive || hasNegative) return false;

  const isGenericSoftwareTitle = /\bsoftware (engineer|developer)\b/i.test(normalizedTitle);
  const hasExplicitFrontendSignal =
    /\b(front[- ]?end|react|next(?:\.js)?|typescript|javascript|ui|web)\b/i.test(
      normalizedContext
    );

  if (isGenericSoftwareTitle && !hasExplicitFrontendSignal) {
    return false;
  }

  return true;
}

export function getDefaultPortalConfig(type: PortalType) {
  return JSON.parse(JSON.stringify(SCANNER_DEFAULTS.defaultPortalConfigs[type])) as Record<
    string,
    unknown
  >;
}
