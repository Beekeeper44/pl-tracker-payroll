import crypto from 'node:crypto';
import { sql, ensureSchema } from './db.js';

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error('SESSION_SECRET must be set (32+ characters)');
  return s;
}

const b64url = buf => Buffer.from(buf).toString('base64url');

export function signToken(userId) {
  const payload = b64url(JSON.stringify({ uid: userId, exp: Date.now() + TOKEN_TTL_MS }));
  const sig = b64url(crypto.createHmac('sha256', secret()).update(payload).digest());
  return `${payload}.${sig}`;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  const expected = b64url(crypto.createHmac('sha256', secret()).update(payload).digest());
  const a = Buffer.from(sig || '');
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (!data.uid || !data.exp || data.exp < Date.now()) return null;
    return data;
  } catch { return null; }
}

export const publicUser = u => ({
  username: u.username,
  displayName: u.display_name,
  admin: u.is_admin,
});

// Resolves the signed-in user from the Authorization header, re-reading the
// users table so role changes and removals take effect immediately.
// Sends a 401/403 and returns null when the request isn't allowed.
export async function requireUser(req, res, { admin = false } = {}) {
  await ensureSchema();
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const data = verifyToken(token);
  if (!data) { res.status(401).json({ error: 'Not signed in' }); return null; }
  const rows = await sql`SELECT * FROM users WHERE id = ${data.uid}`;
  if (!rows.length) { res.status(401).json({ error: 'Account no longer exists' }); return null; }
  const user = rows[0];
  if (admin && !user.is_admin) { res.status(403).json({ error: 'Admins only' }); return null; }
  return user;
}

export function handleError(res, err) {
  console.error(err);
  res.status(500).json({ error: 'Server error' });
}
