import { Pool } from 'pg';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set');
}

const g = globalThis as typeof globalThis & { __pgPool?: Pool };

if (!g.__pgPool) {
  g.__pgPool = new Pool({ connectionString: process.env.DATABASE_URL });
}

export const pool = g.__pgPool;
