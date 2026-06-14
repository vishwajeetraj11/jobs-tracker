import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import {
  createReport,
  getCareerSettings,
  getProfile,
  resolveProviderAndKeys,
  updateJobEvaluation,
  type JobRow,
  type ProfileRow,
} from './career-ops-data';
import {
  evaluateLocationEligibility,
  isLikelyGenericListingUrl,
  sanitizeJobTitle,
  sanitizeJobUrl,
} from './job-text';
import {
  RECOMMENDATIONS,
  gradeFromScore,
  recommendationFromScore,
  type Provider,
  type Recommendation,
} from './career-config';
import {
  buildEvaluationSystemPrompt,
  buildEvaluationUserPrompt,
  buildSearchSystemPrompt,
} from './career-prompts';
import { fetchJobDescription } from './jd-fetcher';

const DEFAULT_MODELS: Record<Provider, string> = {
  anthropic: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
  openai: process.env.OPENAI_MODEL || 'gpt-4o',
};

export interface EvaluationJson {
  score_cv: number | null;
  score_north: number | null;
  score_comp: number | null;
  score_culture: number | null;
  score_flags: number | null;
  score_global: number | null;
  grade: string | null;
  remote_policy: string | null;
  comp_range: string | null;
  archetype: string | null;
  recommended: Recommendation;
  role_summary: string;
  tailored_angle: string;
}

export interface EvaluationResult {
  provider: Provider;
  model: string;
  jdText: string;
  json: EvaluationJson;
  reportMarkdown: string;
  raw: string;
}

export interface SearchJobResult {
  title: string;
  url: string;
  snippet?: string;
}

export interface ResumeImportProfile {
  name: string;
  email: string;
  location: string;
  target_role: string;
  summary: string;
  skills: string;
}

export interface ResumeImportResult {
  provider: Provider;
  model: string;
  profile: ResumeImportProfile;
  cv_md: string;
  raw: string;
}

type EvalEvent =
  | { type: 'provider:selected'; provider: Provider; model: string }
  | { type: 'provider:trying'; provider: Provider; model: string }
  | { type: 'provider:failed'; provider: Provider; error: string }
  | { type: 'provider:done'; provider: Provider; model: string }
  | { type: 'role:gate'; decision: 'skip'; reason: string }
  | { type: 'profile:loaded' }
  | { type: 'jd:loaded'; chars: number }
  | { type: 'report:persisted'; reportNum: number }
  | { type: 'job:updated'; score: number | null; grade: string | null };

export interface EvaluateJobOptions {
  profile?: ProfileRow;
  providerOverride?: Provider;
  onEvent?: (event: EvalEvent) => Promise<void> | void;
}

const RESUME_IMPORT_PROMPT = `You are an expert resume parser.
Return strict JSON only with this exact shape:
{
  "profile": {
    "name": "string",
    "email": "string",
    "location": "string",
    "target_role": "string",
    "summary": "string",
    "skills": "comma separated skills"
  },
  "cv_md": "markdown"
}

Rules:
- Infer fields conservatively from resume text.
- Keep summary concise (3-5 lines).
- skills must be a single comma-separated string.
- cv_md should be clean markdown with sections:
  # Name
  ## Summary
  ## Skills
  ## Experience
  ## Education
  ## Projects (if present)
- Do not include code fences.
- Output valid JSON only.`;

const FRONTEND_SIGNALS = [
  /\bfront[- ]?end\b/i,
  /\bui engineer\b/i,
  /\bweb (engineer|developer)\b/i,
  /\breact\b/i,
  /\bnext(?:\.js)?\b/i,
  /\btypescript\b/i,
  /\bjavascript\b/i,
  /\bvue\b/i,
  /\bangular\b/i,
  /\bsvelte\b/i,
  /\bdesign system\b/i,
];

const NON_FRONTEND_SIGNALS = [
  /\bback[- ]?end\b/i,
  /\bdata engineer\b/i,
  /\bdata scientist\b/i,
  /\bmachine learning\b/i,
  /\bml engineer\b/i,
  /\bai engineer\b/i,
  /\bdevops\b/i,
  /\bsre\b/i,
  /\bsite reliability\b/i,
  /\bplatform engineer\b/i,
  /\bsecurity engineer\b/i,
  /\bios\b/i,
  /\bandroid\b/i,
  /\bmobile engineer\b/i,
  /\bfirmware\b/i,
  /\bembedded\b/i,
];

