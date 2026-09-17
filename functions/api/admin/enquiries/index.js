import { handle, json } from '../../../../src/lib/http.js';
import { all, one } from '../../../../src/lib/db.js';
import { int, oneOf } from '../../../../src/lib/validate.js';

export const onRequestGet = handle(async ({ request, env }) => {
  const q = new URL(request.url).searchParams;
  const where = [];
  const params = [];
  const status = q.get('status');
  if (status) { where.push('status = ?'); params.push(oneOf(status, 'status', ['new', 'in_progress', 'closed', 'spam'])); }
  const search = (q.get('q') || '').trim().replace(/[%_]/g, '');
  if (search) { where.push('(name LIKE ? OR phone LIKE ? OR email LIKE ? OR message LIKE ?)'); for (let i = 0; i < 4; i++) params.push(`%${search}%`); }
  const page = int(q.get('page') || 1, 'page', { min: 1, max: 10000 });
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [rows, count, counts] = await Promise.all([
    all(env.DB, `SELECT * FROM enquiries ${clause} ORDER BY id DESC LIMIT 25 OFFSET ?`, ...params, (page - 1) * 25),
    one(env.DB, `SELECT COUNT(*) AS n FROM enquiries ${clause}`, ...params),
    all(env.DB, 'SELECT status, COUNT(*) AS n FROM enquiries GROUP BY status'),
  ]);
  return json({ rows: rows.map((r) => ({ ...r, payload: JSON.parse(r.payload || '{}') })), total: count.n, page,
    pages: Math.max(1, Math.ceil(count.n / 25)), counts: Object.fromEntries(counts.map((c) => [c.status, c.n])) });
});
