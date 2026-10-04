// Deletes the caller's own review, verified by the browser token.
//
//   POST /api/reviews-delete  { authorToken }
//
// Only a review whose author_token matches the caller's token is removed.

import { getSql, isUuid } from './_db.js';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
    const token = body?.authorToken;

    if (!isUuid(token)) {
      return res.status(400).json({ error: 'Invalid author token' });
    }

    const sql = getSql();
    await sql`DELETE FROM reviews WHERE author_token = ${token}`;
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('reviews-delete error:', err);
    return res.status(500).json({ error: 'Internal error', detail: String(err?.message ?? err) });
  }
}
