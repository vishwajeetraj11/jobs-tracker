export interface CompanyRow {
  name: string;
  careers_url: string | null;
  status: string;
  open_roles: Array<{ title: string; url: string; source?: string; category?: string }> | null;
  updated_at: string;
  mentor_linkedins: string[] | null;
}

const QUERY = `
  SELECT
    c.name,
    c.careers_url,
    c.status,
    c.open_roles,
    c.updated_at,
    array_agg(DISTINCT m.linkedin) FILTER (WHERE m.linkedin IS NOT NULL) AS mentor_linkedins
  FROM companies c
  LEFT JOIN mentors m ON m.employer = c.name
  GROUP BY c.name, c.careers_url, c.status, c.open_roles, c.updated_at
  ORDER BY
    CASE c.status WHEN 'applied' THEN 0 WHEN 'watching' THEN 1 WHEN 'closed' THEN 2 WHEN 'new' THEN 3 ELSE 4 END,
    COALESCE(jsonb_array_length(c.open_roles), 0) DESC,
    c.updated_at DESC
`;

export async function getCompanies(): Promise<CompanyRow[]> {
  if (process.env.USE_STATIC_DATA === 'true') {
    const { default: data } = await import('../data/companies.json');
    return data as CompanyRow[];
  }

  const { pool } = await import('./db');
  const { rows } = await pool.query(QUERY);
  return rows;
}
