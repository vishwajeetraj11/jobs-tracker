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
  ats TEXT, -- 'greenhouse' | 'lever' | 'ashby' | 'custom' | null
  ats_slug TEXT,
  status TEXT DEFAULT 'new', -- 'new' | 'watching' | 'applied' | 'closed'
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
