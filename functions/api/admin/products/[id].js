import { handle, json, readJson, HttpError } from '../../../../src/lib/http.js';
import { one, run, nowIso } from '../../../../src/lib/db.js';
import { audit, requireRole } from '../../../../src/lib/auth.js';
import { int } from '../../../../src/lib/validate.js';
import { parseProduct } from '../../../../src/lib/products.js';

export const onRequestPatch = handle(async ({ request, env, params, data }) => {
  requireRole(data.admin, 'staff');
  const id = int(params.id, 'id', { required: true, min: 1 });
  const body = await readJson(request);
  const changes = parseProduct(body, { partial: true });
  // Staff may only adjust stock and availability; everything else is managers.
  const staffFields = ['stock', 'active'];
  if (data.admin.role === 'staff' && Object.keys(changes).some((k) => !staffFields.includes(k))) requireRole(data.admin, 'manager');
  const cols = Object.keys(changes);
  if (!cols.length) throw new HttpError(422, 'Nothing to update.');
  const res = await run(env.DB, `UPDATE products SET ${cols.map((c) => `${c} = ?`).join(', ')}, updated_at = ? WHERE id = ?`,
    ...cols.map((c) => changes[c]), nowIso(), id);
  if (!res.meta.changes) throw new HttpError(404, 'Not found.');
  await audit(env, data.admin.id, 'product.update', 'product', id, changes, data.ip);
  return json({ row: await one(env.DB, 'SELECT * FROM products WHERE id = ?', id) });
});

export const onRequestDelete = handle(async ({ env, params, data }) => {
  requireRole(data.admin, 'manager');
  const id = int(params.id, 'id', { required: true, min: 1 });
  const used = await one(env.DB, 'SELECT COUNT(*) AS n FROM order_items WHERE product_id = ?', id);
  if (used.n > 0) {
    await run(env.DB, 'UPDATE products SET active = 0, updated_at = ? WHERE id = ?', nowIso(), id);
    await audit(env, data.admin.id, 'product.archive', 'product', id, null, data.ip);
    return json({ archived: true });
  }
  await run(env.DB, 'DELETE FROM products WHERE id = ?', id);
  await audit(env, data.admin.id, 'product.delete', 'product', id, null, data.ip);
  return json({ deleted: true });
});