const GENERIC_ENGINEERING_TITLES = [
  /^software engineer\b/i,
  /^software developer\b/i,
  /^engineer\b/i,
];

function clampScore(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return null;
  const normalized = Math.max(0, Math.min(5, parsed));
  return Math.round(normalized * 10) / 10;
}

function safeJsonExtract(text: string) {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) {
    return text.slice(start, end + 1);
  }

  return text;
}

function parseDelimitedResponse(rawText: string) {
  const jsonMatch = rawText.match(/---JSON---\s*([\s\S]*?)\s*---REPORT---/i);
  const reportMatch = rawText.match(/---REPORT---\s*([\s\S]*)$/i);

  if (!jsonMatch?.[1]) {
    throw new Error('Model output is missing ---JSON--- block');
  }

  const parsed = JSON.parse(safeJsonExtract(jsonMatch[1])) as Record<string, unknown>;
  const report = reportMatch?.[1]?.trim() || '';

  return { parsed, report };
}

function parseLenientResponse(rawText: string) {
  try {
    return parseDelimitedResponse(rawText);
  } catch {
    const parsed = JSON.parse(safeJsonExtract(rawText)) as Record<string, unknown>;
    return { parsed, report: '' };
  }
}

function normalizeEvaluation(parsed: Record<string, unknown>): EvaluationJson {
  const scoreGlobal = clampScore(parsed.score_global);

  return {
    score_cv: clampScore(parsed.score_cv),
    score_north: clampScore(parsed.score_north),
    score_comp: clampScore(parsed.score_comp),
    score_culture: clampScore(parsed.score_culture),
    score_flags: clampScore(parsed.score_flags),
    score_global: scoreGlobal,
    grade: typeof parsed.grade === 'string' && parsed.grade.trim() ? parsed.grade.trim() : gradeFromScore(scoreGlobal),
    remote_policy:
      typeof parsed.remote_policy === 'string' && parsed.remote_policy.trim()
        ? parsed.remote_policy.trim()
        : 'Not specified',
    comp_range:
      typeof parsed.comp_range === 'string' && parsed.comp_range.trim() ? parsed.comp_range.trim() : 'Not specified',
    archetype: typeof parsed.archetype === 'string' && parsed.archetype.trim() ? parsed.archetype.trim() : 'Generalist',
    recommended: RECOMMENDATIONS.includes(parsed.recommended as Recommendation)
      ? (parsed.recommended as Recommendation)
      : recommendationFromScore(scoreGlobal),
    role_summary:
      typeof parsed.role_summary === 'string' && parsed.role_summary.trim()
        ? parsed.role_summary.trim()
        : 'Role summary unavailable.',
    tailored_angle:
      typeof parsed.tailored_angle === 'string' && parsed.tailored_angle.trim()
        ? parsed.tailored_angle.trim()
        : 'Highlight measurable outcomes and role-relevant projects.',
  };
}

