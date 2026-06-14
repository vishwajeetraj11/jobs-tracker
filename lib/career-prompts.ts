import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { JobRow, ProfileRow } from './career-ops-data';

interface LegacyEvaluationPrompts {
  shared: string;
  oferta: string;
  profile: string;
}

interface LegacyPromptContext {
  evaluation: LegacyEvaluationPrompts;
  scan: string;
  autoPipeline: string;
  apply: string;
  pdf: string;
  batch: string;
}

const PROMPTS_ROOT = path.join(process.cwd(), 'prompts', 'career');

let promptContextCache: Promise<LegacyPromptContext> | null = null;

function normalizePromptText(value: string) {
  return value.replace(/\r\n/g, '\n').replace(/<!--[\s\S]*?-->/g, '').trim();
}

function between(content: string, start: string, end?: string) {
  const startIndex = content.indexOf(start);
  if (startIndex === -1) return '';

  const sliced = content.slice(startIndex);
  if (!end) return sliced.trim();

  const endIndex = sliced.indexOf(end);
  if (endIndex === -1) return sliced.trim();

  return sliced.slice(0, endIndex).trim();
}

async function readPrompt(relativePath: string) {
  const filePath = path.join(PROMPTS_ROOT, relativePath);
  return normalizePromptText(await readFile(filePath, 'utf8'));
}

async function loadLegacyPromptContext(): Promise<LegacyPromptContext> {
  const [sharedRaw, ofertaRaw, profileRaw, scanRaw, autoPipelineRaw, applyRaw, pdfRaw, batchRaw] = await Promise.all([
    readPrompt(path.join('evaluation', '_shared.md')),
    readPrompt(path.join('evaluation', 'oferta.md')),
    readPrompt(path.join('evaluation', '_profile.md')),
    readPrompt(path.join('flows', 'scan.md')),
    readPrompt(path.join('flows', 'auto-pipeline.md')),
    readPrompt(path.join('flows', 'apply.md')),
    readPrompt(path.join('flows', 'pdf.md')),
    readPrompt(path.join('flows', 'batch-prompt.md')),
  ]);

  const shared = [
    between(sharedRaw, '## Scoring System', '### Tools'),
    between(sharedRaw, '## Professional Writing & ATS Compatibility'),
  ]
    .filter(Boolean)
    .join('\n\n')
    .trim();

  const oferta = [
    between(ofertaRaw, '# Modo: oferta — Evaluación Completa A-F', '## Post-evaluación'),
    between(ofertaRaw, '**Formato del report:**', '### 2. Registrar en tracker'),
  ]
    .filter(Boolean)
    .join('\n\n')
    .trim();

  const scan = [
    between(scanRaw, '### Nivel 3 — WebSearch queries (DESCUBRIMIENTO AMPLIO)', '6. **Filtrar por título**'),
    between(scanRaw, '## Extracción de título y empresa de WebSearch results', '## URLs privadas'),
  ]
    .filter(Boolean)
    .join('\n\n')
    .trim();

  const autoPipeline = [
    between(autoPipelineRaw, '## Paso 4 — Draft Application Answers', '## Paso 5'),
  ]
    .filter(Boolean)
    .join('\n\n')
    .trim();

  const apply = [
    between(applyRaw, '## Paso 5 — Generar respuestas', '## Paso 6'),
  ]
    .filter(Boolean)
    .join('\n\n')
    .trim();

  const pdf = [
    between(pdfRaw, '## Reglas ATS', '## Diseño del PDF'),
    between(pdfRaw, '## Diseño del PDF', '## Orden de secciones'),
    between(pdfRaw, '## Orden de secciones', '## Estrategia de keyword injection'),
    between(pdfRaw, '## Estrategia de keyword injection', '## Template HTML'),
  ]
    .filter(Boolean)
    .join('\n\n')
    .trim();

  const batch = [
    between(batchRaw, '### Paso 3 — Guardar Report .md', '### Paso 4 — Generar PDF'),
    between(batchRaw, '### Paso 4 — Generar PDF', '**Template placeholders'),
  ]
    .filter(Boolean)
    .join('\n\n')
    .trim();

  return {
    evaluation: {
      shared,
      oferta,
      profile: profileRaw,
    },
    scan,
    autoPipeline,
    apply,
    pdf,
    batch,
  };
}

