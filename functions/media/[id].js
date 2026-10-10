import { one, all } from '../../src/lib/db.js';
import { PART_SIZE, parseRange, partsForRange } from '../../src/lib/media.js';

const BASE_HEADERS = {
  // Media ids are random and never reused, so the bytes behind one never change.
  'cache-control': 'public, max-age=31536000, immutable',
  'x-content-type-options': 'nosniff',
};

// Streams the parts of a video one row at a time, so a long video never has to
// sit in memory in one piece.
function streamParts(db, id, first, last, offset, bytesWanted) {
  let idx = first;
  let left = bytesWanted;
  return new ReadableStream({
    async pull(controller) {
      if (idx > last || left <= 0) { controller.close(); return; }
      const row = await one(db, 'SELECT bytes FROM media_parts WHERE media_id = ? AND idx = ?', id, idx);
      if (!row) { controller.error(new Error('missing part')); return; }
      let chunk = new Uint8Array(row.bytes);
      if (idx === first && offset) chunk = chunk.subarray(offset);
      if (chunk.length > left) chunk = chunk.subarray(0, left);
      left -= chunk.length;
      idx += 1;
      controller.enqueue(chunk);
    },
  });
}

export async function onRequest({ request, env, params }) {
  const id = String(params.id || '');
  if (!/^[A-Za-z0-9_-]{10,64}$/.test(id)) return new Response('Not found', { status: 404 });
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405, headers: { allow: 'GET, HEAD' } });
  }

  const row = await one(env.DB, 'SELECT mime, kind, size, status, bytes FROM media WHERE id = ?', id);
  if (!row || row.status !== 'ready') return new Response('Not found', { status: 404 });

  if (row.kind !== 'video') {
    const bytes = new Uint8Array(row.bytes);
    return new Response(request.method === 'HEAD' ? null : bytes, {
      headers: { ...BASE_HEADERS, 'content-type': row.mime, 'content-length': String(bytes.length) },
    });
  }

  const parts = await all(env.DB, 'SELECT size FROM media_parts WHERE media_id = ? ORDER BY idx', id);
  const total = parts.reduce((n, p) => n + p.size, 0);
  if (!total) return new Response('Not found', { status: 404 });

  const headers = { ...BASE_HEADERS, 'content-type': row.mime, 'accept-ranges': 'bytes' };
  const range = parseRange(request.headers.get('range'), total);

  if (range && range.unsatisfiable) {
    return new Response(null, { status: 416, headers: { ...headers, 'content-range': `bytes */${total}` } });
  }

  const start = range ? range.start : 0;
  const end = range ? range.end : total - 1;
  const length = end - start + 1;
  const status = range ? 206 : 200;
  if (range) headers['content-range'] = `bytes ${start}-${end}/${total}`;
  headers['content-length'] = String(length);

  if (request.method === 'HEAD') return new Response(null, { status, headers });

  const { first, last, offset } = partsForRange(start, end, PART_SIZE);
  return new Response(streamParts(env.DB, id, first, last, offset, length), { status, headers });
}
