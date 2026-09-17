import { handle, json, readJson } from '../../../../src/lib/http.js';
import { all, one, run } from '../../../../src/lib/db.js';
import { audit, requireRole } from '../../../../src/lib/auth.js';
import { parseOffering } from '../../../../src/lib/offerings.js';

export const onRequestGet = handle(async ({ env }) => {
  const rows = await all(env.DB, `SELECT o.*,
      (SELECT COUNT(*) FROM slots s WHERE s.offering_id = o.id AND s.starts_at > strftime('%Y-%m-%dT%H:%M:%fZ','now') AND s.status = 'open') AS upcoming_slots
    FROM offerings o ORDER BY o.sort, o.id`);
  return json({ rows });
});

export const onRequestPost = handle(async ({ request, env, data }) => {
  requireRole(data.admin, 'manager');
  const o = parseOffering(await readJson(request), { partial: false });
  const res = await run(env.DB, `INSERT INTO offerings (slug, kind, name, summary, description, price_fils, price_unit, deposit_fils,
      min_age, max_age, max_children, visits, validity_days, image_id, active, sort)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    o.slug, o.kind, o.name, o.summary ?? '', o.description ?? '', o.price_fils, o.price_unit ?? 'child', o.deposit_fils,
    o.min_age, o.max_age, o.max_children ?? 6, o.visits, o.validity_days, o.image_id, o.active ?? 1, o.sort ?? 0);
  const row = await one(env.DB, 'SELECT * FROM offerings WHERE id = ?', res.meta.last_row_id);
  await audit(env, data.admin.id, 'offering.create', 'offering', row.id, { name: row.name }, data.ip);
  return json({ row }, 201);
});
