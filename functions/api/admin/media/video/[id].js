import { handle, json, HttpError } from '../../../../../src/lib/http.js';
import { one, run } from '../../../../../src/lib/db.js';
import { requireRole } from '../../../../../src/lib/auth.js';
import { PART_SIZE, MAX_PARTS, MAX_VIDEO_BYTES, sniffVideo } from '../../../../../src/lib/media.js';

// One part of a video upload. Parts can be retried: writing the same index
// twice replaces it rather than failing.
export const onRequestPut = handle(async ({ request, env, params, data }) => {
  requireRole(data.admin, 'staff');
  const id = String(params.id || '');
  const idx = Number(new URL(request.url).searchParams.get('part'));
  if (!Number.isInteger(idx) || idx < 0 || idx >= MAX_PARTS) throw new HttpError(422, 'Bad part number.');

  const media = await one(env.DB, "SELECT id, status FROM media WHERE id = ? AND kind = 'video'", id);
  if (!media) throw new HttpError(404, 'Upload not found.');
  if (media.status !== 'uploading') throw new HttpError(409, 'This upload is already finished.');

  const bytes = new Uint8Array(await request.arrayBuffer());
  if (!bytes.length) throw new HttpError(422, 'Empty part.');
  if (bytes.length > PART_SIZE) throw new HttpError(413, 'Part is too large.');
  if (idx === 0 && !sniffVideo(bytes)) throw new HttpError(415, 'That file is not an MP4 or WebM video.');

  const totals = await one(env.DB, 'SELECT COALESCE(SUM(size), 0) AS total FROM media_parts WHERE media_id = ? AND idx <> ?', id, idx);
  if (totals.total + bytes.length > MAX_VIDEO_BYTES) throw new HttpError(413, 'Video is too large.');

  await run(env.DB, 'INSERT OR REPLACE INTO media_parts (media_id, idx, bytes, size) VALUES (?, ?, ?, ?)', id, idx, bytes, bytes.length);
  return json({ part: idx, received: bytes.length });
});
