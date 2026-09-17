import { handle, json, readJson } from '../../../../src/lib/http.js';
import { all, one, run } from '../../../../src/lib/db.js';
import { audit, requireRole } from '../../../../src/lib/auth.js';
import { parseProduct } from '../../../../src/lib/products.js';

export const onRequestGet = handle(async ({ env }) => {
  const rows = await all(env.DB, `SELECT p.*,
      (SELECT COALESCE(SUM(oi.qty), 0) FROM order_items oi JOIN orders o ON o.id = oi.order_id
        WHERE oi.product_id = p.id AND o.status IN ('paid','confirmed','completed')) AS sold
    FROM products p ORDER BY p.sort, p.id`);
  return json({ rows });
});

export const onRequestPost = handle(async ({ request, env, data }) => {
  requireRole(data.admin, 'manager');
  const p = parseProduct(await readJson(request), { partial: false });
  const max = await one(env.DB, 'SELECT COALESCE(MAX(sort), 0) AS s FROM products');
  const res = await run(env.DB, `INSERT INTO products (slug, name, description, price_fils, image_id, stock, active, featured, sort)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    p.slug, p.name, p.description ?? '', p.price_fils ?? null, p.image_id ?? null, p.stock ?? null, p.active ?? 1, p.featured ?? 1, max.s + 10);
  const row = await one(env.DB, 'SELECT * FROM products WHERE id = ?', res.meta.last_row_id);
  await audit(env, data.admin.id, 'product.create', 'product', row.id, { name: row.name }, data.ip);
  return json({ row }, 201);
});
