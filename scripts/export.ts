/**
 * Dumps the current companies data from the local DB to data/companies.json.
 * Run with: npm run export
 */

import { pool } from '../lib/db';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

async function main() {
  console.log('Connecting to DB…');

  const { rows } = await pool.query(`
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
  `);

  const outDir = join(__dirname, '..', 'data');
  const outPath = join(outDir, 'companies.json');

  mkdirSync(outDir, { recursive: true });
  writeFileSync(outPath, JSON.stringify(rows, null, 2));

  console.log(`✓ Exported ${rows.length} companies → data/companies.json`);
  await pool.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