function extractFallbackKeywords(job: JobRow, jdText: string) {
  const stopWords = new Set([
    'about',
    'across',
    'after',
    'again',
    'along',
    'also',
    'and',
    'build',
    'candidate',
    'company',
    'experience',
    'from',
    'have',
    'into',
    'job',
    'just',
    'more',
    'must',
    'need',
    'requirements',
    'role',
    'team',
    'that',
    'their',
    'them',
    'this',
    'through',
    'using',
    'with',
    'your',
  ]);

  const rawText = `${job.title} ${job.company} ${job.source ?? ''} ${jdText}`.toLowerCase();
  const tokens = rawText.match(/[a-z0-9.+#/-]{3,}/g) ?? [];
  const seen = new Set<string>();
  const keywords: string[] = [];

  for (const token of tokens) {
    if (stopWords.has(token) || seen.has(token) || /^\d+$/.test(token)) continue;
    seen.add(token);
    keywords.push(token);

    if (keywords.length === 18) {
      break;
    }
  }

  return keywords;
}

function inferPaperFormat(job: JobRow, jdText: string) {
  const text = `${job.company} ${job.title} ${jdText}`.toLowerCase();
  const northAmericaSignals = [
    'united states',
    'usa',
    'u.s.',
    'canada',
    'toronto',
    'vancouver',
    'montreal',
    'new york',
    'san francisco',
    'austin',
    'seattle',
    'boston',
    'chicago',
  ];

  return northAmericaSignals.some((signal) => text.includes(signal)) ? 'Letter' : 'A4';
}

function buildFallbackApplicationAnswers(job: JobRow, json: EvaluationJson) {
  if (json.recommended !== 'apply') {
    return [] as string[];
  }

  return [
    '## G) Draft Application Answers',
    '### Why are you interested in this role?',
    `This role lines up with the kind of frontend ownership I want to keep doubling down on: shipping complex user-facing product surfaces with clear business impact. ${json.role_summary}`,
    '',
    '### Why do you want to work at this company?',
    `The strongest pull is the overlap between ${job.company}'s role scope and the work I already enjoy doing well: turning complex product requirements into reliable, high-quality frontend delivery.`,
    '',
    '### Tell us about a relevant project or achievement.',
    'A strong example is the work where I owned complex frontend delivery end to end, improved user-facing performance, and translated ambiguous requirements into shipped product outcomes. I would tailor the exact project choice to the JD requirements and emphasize measurable impact.',
    '',
    '### What makes you a good fit for this position?',
    `I fit best where frontend quality, product thinking, and execution all matter at the same time. ${json.tailored_angle}`,
    '',
    '### How did you hear about this role?',
    'I found it through my structured career-ops scanning workflow and prioritized it after evaluating the role against my current target criteria.',
  ];
}

function buildFallbackPdfTailoringPlan(
  job: JobRow,
  jdText: string,
  json: EvaluationJson,
  keywords: string[]
) {
  const keywordSet = keywords.slice(0, 8).join(', ') || 'frontend, react, typescript';

  return [
    '## H) PDF Tailoring Plan',
    `- Recommended paper format: ${inferPaperFormat(job, jdText)}`,
    `- Professional Summary rewrite: ${json.tailored_angle}`,
    `- Core Competencies: ${keywordSet}`,
    `- Elevate these proof areas first: ${json.archetype ?? 'frontend ownership'}, measurable outcomes, product complexity, cross-functional delivery.`,
    '- Reorder bullets so the first bullet under each relevant role matches the JD’s strongest requirements.',
    '- Inject JD keywords naturally into existing experience only where they are already true.',
  ];
}

function buildFallbackReport(json: EvaluationJson, job: JobRow, jdText: string) {
  const keywords = extractFallbackKeywords(job, jdText);
  const applicationAnswers = buildFallbackApplicationAnswers(job, json);
  const pdfTailoringPlan = buildFallbackPdfTailoringPlan(job, jdText, json, keywords);

  return [
    '## A) Role Snapshot',
    `- Company: ${job.company}`,
    `- Role: ${job.title}`,
    `- Source: ${job.source ?? 'unknown'}`,
    `- Archetype: ${json.archetype ?? 'Generalist'}`,
    `- Remote policy: ${json.remote_policy ?? 'Not specified'}`,
    `- Compensation: ${json.comp_range ?? 'Not specified'}`,
    '',
    json.role_summary,
    '',
    '## B) Match with CV',
    `- CV alignment: ${json.score_cv ?? 'n/a'}/5`,
    '- Emphasize the most relevant shipped frontend outcomes and direct requirement matches in the CV.',
    '- Add tighter JD-to-proof mapping when a fuller model report is available.',
    '',
    '## C) Level and Strategy',
    `- North star fit: ${json.score_north ?? 'n/a'}/5`,
    '- Position seniority honestly and anchor the story on ownership, shipped outcomes, and product complexity.',
    '- If the role stretches into adjacent territory, frame it as adjacent experience instead of overstating direct match.',
    '',
    '## D) Comp and Demand',
    `- Compensation fit: ${json.score_comp ?? 'n/a'}/5`,
    `- Culture fit: ${json.score_culture ?? 'n/a'}/5`,
    `- Risk profile: ${json.score_flags ?? 'n/a'}/5`,
    '',
    '## E) Personalization Plan',
    json.tailored_angle,
    '',
    '## F) Interview Plan',
    '- Prepare two or three stories that show complex frontend ownership, measurable impact, and cross-functional execution.',
    '- Be ready to explain why this role fits the current direction and where the strongest proof already exists.',
    '',
    '## Final Recommendation',
    `- Global score: ${json.score_global ?? 'n/a'}/5 (${json.grade ?? 'n/a'})`,
    `- Recommendation: **${json.recommended.toUpperCase()}**`,
    '',
    ...applicationAnswers,
    ...(applicationAnswers.length > 0 ? [''] : []),
    ...pdfTailoringPlan,
    '',
    '## Keywords Extracted',
    keywords.length > 0 ? keywords.map((keyword) => `- ${keyword}`).join('\n') : '- No stable keywords extracted.',
  ].join('\n');
}

function countSignalMatches(text: string, patterns: RegExp[]) {
  return patterns.reduce((count, pattern) => count + (pattern.test(text) ? 1 : 0), 0);
}

function isGenericEngineeringTitle(title: string) {
  return GENERIC_ENGINEERING_TITLES.some((pattern) => pattern.test(title.trim()));
}

function buildRoleGateSkipResult(
  job: JobRow,
  jdText: string,
  reason: string,
  provider: Provider
): EvaluationResult {
  const scoreGlobal = 1.6;
  const json: EvaluationJson = {
    score_cv: 2.0,
    score_north: 1.0,
    score_comp: 2.5,
    score_culture: 2.0,
    score_flags: 1.0,
    score_global: scoreGlobal,
    grade: gradeFromScore(scoreGlobal),
    remote_policy: 'Unknown',
    comp_range: 'Unknown',
    archetype: 'Out-of-scope role',
    recommended: 'skip',
    role_summary: `Role filtered out before AI scoring: ${reason}`,
    tailored_angle:
      'Prioritize postings with explicit frontend scope (Frontend/UI/Web + React/TypeScript) before spending AI budget.',
  };

  const reportMarkdown = [
    '## A) Role Snapshot',
    `- Company: ${job.company}`,
    `- Role: ${job.title}`,
    `- Source: ${job.source ?? 'unknown'}`,
    `- Archetype: ${json.archetype}`,
    '',
    json.role_summary,
    '',
    '## B) Match with CV',
    '- CV alignment: 2.0/5',
    '- Frontend proof could not be established strongly enough from the role title/JD.',
    '',
    '## C) Level and Strategy',
    '- North star fit: 1.0/5',
    '- Save AI budget for roles with explicit frontend scope or clearer overlap.',
    '',
    '## D) Comp and Demand',
    '- Compensation fit: 2.5/5',
    '- Culture fit: 2.0/5',
    '- Risk profile: 1.0/5',
    '',
    '## E) Personalization Plan',
    json.tailored_angle,
    '',
    '## F) Interview Plan',
    '- No interview prep recommended until frontend relevance is confirmed.',
    '',
    '## Final Recommendation',
    `- Global score: ${scoreGlobal}/5 (${json.grade})`,
    `- ${reason}`,
    '- Evaluating low-signal roles can produce hallucinated fit and waste AI budget.',
    '',
    '## H) PDF Tailoring Plan',
    `- Recommended paper format: ${inferPaperFormat(job, jdText)}`,
    '- Do not generate a tailored PDF for this role unless the role becomes in-scope after manual review.',
    '',
    '## Keywords Extracted',
    '- frontend',
    '- react',
    '- typescript',
  ].join('\n');

  return {
    provider,
    model: 'heuristic-role-gate',
    jdText,
    json,
    reportMarkdown,
    raw: JSON.stringify({ type: 'role-gate', reason }),
  };
}

function buildUnavailableJobSkipResult(
  job: JobRow,
  jdText: string,
  reason: string,
  provider: Provider
): EvaluationResult {
  const scoreGlobal = 0.8;
  const json: EvaluationJson = {
    score_cv: 0.5,
    score_north: 0.5,
    score_comp: null,
    score_culture: null,
    score_flags: 0.5,
    score_global: scoreGlobal,
    grade: gradeFromScore(scoreGlobal),
    remote_policy: 'Unavailable',
    comp_range: 'Unavailable',
    archetype: 'Closed / unavailable role',
    recommended: 'skip',
    role_summary: `Job posting appears unavailable before AI evaluation: ${reason}`,
    tailored_angle:
      'Do not spend tailoring time on this posting. Move effort to currently active roles with accessible job descriptions.',
  };

  const reportMarkdown = [
    '## A) Role Snapshot',
    `- Company: ${job.company}`,
    `- Role: ${job.title}`,
    `- Source: ${job.source ?? 'unknown'}`,
    `- Archetype: ${json.archetype}`,
    '',
    json.role_summary,
    '',
    '## B) Match with CV',
    '- CV alignment: not evaluated because the posting is unavailable.',
    '',
    '## C) Level and Strategy',
    '- No strategy recommended because the role is no longer actionable.',
    '',
    '## D) Comp and Demand',
    '- Compensation fit: unavailable',
    '- Culture fit: unavailable',
    '- Risk profile: high because the link is dead or closed.',
    '',
    '## E) Personalization Plan',
    json.tailored_angle,
    '',
    '## F) Interview Plan',
    '- No interview prep recommended.',
    '',
    '## Final Recommendation',
    `- Global score: ${scoreGlobal}/5 (${json.grade})`,
    `- ${reason}`,
    '- Mark this job as discarded and move on.',
    '',
    '## H) PDF Tailoring Plan',
    `- Recommended paper format: ${inferPaperFormat(job, jdText)}`,
    '- Do not generate a tailored PDF for an unavailable posting.',
    '',
    '## Keywords Extracted',
    '- unavailable',
    '- closed',
    '- expired',
  ].join('\n');

  return {
    provider,
    model: 'heuristic-unavailable-gate',
    jdText,
    json,
    reportMarkdown,
    raw: JSON.stringify({ type: 'unavailable-gate', reason }),
  };
}

function maybeGateRoleMismatch(job: JobRow, jdText: string): { skip: true; reason: string } | { skip: false } {
  const jd = jdText.trim();
  const location = evaluateLocationEligibility(`${job.title}\n${job.company}\n${jd}`, job.url);
  if (!location.eligible) {
    return {
      skip: true,
      reason: `Location constraint not met. ${location.reason}`,
    };
  }

  const combined = `${job.title}\n${jd}`.toLowerCase();

  const frontendSignals = countSignalMatches(combined, FRONTEND_SIGNALS);
  const nonFrontendSignals = countSignalMatches(combined, NON_FRONTEND_SIGNALS);

  if (nonFrontendSignals > 0 && frontendSignals === 0) {
    return {
      skip: true,
      reason:
        'Detected non-frontend role signals with no frontend indicators in title/JD.',
    };
  }

  if (jd.length < 200 && frontendSignals === 0 && isGenericEngineeringTitle(job.title)) {
    return {
      skip: true,
      reason:
        'Insufficient JD content for a generic engineering title; frontend fit cannot be verified.',
    };
  }

  return { skip: false };
}

function parseAnthropicText(response: Anthropic.Messages.Message) {
  return response.content
    .map((part) => (part.type === 'text' ? part.text : ''))
    .join('\n')
    .trim();
}

async function runAnthropicCompletion(params: {
  apiKey: string;
  model: string;
  system: string;
  prompt: string;
}) {
  const anthropic = new Anthropic({ apiKey: params.apiKey });

  const response = await anthropic.messages.create({
    model: params.model,
    max_tokens: 3500,
    temperature: 0.1,
    system: params.system,
    messages: [
      {
        role: 'user',
        content: [{ type: 'text', text: params.prompt }],
      },
    ],
  });

  return parseAnthropicText(response);
}

async function runOpenAiCompletion(params: {
  apiKey: string;
  model: string;
  system: string;
  prompt: string;
}) {
  const client = new OpenAI({ apiKey: params.apiKey });

  const response = await client.responses.create({
    model: params.model,
    temperature: 0.1,
    input: [
      { role: 'system', content: params.system },
      { role: 'user', content: params.prompt },
    ],
  });

  return (response.output_text || '').trim();
}

async function getProviderOrder(preferred?: Provider) {
  const settings = await getCareerSettings();
  const resolved = resolveProviderAndKeys(settings);

  const basePreferred = preferred ?? resolved.provider;
  const primary = basePreferred;
  const secondary = primary === 'anthropic' ? 'openai' : 'anthropic';

  const entries: Array<{ provider: Provider; apiKey: string; model: string }> = [];

  const primaryKey = primary === 'anthropic' ? resolved.anthropic : resolved.openai;
  if (primaryKey) {
    entries.push({
      provider: primary,
      apiKey: primaryKey,
      model: DEFAULT_MODELS[primary],
    });
  }

  const secondaryKey = secondary === 'anthropic' ? resolved.anthropic : resolved.openai;
  if (secondaryKey) {
    entries.push({
      provider: secondary,
      apiKey: secondaryKey,
      model: DEFAULT_MODELS[secondary],
    });
  }

  return entries;
}

export async function getActiveProviderSummary(providerOverride?: Provider) {
  const settings = await getCareerSettings();
  const resolved = resolveProviderAndKeys(settings);

  let provider = providerOverride ?? resolved.provider;
  if (provider === 'anthropic' && !resolved.anthropic && resolved.openai) {
    provider = 'openai';
  } else if (provider === 'openai' && !resolved.openai && resolved.anthropic) {
    provider = 'anthropic';
  }

  return {
    provider,
    model: DEFAULT_MODELS[provider],
    hasApiKey:
      provider === 'anthropic' ? Boolean(resolved.anthropic) : Boolean(resolved.openai),
  };
}

export async function testProviderConnection(providerOverride?: Provider) {
  const candidates = await getProviderOrder(providerOverride);
  if (!candidates[0]) {
    return {
      ok: false,
      provider: providerOverride ?? 'anthropic',
      model: DEFAULT_MODELS[providerOverride ?? 'anthropic'],
      message: 'No provider key configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY.',
    };
  }

  const candidate = candidates[0];

  try {
    if (candidate.provider === 'anthropic') {
      await runAnthropicCompletion({
        apiKey: candidate.apiKey,
        model: candidate.model,
        system: 'Return exactly: ok',
        prompt: 'Reply with ok',
      });
    } else {
      await runOpenAiCompletion({
        apiKey: candidate.apiKey,
        model: candidate.model,
        system: 'Return exactly: ok',
        prompt: 'Reply with ok',
      });
    }

    return {
      ok: true,
      provider: candidate.provider,
      model: candidate.model,
      message: 'Connection successful.',
    };
  } catch (error) {
    return {
      ok: false,
      provider: candidate.provider,
      model: candidate.model,
      message: error instanceof Error ? error.message : 'Unknown provider connection error',
    };
  }
}

export async function evaluateJob(job: JobRow, options: EvaluateJobOptions = {}): Promise<EvaluationResult> {
  const profile = options.profile ?? (await getProfile());
  await options.onEvent?.({ type: 'profile:loaded' });

  let jdText = job.jd_text?.trim() || '';
  let unavailableReason: string | null = null;

  try {
    const fetched = await fetchJobDescription(job.url);
    if (fetched.jdText.trim()) {
      jdText = fetched.jdText;
    }
    if (fetched.availability === 'expired') {
      unavailableReason = fetched.unavailableReason ?? 'Job posting is closed or missing.';
    }
  } catch {
    // Keep cached jdText when live fetch is blocked or temporarily fails.
  }

  await options.onEvent?.({ type: 'jd:loaded', chars: jdText.length });

  if (unavailableReason) {
    await options.onEvent?.({
      type: 'role:gate',
      decision: 'skip',
      reason: unavailableReason,
    });

    return buildUnavailableJobSkipResult(
      job,
      jdText,
      unavailableReason,
      options.providerOverride ?? 'anthropic'
    );
  }

  const [systemPrompt, providers] = await Promise.all([
    buildEvaluationSystemPrompt(),
    getProviderOrder(options.providerOverride),
  ]);

  if (providers.length === 0) {
    throw new Error('No AI provider key configured for evaluation.');
  }

  const roleGate = maybeGateRoleMismatch(job, jdText);
  if (roleGate.skip) {
    await options.onEvent?.({
      type: 'role:gate',
      decision: 'skip',
      reason: roleGate.reason,
    });
    return buildRoleGateSkipResult(job, jdText, roleGate.reason, providers[0].provider);
  }

  const prompt = buildEvaluationUserPrompt(job, profile, jdText);

  await options.onEvent?.({
    type: 'provider:selected',
    provider: providers[0].provider,
    model: providers[0].model,
  });

  const errors: string[] = [];

  for (const candidate of providers) {
    await options.onEvent?.({
      type: 'provider:trying',
      provider: candidate.provider,
      model: candidate.model,
    });

    try {
      const raw =
        candidate.provider === 'anthropic'
          ? await runAnthropicCompletion({
              apiKey: candidate.apiKey,
              model: candidate.model,
              system: systemPrompt,
              prompt,
            })
          : await runOpenAiCompletion({
              apiKey: candidate.apiKey,
              model: candidate.model,
              system: systemPrompt,
              prompt,
            });

      const { parsed, report } = parseLenientResponse(raw);
      const normalized = normalizeEvaluation(parsed);
      const reportMarkdown = report || buildFallbackReport(normalized, job, jdText);

      await options.onEvent?.({
        type: 'provider:done',
        provider: candidate.provider,
        model: candidate.model,
      });

      return {
        provider: candidate.provider,
        model: candidate.model,
        jdText,
        json: normalized,
        reportMarkdown,
        raw,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown evaluation error';
      errors.push(`${candidate.provider}: ${message}`);
      await options.onEvent?.({
        type: 'provider:failed',
        provider: candidate.provider,
        error: message,
      });
    }
  }

  throw new Error(`Evaluation failed for all providers. ${errors.join(' | ')}`);
}

export async function evaluateAndPersistJob(job: JobRow, options: EvaluateJobOptions = {}) {
  const result = await evaluateJob(job, options);

  const report = await createReport(job.id, {
    content: result.reportMarkdown,
    role_summary: result.json.role_summary,
    score_cv: result.json.score_cv,
    score_north: result.json.score_north,
    score_comp: result.json.score_comp,
    score_culture: result.json.score_culture,
    score_flags: result.json.score_flags,
    score_global: result.json.score_global,
    remote_policy: result.json.remote_policy,
    comp_range: result.json.comp_range,
    archetype: result.json.archetype,
    recommended: result.json.recommended,
  });

  await options.onEvent?.({ type: 'report:persisted', reportNum: report.num });

  const status = result.json.recommended === 'skip' ? 'discarded' : 'evaluated';

  const updatedJob = await updateJobEvaluation(job.id, {
    score_global: result.json.score_global,
    grade: result.json.grade,
    status,
    jd_text: result.jdText || null,
  });

  await options.onEvent?.({
    type: 'job:updated',
    score: updatedJob?.score ?? result.json.score_global,
    grade: updatedJob?.grade ?? result.json.grade,
  });

  return {
    result,
    report,
    job: updatedJob,
  };
}

function normalizeSearchResults(payload: unknown) {
  if (!payload || typeof payload !== 'object') return [];
  const rawList = (payload as { results?: unknown }).results;
  if (!Array.isArray(rawList)) return [];

  const seen = new Set<string>();
  const results: SearchJobResult[] = [];

  for (const entry of rawList) {
    if (!entry || typeof entry !== 'object') continue;
    const item = entry as Record<string, unknown>;
    const url = typeof item.url === 'string' ? sanitizeJobUrl(item.url) : '';
    if (!url || seen.has(url)) continue;
    if (isLikelyGenericListingUrl(url)) continue;

    seen.add(url);
    results.push({
      title:
        typeof item.title === 'string' && item.title.trim()
          ? sanitizeJobTitle(item.title)
          : 'Untitled role',
      url,
      snippet: typeof item.snippet === 'string' ? item.snippet.trim() : undefined,
    });
  }

  return results;
}

function normalizeResumeImportPayload(
  payload: Record<string, unknown>,
  resumeText: string
): { profile: ResumeImportProfile; cv_md: string } {
  const profileRaw =
    payload.profile && typeof payload.profile === 'object'
      ? (payload.profile as Record<string, unknown>)
      : {};

  const profile: ResumeImportProfile = {
    name: typeof profileRaw.name === 'string' ? profileRaw.name.trim() : '',
    email: typeof profileRaw.email === 'string' ? profileRaw.email.trim() : '',
    location: typeof profileRaw.location === 'string' ? profileRaw.location.trim() : '',
    target_role:
      typeof profileRaw.target_role === 'string' ? profileRaw.target_role.trim() : '',
    summary: typeof profileRaw.summary === 'string' ? profileRaw.summary.trim() : '',
    skills: typeof profileRaw.skills === 'string' ? profileRaw.skills.trim() : '',
  };

  const cv_md =
    typeof payload.cv_md === 'string' && payload.cv_md.trim()
      ? payload.cv_md.trim()
      : [
          '# Imported Resume',
          '',
          '## Raw Content',
          '',
          resumeText.slice(0, 12000),
        ].join('\n');

  return { profile, cv_md };
}

async function searchWithOpenAi(
  apiKey: string,
  query: string,
  maxResults: number,
  model: string,
  systemPrompt: string
) {
  const client = new OpenAI({ apiKey });

  const response = await client.responses.create({
    model,
    tools: [{ type: 'web_search_preview' }],
    input: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `Find up to ${maxResults} current job posting URLs for this query: ${query}`,
      },
    ],
  });

  const parsed = JSON.parse(safeJsonExtract(response.output_text || '{}'));
  return normalizeSearchResults(parsed).slice(0, maxResults);
}

async function searchWithAnthropic(
  apiKey: string,
  query: string,
  maxResults: number,
  model: string,
  systemPrompt: string
) {
  const anthropic = new Anthropic({ apiKey });

  const response = await anthropic.messages.create({
    model,
    max_tokens: 1500,
    temperature: 0,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Find up to ${maxResults} current job posting URLs for this query: ${query}`,
          },
        ],
      },
    ],
    tools: [
      {
        type: 'web_search_20250305',
        name: 'web_search',
      },
    ],
  } as never);

  const text = parseAnthropicText(response);
  const parsed = JSON.parse(safeJsonExtract(text || '{}'));
  return normalizeSearchResults(parsed).slice(0, maxResults);
}

export async function providerWebSearchJobs(
  query: string,
  maxResults = 20,
  providerOverride?: Provider
) {
  const [providers, systemPrompt] = await Promise.all([
    getProviderOrder(providerOverride),
    buildSearchSystemPrompt(),
  ]);
  if (providers.length === 0) {
    throw new Error('No AI provider key configured for web search.');
  }

  const errors: string[] = [];

  for (const candidate of providers) {
    try {
      if (candidate.provider === 'openai') {
        const results = await searchWithOpenAi(
          candidate.apiKey,
          query,
          maxResults,
          candidate.model,
          systemPrompt
        );
        return { provider: candidate.provider, model: candidate.model, results };
      }

      const results = await searchWithAnthropic(
        candidate.apiKey,
        query,
        maxResults,
        candidate.model,
        systemPrompt
      );
      return { provider: candidate.provider, model: candidate.model, results };
    } catch (error) {
      errors.push(
        `${candidate.provider}: ${error instanceof Error ? error.message : 'Unknown search error'}`
      );
    }
  }

  throw new Error(`Provider web search failed. ${errors.join(' | ')}`);
}

export async function extractProfileAndCvFromResume(
  resumeText: string,
  providerOverride?: Provider
): Promise<ResumeImportResult> {
  const input = resumeText.slice(0, 40000);
  const providers = await getProviderOrder(providerOverride);

  if (providers.length === 0) {
    throw new Error('No AI provider key configured for resume import.');
  }

  const errors: string[] = [];

  for (const candidate of providers) {
    try {
      const raw =
        candidate.provider === 'anthropic'
          ? await runAnthropicCompletion({
              apiKey: candidate.apiKey,
              model: candidate.model,
              system: RESUME_IMPORT_PROMPT,
              prompt: `Parse this resume text into structured profile + markdown CV:\n\n${input}`,
            })
          : await runOpenAiCompletion({
              apiKey: candidate.apiKey,
              model: candidate.model,
              system: RESUME_IMPORT_PROMPT,
              prompt: `Parse this resume text into structured profile + markdown CV:\n\n${input}`,
            });

      const parsed = JSON.parse(safeJsonExtract(raw)) as Record<string, unknown>;
      const normalized = normalizeResumeImportPayload(parsed, input);

      return {
        provider: candidate.provider,
        model: candidate.model,
        profile: normalized.profile,
        cv_md: normalized.cv_md,
        raw,
      };
    } catch (error) {
      errors.push(
        `${candidate.provider}: ${error instanceof Error ? error.message : 'Unknown resume import error'}`
      );
    }
  }

  throw new Error(`Resume import failed. ${errors.join(' | ')}`);
}
