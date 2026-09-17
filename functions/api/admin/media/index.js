import { handle, json, HttpError } from '../../../../src/lib/http.js';
import { all, run } from '../../../../src/lib/db.js';
import { audit, requireRole } from '../../../../src/lib/auth.js';
import { randomToken } from '../../../../src/lib/crypto.js';

const TYPES = ['image/webp', 'image/jpeg', 'image/png'];
const MAX_BYTES = 1_500_000;

// The admin resizes to WebP in the browser before uploading, so this only has
// to check type and size. The first bytes are checked too, not just the header.
function sniff(bytes) {
  const b = bytes;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  return null;
}

export const onRequestPost = handle(async ({ request, env, data }) => {
  requireRole(data.admin, 'staff');
  const declared = (request.headers.get('content-type') || '').split(';')[0].trim();
  if (!TYPES.includes(declared)) throw new HttpError(415, 'Upload a WebP, JPEG or PNG image.');
  const buf = new Uint8Array(await request.arrayBuffer());
  if (!buf.length) throw new HttpError(422, 'The image is empty.');
  if (buf.length > MAX_BYTES) throw new HttpError(413, 'Image is too large (max 1.5 MB).');
  const actual = sniff(buf);
  if (actual !== declared) throw new HttpError(415, 'That file is not the image type it claims to be.');
  const id = randomToken(16);
  const width = parseInt(request.headers.get('x-width') || '', 10) || null;
  const height = parseInt(request.headers.get('x-height') || '', 10) || null;
  await run(env.DB, 'INSERT INTO media (id, mime, bytes, size, width, height, alt) VALUES (?, ?, ?, ?, ?, ?, ?)',
    id, actual, buf, buf.length, width, height, (request.headers.get('x-alt') || '').slice(0, 200) || null);
  await audit(env, data.admin.id, 'media.upload', 'media', id, { size: buf.length }, data.ip);
  return json({ id, url: `/media/${id}`, size: buf.length, width, height }, 201);
});

export const onRequestGet = handle(async ({ env }) => {
  const rows = await all(env.DB, 'SELECT id, mime, size, width, height, alt, created_at FROM media ORDER BY created_at DESC LIMIT 120');
  return json({ rows });
});
