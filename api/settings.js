import { sql } from '../lib/db.js';
import { requireUser, handleError } from '../lib/auth.js';

// Small shared settings (e.g. the Google Sheet row order used by Export CSV).
const ALLOWED_KEYS = new Set(['export_order']);

export default async function handler(req, res) {
  try {
    const me = await requireUser(req, res);
    if (!me) return;
    const key = String((req.method === 'GET' ? req.query?.key : req.body?.key) || '');
    if (!ALLOWED_KEYS.has(key)) return res.status(400).json({ error: 'Unknown setting' });

    if (req.method === 'GET') {
      const [row] = await sql`SELECT value, updated_by, updated_at FROM app_settings WHERE key = ${key}`;
      return res.status(200).json({ key, value: row?.value ?? null, updatedBy: row?.updated_by ?? null, updatedAt: row?.updated_at ?? null });
    }

    if (req.method === 'PUT') {
      const value = req.body?.value;
      const okItem = v => typeof v === 'string' || (v && typeof v.name === 'string' && (v.code === undefined || typeof v.code === 'string'));
      if (key === 'export_order' && (!Array.isArray(value) || !value.every(okItem) || value.length > 2000)) {
        return res.status(400).json({ error: 'export_order must be a list of names' });
      }
      const who = me.display_name || me.username;
      await sql`INSERT INTO app_settings (key, value, updated_by, updated_at)
                VALUES (${key}, ${JSON.stringify(value)}::jsonb, ${who}, now())
                ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`;
      return res.status(200).json({ key, ok: true });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) { handleError(res, err); }
}
