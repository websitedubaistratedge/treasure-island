import { HttpError } from './http.js';

// Fixed-window counter in D1. One upsert per request; the window resets
// itself, so no cleanup job is needed.
export async function rateLimit(db, key, limit, windowSeconds) {
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - (now % windowSeconds);
  const row = await db.prepare(
    `INSERT INTO rate_limits (key, count, window_start) VALUES (?, 1, ?)
     ON CONFLICT(key) DO UPDATE SET
       count = CASE WHEN rate_limits.window_start < excluded.window_start THEN 1 ELSE rate_limits.count + 1 END,
       window_start = excluded.window_start
     RETURNING count`
  ).bind(key, windowStart).first();
  if (row && row.count > limit) {
    const retry = windowStart + windowSeconds - now;
    throw new HttpError(429, 'Too many requests. Please wait a moment and try again.', { retryAfter: retry });
  }
}
