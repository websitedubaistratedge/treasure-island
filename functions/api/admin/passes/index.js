import { handle, json, readJson, HttpError } from '../../../../src/lib/http.js';
import { all, one, run } from '../../../../src/lib/db.js';
import { audit, requireRole } from '../../../../src/lib/auth.js';
import { str, int, phone, oneOf } from '../../../../src/lib/validate.js';
import { makePassCode } from '../../../../src/lib/orders.js';

export const onRequestGet = handle(async ({ request, env }) => {
  const q = new URL(request.url).searchParams;
  const where = [];
  const params = [];
  const status = q.get('status');
  if (status) { where.push('p.status = ?'); params.push(oneOf(status, 'status', ['pending', 'active', 'used_up', 'expired', 'void'])); }
  const search = (q.get('q') || '').trim().replace(/[%_]/g, '');
  if (search) { where.push('(p.code LIKE ? OR p.holder_name LIKE ? OR p.holder_phone LIKE ?)'); params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
  const rows = await all(env.DB, `SELECT p.*, (SELECT MAX(created_at) FROM pass_visits v WHERE v.pass_id = p.id) AS last_visit
      FROM passes p ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY p.id DESC LIMIT 200`, ...params);
  return json({ rows });
});

export const onRequestPost = handle(async ({ request, env, data }) => {
  requireRole(data.admin, 'manager');
  const body = await readJson(request);
  const offeringId = int(body.offeringId, 'offeringId', { min: 1 });
  const template = offeringId ? await one(env.DB, "SELECT * FROM offerings WHERE id = ? AND kind = 'pass'", offeringId) : null;
  if (offeringId && !template) throw new HttpError(422, 'Choose a pass type.', { field: 'offeringId' });
  const visits = int(body.visits ?? (template && template.visits), 'visits', { required: true, min: 1, max: 500, label: 'Visits' });
  const days = int(body.validity_days ?? (template && template.validity_days), 'validity_days', { min: 1, max: 3650 });
  const children = Array.isArray(body.children) ? body.children.slice(0, 10).map((c, i) => ({ name: str(c.name, `children.${i}.name`, { required: true, max: 80 }) })) : [];
  const code = makePassCode();
  await run(env.DB, `INSERT INTO passes (code, offering_id, name, holder_name, holder_phone, children, visits_total, status, expires_at, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
    code, offeringId, str(body.name, 'name', { max: 120 }) || (template ? template.name : `${visits}-visit pass`),
    str(body.holder_name, 'holder_name', { required: true, max: 120, label: 'Holder name' }), phone(body.holder_phone, 'holder_phone', { required: false }),
    JSON.stringify(children), visits, days ? new Date(Date.now() + days * 86400000).toISOString() : null, data.admin.id);
  const row = await one(env.DB, 'SELECT * FROM passes WHERE code = ?', code);
  await audit(env, data.admin.id, 'pass.issue', 'pass', row.id, { code, visits }, data.ip);
  return json({ row }, 201);
});
