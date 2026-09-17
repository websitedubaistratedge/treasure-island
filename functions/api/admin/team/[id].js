import { handle, json, readJson, HttpError } from '../../../../src/lib/http.js';
import { one, run, nowIso } from '../../../../src/lib/db.js';
import { audit, requireRole, publicAdmin } from '../../../../src/lib/auth.js';
import { hashPassword, generatePassword } from '../../../../src/lib/crypto.js';
import { str, int, oneOf, bool } from '../../../../src/lib/validate.js';

async function ownersLeft(env, excludingId) {
  const r = await one(env.DB, "SELECT COUNT(*) AS n FROM admins WHERE role = 'owner' AND active = 1 AND id != ?", excludingId);
  return r.n;
}

export const onRequestPatch = handle(async ({ request, env, params, data }) => {
  requireRole(data.admin, 'owner');
  const id = int(params.id, 'id', { required: true, min: 1 });
  const target = await one(env.DB, 'SELECT * FROM admins WHERE id = ?', id);
  if (!target) throw new HttpError(404, 'Not found.');
  const body = await readJson(request);
  const now = nowIso();
  let password = null;
  if ('name' in body) await run(env.DB, 'UPDATE admins SET name = ?, updated_at = ? WHERE id = ?', str(body.name, 'name', { required: true, max: 80 }), now, id);
  if ('role' in body) {
    const role = oneOf(body.role, 'role', ['owner', 'manager', 'staff']);
    if (target.role === 'owner' && role !== 'owner' && (await ownersLeft(env, id)) === 0) throw new HttpError(409, 'There must always be at least one owner.');
    await run(env.DB, 'UPDATE admins SET role = ?, updated_at = ? WHERE id = ?', role, now, id);
  }
  if ('active' in body) {
    const active = bool(body.active);
    if (!active && id === data.admin.id) throw new HttpError(409, 'You cannot deactivate yourself.');
    if (!active && target.role === 'owner' && (await ownersLeft(env, id)) === 0) throw new HttpError(409, 'There must always be at least one owner.');
    await env.DB.batch([
      env.DB.prepare('UPDATE admins SET active = ?, updated_at = ? WHERE id = ?').bind(active ? 1 : 0, now, id),
      ...(active ? [] : [env.DB.prepare('DELETE FROM sessions WHERE admin_id = ?').bind(id)]),
    ]);
  }
  if (body.resetPassword) {
    password = generatePassword();
    const h = await hashPassword(password);
    await env.DB.batch([
      env.DB.prepare('UPDATE admins SET password_hash = ?, password_salt = ?, password_iter = ?, updated_at = ? WHERE id = ?').bind(h.hash, h.salt, h.iterations, now, id),
      env.DB.prepare('DELETE FROM sessions WHERE admin_id = ?').bind(id),
    ]);
  }
  await audit(env, data.admin.id, 'team.update', 'admin', id, { ...body, resetPassword: !!body.resetPassword }, data.ip);
  return json({ row: publicAdmin(await one(env.DB, 'SELECT * FROM admins WHERE id = ?', id)), password });
});

export const onRequestDelete = handle(async ({ env, params, data }) => {
  requireRole(data.admin, 'owner');
  const id = int(params.id, 'id', { required: true, min: 1 });
  if (id === data.admin.id) throw new HttpError(409, 'You cannot remove yourself.');
  const target = await one(env.DB, 'SELECT * FROM admins WHERE id = ?', id);
  if (!target) throw new HttpError(404, 'Not found.');
  if (target.role === 'owner' && (await ownersLeft(env, id)) === 0) throw new HttpError(409, 'There must always be at least one owner.');
  await run(env.DB, 'DELETE FROM admins WHERE id = ?', id);
  await audit(env, data.admin.id, 'team.remove', 'admin', id, { email: target.email }, data.ip);
  return json({ deleted: true });
});
