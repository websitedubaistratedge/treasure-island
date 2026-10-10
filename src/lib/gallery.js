import { HttpError } from './http.js';
import { all, one } from './db.js';
import { galleryFor } from './media.js';

const TABLE = { offering: 'offerings', product: 'products' };
const MAX_ITEMS = 12;

// Replaces the whole gallery of one programme or product in a single
// transaction: links that are gone are removed, the rest are stored in the
// order the admin arranged them.
export async function saveGallery(db, entity, entityId, ids) {
  const table = TABLE[entity];
  if (!table) throw new HttpError(422, 'Unknown item type.');
  if (!Array.isArray(ids)) throw new HttpError(422, 'Send the list of photos and videos.');
  if (ids.length > MAX_ITEMS) throw new HttpError(422, `Up to ${MAX_ITEMS} photos and videos.`);

  const clean = [];
  for (const raw of ids) {
    const id = String(raw || '');
    if (!/^[A-Za-z0-9_-]{10,64}$/.test(id)) throw new HttpError(422, 'Bad media id.');
    if (!clean.includes(id)) clean.push(id);
  }

  const owner = await one(db, `SELECT id FROM ${table} WHERE id = ?`, entityId);
  if (!owner) throw new HttpError(404, 'Not found.');

  if (clean.length) {
    const marks = clean.map(() => '?').join(', ');
    const found = await all(db, `SELECT id FROM media WHERE id IN (${marks}) AND status = 'ready'`, ...clean);
    if (found.length !== clean.length) throw new HttpError(422, 'One of the photos or videos is no longer available.');
  }

  const statements = [db.prepare('DELETE FROM media_links WHERE entity = ? AND entity_id = ?').bind(entity, entityId)];
  clean.forEach((id, i) => {
    statements.push(db.prepare('INSERT INTO media_links (entity, entity_id, media_id, sort) VALUES (?, ?, ?, ?)').bind(entity, entityId, id, i * 10));
  });
  await db.batch(statements);
  return galleryFor(db, entity, entityId);
}
