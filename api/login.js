import bcrypt from 'bcryptjs';
import { sql, ensureSchema } from '../lib/db.js';
import { signToken, publicUser, handleError } from '../lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    await ensureSchema();
    const username = String(req.body?.username || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const rows = username ? await sql`SELECT * FROM users WHERE username = ${username}` : [];
    const user = rows[0];
    const ok = user ? await bcrypt.compare(password, user.password_hash) : false;
    if (!ok) {
      await new Promise(r => setTimeout(r, 400)); // slow down guessing
      return res.status(401).json({ error: 'Wrong username or password' });
    }
    res.status(200).json({ token: signToken(user.id), user: publicUser(user) });
  } catch (err) { handleError(res, err); }
}
