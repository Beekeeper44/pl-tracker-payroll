import bcrypt from 'bcryptjs';
import { sql } from '../lib/db.js';
import { requireUser, publicUser, handleError } from '../lib/auth.js';

const USERNAME_RE = /^[a-z0-9_]{3,30}$/;
const MIN_PASSWORD = 4;

async function adminCount() {
  const [{ n }] = await sql`SELECT COUNT(*)::int AS n FROM users WHERE is_admin`;
  return n;
}

export default async function handler(req, res) {
  try {
    const me = await requireUser(req, res, { admin: true });
    if (!me) return;

    if (req.method === 'GET') {
      const rows = await sql`SELECT * FROM users ORDER BY is_admin DESC, display_name`;
      return res.status(200).json({ users: rows.map(publicUser) });
    }

    if (req.method === 'POST') {
      const username = String(req.body?.username || '').trim().toLowerCase();
      const displayName = String(req.body?.displayName || '').trim() || username;
      const password = String(req.body?.password || '');
      const admin = !!req.body?.admin;
      if (!USERNAME_RE.test(username)) return res.status(400).json({ error: 'Username: 3–30 chars, letters/numbers/underscore only.' });
      if (password.length < MIN_PASSWORD) return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD} characters.` });
      const hash = await bcrypt.hash(password, 10);
      const rows = await sql`
        INSERT INTO users (username, display_name, password_hash, is_admin)
        VALUES (${username}, ${displayName}, ${hash}, ${admin})
        ON CONFLICT (username) DO NOTHING
        RETURNING *`;
      if (!rows.length) return res.status(409).json({ error: 'That username is already taken.' });
      return res.status(201).json({ user: publicUser(rows[0]) });
    }

    if (req.method === 'PATCH') {
      const username = String(req.body?.username || '').trim().toLowerCase();
      const [target] = await sql`SELECT * FROM users WHERE username = ${username}`;
      if (!target) return res.status(404).json({ error: 'User not found' });

      if (typeof req.body?.admin === 'boolean' && req.body.admin !== target.is_admin) {
        if (target.id === me.id) return res.status(400).json({ error: 'You cannot change your own admin role.' });
        if (!req.body.admin && (await adminCount()) <= 1) return res.status(400).json({ error: 'At least one admin is required.' });
        await sql`UPDATE users SET is_admin = ${req.body.admin}, updated_at = now() WHERE id = ${target.id}`;
      }
      if (typeof req.body?.displayName === 'string' && req.body.displayName.trim()) {
        await sql`UPDATE users SET display_name = ${req.body.displayName.trim()}, updated_at = now() WHERE id = ${target.id}`;
      }
      if (typeof req.body?.password === 'string') {
        if (req.body.password.length < MIN_PASSWORD) return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD} characters.` });
        const hash = await bcrypt.hash(req.body.password, 10);
        await sql`UPDATE users SET password_hash = ${hash}, updated_at = now() WHERE id = ${target.id}`;
      }
      const [updated] = await sql`SELECT * FROM users WHERE id = ${target.id}`;
      return res.status(200).json({ user: publicUser(updated) });
    }

    if (req.method === 'DELETE') {
      const username = String(req.query?.username || '').trim().toLowerCase();
      const [target] = await sql`SELECT * FROM users WHERE username = ${username}`;
      if (!target) return res.status(404).json({ error: 'User not found' });
      if (target.id === me.id) return res.status(400).json({ error: 'You cannot remove yourself.' });
      if (target.is_admin && (await adminCount()) <= 1) return res.status(400).json({ error: 'At least one admin is required.' });
      await sql`DELETE FROM users WHERE id = ${target.id}`;
      return res.status(200).json({ ok: true });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) { handleError(res, err); }
}
