import { handle, json, readJson, HttpError } from '../../../../src/lib/http.js';
import { one, run, nowIso } from '../../../../src/lib/db.js';
import { audit, requireRole } from '../../../../src/lib/auth.js';
import { int } from '../../../../src/lib/validate.js';
import { parseOffering } from '../../../../src/lib/offerings.js';

export const onRequestPatch = handle(async ({ request, env, params, data }) => {
  requireRole(data.admin, 'manager');
  const id = int(params.id, 'id', { required: true, min: 1 });
  const changes = parseOffering(await readJson(request), { partial: true });
  const cols = Object.keys(changes);
  if (!cols.length) throw new HttpError(422, 'Nothing to update.');
  const res = await run(env.DB, `UPDATE offerings SET ${cols.map((c) => `${c} = ?`).join(', ')}, updated_at = ? WHERE id = ?`,
    ...cols.map((c) => changes[c]), nowIso(), id);
  if (!res.meta.changes) throw new HttpError(404, 'Not found.');
  await audit(env, data.admin.id, 'offering.update', 'offering', id, changes, data.ip);
  return json({ row: await one(env.DB, 'SELECT * FROM offerings WHERE id = ?', id) });
});

export const onRequestDelete = handle(async ({ env, params, data }) => {
  requireRole(data.admin, 'manager');
  const id = int(params.id, 'id', { required: true, min: 1 });
  const used = await one(env.DB, 'SELECT COUNT(*) AS n FROM order_items WHERE offering_id = ?', id);
  if (used.n > 0) {
    await run(env.DB, 'UPDATE offerings SET active = 0, updated_at = ? WHERE id = ?', nowIso(), id);
    await audit(env, data.admin.id, 'offering.archive', 'offering', id, null, data.ip);
    return json({ archived: true });
  }
  await run(env.DB, 'DELETE FROM offerings WHERE id = ?', id);
  await audit(env, data.admin.id, 'offering.delete', 'offering', id, null, data.ip);
  return json({ deleted: true });
});
