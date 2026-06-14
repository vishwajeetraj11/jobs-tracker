import { pool } from './db';
import {
  ACTIVE_JOB_STATUSES,
  CLOSED_JOB_STATUSES,
  JOB_STATUSES,
  PORTAL_TYPES,
  PROVIDERS,
  RECOMMENDATIONS,
  isPortalType,
  normalizeJobStatusInput,
  type JobStatus,
  type PortalType,
  type Provider,
  type Recommendation,
} from './career-config';
import { loadSeedPortalsFromYaml } from './portal-seed';
import {
  isLikelyGenericListingUrl,
  sanitizeCompanyName,
  sanitizeJobTitle,
  sanitizeJobUrl,
} from './job-text';

export interface JobRow {
  id: number;
  url: string;
  company: string;
  title: string;
  source: string | null;
  status: JobStatus;
  score: number | null;
  grade: string | null;
  pdf_generated: boolean;
  added_at: string;
  evaluated_at: string | null;
  notes: string | null;
  jd_text: string | null;
}

export interface ReportRow {
  id: number;
  job_id: number;
  num: number;
  content: string;
  role_summary: string | null;
  score_cv: number | null;
  score_north: number | null;
  score_comp: number | null;
  score_culture: number | null;
  score_flags: number | null;
  score_global: number | null;
  remote_policy: string | null;
  comp_range: string | null;
  archetype: string | null;
  recommended: Recommendation | null;
  created_at: string;
  job_title: string | null;
  job_company: string | null;
  job_status: JobStatus | null;
}

export interface ScanHistoryRow {
  id: number;
  url: string;
  first_seen: string;
  portal: string | null;
  title: string | null;
  company: string | null;
  scan_status: string | null;
}

export interface ProfileRow {
  id: number;
  data: Record<string, unknown>;
  cv_md: string;
  updated_at: string;
}

export interface PortalRow {
  id: number;
  name: string;
  type: PortalType;
  config: Record<string, unknown>;
  enabled: boolean;
  updated_at: string;
}

export interface CareerSettingsRow {
  id: number;
  provider: Provider;
  anthropic_api_key: string | null;
  openai_api_key: string | null;
  scan_schedule: string | null;
  updated_at: string;
}

interface MetricsActivity {
  ts: string;
  type: 'report' | 'scan' | 'job';
  label: string;
}

interface MetricsTotals {
  total_jobs: number;
  pending: number;
  evaluated: number;
  applied: number;
  responded: number;
  interview: number;
  offer: number;
  rejected: number;
  discarded: number;
  skip: number;
  active: number;
  closed: number;
  avg_score: number | null;
}

