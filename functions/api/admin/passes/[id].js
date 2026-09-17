import { handle, json, readJson, HttpError } from '../../../../src/lib/http.js';
import { one, all, run, nowIso } from '../../../../src/lib/db.js';
import { audit, requireRole } from '../../../../src/lib/auth.js';
import { int, oneOf } from '../../../../src/lib/validate.js';

export const onRequestGet = handle(async ({ env, params }) => {
  const id = int(params.id, 'id', { required: true, min: 1 });
  const row = await one(env.DB, 'SELECT * FROM passes WHERE id = ?', id);
  if (!row) throw new HttpError(404, 'Pass not found.');
  const visits = await all(env.DB, 'SELECT v.*, a.name AS admin_name FROM pass_visits v LEFT JOIN admins a ON a.id = v.admin_id WHERE v.pass_id = ? ORDER BY v.id DESC', id);
  return json({ row, visits });
});

export const onRequestPatch = handle(async ({ request, env, params, data }) => {
  requireRole(data.admin, 'manager');
  const id = int(params.id, 'id', { required: true, min: 1 });
  const body = await readJson(request);
  const action = oneOf(body.action, 'action', ['void', 'add_visits', 'reactivate']);
  const now = nowIso();
  if (action === 'void') await run(env.DB, "UPDATE passes SET status = 'void', updated_at = ? WHERE id = ?", now, id);
  if (action === 'reactivate') await run(env.DB, "UPDATE passes SET status = CASE WHEN visits_used < visits_total THEN 'active' ELSE 'used_up' END, updated_at = ? WHERE id = ? AND status = 'void'", now, id);
  if (action === 'add_visits') {
    const n = int(body.visits, 'visits', { required: true, min: 1, max: 500 });
    await run(env.DB, "UPDATE passes SET visits_total = visits_total + ?, status = CASE WHEN status = 'used_up' THEN 'active' ELSE status END, updated_at = ? WHERE id = ?", n, now, id);
  }
  await audit(env, data.admin.id, `pass.${action}`, 'pass', id, body, data.ip);
  return json({ row: await one(env.DB, 'SELECT * FROM passes WHERE id = ?', id) });
});
