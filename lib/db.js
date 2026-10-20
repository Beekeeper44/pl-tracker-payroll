import { neon } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set');
}

export const sql = neon(process.env.DATABASE_URL);

// Tables are created on first use, so a fresh Neon database works without a
// manual migration. db/setup.sql does the same and also loads the seed data.
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
    })().catch(err => { schemaReady = null; throw err; });
  }
  return schemaReady;
}
