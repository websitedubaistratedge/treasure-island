import { handle, json, readJson, HttpError } from '../../../../src/lib/http.js';
import { audit, requireRole } from '../../../../src/lib/auth.js';

export const onRequestPost = handle(async ({ request, env, data }) => {
  requireRole(data.admin, 'manager');
  const { ids } = await readJson(request);
  if (!Array.isArray(ids) || !ids.length || ids.length > 500 || !ids.every((n) => Number.isInteger(n) && n > 0)) {
    throw new HttpError(422, 'Invalid order.');
  }
  const stmt = env.DB.prepare('UPDATE products SET sort = ? WHERE id = ?');
  await env.DB.batch(ids.map((id, i) => stmt.bind((i + 1) * 10, id)));
  await audit(env, data.admin.id, 'product.reorder', 'product', null, { count: ids.length }, data.ip);
  return json({ ok: true });
});