async function getLegacyEvaluationPrompts() {
  if (!promptContextCache) {
    promptContextCache = loadLegacyPromptContext();
  }

  const context = await promptContextCache;
  return context.evaluation;
}

async function getLegacyScanPrompt() {
  if (!promptContextCache) {
    promptContextCache = loadLegacyPromptContext();
  }

  const context = await promptContextCache;
  return context.scan;
}

async function getLegacyDownstreamPrompts() {
  if (!promptContextCache) {
    promptContextCache = loadLegacyPromptContext();
  }

  const context = await promptContextCache;
  return {
    autoPipeline: context.autoPipeline,
    apply: context.apply,
    pdf: context.pdf,
    batch: context.batch,
  };
}

function truncate(value: string, limit: number) {
  if (value.length <= limit) return value;
  return `${value.slice(0, limit)}...`;
}

function renderProfileOverrideMarkdown(profile: ProfileRow) {
  const data = profile.data ?? {};
  const knownKeys = Object.entries(data)
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .slice(0, 20)
    .map(([key, value]) => {
      if (Array.isArray(value)) {
        return `- ${key}: ${value.join(', ')}`;
      }
      if (typeof value === 'object') {
        return `- ${key}: ${truncate(JSON.stringify(value), 280)}`;
      }
      return `- ${key}: ${String(value)}`;
    });

  if (knownKeys.length === 0) {
    return 'No structured profile fields saved in the web app yet.';
  }

  return knownKeys.join('\n');
}

export async function buildEvaluationSystemPrompt() {
  const [legacy, downstream] = await Promise.all([
    getLegacyEvaluationPrompts(),
    getLegacyDownstreamPrompts(),
  ]);

  return [
    'You are the career-ops web evaluator.',
    '',
    'Use the imported legacy career-ops specifications below as the evaluation canon.',
    'They preserve the deeper logic from the original repo, but you are running inside the web app.',
    '',
    'Web-app adaptation rules:',
    '- Return only the required delimiter format.',
    '- Do not mention tracker files, reports directories, PDFs, batch runners, shell commands, or filesystem operations.',
    '- Treat those legacy instructions as evaluation guidance, not execution steps.',
    '- When current runtime candidate data conflicts with imported legacy profile context, prefer the current runtime data.',
    '- If compensation, remote policy, or company details are unavailable from the provided job text, say so rather than inventing them.',
    '- Location rule: only treat a role as eligible when it is India-based, remote from India, or explicitly remote worldwide/anywhere; otherwise recommend "skip".',
    '- Cite exact CV lines or phrases wherever possible inside the report.',
    '',
    'You must always output in this exact delimiter format:',
    '---JSON---',
    '{valid JSON object}',
    '---REPORT---',
    '<markdown report>',
    '',
    'JSON schema (all keys required):',
    '{',
    '  "score_cv": number,',
    '  "score_north": number,',
    '  "score_comp": number,',
    '  "score_culture": number,',
    '  "score_flags": number,',
    '  "score_global": number,',
    '  "grade": string,',
    '  "remote_policy": string,',
    '  "comp_range": string,',
    '  "archetype": string,',
    '  "recommended": "apply" | "skip" | "watch",',
    '  "role_summary": string,',
    '  "tailored_angle": string',
    '}',
    '',
    'Scoring interpretation to preserve from legacy career-ops:',
    '- 4.5+ => strongest apply-immediately tier',
    '- 4.0-4.4 => good apply tier',
    '- 3.5-3.9 => watch / conditional tier',
    '- below 3.5 => skip tier',
    '',
    'REPORT requirements:',
    '- Preserve the spirit of the original A-F evaluation blocks.',
    '- Use markdown headings in this order:',
    '  ## A) Role Snapshot',
    '  ## B) Match with CV',
    '  ## C) Level and Strategy',
    '  ## D) Comp and Demand',
    '  ## E) Personalization Plan',
    '  ## F) Interview Plan',
    '  ## Final Recommendation',
    '  ## G) Draft Application Answers (include when the role is worth applying to; otherwise omit it)',
    '  ## H) PDF Tailoring Plan',
    '  ## Keywords Extracted',
    '- Keep the report direct, high-signal, and specific.',
    '- In section G, include concise answers for these questions when applicable:',
    '  1. Why are you interested in this role?',
    '  2. Why do you want to work at this company?',
    '  3. Tell us about a relevant project or achievement.',
    '  4. What makes you a good fit for this position?',
    '  5. How did you hear about this role?',
    '- In section H, provide:',
    '  - a rewritten professional summary (3-4 lines)',
    '  - a core competencies list (6-8 keyword phrases)',
    '  - top projects or experience bullets to elevate',
    '  - keyword injection opportunities based only on true experience',
    '  - recommended paper format (A4 or Letter) and recruiter-facing emphasis',
    '',
    '=== Imported career-ops shared rules ===',
    legacy.shared,
    '',
    '=== Imported career-ops offer evaluation mode ===',
    legacy.oferta,
    '',
    '=== Imported career-ops user profile context ===',
    legacy.profile,
    '',
    '=== Imported career-ops auto-pipeline guidance ===',
    downstream.autoPipeline,
    '',
    '=== Imported career-ops apply guidance ===',
    downstream.apply,
    '',
    '=== Imported career-ops PDF guidance ===',
    downstream.pdf,
    '',
    '=== Imported career-ops batch worker guidance ===',
    downstream.batch,
  ].join('\n');
}

