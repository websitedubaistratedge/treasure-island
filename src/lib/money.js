import { HttpError } from './http.js';

// Accepts 150, "150", "150.5" and returns fils (integer). null/"" stay null.
export function toFils(value, field = 'price', { nullable = true } = {}) {
  if (value === null || value === undefined || value === '') {
    if (nullable) return null;
    throw new HttpError(422, `${field} is required.`, { field });
  }
  const n = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isFinite(n) || n < 0 || n > 1_000_000) {
    throw new HttpError(422, `${field} must be an amount between 0 and 1,000,000 AED.`, { field });
  }
  return Math.round(n * 100);
}

export const fromFils = (fils) => (fils == null ? null : fils / 100);

export function formatAed(fils) {
  if (fils == null) return 'Ask for price';
  const aed = fils / 100;
  return `${Number.isInteger(aed) ? aed : aed.toFixed(2)} AED`;
}
