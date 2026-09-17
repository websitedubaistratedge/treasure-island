import { HttpError } from './http.js';

// Dubai is UTC+4 all year. Staff type local times; the database stores UTC.
export const DUBAI_OFFSET_MIN = 240;

export function dubaiDate(date = new Date()) {
  return new Date(date.getTime() + DUBAI_OFFSET_MIN * 60000);
}

// "2026-09-20", "10:30" (Dubai) -> "2026-09-20T06:30:00.000Z"
export function dubaiToUtcIso(day, time) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day || '')) throw new HttpError(422, 'Date must be YYYY-MM-DD.', { field: 'date' });
  if (!/^\d{2}:\d{2}$/.test(time || '')) throw new HttpError(422, 'Time must be HH:MM.', { field: 'time' });
  const [y, m, d] = day.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  if (hh > 23 || mm > 59) throw new HttpError(422, 'Time must be HH:MM.', { field: 'time' });
  const utc = Date.UTC(y, m - 1, d, hh, mm) - DUBAI_OFFSET_MIN * 60000;
  const check = new Date(utc + DUBAI_OFFSET_MIN * 60000);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) {
    throw new HttpError(422, 'That date does not exist.', { field: 'date' });
  }
  return new Date(utc).toISOString();
}

export function addDays(day, n) {
  const [y, m, d] = day.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

// 0 = Sunday ... 6 = Saturday, for a YYYY-MM-DD calendar day.
export function weekday(day) {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function todayInDubai() {
  return dubaiDate().toISOString().slice(0, 10);
}

export function isIso(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

export function addMinutesIso(minutes, from = new Date()) {
  return new Date(from.getTime() + minutes * 60000).toISOString();
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// "Sat 20 Sep, 10:00". Built from fixed names rather than Intl, whose month
// abbreviations differ between ICU versions ("Sep" vs "Sept").
export function formatDubai(iso) {
  const d = dubaiDate(new Date(iso));
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}, ${hh}:${mm}`;
}
