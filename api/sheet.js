import { sql } from '../lib/db.js';
import { requireUser, handleError } from '../lib/auth.js';

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

// One saved sheet per month ("YYYY-MM"). Each save bumps `version`; a save
// against an outdated version is rejected with 409 so two people editing at
// once can't silently overwrite each other.
export default async function handler(req, res) {
  try {
    const me = await requireUser(req, res);
    if (!me) return;

    if (req.method === 'GET') {
      const period = String(req.query?.period || '');
      if (!PERIOD_RE.test(period)) return res.status(400).json({ error: 'period must be YYYY-MM' });

      // Cheap poll: the client sends the version it has; skip the payload if unchanged.
      const since = req.query?.since !== undefined ? Number(req.query.since) : null;
      const [row] = await sql`SELECT version FROM payroll_sheets WHERE period = ${period}`;
      if (since !== null && (row ? row.version : 0) === since) {
        return res.status(200).json({ period, version: since, unchanged: true });
      }
      if (row) {
        const [full] = await sql`SELECT data, version, updated_by, updated_at FROM payroll_sheets WHERE period = ${period}`;
        return res.status(200).json({ period, data: full.data, version: full.version, updatedBy: full.updated_by, updatedAt: full.updated_at });
      }

      // No sheet for this month yet: start from the closest earlier month
      // (or, failing that, the latest one). Nothing is written until someone edits.
      const [prev] = await sql`
        SELECT period, data FROM payroll_sheets
        ORDER BY (period <= ${period}) DESC, period DESC
        LIMIT 1`;
      return res.status(200).json({ period, data: prev?.data ?? null, version: 0, inheritedFrom: prev?.period ?? null });
    }

    if (req.method === 'PUT') {
      const { period, version, data } = req.body || {};
      if (!PERIOD_RE.test(String(period))) return res.status(400).json({ error: 'period must be YYYY-MM' });
      if (!data || !Array.isArray(data.batches)) return res.status(400).json({ error: 'data.batches must be an array' });
      const who = me.display_name || me.username;
      const json = JSON.stringify(data);

      let rows;
      if (Number(version) === 0) {
        rows = await sql`
          INSERT INTO payroll_sheets (period, data, version, updated_by)
          VALUES (${period}, ${json}::jsonb, 1, ${who})
          ON CONFLICT (period) DO NOTHING
          RETURNING version, updated_at`;
      } else {
        rows = await sql`
          UPDATE payroll_sheets
          SET data = ${json}::jsonb, version = version + 1, updated_by = ${who}, updated_at = now()
          WHERE period = ${period} AND version = ${Number(version)}
          RETURNING version, updated_at`;
      }

      if (!rows.length) {
        const [cur] = await sql`SELECT version, updated_by FROM payroll_sheets WHERE period = ${period}`;
        return res.status(409).json({ error: 'Sheet was changed by someone else', version: cur?.version ?? 0, updatedBy: cur?.updated_by ?? null });
      }
      return res.status(200).json({ period, version: rows[0].version, updatedAt: rows[0].updated_at });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) { handleError(res, err); }
}