export interface CareerMetrics {
  totals: MetricsTotals;
  top_jobs: JobRow[];
  activity: MetricsActivity[];
  latest_scan: ScanHistoryRow | null;
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function toOneDecimal(value: unknown): number | null {
  const parsed = toNumber(value);
  if (parsed === null) return null;
  return Math.round(Math.max(0, Math.min(5, parsed)) * 10) / 10;
}

function toObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export function coerceJobStatus(value: string | null | undefined): JobStatus {
  return normalizeJobStatusInput(value) ?? 'pending';
}

export function coerceRecommendation(value: string | null | undefined): Recommendation | null {
  if (!value) return null;
  return RECOMMENDATIONS.includes(value as Recommendation) ? (value as Recommendation) : null;
}

export function coerceProvider(value: string | null | undefined): Provider {
  if (value && PROVIDERS.includes(value as Provider)) {
    return value as Provider;
  }
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (process.env.OPENAI_API_KEY) return 'openai';
  return 'anthropic';
}

function normalizeJobRow(row: Record<string, unknown>): JobRow {
  const company = sanitizeCompanyName(String(row.company ?? 'Unknown'));
  return {
    id: Number(row.id),
    url: sanitizeJobUrl(String(row.url ?? '')),
    company,
    title: sanitizeJobTitle(String(row.title ?? 'Untitled role'), company),
    source: row.source ? String(row.source) : null,
    status: coerceJobStatus(row.status ? String(row.status) : null),
    score: toOneDecimal(row.score),
    grade: row.grade ? String(row.grade) : null,
    pdf_generated: Boolean(row.pdf_generated),
    added_at: String(row.added_at ?? row.created_at ?? new Date().toISOString()),
    evaluated_at: row.evaluated_at ? String(row.evaluated_at) : null,
    notes: row.notes ? String(row.notes) : null,
    jd_text: row.jd_text ? String(row.jd_text) : null,
  };
}

function normalizeReportRow(row: Record<string, unknown>): ReportRow {
  return {
    id: Number(row.id),
    job_id: Number(row.job_id),
    num: Number(row.num),
    content: String(row.content ?? ''),
    role_summary: row.role_summary ? String(row.role_summary) : null,
    score_cv: toOneDecimal(row.score_cv),
    score_north: toOneDecimal(row.score_north),
    score_comp: toOneDecimal(row.score_comp),
    score_culture: toOneDecimal(row.score_culture),
    score_flags: toOneDecimal(row.score_flags),
    score_global: toOneDecimal(row.score_global),
    remote_policy: row.remote_policy ? String(row.remote_policy) : null,
    comp_range: row.comp_range ? String(row.comp_range) : null,
    archetype: row.archetype ? String(row.archetype) : null,
    recommended: coerceRecommendation(row.recommended ? String(row.recommended) : null),
    created_at: String(row.created_at ?? new Date().toISOString()),
    job_title: row.job_title ? String(row.job_title) : null,
    job_company: row.job_company ? String(row.job_company) : null,
    job_status: row.job_status ? coerceJobStatus(String(row.job_status)) : null,
  };
}

function normalizePortalRow(row: Record<string, unknown>): PortalRow {
  const type = String(row.type ?? 'search_query');
  return {
    id: Number(row.id),
    name: String(row.name ?? ''),
    type: isPortalType(type) ? type : 'search_query',
    config: toObject(row.config),
    enabled: Boolean(row.enabled),
    updated_at: String(row.updated_at ?? new Date().toISOString()),
  };
}

function normalizeScanHistoryRow(row: Record<string, unknown>): ScanHistoryRow {
  return {
    id: Number(row.id),
    url: String(row.url ?? ''),
    first_seen: String(row.first_seen ?? new Date().toISOString().slice(0, 10)),
    portal: row.portal ? String(row.portal) : null,
    title: row.title ? String(row.title) : null,
    company: row.company ? String(row.company) : null,
    scan_status: row.scan_status ? String(row.scan_status) : null,
  };
}

function normalizeSettingsRow(row: Record<string, unknown>): CareerSettingsRow {
  return {
    id: Number(row.id),
    provider: coerceProvider(row.provider ? String(row.provider) : null),
    anthropic_api_key: row.anthropic_api_key ? String(row.anthropic_api_key) : null,
    openai_api_key: row.openai_api_key ? String(row.openai_api_key) : null,
    scan_schedule: row.scan_schedule ? String(row.scan_schedule) : null,
    updated_at: String(row.updated_at ?? new Date().toISOString()),
  };
}

export function maskSecret(value: string | null | undefined) {
  if (!value) return null;
  if (value.length <= 8) return '*'.repeat(Math.max(value.length, 4));
  return `${value.slice(0, 4)}${'*'.repeat(Math.max(4, value.length - 8))}${value.slice(-4)}`;
}

async function ensureProfileSeedRow() {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS profile (
      id INTEGER PRIMARY KEY DEFAULT 1,
      data JSONB NOT NULL,
      cv_md TEXT,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`
  );

  await pool.query(
    `INSERT INTO profile (id, data, cv_md, updated_at)
     VALUES (1, '{}'::jsonb, '', NOW())
     ON CONFLICT (id) DO NOTHING`
  );
}

async function ensureSettingsSeedRow() {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS career_settings (
      id INTEGER PRIMARY KEY DEFAULT 1,
      provider TEXT DEFAULT 'anthropic',
      anthropic_api_key TEXT,
      openai_api_key TEXT,
      scan_schedule TEXT,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`
  );

  await pool.query(
    `INSERT INTO career_settings (id, provider, updated_at)
     VALUES (1, 'anthropic', NOW())
     ON CONFLICT (id) DO NOTHING`
  );
}

async function ensurePortalsSeedRows() {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS portals (
      id SERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      type TEXT NOT NULL,
      config JSONB NOT NULL,
      enabled BOOLEAN DEFAULT true,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`
  );

  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM portals`
  );

  const count = Number(rows[0]?.count ?? '0');
  if (count > 0) return;

  try {
    const defaults = await loadSeedPortalsFromYaml();
    if (defaults.length === 0) return;

    for (const item of defaults) {
      await pool.query(
        `INSERT INTO portals (name, type, config, enabled, updated_at)
         VALUES ($1, $2, $3::jsonb, $4, NOW())
         ON CONFLICT (name) DO NOTHING`,
        [item.name, item.type, JSON.stringify(item.config ?? {}), item.enabled ?? true]
      );
    }
  } catch (error) {
    console.error('[career-ops] Failed to auto-seed portals from YAML', error);
  }
}

// jobs

export interface JobsQuery {
  q?: string;
  status?: string;
  source?: string;
  min_score?: number;
  max_score?: number;
  sort?: 'added_at' | 'evaluated_at' | 'score' | 'title' | 'company' | 'status';
  order?: 'asc' | 'desc';
  limit?: number;
}

export async function listJobs(query: JobsQuery = {}) {
  const clauses: string[] = [];
  const params: Array<string | number> = [];

  if (query.q) {
    params.push(`%${query.q}%`);
    clauses.push(
      `(j.title ILIKE $${params.length} OR j.company ILIKE $${params.length} OR j.url ILIKE $${params.length})`
    );
  }

  if (query.status) {
    const normalizedStatus = normalizeJobStatusInput(query.status);
    if (!normalizedStatus) {
      return [];
    }
    params.push(normalizedStatus);
    clauses.push(`j.status = $${params.length}`);
  }

  if (query.source) {
    params.push(query.source);
    clauses.push(`j.source = $${params.length}`);
  }

  if (query.min_score !== undefined && Number.isFinite(query.min_score)) {
    params.push(Number(query.min_score));
    clauses.push(`j.score >= $${params.length}`);
  }

  if (query.max_score !== undefined && Number.isFinite(query.max_score)) {
    params.push(Number(query.max_score));
    clauses.push(`j.score <= $${params.length}`);
  }

  const sortMap: Record<NonNullable<JobsQuery['sort']>, string> = {
    added_at: 'j.added_at',
    evaluated_at: 'j.evaluated_at',
    score: 'j.score',
    title: 'j.title',
    company: 'j.company',
    status: 'j.status',
  };

  const sort = query.sort && sortMap[query.sort] ? sortMap[query.sort] : 'j.added_at';
  const order = query.order === 'asc' ? 'ASC' : 'DESC';

  const limit = Math.min(Math.max(query.limit ?? 200, 1), 1000);
  params.push(limit);

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  const { rows } = await pool.query<Record<string, unknown>>(
    `SELECT j.*
     FROM jobs j
     ${where}
     ORDER BY ${sort} ${order} NULLS LAST, j.id DESC
     LIMIT $${params.length}`,
    params
  );

  return rows.map(normalizeJobRow);
}

export interface CreateJobInput {
  url: string;
  company: string;
  title: string;
  source?: string | null;
  status?: string;
  score?: number | null;
  grade?: string | null;
  notes?: string | null;
  jd_text?: string | null;
}

export async function createJob(input: CreateJobInput) {
  const normalizedCompany = sanitizeCompanyName(input.company || 'Unknown');
  const normalizedTitle = sanitizeJobTitle(input.title || 'Untitled role', normalizedCompany);
  const normalizedUrl = sanitizeJobUrl(input.url || '');

  if (!normalizedUrl) {
    throw new Error('Job URL is required.');
  }

  const inserted = await pool.query<Record<string, unknown>>(
    `INSERT INTO jobs (
      url,
      company,
      title,
      source,
      status,
      score,
      grade,
      notes,
      jd_text,
      added_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
    ON CONFLICT (url) DO NOTHING
    RETURNING *`,
    [
      normalizedUrl,
      normalizedCompany,
      normalizedTitle,
      input.source ?? null,
      coerceJobStatus(input.status),
      toOneDecimal(input.score),
      input.grade ?? null,
      input.notes ?? null,
      input.jd_text ?? null,
    ]
  );

  if (inserted.rows[0]) {
    return {
      item: normalizeJobRow(inserted.rows[0]),
      inserted: true,
    };
  }

  const existing = await pool.query<Record<string, unknown>>(
    `SELECT * FROM jobs WHERE url = $1 LIMIT 1`,
    [normalizedUrl]
  );

  if (!existing.rows[0]) {
    throw new Error('Unable to fetch existing job after conflict on url');
  }

  return {
    item: normalizeJobRow(existing.rows[0]),
    inserted: false,
  };
}

export async function getJobById(id: number) {
  const { rows } = await pool.query<Record<string, unknown>>(
    `SELECT * FROM jobs WHERE id = $1 LIMIT 1`,
    [id]
  );

  return rows[0] ? normalizeJobRow(rows[0]) : null;
}

export async function getJobByUrl(url: string) {
  const normalizedUrl = sanitizeJobUrl(url);
  if (!normalizedUrl) return null;

  const { rows } = await pool.query<Record<string, unknown>>(
    `SELECT * FROM jobs WHERE url = $1 LIMIT 1`,
    [normalizedUrl]
  );

  return rows[0] ? normalizeJobRow(rows[0]) : null;
}

export async function updateJobStatus(id: number, status: string) {
  const { rows } = await pool.query<Record<string, unknown>>(
    `UPDATE jobs
     SET status = $1
     WHERE id = $2
     RETURNING *`,
    [coerceJobStatus(status), id]
  );

  return rows[0] ? normalizeJobRow(rows[0]) : null;
}

export async function bulkUpdateJobStatus(ids: number[], status: string) {
  if (ids.length === 0) return [];

  const normalizedIds = ids.filter((id) => Number.isFinite(id));
  if (normalizedIds.length === 0) return [];

  const { rows } = await pool.query<Record<string, unknown>>(
    `UPDATE jobs
     SET status = $1
     WHERE id = ANY($2::int[])
     RETURNING *`,
    [coerceJobStatus(status), normalizedIds]
  );

  return rows.map(normalizeJobRow);
}

export async function updateJobNotes(id: number, notes: string | null) {
  const { rows } = await pool.query<Record<string, unknown>>(
    `UPDATE jobs
     SET notes = $1
     WHERE id = $2
     RETURNING *`,
    [notes, id]
  );

  return rows[0] ? normalizeJobRow(rows[0]) : null;
}

export async function updateJobEvaluation(
  id: number,
  input: {
    score_global: number | null;
    grade: string | null;
    status?: string;
    jd_text?: string | null;
  }
) {
  const { rows } = await pool.query<Record<string, unknown>>(
    `UPDATE jobs
     SET score = $1,
         grade = $2,
         status = $3,
         evaluated_at = NOW(),
         jd_text = COALESCE($4, jd_text)
     WHERE id = $5
     RETURNING *`,
    [
      toOneDecimal(input.score_global),
      input.grade ?? null,
      coerceJobStatus(input.status ?? 'evaluated'),
      input.jd_text ?? null,
      id,
    ]
  );

  return rows[0] ? normalizeJobRow(rows[0]) : null;
}

export async function markJobPdfGenerated(id: number, value = true) {
  const { rows } = await pool.query<Record<string, unknown>>(
    `UPDATE jobs
     SET pdf_generated = $1
     WHERE id = $2
     RETURNING *`,
    [value, id]
  );

  return rows[0] ? normalizeJobRow(rows[0]) : null;
}

export async function deleteJob(id: number) {
  const result = await pool.query('DELETE FROM jobs WHERE id = $1', [id]);
  return (result.rowCount ?? 0) > 0;
}

export async function listPendingJobs(limit = 200) {
  const rows = await listJobs({ status: 'pending', sort: 'added_at', order: 'asc', limit });
  return rows.filter((job) => !isLikelyGenericListingUrl(job.url));
}

// reports

export interface CreateReportInput {
  content: string;
  role_summary?: string | null;
  score_cv?: number | null;
  score_north?: number | null;
  score_comp?: number | null;
  score_culture?: number | null;
  score_flags?: number | null;
  score_global?: number | null;
  remote_policy?: string | null;
  comp_range?: string | null;
  archetype?: string | null;
  recommended?: string | null;
}

export async function createReport(jobId: number, input: CreateReportInput) {
  const { rows } = await pool.query<Record<string, unknown>>(
    `WITH next_num AS (
      SELECT COALESCE(MAX(num), 0) + 1 AS value
      FROM reports
    )
    INSERT INTO reports (
      job_id,
      num,
      content,
      role_summary,
      score_cv,
      score_north,
      score_comp,
      score_culture,
      score_flags,
      score_global,
      remote_policy,
      comp_range,
      archetype,
      recommended,
      created_at
    )
    SELECT
      $1,
      next_num.value,
      $2,
      $3,
      $4,
      $5,
      $6,
      $7,
      $8,
      $9,
      $10,
      $11,
      $12,
      $13,
      NOW()
    FROM next_num
    RETURNING
      id,
      job_id,
      num,
      content,
      role_summary,
      score_cv,
      score_north,
      score_comp,
      score_culture,
      score_flags,
      score_global,
      remote_policy,
      comp_range,
      archetype,
      recommended,
      created_at,
      NULL::TEXT AS job_title,
      NULL::TEXT AS job_company,
      NULL::TEXT AS job_status`,
    [
      jobId,
      input.content,
      input.role_summary ?? null,
      toOneDecimal(input.score_cv),
      toOneDecimal(input.score_north),
      toOneDecimal(input.score_comp),
      toOneDecimal(input.score_culture),
      toOneDecimal(input.score_flags),
      toOneDecimal(input.score_global),
      input.remote_policy ?? null,
      input.comp_range ?? null,
      input.archetype ?? null,
      coerceRecommendation(input.recommended ?? null),
    ]
  );

  return normalizeReportRow(rows[0]);
}

export interface ReportsQuery {
  q?: string;
  recommended?: string;
  archetype?: string;
  min_score?: number;
  max_score?: number;
  job_id?: number;
  limit?: number;
}

export async function listReports(query: ReportsQuery = {}) {
  const clauses: string[] = [];
  const params: Array<string | number> = [];

  if (query.q) {
    params.push(`%${query.q}%`);
    clauses.push(
      `(j.title ILIKE $${params.length} OR j.company ILIKE $${params.length} OR r.content ILIKE $${params.length})`
    );
  }

  if (query.recommended) {
    params.push(query.recommended);
    clauses.push(`r.recommended = $${params.length}`);
  }

  if (query.archetype) {
    params.push(query.archetype);
    clauses.push(`r.archetype = $${params.length}`);
  }

  if (query.min_score !== undefined && Number.isFinite(query.min_score)) {
    params.push(query.min_score);
    clauses.push(`r.score_global >= $${params.length}`);
  }

  if (query.max_score !== undefined && Number.isFinite(query.max_score)) {
    params.push(query.max_score);
    clauses.push(`r.score_global <= $${params.length}`);
  }

  if (query.job_id !== undefined && Number.isFinite(query.job_id)) {
    params.push(query.job_id);
    clauses.push(`r.job_id = $${params.length}`);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const limit = Math.min(Math.max(query.limit ?? 200, 1), 1000);
  params.push(limit);

  const { rows } = await pool.query<Record<string, unknown>>(
    `SELECT
      r.id,
      r.job_id,
      r.num,
      r.content,
      r.role_summary,
      r.score_cv,
      r.score_north,
      r.score_comp,
      r.score_culture,
      r.score_flags,
      r.score_global,
      r.remote_policy,
      r.comp_range,
      r.archetype,
      r.recommended,
      r.created_at,
      j.title AS job_title,
      j.company AS job_company,
      j.status AS job_status
    FROM reports r
    JOIN jobs j ON j.id = r.job_id
    ${where}
    ORDER BY r.created_at DESC, r.id DESC
    LIMIT $${params.length}`,
    params
  );

  return rows.map(normalizeReportRow);
}

export async function getReportById(id: number) {
  const { rows } = await pool.query<Record<string, unknown>>(
    `SELECT
      r.id,
      r.job_id,
      r.num,
      r.content,
      r.role_summary,
      r.score_cv,
      r.score_north,
      r.score_comp,
      r.score_culture,
      r.score_flags,
      r.score_global,
      r.remote_policy,
      r.comp_range,
      r.archetype,
      r.recommended,
      r.created_at,
      j.title AS job_title,
      j.company AS job_company,
      j.status AS job_status
    FROM reports r
    JOIN jobs j ON j.id = r.job_id
    WHERE r.id = $1
    LIMIT 1`,
    [id]
  );

  return rows[0] ? normalizeReportRow(rows[0]) : null;
}

export async function getLatestReportForJob(jobId: number) {
  const { rows } = await pool.query<Record<string, unknown>>(
    `SELECT
      r.id,
      r.job_id,
      r.num,
      r.content,
      r.role_summary,
      r.score_cv,
      r.score_north,
      r.score_comp,
      r.score_culture,
      r.score_flags,
      r.score_global,
      r.remote_policy,
      r.comp_range,
      r.archetype,
      r.recommended,
      r.created_at,
      j.title AS job_title,
      j.company AS job_company,
      j.status AS job_status
    FROM reports r
    JOIN jobs j ON j.id = r.job_id
    WHERE r.job_id = $1
    ORDER BY r.created_at DESC, r.id DESC
    LIMIT 1`,
    [jobId]
  );

  return rows[0] ? normalizeReportRow(rows[0]) : null;
}

// profile + cv

export async function getProfile() {
  await ensureProfileSeedRow();

  const { rows } = await pool.query<Record<string, unknown>>(
    `SELECT id, data, cv_md, updated_at
     FROM profile
     WHERE id = 1
     LIMIT 1`
  );

  const row = rows[0] ?? {
    id: 1,
    data: {},
    cv_md: '',
    updated_at: new Date().toISOString(),
  };

  return {
    id: Number(row.id),
    data: toObject(row.data),
    cv_md: row.cv_md ? String(row.cv_md) : '',
    updated_at: String(row.updated_at ?? new Date().toISOString()),
  } as ProfileRow;
}

export async function updateProfileData(data: Record<string, unknown>) {
  await ensureProfileSeedRow();

  const current = await getProfile();
  const merged = {
    ...current.data,
    ...data,
  };

  const { rows } = await pool.query<Record<string, unknown>>(
    `UPDATE profile
     SET data = $1,
         updated_at = NOW()
     WHERE id = 1
     RETURNING id, data, cv_md, updated_at`,
    [JSON.stringify(merged)]
  );

  const row = rows[0];

  return {
    id: Number(row.id),
    data: toObject(row.data),
    cv_md: row.cv_md ? String(row.cv_md) : '',
    updated_at: String(row.updated_at ?? new Date().toISOString()),
  } as ProfileRow;
}

export async function updateCvMarkdown(cvMd: string) {
  await ensureProfileSeedRow();

  const { rows } = await pool.query<Record<string, unknown>>(
    `UPDATE profile
     SET cv_md = $1,
         updated_at = NOW()
     WHERE id = 1
     RETURNING id, data, cv_md, updated_at`,
    [cvMd]
  );

  const row = rows[0];

  return {
    id: Number(row.id),
    data: toObject(row.data),
    cv_md: row.cv_md ? String(row.cv_md) : '',
    updated_at: String(row.updated_at ?? new Date().toISOString()),
  } as ProfileRow;
}

// portals

export interface CreatePortalInput {
  name: string;
  type: PortalType;
  config: Record<string, unknown>;
  enabled?: boolean;
}

export async function listPortals() {
  await ensurePortalsSeedRows();

  const { rows } = await pool.query<Record<string, unknown>>(
    `SELECT id, name, type, config, enabled, updated_at
     FROM portals
     ORDER BY enabled DESC, updated_at DESC, id DESC`
  );

  return rows.map(normalizePortalRow);
}

export async function getPortalById(id: number) {
  const { rows } = await pool.query<Record<string, unknown>>(
    `SELECT id, name, type, config, enabled, updated_at
     FROM portals
     WHERE id = $1
     LIMIT 1`,
    [id]
  );

  return rows[0] ? normalizePortalRow(rows[0]) : null;
}

export async function createPortal(input: CreatePortalInput) {
  const { rows } = await pool.query<Record<string, unknown>>(
    `INSERT INTO portals (name, type, config, enabled, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     RETURNING id, name, type, config, enabled, updated_at`,
    [input.name, input.type, JSON.stringify(input.config ?? {}), input.enabled ?? true]
  );

  return normalizePortalRow(rows[0]);
}

export interface UpdatePortalInput {
  name?: string;
  type?: PortalType;
  config?: Record<string, unknown>;
  enabled?: boolean;
}

export async function updatePortal(id: number, input: UpdatePortalInput) {
  const current = await getPortalById(id);
  if (!current) return null;

  const { rows } = await pool.query<Record<string, unknown>>(
    `UPDATE portals
     SET name = $1,
         type = $2,
         config = $3,
         enabled = $4,
         updated_at = NOW()
     WHERE id = $5
     RETURNING id, name, type, config, enabled, updated_at`,
    [
      input.name ?? current.name,
      input.type ?? current.type,
      JSON.stringify(input.config ?? current.config),
      input.enabled ?? current.enabled,
      id,
    ]
  );

  return rows[0] ? normalizePortalRow(rows[0]) : null;
}

export async function deletePortal(id: number) {
  const result = await pool.query('DELETE FROM portals WHERE id = $1', [id]);
  return (result.rowCount ?? 0) > 0;
}

// scan history

export interface AddScanHistoryInput {
  url: string;
  first_seen?: string;
  portal?: string | null;
  title?: string | null;
  company?: string | null;
  scan_status?: string | null;
}

export async function addScanHistory(input: AddScanHistoryInput) {
  const firstSeen = input.first_seen ?? new Date().toISOString().slice(0, 10);

  const { rows } = await pool.query<Record<string, unknown>>(
    `INSERT INTO scan_history (url, first_seen, portal, title, company, scan_status)
     VALUES ($1, $2::date, $3, $4, $5, $6)
     RETURNING id, url, first_seen, portal, title, company, scan_status`,
    [
      input.url,
      firstSeen,
      input.portal ?? null,
      input.title ?? null,
      input.company ?? null,
      input.scan_status ?? null,
    ]
  );

  return normalizeScanHistoryRow(rows[0]);
}

export async function listScanHistory(limit = 150) {
  const normalizedLimit = Math.min(Math.max(limit, 1), 1000);

  const { rows } = await pool.query<Record<string, unknown>>(
    `SELECT id, url, first_seen, portal, title, company, scan_status
     FROM scan_history
     ORDER BY id DESC
     LIMIT $1`,
    [normalizedLimit]
  );

  return rows.map(normalizeScanHistoryRow);
}

// settings

export async function getCareerSettings() {
  await ensureSettingsSeedRow();

  const { rows } = await pool.query<Record<string, unknown>>(
    `SELECT id, provider, anthropic_api_key, openai_api_key, scan_schedule, updated_at
     FROM career_settings
     WHERE id = 1
     LIMIT 1`
  );

  return normalizeSettingsRow(rows[0]);
}

export interface UpdateCareerSettingsInput {
  provider?: Provider;
  anthropic_api_key?: string | null;
  openai_api_key?: string | null;
  scan_schedule?: string | null;
}

export async function updateCareerSettings(input: UpdateCareerSettingsInput) {
  await ensureSettingsSeedRow();
  const current = await getCareerSettings();

  const { rows } = await pool.query<Record<string, unknown>>(
    `UPDATE career_settings
     SET provider = $1,
         anthropic_api_key = $2,
         openai_api_key = $3,
         scan_schedule = $4,
         updated_at = NOW()
     WHERE id = 1
     RETURNING id, provider, anthropic_api_key, openai_api_key, scan_schedule, updated_at`,
    [
      input.provider ?? current.provider,
      input.anthropic_api_key === undefined ? current.anthropic_api_key : input.anthropic_api_key,
      input.openai_api_key === undefined ? current.openai_api_key : input.openai_api_key,
      input.scan_schedule === undefined ? current.scan_schedule : input.scan_schedule,
    ]
  );

  return normalizeSettingsRow(rows[0]);
}

export async function getCareerSettingsPublic() {
  const settings = await getCareerSettings();

  return {
    provider: settings.provider,
    anthropic_api_key: maskSecret(settings.anthropic_api_key),
    openai_api_key: maskSecret(settings.openai_api_key),
    has_anthropic_key: Boolean(settings.anthropic_api_key || process.env.ANTHROPIC_API_KEY),
    has_openai_key: Boolean(settings.openai_api_key || process.env.OPENAI_API_KEY),
    scan_schedule: settings.scan_schedule,
    updated_at: settings.updated_at,
  };
}

export function resolveProviderAndKeys(settings: CareerSettingsRow) {
  const envAnthropic = process.env.ANTHROPIC_API_KEY || null;
  const envOpenai = process.env.OPENAI_API_KEY || null;

  const anthropic = settings.anthropic_api_key || envAnthropic;
  const openai = settings.openai_api_key || envOpenai;

  let provider = settings.provider;

  if (provider === 'anthropic' && !anthropic && openai) {
    provider = 'openai';
  } else if (provider === 'openai' && !openai && anthropic) {
    provider = 'anthropic';
  } else if (!anthropic && !openai) {
    provider = settings.provider;
  }

  return {
    provider,
    anthropic,
    openai,
  };
}

// metrics

export async function getMetrics(): Promise<CareerMetrics> {
  const [totalsRes, topJobsRes, activityRes, latestScanRes] = await Promise.all([
    pool.query<Record<string, unknown>>(
      `SELECT
        COUNT(*)::int AS total_jobs,
        COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
        COUNT(*) FILTER (WHERE status = 'evaluated')::int AS evaluated,
        COUNT(*) FILTER (WHERE status = 'applied')::int AS applied,
        COUNT(*) FILTER (WHERE status = 'responded')::int AS responded,
        COUNT(*) FILTER (WHERE status = 'interview')::int AS interview,
        COUNT(*) FILTER (WHERE status = 'offer')::int AS offer,
        COUNT(*) FILTER (WHERE status = 'rejected')::int AS rejected,
        COUNT(*) FILTER (WHERE status = 'discarded')::int AS discarded,
        COUNT(*) FILTER (WHERE status = 'skip')::int AS skip,
        ROUND(AVG(score)::numeric, 1) AS avg_score
      FROM jobs`
    ),
    pool.query<Record<string, unknown>>(
      `SELECT *
       FROM jobs
       ORDER BY score DESC NULLS LAST, added_at DESC
       LIMIT 10`
    ),
    pool.query<Record<string, unknown>>(
      `SELECT *
       FROM (
         SELECT
           r.created_at AS ts,
           'report'::TEXT AS type,
           CONCAT('Report #', r.num, ' for ', j.title, ' at ', j.company) AS label
         FROM reports r
         JOIN jobs j ON j.id = r.job_id

         UNION ALL

         SELECT
           j.evaluated_at AS ts,
           'job'::TEXT AS type,
           CONCAT('Evaluated ', j.title, ' (', j.grade, ')') AS label
         FROM jobs j
         WHERE j.evaluated_at IS NOT NULL

         UNION ALL

         SELECT
           (s.first_seen::timestamp) AS ts,
           'scan'::TEXT AS type,
           CONCAT('Scan ', COALESCE(s.scan_status, 'unknown'), ': ', COALESCE(s.title, s.url)) AS label
         FROM scan_history s
       ) t
       ORDER BY ts DESC
       LIMIT 25`
    ),
    pool.query<Record<string, unknown>>(
      `SELECT id, url, first_seen, portal, title, company, scan_status
       FROM scan_history
       ORDER BY id DESC
       LIMIT 1`
    ),
  ]);

  const totalsRow = totalsRes.rows[0] ?? {
    total_jobs: 0,
    pending: 0,
    evaluated: 0,
    applied: 0,
    responded: 0,
    interview: 0,
    offer: 0,
    rejected: 0,
    discarded: 0,
    skip: 0,
    avg_score: null,
  };

  const active = ACTIVE_JOB_STATUSES.reduce(
    (sum, status) => sum + Number(totalsRow[status] ?? 0),
    0
  );
  const closed = CLOSED_JOB_STATUSES.reduce(
    (sum, status) => sum + Number(totalsRow[status] ?? 0),
    0
  );

  const totals: MetricsTotals = {
    total_jobs: Number(totalsRow.total_jobs ?? 0),
    pending: Number(totalsRow.pending ?? 0),
    evaluated: Number(totalsRow.evaluated ?? 0),
    applied: Number(totalsRow.applied ?? 0),
    responded: Number(totalsRow.responded ?? 0),
    interview: Number(totalsRow.interview ?? 0),
    offer: Number(totalsRow.offer ?? 0),
    rejected: Number(totalsRow.rejected ?? 0),
    discarded: Number(totalsRow.discarded ?? 0),
    skip: Number(totalsRow.skip ?? 0),
    active,
    closed,
    avg_score: toOneDecimal(totalsRow.avg_score),
  };

  return {
    totals,
    top_jobs: topJobsRes.rows.map(normalizeJobRow),
    activity: activityRes.rows.map((row) => ({
      ts: String(row.ts),
      type: (row.type as MetricsActivity['type']) ?? 'job',
      label: String(row.label ?? ''),
    })),
    latest_scan: latestScanRes.rows[0] ? normalizeScanHistoryRow(latestScanRes.rows[0]) : null,
  };
}
