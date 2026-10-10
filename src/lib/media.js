import { all } from './db.js';

// Videos are stored in parts because a single database value cannot hold a
// whole file. 512 KB keeps every row far below the limit and makes seeking
// cheap: a byte range usually touches one or two parts.
export const PART_SIZE = 512 * 1024;
export const MAX_VIDEO_BYTES = 64 * 1024 * 1024;
export const MAX_PARTS = Math.ceil(MAX_VIDEO_BYTES / PART_SIZE);
export const VIDEO_TYPES = ['video/mp4', 'video/webm'];

// Reads the container's own signature rather than trusting the upload's
// declared type: MP4/MOV carry "ftyp" at offset 4, WebM starts with an EBML
// header. Anything else is rejected.
export function sniffVideo(bytes) {
  const b = bytes;
  if (b.length < 12) return null;
  if (b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) return 'video/mp4';
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return 'video/webm';
  return null;
}

export const mediaUrl = (id) => `/media/${id}`;

export function posterUrl(row) {
  if (!row) return null;
  if (row.kind === 'video') return row.poster_id ? mediaUrl(row.poster_id) : null;
  return mediaUrl(row.id);
}

// Parses a single "bytes=" range against a known length. Returns null for a
// header we do not understand, so the caller can send the whole file instead.
export function parseRange(header, total) {
  const m = /^bytes=(\d*)-(\d*)$/.exec((header || '').trim());
  if (!m) return null;
  const [, rawStart, rawEnd] = m;
  if (rawStart === '' && rawEnd === '') return null;
  let start;
  let end;
  if (rawStart === '') {
    const suffix = Number(rawEnd);
    if (!suffix) return null;
    start = Math.max(0, total - suffix);
    end = total - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd === '' ? total - 1 : Math.min(Number(rawEnd), total - 1);
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= total) return { unsatisfiable: true };
  return { start, end };
}

// Which stored parts cover a byte range, and where the range starts inside the
// first of them.
export function partsForRange(start, end, partSize = PART_SIZE) {
  return {
    first: Math.floor(start / partSize),
    last: Math.floor(end / partSize),
    offset: start % partSize,
  };
}

const GALLERY_SQL = `SELECT m.id, m.kind, m.mime, m.size, m.width, m.height, m.duration, m.poster_id, m.title, m.alt, l.sort
  FROM media_links l JOIN media m ON m.id = l.media_id
  WHERE l.entity = ? AND l.entity_id = ? AND m.status = 'ready'
  ORDER BY l.sort, l.id`;

export function galleryFor(db, entity, entityId) {
  return all(db, GALLERY_SQL, entity, entityId);
}

// One query for many owners, so a page render stays a single round trip.
export async function galleriesFor(db, entity, ids) {
  if (!ids.length) return new Map();
  const marks = ids.map(() => '?').join(', ');
  const rows = await all(db, `SELECT l.entity_id, m.id, m.kind, m.mime, m.width, m.height, m.duration, m.poster_id, m.title, m.alt, l.sort
    FROM media_links l JOIN media m ON m.id = l.media_id
    WHERE l.entity = ? AND l.entity_id IN (${marks}) AND m.status = 'ready'
    ORDER BY l.entity_id, l.sort, l.id`, entity, ...ids);
  const out = new Map();
  for (const row of rows) {
    if (!out.has(row.entity_id)) out.set(row.entity_id, []);
    out.get(row.entity_id).push(row);
  }
  return out;
}

export const firstVideo = (items = []) => items.find((m) => m.kind === 'video') || null;
export const firstImage = (items = []) => items.find((m) => m.kind === 'image') || null;
