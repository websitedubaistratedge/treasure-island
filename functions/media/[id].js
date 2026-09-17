import { one } from '../../src/lib/db.js';

export async function onRequestGet({ env, params }) {
  const id = String(params.id || '');
  if (!/^[A-Za-z0-9_-]{10,64}$/.test(id)) return new Response('Not found', { status: 404 });
  const row = await one(env.DB, 'SELECT mime, bytes FROM media WHERE id = ?', id);
  if (!row) return new Response('Not found', { status: 404 });
  // Media ids are random and never reused, so the bytes behind one never change.
  return new Response(new Uint8Array(row.bytes), {
    headers: {
      'content-type': row.mime,
      'cache-control': 'public, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
    },
  });
}
