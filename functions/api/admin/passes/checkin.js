import { handle, json, readJson, HttpError } from '../../../../src/lib/http.js';
import { one, nowIso } from '../../../../src/lib/db.js';
import { audit } from '../../../../src/lib/auth.js';
import { str } from '../../../../src/lib/validate.js';

// Uses one visit. The guarded UPDATE is the single source of truth: it only
// succeeds while the pass is active, unexpired and has visits left.
export const onRequestPost = handle(async ({ request, env, data }) => {
  const body = await readJson(request);
  const code = (str(body.code, 'code', { required: true, max: 40, label: 'Pass code' }) || '').toUpperCase().trim();
  const pass = await one(env.DB, 'SELECT * FROM passes WHERE code = ?', code);
  if (!pass) throw new HttpError(404, 'No pass with that code.', { field: 'code' });
  const now = nowIso();
  if (pass.status !== 'active') throw new HttpError(409, `This pass is ${pass.status.replace('_', ' ')}.`, { pass });
  if (pass.expires_at && pass.expires_at <= now) throw new HttpError(409, 'This pass has expired.', { pass });
  const [upd] = await env.DB.batch([
    env.DB.prepare(`UPDATE passes SET visits_used = visits_used + 1,
        status = CASE WHEN visits_used + 1 >= visits_total THEN 'used_up' ELSE status END, updated_at = ?
      WHERE id = ? AND status = 'active' AND visits_used < visits_total AND (expires_at IS NULL OR expires_at > ?)`).bind(now, pass.id, now),
    env.DB.prepare('INSERT INTO pass_visits (pass_id, admin_id, note) SELECT ?, ?, ? WHERE changes() = 1')
      .bind(pass.id, data.admin.id, str(body.note, 'note', { max: 200 })),
  ]);
  if (!upd.meta.changes) throw new HttpError(409, 'No visits left on this pass.', { pass });
  await audit(env, data.admin.id, 'pass.checkin', 'pass', pass.id, { code }, data.ip);
  return json({ row: await one(env.DB, 'SELECT * FROM passes WHERE id = ?', pass.id) });
});
