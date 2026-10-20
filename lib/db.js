import { neon } from '@neondatabase/serverless';
import { seedIfEmpty } from './seed.js';

// Vercel's Neon integration sets DATABASE_URL (and POSTGRES_URL as a backup name)
const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!url) {
  throw new Error('DATABASE_URL is not set — connect the Neon database to this Vercel project');
}

export const sql = neon(url);

// Tables are created on first use, so a fresh Neon database works without a
// manual migration, and an empty database gets the starting users and sheet (lib/seed.js).
let schemaReady = null;
export function ensureSchema() {
  if (!schemaReady) {
    schemaReady = (async () => {
      await sql`CREATE TABLE IF NOT EXISTS users (
        id            SERIAL PRIMARY KEY,
        username      TEXT UNIQUE NOT NULL,
        display_name  TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        is_admin      BOOLEAN NOT NULL DEFAULT FALSE,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
      )`;
      await sql`CREATE TABLE IF NOT EXISTS payroll_sheets (
        period      TEXT PRIMARY KEY CHECK (period ~ '^[0-9]{4}-[0-9]{2}$'),
        data        JSONB NOT NULL,
        version     INTEGER NOT NULL DEFAULT 1,
        updated_by  TEXT,
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      )`;
      await seedIfEmpty(sql);
    })().catch(err => { schemaReady = null; throw err; });
  }
  return schemaReady;
}
