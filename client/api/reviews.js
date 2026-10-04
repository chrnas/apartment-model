// Serverless API for anonymous reviews.
//
//   GET  /api/reviews                 -> { reviews: [...], count, average }
//   POST /api/reviews                 -> upserts the caller's review (by token)
//
// No personal data is stored: rating, comment, a random browser token, timestamps.

import { sql, isUuid } from './_db.js';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  try {
    if (req.method === 'GET') {
      return await listReviews(res);
    }
    if (req.method === 'POST') {
      return await upsertReview(req, res);
    }
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('reviews handler error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}

async function listReviews(res) {
  const rows = await sql`
    SELECT id, rating, comment, author_token, created_at, updated_at
    FROM reviews
    ORDER BY created_at DESC
  `;

  const count = rows.length;
  const average =
    count === 0 ? 0 : rows.reduce((sum, r) => sum + r.rating, 0) / count;

  return res.status(200).json({
    reviews: rows,
    count,
    average: Math.round(average * 100) / 100,
  });
}

async function upsertReview(req, res) {
  const body = typeof req.body === 'object' ? req.body : safeParse(req.body);
  const rating = Number(body?.rating);
  const comment = String(body?.comment ?? '').slice(0, 2000);
  const token = body?.authorToken;

  if (!isUuid(token)) {
    return res.status(400).json({ error: 'Invalid author token' });
  }
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return res.status(400).json({ error: 'Rating must be an integer 1-5' });
  }

  // One review per browser token: insert, or update the existing one.
  const rows = await sql`
    INSERT INTO reviews (rating, comment, author_token)
    VALUES (${rating}, ${comment}, ${token})
    ON CONFLICT (author_token)
    DO UPDATE SET rating = EXCLUDED.rating,
                  comment = EXCLUDED.comment,
                  updated_at = now()
    RETURNING id, rating, comment, author_token, created_at, updated_at
  `;

  return res.status(200).json({ review: rows[0] });
}

function safeParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}