export function buildEvaluationUserPrompt(job: JobRow, profile: ProfileRow, jdText: string) {
  const profileJson = JSON.stringify(profile.data ?? {}, null, 2).slice(0, 12000);
  const profileMarkdown = renderProfileOverrideMarkdown(profile);
  const cvMarkdown = (profile.cv_md || '').slice(0, 16000);
  const jd = jdText.slice(0, 32000);

  return `Evaluate this job for the current candidate.

Current runtime overrides:
- The structured profile data below is the latest web-app source of truth.
- Use it to override any conflicting imported legacy profile statements.

Current Structured Profile (JSON):
${profileJson || '{}'}

Current Structured Profile (readable summary):
${profileMarkdown}

Current CV (markdown):
${cvMarkdown || 'Not provided'}

Job Metadata:
- Title: ${job.title}
- Company: ${job.company}
- URL: ${job.url}
- Source: ${job.source ?? 'unknown'}

Job Description:
${jd || 'Unavailable'}

Downstream output expectations:
- Produce the full A-F evaluation.
- Add section G with draft application answers when the role is worth applying to.
- Add section H with PDF tailoring guidance that can be reused for ATS-optimized CV generation.
`;
}

export async function buildSearchSystemPrompt() {
  const legacyScan = await getLegacyScanPrompt();

  return [
    'You are the career-ops web search extractor for the scanner.',
    '',
    'Use the imported legacy scan guidance below as the discovery canon, but adapt it to the web app.',
    '',
    'Web-app adaptation rules:',
    '- You are only resolving search results for one query at a time.',
    '- Return only the required JSON payload.',
    '- Do not mention trackers, pipeline files, Playwright, WebFetch, or filesystem operations.',
    '- Prefer individual job posting URLs over category pages or company homepages.',
    '- Infer title and company conservatively from search result titles/snippets.',
    '- Skip stale-looking, generic, login-gated, or obviously non-job links.',
    '- Prefer jobs in India or roles explicitly open to remote worldwide/anywhere (including India).',
    '- Avoid links that clearly restrict hiring to non-India regions only.',
    '',
    'Return only JSON with this exact shape:',
    '{',
    '  "results": [',
    '    { "title": "string", "url": "https://...", "snippet": "string" }',
    '  ]',
    '}',
    '',
    'Rules:',
    '- Only include individual job posting URLs.',
    '- Skip category pages, login pages, and homepages.',
    '- Max results should follow user instruction.',
    '- Output valid JSON only.',
    '',
    '=== Imported career-ops scan guidance ===',
    legacyScan,
  ].join('\n');
}
