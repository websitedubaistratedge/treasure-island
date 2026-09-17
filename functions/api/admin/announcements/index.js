import { handle, json, readJson } from '../../../../src/lib/http.js';
import { all, one, run } from '../../../../src/lib/db.js';
import { audit, requireRole } from '../../../../src/lib/auth.js';
import { parseAnnouncement } from '../../../../src/lib/announcements.js';

export const onRequestGet = handle(async ({ env }) => json({ rows: await all(env.DB, 'SELECT * FROM announcements ORDER BY id DESC LIMIT 100') }));

export const onRequestPost = handle(async ({ request, env, data }) => {
  requireRole(data.admin, 'manager');
  const a = parseAnnouncement(await readJson(request), { partial: false });
  const res = await run(env.DB, 'INSERT INTO announcements (message, link_url, link_label, tone, starts_at, ends_at, active) VALUES (?, ?, ?, ?, ?, ?, ?)',
    a.message, a.link_url ?? null, a.link_label ?? null, a.tone ?? 'gold', a.starts_at ?? null, a.ends_at ?? null, a.active ?? 1);
  await audit(env, data.admin.id, 'announcement.create', 'announcement', res.meta.last_row_id, null, data.ip);
  return json({ row: await one(env.DB, 'SELECT * FROM announcements WHERE id = ?', res.meta.last_row_id) }, 201);
});
