import { handle, json, readJson } from '../../../../../src/lib/http.js';
import { audit, requireRole } from '../../../../../src/lib/auth.js';
import { int } from '../../../../../src/lib/validate.js';
import { galleryFor } from '../../../../../src/lib/media.js';
import { saveGallery } from '../../../../../src/lib/gallery.js';

export const onRequestGet = handle(async ({ env, params }) => {
  const id = int(params.id, 'id', { required: true, min: 1 });
  return json({ rows: await galleryFor(env.DB, 'product', id) });
});

export const onRequestPut = handle(async ({ request, env, params, data }) => {
  requireRole(data.admin, 'manager');
  const id = int(params.id, 'id', { required: true, min: 1 });
  const body = await readJson(request);
  const rows = await saveGallery(env.DB, 'product', id, body.ids);
  await audit(env, data.admin.id, 'product.media', 'product', id, { count: rows.length }, data.ip);
  return json({ rows });
});
