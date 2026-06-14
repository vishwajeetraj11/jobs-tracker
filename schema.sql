CREATE TABLE IF NOT EXISTS mentors (
  slug TEXT PRIMARY KEY,
  name TEXT,
  title TEXT,
  employer TEXT,
  country TEXT,
  linkedin TEXT,
  website TEXT,
  last_seen TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS companies (
  name TEXT PRIMARY KEY,
  careers_url TEXT,
  ats TEXT,
  ats_slug TEXT,
  status TEXT DEFAULT 'new',
  open_roles JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS applied (
  id SERIAL PRIMARY KEY,
  company TEXT,
  role TEXT,
  platform TEXT,
  url TEXT,
  applied_at TIMESTAMPTZ DEFAULT NOW()
);

-- career-ops tables (v2.1)

CREATE TABLE IF NOT EXISTS jobs (
  id SERIAL PRIMARY KEY,
  url TEXT UNIQUE NOT NULL,
  company TEXT NOT NULL,
  title TEXT NOT NULL,
  source TEXT,
  status TEXT DEFAULT 'pending', -- pending|evaluated|applied|responded|interview|offer|rejected|discarded|skip
  score NUMERIC(3,1),
  grade TEXT,
  pdf_generated BOOLEAN DEFAULT false,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  evaluated_at TIMESTAMPTZ,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS reports (
  id SERIAL PRIMARY KEY,
  job_id INTEGER REFERENCES jobs(id) ON DELETE CASCADE,
  num INTEGER UNIQUE NOT NULL,
  content TEXT NOT NULL,
  role_summary TEXT,
  score_cv NUMERIC(3,1),
  score_north NUMERIC(3,1),
  score_comp NUMERIC(3,1),
  score_culture NUMERIC(3,1),
  score_flags NUMERIC(3,1),
  score_global NUMERIC(3,1),
  remote_policy TEXT,
  comp_range TEXT,
  archetype TEXT,
  recommended TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS scan_history (
  id SERIAL PRIMARY KEY,
  url TEXT NOT NULL,
  first_seen DATE NOT NULL,
  portal TEXT,
  title TEXT,
  company TEXT,
  scan_status TEXT -- added|skipped_title|skipped_dup|skipped_expired|skipped_location
);

CREATE TABLE IF NOT EXISTS profile (
  id INTEGER PRIMARY KEY DEFAULT 1,
  data JSONB NOT NULL,
  cv_md TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS portals (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL, -- search_query|tracked_company
  config JSONB NOT NULL,
  enabled BOOLEAN DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS career_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  provider TEXT DEFAULT 'anthropic', -- anthropic|openai
  anthropic_api_key TEXT,
  openai_api_key TEXT,
  scan_schedule TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- additive migration compatibility for local dev databases that already have earlier table shapes

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS grade TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS pdf_generated BOOLEAN DEFAULT false;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS added_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS evaluated_at TIMESTAMPTZ;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS jd_text TEXT;
UPDATE jobs
SET added_at = COALESCE(added_at, NOW())
WHERE added_at IS NULL;
UPDATE jobs
SET status = 'evaluated'
WHERE status IN ('apply-now');

ALTER TABLE reports ADD COLUMN IF NOT EXISTS num INTEGER;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS content TEXT;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS role_summary TEXT;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS score_cv NUMERIC(3,1);
ALTER TABLE reports ADD COLUMN IF NOT EXISTS score_north NUMERIC(3,1);
ALTER TABLE reports ADD COLUMN IF NOT EXISTS score_comp NUMERIC(3,1);
ALTER TABLE reports ADD COLUMN IF NOT EXISTS score_culture NUMERIC(3,1);
ALTER TABLE reports ADD COLUMN IF NOT EXISTS score_flags NUMERIC(3,1);
ALTER TABLE reports ADD COLUMN IF NOT EXISTS score_global NUMERIC(3,1);
ALTER TABLE reports ADD COLUMN IF NOT EXISTS remote_policy TEXT;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS comp_range TEXT;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS archetype TEXT;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS recommended TEXT;
UPDATE reports
SET num = COALESCE(num, id)
WHERE num IS NULL;
UPDATE reports
SET content = COALESCE(content, '')
WHERE content IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS reports_num_unique_idx ON reports (num);

ALTER TABLE scan_history ADD COLUMN IF NOT EXISTS url TEXT;
ALTER TABLE scan_history ADD COLUMN IF NOT EXISTS first_seen DATE;
ALTER TABLE scan_history ADD COLUMN IF NOT EXISTS portal TEXT;
ALTER TABLE scan_history ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE scan_history ADD COLUMN IF NOT EXISTS company TEXT;
ALTER TABLE scan_history ADD COLUMN IF NOT EXISTS scan_status TEXT;
UPDATE scan_history
SET first_seen = COALESCE(first_seen, NOW()::date)
WHERE first_seen IS NULL;
UPDATE scan_history
SET scan_status = COALESCE(scan_status, 'added')
WHERE scan_status IS NULL;
UPDATE scan_history
SET portal = COALESCE(portal, 'legacy')
WHERE portal IS NULL;
UPDATE scan_history
SET url = COALESCE(url, '')
WHERE url IS NULL;

ALTER TABLE profile ADD COLUMN IF NOT EXISTS data JSONB;
ALTER TABLE profile ADD COLUMN IF NOT EXISTS cv_md TEXT;
ALTER TABLE profile ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
UPDATE profile
SET data = COALESCE(
  data,
  '{}'::jsonb
)
WHERE data IS NULL;

ALTER TABLE portals ADD COLUMN IF NOT EXISTS type TEXT;
ALTER TABLE portals ADD COLUMN IF NOT EXISTS config JSONB;
ALTER TABLE portals ADD COLUMN IF NOT EXISTS enabled BOOLEAN;
ALTER TABLE portals ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
UPDATE portals
SET type = COALESCE(type, 'tracked_company')
WHERE type IS NULL;
UPDATE portals
SET config = COALESCE(config, '{}'::jsonb)
WHERE config IS NULL;
UPDATE portals
SET enabled = COALESCE(enabled, true)
WHERE enabled IS NULL;
UPDATE portals
SET updated_at = COALESCE(updated_at, NOW())
WHERE updated_at IS NULL;

INSERT INTO profile (id, data, cv_md, updated_at)
VALUES (1, '{}'::jsonb, '', NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO career_settings (id, provider, updated_at)
VALUES (1, 'anthropic', NOW())
ON CONFLICT (id) DO NOTHING;

CREATE UNIQUE INDEX IF NOT EXISTS portals_name_unique_idx ON portals (name);
CREATE UNIQUE INDEX IF NOT EXISTS jobs_url_unique_idx ON jobs (url);
CREATE INDEX IF NOT EXISTS jobs_status_idx ON jobs (status);
CREATE INDEX IF NOT EXISTS jobs_score_idx ON jobs (score DESC);
CREATE INDEX IF NOT EXISTS jobs_added_idx ON jobs (added_at DESC);
CREATE INDEX IF NOT EXISTS scan_history_first_seen_idx ON scan_history (first_seen DESC);
CREATE INDEX IF NOT EXISTS reports_job_id_idx ON reports (job_id);
