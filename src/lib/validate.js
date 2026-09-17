import { HttpError } from './http.js';

const fail = (field, message) => { throw new HttpError(422, message, { field }); };

export function str(value, field, { required = false, min = 0, max = 500, label = field } = {}) {
  if (value === undefined || value === null) value = '';
  if (typeof value !== 'string' && typeof value !== 'number') fail(field, `${label} is invalid.`);
  const s = String(value).trim();
  if (!s) {
    if (required) fail(field, `${label} is required.`);
    return null;
  }
  if (s.length < min) fail(field, `${label} must be at least ${min} characters.`);
  if (s.length > max) fail(field, `${label} must be at most ${max} characters.`);
  return s;
}

export function int(value, field, { required = false, min = -1e9, max = 1e9, label = field } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) fail(field, `${label} is required.`);
    return null;
  }
  const n = Number(value);
  if (!Number.isInteger(n)) fail(field, `${label} must be a whole number.`);
  if (n < min || n > max) fail(field, `${label} must be between ${min} and ${max}.`);
  return n;
}

export const bool = (value) => value === true || value === 1 || value === '1' || value === 'true';

export function oneOf(value, field, options, { required = true, label = field } = {}) {
  if ((value === undefined || value === null || value === '') && !required) return null;
  if (!options.includes(value)) fail(field, `${label} must be one of: ${options.join(', ')}.`);
  return value;
}

export function email(value, field = 'email', { required = false } = {}) {
  const s = str(value, field, { required, max: 254, label: 'Email' });
  if (s && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s)) fail(field, 'Email looks invalid.');
  return s ? s.toLowerCase() : null;
}

// Keeps a + and digits. UAE local mobiles (05x...) become +9715x...
export function phone(value, field = 'phone', { required = true } = {}) {
  const s = str(value, field, { required, max: 32, label: 'Phone' });
  if (!s) return null;
  let digits = s.replace(/[^\d+]/g, '');
  if (digits.startsWith('00')) digits = '+' + digits.slice(2);
  if (/^0\d{8,9}$/.test(digits)) digits = '+971' + digits.slice(1);
  if (!digits.startsWith('+')) digits = '+' + digits;
  if (!/^\+\d{8,15}$/.test(digits)) fail(field, 'Phone number looks invalid.');
  return digits;
}

export function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'item';
}

export function url(value, field, { required = false } = {}) {
  const s = str(value, field, { required, max: 500, label: 'Link' });
  if (!s) return null;
  if (s.startsWith('/') && !s.startsWith('//')) return s;
  try {
    const u = new URL(s);
    if (u.protocol === 'https:' || u.protocol === 'http:') return u.toString();
  } catch { /* fall through */ }
  fail(field, 'Link must start with https:// or /.');
}
