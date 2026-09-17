import { handle, json } from '../../../src/lib/http.js';
import { all, one } from '../../../src/lib/db.js';
import { requireRole } from '../../../src/lib/auth.js';
import { int } from '../../../src/lib/validate.js';

export const onRequestGet = handle(async ({ request, env, data }) => {
  requireRole(data.admin, 'manager');
  const page = int(new URL(request.url).searchParams.get('page') || 1, 'page', { min: 1, max: 10000 });
  const [rows, count] = await Promise.all([
    all(env.DB, 'SELECT l.*, a.name AS admin_name, a.email AS admin_email FROM audit_log l LEFT JOIN admins a ON a.id = l.admin_id ORDER BY l.id DESC LIMIT 50 OFFSET ?', (page - 1) * 50),
    one(env.DB, 'SELECT COUNT(*) AS n FROM audit_log'),
  ]);
  return json({ rows: rows.map((r) => ({ ...r, detail: r.detail ? JSON.parse(r.detail) : null })), page, pages: Math.max(1, Math.ceil(count.n / 50)) });
});
