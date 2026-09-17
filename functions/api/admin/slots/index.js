import { handle, json, readJson, HttpError } from '../../../../src/lib/http.js';
import { all, one } from '../../../../src/lib/db.js';
import { audit, requireRole } from '../../../../src/lib/auth.js';
import { slotsWithAvailability } from '../../../../src/lib/availability.js';
import { int, str } from '../../../../src/lib/validate.js';
import { dubaiToUtcIso, addDays, weekday, isIso } from '../../../../src/lib/time.js';

export const onRequestGet = handle(async ({ request, env }) => {
  const q = new URL(request.url).searchParams;
  const from = isIso(q.get('from')) ? q.get('from') : new Date(Date.now() - 86400000).toISOString();
  const to = isIso(q.get('to')) ? q.get('to') : new Date(Date.now() + 35 * 86400000).toISOString();
  const offeringId = int(q.get('offering'), 'offering', { min: 1 });
  const rows = await slotsWithAvailability(env.DB, { offeringId, from, to, openOnly: false, limit: 1000 });
  const names = Object.fromEntries((await all(env.DB, 'SELECT id, name, kind FROM offerings')).map((o) => [o.id, o]));
  return json({ rows: rows.map((r) => ({ ...r, offering: names[r.offering_id] && names[r.offering_id].name, kind: names[r.offering_id] && names[r.offering_id].kind })) });
});

// Creates one or many sessions. Recurring form: every chosen weekday between
// two dates, at each of the given times.
export const onRequestPost = handle(async ({ request, env, data }) => {
  requireRole(data.admin, 'manager');
  const body = await readJson(request);
  const offeringId = int(body.offeringId, 'offeringId', { required: true, min: 1, label: 'Offering' });
  const offering = await one(env.DB, 'SELECT id, kind FROM offerings WHERE id = ?', offeringId);
  if (!offering) throw new HttpError(422, 'Choose what this session is for.', { field: 'offeringId' });
  if (offering.kind === 'pass') throw new HttpError(422, 'Passes do not have sessions.', { field: 'offeringId' });
  const capacity = int(body.capacity, 'capacity', { required: true, min: 1, max: 1000, label: 'Capacity' });
  const note = str(body.note, 'note', { max: 200 });
  const times = Array.isArray(body.times) ? body.times : [];
  if (!times.length) throw new HttpError(422, 'Add at least one time.', { field: 'times' });

  const startDate = str(body.startDate, 'startDate', { required: true, max: 10, label: 'Start date' });
  const endDate = str(body.endDate || body.startDate, 'endDate', { required: true, max: 10, label: 'End date' });
  const weekdays = Array.isArray(body.weekdays) && body.weekdays.length ? body.weekdays.map(Number) : null;

  const entries = [];
  for (let day = startDate, guard = 0; day <= endDate; day = addDays(day, 1), guard++) {
    if (guard > 400) throw new HttpError(422, 'Keep the range under 400 days.', { field: 'endDate' });
    if (weekdays && !weekdays.includes(weekday(day))) continue;
    for (const t of times) {
      const starts = dubaiToUtcIso(day, t.start);
      const ends = dubaiToUtcIso(day, t.end);
      if (ends <= starts) throw new HttpError(422, 'End time must be after start time.', { field: 'times' });
      entries.push([starts, ends]);
    }
  }
  if (!entries.length) throw new HttpError(422, 'Those dates and weekdays produce no sessions.', { field: 'weekdays' });
  if (entries.length > 600) throw new HttpError(422, 'That would create more than 600 sessions. Use a shorter range.', { field: 'endDate' });

  const stmt = env.DB.prepare('INSERT INTO slots (offering_id, starts_at, ends_at, capacity, note) VALUES (?, ?, ?, ?, ?)');
  for (let i = 0; i < entries.length; i += 100) {
    await env.DB.batch(entries.slice(i, i + 100).map(([s, e]) => stmt.bind(offeringId, s, e, capacity, note)));
  }
  await audit(env, data.admin.id, 'slot.create', 'offering', offeringId, { count: entries.length }, data.ip);
  return json({ created: entries.length }, 201);
});
