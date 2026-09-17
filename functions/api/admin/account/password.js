import { handle, json, readJson, HttpError } from '../../../../src/lib/http.js';
import { nowIso } from '../../../../src/lib/db.js';
import { audit, readCookie, SESSION_COOKIE } from '../../../../src/lib/auth.js';
import { verifyPassword, hashPassword, sha256Hex } from '../../../../src/lib/crypto.js';
import { str } from '../../../../src/lib/validate.js';

export const onRequestPost = handle(async ({ request, env, data }) => {
  const body = await readJson(request, 4096);
  const current = str(body.current, 'current', { required: true, max: 200, label: 'Current password' });
  const next = str(body.next, 'next', { required: true, min: 12, max: 200, label: 'New password' });
  if (!(await verifyPassword(current, data.admin))) throw new HttpError(422, 'Current password is incorrect.', { field: 'current' });
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(next)).length;
  if (classes < 3) throw new HttpError(422, 'Use at least three of: lowercase, uppercase, numbers, symbols.', { field: 'next' });
  if (next === current) throw new HttpError(422, 'Choose a different password.', { field: 'next' });
  const h = await hashPassword(next);
  const keep = await sha256Hex(readCookie(request, SESSION_COOKIE) || '');
  // Changing the password signs out every other device.
  await env.DB.batch([
    env.DB.prepare('UPDATE admins SET password_hash = ?, password_salt = ?, password_iter = ?, updated_at = ? WHERE id = ?').bind(h.hash, h.salt, h.iterations, nowIso(), data.admin.id),
    env.DB.prepare('DELETE FROM sessions WHERE admin_id = ? AND token_hash != ?').bind(data.admin.id, keep),
  ]);
  await audit(env, data.admin.id, 'account.password', 'admin', data.admin.id, null, data.ip);
  return json({ ok: true });
});
