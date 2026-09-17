import { handle, json, HttpError } from '../../../../src/lib/http.js';
import { one, run } from '../../../../src/lib/db.js';
import { audit, requireRole } from '../../../../src/lib/auth.js';

export const onRequestDelete = handle(async ({ env, params, data }) => {
  requireRole(data.admin, 'manager');
  const id = String(params.id || '');
  const used = await one(env.DB, 'SELECT (SELECT COUNT(*) FROM products WHERE image_id = ?) + (SELECT COUNT(*) FROM offerings WHERE image_id = ?) AS n', id, id);
  if (used.n > 0) throw new HttpError(409, 'This image is still used by a product or service.');
  const res = await run(env.DB, 'DELETE FROM media WHERE id = ?', id);
  if (!res.meta.changes) throw new HttpError(404, 'Not found.');
  await audit(env, data.admin.id, 'media.delete', 'media', id, null, data.ip);
  return json({ deleted: true });
});
