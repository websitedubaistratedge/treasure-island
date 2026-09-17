import { handle, json, readJson, HttpError } from '../../../../src/lib/http.js';
import { all, one, run } from '../../../../src/lib/db.js';
import { audit, requireRole, publicAdmin } from '../../../../src/lib/auth.js';
import { hashPassword, generatePassword } from '../../../../src/lib/crypto.js';
import { str, email, oneOf } from '../../../../src/lib/validate.js';

export const onRequestGet = handle(async ({ env, data }) => {
  requireRole(data.admin, 'manager');
  const rows = await all(env.DB, 'SELECT * FROM admins ORDER BY id');
  return json({ rows: rows.map(publicAdmin) });
});

// The new member's password is generated here and shown to the owner once;
// only its hash is stored.
export const onRequestPost = handle(async ({ request, env, data }) => {
  requireRole(data.admin, 'owner');
  const body = await readJson(request);
  const address = email(body.email, 'email', { required: true });
  const name = str(body.name, 'name', { required: true, max: 80, label: 'Name' });
  const role = oneOf(body.role, 'role', ['owner', 'manager', 'staff']);
  if (await one(env.DB, 'SELECT id FROM admins WHERE email = ?', address)) throw new HttpError(409, 'Someone with that email is already on the team.', { field: 'email' });
  const password = generatePassword();
  const h = await hashPassword(password);
  const res = await run(env.DB, 'INSERT INTO admins (email, name, role, password_hash, password_salt, password_iter) VALUES (?, ?, ?, ?, ?, ?)',
    address, name, role, h.hash, h.salt, h.iterations);
  await audit(env, data.admin.id, 'team.add', 'admin', res.meta.last_row_id, { email: address, role }, data.ip);
  return json({ row: publicAdmin(await one(env.DB, 'SELECT * FROM admins WHERE id = ?', res.meta.last_row_id)), password }, 201);
});
