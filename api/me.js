import { requireUser, publicUser, handleError } from '../lib/auth.js';

export default async function handler(req, res) {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    res.status(200).json({ user: publicUser(user) });
  } catch (err) { handleError(res, err); }
}
