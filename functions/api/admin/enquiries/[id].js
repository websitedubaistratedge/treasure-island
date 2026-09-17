import { handle, json, readJson, HttpError } from '../../../../src/lib/http.js';
import { one, run, nowIso } from '../../../../src/lib/db.js';
import { audit } from '../../../../src/lib/auth.js';
import { int, str, oneOf } from '../../../../src/lib/validate.js';

export const onRequestPatch = handle(async ({ request, env, params, data }) => {
  const id = int(params.id, 'id', { required: true, min: 1 });
  const body = await readJson(request);
  const sets = [];
  const vals = [];
  if ('status' in body) { sets.push('status = ?'); vals.push(oneOf(body.status, 'status', ['new', 'in_progress', 'closed', 'spam'])); }
  if ('internal_notes' in body) { sets.push('internal_notes = ?'); vals.push(str(body.internal_notes, 'internal_notes', { max: 4000 })); }
  if (!sets.length) throw new HttpError(422, 'Nothing to update.');
  const res = await run(env.DB, `UPDATE enquiries SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`, ...vals, nowIso(), id);
  if (!res.meta.changes) throw new HttpError(404, 'Not found.');
  await audit(env, data.admin.id, 'enquiry.update', 'enquiry', id, body, data.ip);
  const row = await one(env.DB, 'SELECT * FROM enquiries WHERE id = ?', id);
  return json({ row: { ...row, payload: JSON.parse(row.payload || '{}') } });
});
