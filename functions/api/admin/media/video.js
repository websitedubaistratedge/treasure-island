import { handle, json, readJson, HttpError } from '../../../../src/lib/http.js';
import { run } from '../../../../src/lib/db.js';
import { audit, requireRole } from '../../../../src/lib/auth.js';
import { randomToken } from '../../../../src/lib/crypto.js';
import { int, str, oneOf } from '../../../../src/lib/validate.js';
import { PART_SIZE, MAX_VIDEO_BYTES, VIDEO_TYPES } from '../../../../src/lib/media.js';

// Starts an upload. The browser then sends the file one part at a time and
// finishes with /complete, which is what flips the video to "ready".
export const onRequestPost = handle(async ({ request, env, data }) => {
  requireRole(data.admin, 'staff');
  const body = await readJson(request);
  const mime = oneOf(body.mime, 'mime', VIDEO_TYPES);
  const size = int(body.size, 'size', { required: true, min: 1, max: MAX_VIDEO_BYTES, label: 'Video size' });
  const width = int(body.width, 'width', { min: 1, max: 10000 });
  const height = int(body.height, 'height', { min: 1, max: 10000 });
  const duration = body.duration == null ? null : Math.max(0, Math.min(86400, Number(body.duration) || 0));
  const title = str(body.title, 'title', { max: 120 });
  const id = randomToken(16);
  await run(env.DB,
    `INSERT INTO media (id, kind, status, mime, bytes, size, width, height, duration, title)
     VALUES (?, 'video', 'uploading', ?, ?, 0, ?, ?, ?, ?)`,
    id, mime, new Uint8Array(0), width, height, duration, title);
  await audit(env, data.admin.id, 'media.video.start', 'media', id, { size, mime }, data.ip);
  return json({ id, partSize: PART_SIZE, parts: Math.ceil(size / PART_SIZE) }, 201);
});
