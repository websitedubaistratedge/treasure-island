import { str, int, bool, slugify } from './validate.js';
import { toFils } from './money.js';

export function parseProduct(body, { partial }) {
  const has = (k) => Object.prototype.hasOwnProperty.call(body, k);
  const out = {};
  if (!partial || has('name')) out.name = str(body.name, 'name', { required: true, max: 120, label: 'Name' });
  if (!partial) out.slug = `${slugify(body.name)}-${Date.now().toString(36).slice(-4)}`;
  if (has('description')) out.description = str(body.description, 'description', { max: 600 }) ?? '';
  if (has('price')) out.price_fils = toFils(body.price, 'price');
  if (has('stock')) out.stock = int(body.stock, 'stock', { min: 0, max: 100000, label: 'Stock' });
  if (has('image_id')) out.image_id = str(body.image_id, 'image_id', { max: 64 });
  if (has('active')) out.active = bool(body.active) ? 1 : 0;
  if (has('featured')) out.featured = bool(body.featured) ? 1 : 0;
  // An uploaded photo replaces the built-in one.
  if (has('image_id') && out.image_id) out.image_url = null;
  return out;
}
