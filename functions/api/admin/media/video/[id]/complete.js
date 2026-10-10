import { handle, json, readJson, HttpError } from '../../../../../../src/lib/http.js';
import { all, one, run } from '../../../../../../src/lib/db.js';
import { audit, requireRole } from '../../../../../../src/lib/auth.js';
import { str } from '../../../../../../src/lib/validate.js';
import { PART_SIZE } from '../../../../../../src/lib/media.js';

// Finishes an upload: every part must be present, in order, each full except
// the last. Only then does the video become visible to the website.
export const onRequestPost = handle(async ({ request, env, params, data }) => {
  requireRole(data.admin, 'staff');
  const id = String(params.id || '');
  const body = await readJson(request).catch(() => ({}));
  const posterId = str(body.poster_id, 'poster_id', { max: 64 });

  const media = await one(env.DB, "SELECT id, status FROM media WHERE id = ? AND kind = 'video'", id);
  if (!media) throw new HttpError(404, 'Upload not found.');
  if (media.status === 'ready') return json({ id, ready: true });

  const parts = await all(env.DB, 'SELECT idx, size FROM media_parts WHERE media_id = ? ORDER BY idx', id);
  if (!parts.length) throw new HttpError(422, 'No part of the video arrived.');
  let size = 0;
  for (let i = 0; i < parts.length; i += 1) {
    if (parts[i].idx !== i) throw new HttpError(422, 'The video arrived incomplete. Please try again.');
    if (i < parts.length - 1 && parts[i].size !== PART_SIZE) throw new HttpError(422, 'The video arrived incomplete. Please try again.');
    size += parts[i].size;
  }

  if (posterId) {
    const poster = await one(env.DB, "SELECT id FROM media WHERE id = ? AND kind = 'image'", posterId);
    if (!poster) throw new HttpError(422, 'The cover image was not found.');
  }

  await run(env.DB, "UPDATE media SET status = 'ready', size = ?, poster_id = COALESCE(?, poster_id) WHERE id = ?", size, posterId, id);
  await audit(env, data.admin.id, 'media.video.done', 'media', id, { size }, data.ip);
  return json({ id, url: `/media/${id}`, size, ready: true });
});
