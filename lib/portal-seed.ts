import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { SCANNER_DEFAULTS, type PortalType } from './career-config';

interface RawPortalEntry {
  name: string;
  enabled: boolean;
  query?: string;
  careers_url?: string;
  api?: string;
  scan_method?: string;
  scan_query?: string;
  notes?: string;
}

export interface SeedPortalDefinition {
  name: string;
  type: PortalType;
  config: Record<string, unknown>;
  enabled: boolean;
}

const DEFAULT_PORTALS_PATH = path.join(
  process.cwd(),
  'config',
  'career',
  'portals.frontend.yml'
);

function stripQuotes(value: string) {
  if (
    (value.startsWith("'") && value.endsWith("'")) ||
    (value.startsWith('"') && value.endsWith('"'))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function parseScalar(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  return stripQuotes(trimmed);
}

function parsePortalSection(content: string, sectionName: 'search_queries' | 'tracked_companies') {
  const lines = content.split(/\r?\n/);
  const entries: RawPortalEntry[] = [];
  let current: RawPortalEntry | null = null;
  let inSection = false;

  for (const line of lines) {
    if (/^\S/.test(line)) {
      inSection = line.startsWith(`${sectionName}:`);
      continue;
    }

    if (!inSection) continue;

    const itemMatch = line.match(/^  - name:\s*(.+)$/);
    if (itemMatch) {
      if (current?.name) {
        entries.push(current);
      }
      current = {
        name: String(parseScalar(itemMatch[1])),
        enabled: true,
      };
      continue;
    }

    if (!current) continue;

    const fieldMatch = line.match(/^    ([a-z_]+):\s*(.*)$/);
    if (!fieldMatch) continue;

    const [, key, rawValue] = fieldMatch;
    const value = parseScalar(rawValue);

    if (key === 'enabled') {
      current.enabled = Boolean(value);
      continue;
    }

    if (
      key === 'query' ||
      key === 'careers_url' ||
      key === 'api' ||
      key === 'scan_method' ||
      key === 'scan_query' ||
      key === 'notes'
    ) {
      current[key] = String(value);
    }
  }

  if (current?.name) {
    entries.push(current);
  }

  return entries;
}

function extractGreenhouseSlug(apiUrl?: string) {
  if (!apiUrl) return null;
  const match = apiUrl.match(/boards\/([^/]+)\/jobs/i);
  return match?.[1] ?? null;
}

function toSeedPortal(entry: RawPortalEntry, type: PortalType): SeedPortalDefinition {
  if (type === 'search_query') {
    return {
      name: entry.name,
      type,
      enabled: entry.enabled,
      config: {
        query: entry.query ?? '',
        max_results: SCANNER_DEFAULTS.maxResults.search_query,
      },
    };
  }

  const greenhouseSlug = extractGreenhouseSlug(entry.api);
  const config: Record<string, unknown> = {
    company: entry.name,
    careers_url: entry.careers_url ?? '',
    max_results: SCANNER_DEFAULTS.maxResults.tracked_company,
  };

  if (entry.scan_method) config.scan_method = entry.scan_method;
  if (entry.scan_query) config.scan_query = entry.scan_query;
  if (entry.notes) config.notes = entry.notes;
  if (greenhouseSlug) {
    config.ats = 'greenhouse';
    config.ats_slug = greenhouseSlug;
  }

  return {
    name: entry.name,
    type,
    enabled: entry.enabled,
    config,
  };
}

export async function loadSeedPortalsFromYaml() {
  const content = await readFile(DEFAULT_PORTALS_PATH, 'utf8');
  const searchQueries = parsePortalSection(content, 'search_queries');
  const trackedCompanies = parsePortalSection(content, 'tracked_companies');

  return [
    ...searchQueries.map((entry) => toSeedPortal(entry, 'search_query')),
    ...trackedCompanies.map((entry) => toSeedPortal(entry, 'tracked_company')),
  ];
}
