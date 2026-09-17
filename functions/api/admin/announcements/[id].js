import { handle, json, readJson, HttpError } from '../../../../src/lib/http.js';
import { one, run, nowIso } from '../../../../src/lib/db.js';
import { audit, requireRole } from '../../../../src/lib/auth.js';
import { int } from '../../../../src/lib/validate.js';
import { parseAnnouncement } from '../../../../src/lib/announcements.js';

export const onRequestPatch = handle(async ({ request, env, params, data }) => {
  requireRole(data.admin, 'manager');
  const id = int(params.id, 'id', { required: true, min: 1 });
  const changes = parseAnnouncement(await readJson(request), { partial: true });
  const cols = Object.keys(changes);
  if (!cols.length) throw new HttpError(422, 'Nothing to update.');
  const res = await run(env.DB, `UPDATE announcements SET ${cols.map((c) => `${c} = ?`).join(', ')}, updated_at = ? WHERE id = ?`, ...cols.map((c) => changes[c]), nowIso(), id);
  if (!res.meta.changes) throw new HttpError(404, 'Not found.');
  await audit(env, data.admin.id, 'announcement.update', 'announcement', id, changes, data.ip);
  return json({ row: await one(env.DB, 'SELECT * FROM announcements WHERE id = ?', id) });
});

export const onRequestDelete = handle(async ({ env, params, data }) => {
  requireRole(data.admin, 'manager');
  const id = int(params.id, 'id', { required: true, min: 1 });
  await run(env.DB, 'DELETE FROM announcements WHERE id = ?', id);
  await audit(env, data.admin.id, 'announcement.delete', 'announcement', id, null, data.ip);
  return json({ deleted: true });
});
