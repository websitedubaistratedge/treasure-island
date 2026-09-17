import { handle, json } from '../../src/lib/http.js';
import { all } from '../../src/lib/db.js';
import { slotsWithAvailability } from '../../src/lib/availability.js';

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
  return json({ offerings, slots, products }, 200, { 'cache-control': 'no-store' });
});
