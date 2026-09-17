import { HttpError } from './http.js';
import { str, int, oneOf, bool, slugify } from './validate.js';
import { toFils } from './money.js';

// Shared by create and update; in partial mode only fields present are checked.
export function parseOffering(body, { partial }) {
  const has = (k) => Object.prototype.hasOwnProperty.call(body, k);
  const out = {};
  if (!partial || has('name')) out.name = str(body.name, 'name', { required: true, max: 120, label: 'Name' });
  if (!partial || has('kind')) out.kind = oneOf(body.kind, 'kind', ['program', 'camp', 'party', 'workshop', 'event', 'pass']);
  if (!partial) out.slug = slugify(body.slug || body.name) + '-' + Date.now().toString(36).slice(-4);
  if (has('summary')) out.summary = str(body.summary, 'summary', { max: 300 }) ?? '';
  if (has('description')) out.description = str(body.description, 'description', { max: 4000 }) ?? '';
  if (has('price')) out.price_fils = toFils(body.price, 'price');
  if (has('price_unit')) out.price_unit = oneOf(body.price_unit, 'price_unit', ['child', 'booking']);
  if (has('deposit')) out.deposit_fils = toFils(body.deposit, 'deposit');
  if (has('min_age')) out.min_age = int(body.min_age, 'min_age', { min: 0, max: 17 });
  if (has('max_age')) out.max_age = int(body.max_age, 'max_age', { min: 0, max: 17 });
  if (has('max_children')) out.max_children = int(body.max_children, 'max_children', { required: true, min: 1, max: 200, label: 'Max children' });
  if (has('visits')) out.visits = int(body.visits, 'visits', { min: 1, max: 500 });
  if (has('validity_days')) out.validity_days = int(body.validity_days, 'validity_days', { min: 1, max: 3650 });
  if (has('image_id')) out.image_id = str(body.image_id, 'image_id', { max: 64 });
  if (has('active')) out.active = bool(body.active) ? 1 : 0;
  if (has('sort')) out.sort = int(body.sort, 'sort', { min: -100000, max: 100000 }) ?? 0;
  const kind = out.kind;
  if (!partial && kind === 'pass' && !out.visits) throw new HttpError(422, 'A pass needs a number of visits.', { field: 'visits' });
  if (out.min_age != null && out.max_age != null && out.min_age > out.max_age) throw new HttpError(422, 'Minimum age is above maximum age.', { field: 'min_age' });
  return out;
}
