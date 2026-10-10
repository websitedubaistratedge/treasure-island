import { handle, json } from '../../src/lib/http.js';
import { all } from '../../src/lib/db.js';
import { slotsWithAvailability } from '../../src/lib/availability.js';
import { galleriesFor } from '../../src/lib/media.js';

// Everything the booking pages need in one request.
export const onRequestGet = handle(async ({ env }) => {
  const horizon = new Date(Date.now() + 120 * 86400000).toISOString();
  const [offerings, slots, products] = await Promise.all([
    all(env.DB, `SELECT id, slug, kind, name, summary, description, price_fils, price_unit, deposit_fils, min_age, max_age,
                        max_children, visits, validity_days, image_id, image_url
                   FROM offerings WHERE active = 1 ORDER BY sort, id`),
    slotsWithAvailability(env.DB, { to: horizon }),
    all(env.DB, 'SELECT id, name, description, price_fils, image_id, image_url, stock FROM products WHERE active = 1 ORDER BY sort, id'),
  ]);
  // Same here: a booking page without galleries is fine, one that errors is not.
  const gallery = (entity, ids) => galleriesFor(env.DB, entity, ids).catch(() => new Map());
  const [offeringMedia, productMedia] = await Promise.all([
    gallery('offering', offerings.map((o) => o.id)),
    gallery('product', products.map((p) => p.id)),
  ]);
  const withMedia = (rows, map) => rows.map((r) => ({ ...r, media: map.get(r.id) || [] }));
  return json({ offerings: withMedia(offerings, offeringMedia), slots, products: withMedia(products, productMedia) }, 200, { 'cache-control': 'no-store' });
});
