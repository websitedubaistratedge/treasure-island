import { handle, json, readJson, HttpError } from '../../../../src/lib/http.js';
import { one, all, run } from '../../../../src/lib/db.js';
import { audit, requireRole } from '../../../../src/lib/auth.js';
import { HOLDING, takenSql } from '../../../../src/lib/availability.js';
import { int, str, oneOf } from '../../../../src/lib/validate.js';
import { dubaiToUtcIso } from '../../../../src/lib/time.js';

async function slot(env, id) {
  const row = await one(env.DB, `SELECT s.*, ${takenSql('s.id')} AS taken, o.name AS offering, o.kind
                                  FROM slots s JOIN offerings o ON o.id = s.offering_id WHERE s.id = ?`, id);
  if (!row) throw new HttpError(404, 'Session not found.');
  return row;
}

// The session plus everyone booked into it: the class list for the day.
export const onRequestGet = handle(async ({ env, params }) => {
  const id = int(params.id, 'id', { required: true, min: 1 });
  const row = await slot(env, id);
  const attendees = await all(env.DB, `SELECT o.id AS order_id, o.ref, o.status, o.customer_name, o.customer_phone, oi.qty, oi.meta
      FROM order_items oi JOIN orders o ON o.id = oi.order_id
     WHERE oi.slot_id = ? AND o.status IN (${HOLDING})
       AND (o.hold_expires_at IS NULL OR o.hold_expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now'))
     ORDER BY o.id`, id);
  return json({ slot: { ...row, remaining: Math.max(0, row.capacity - row.taken) },
    attendees: attendees.map((a) => ({ ...a, children: JSON.parse(a.meta || '{}').children || [], meta: undefined })) });
});

export const onRequestPatch = handle(async ({ request, env, params, data }) => {
  requireRole(data.admin, 'manager');
  const id = int(params.id, 'id', { required: true, min: 1 });
  const current = await slot(env, id);
  const body = await readJson(request);
  const sets = [];
  const vals = [];
  if ('capacity' in body) {
    const cap = int(body.capacity, 'capacity', { required: true, min: 0, max: 1000, label: 'Capacity' });
    if (cap < current.taken) throw new HttpError(422, `${current.taken} places are already booked, so capacity cannot go below that.`, { field: 'capacity' });
    sets.push('capacity = ?'); vals.push(cap);
  }
  if ('status' in body) { sets.push('status = ?'); vals.push(oneOf(body.status, 'status', ['open', 'closed', 'cancelled'])); }
  if ('note' in body) { sets.push('note = ?'); vals.push(str(body.note, 'note', { max: 200 })); }
  if ('date' in body) {
    const s = dubaiToUtcIso(body.date, body.start);
    const e = dubaiToUtcIso(body.date, body.end);
    if (e <= s) throw new HttpError(422, 'End time must be after start time.', { field: 'end' });
    sets.push('starts_at = ?', 'ends_at = ?'); vals.push(s, e);
  }
  if (!sets.length) throw new HttpError(422, 'Nothing to update.');
  await run(env.DB, `UPDATE slots SET ${sets.join(', ')} WHERE id = ?`, ...vals, id);
  await audit(env, data.admin.id, 'slot.update', 'slot', id, body, data.ip);
  return json({ slot: await slot(env, id) });
});

export const onRequestDelete = handle(async ({ env, params, data }) => {
  requireRole(data.admin, 'manager');
  const id = int(params.id, 'id', { required: true, min: 1 });
  const used = await one(env.DB, 'SELECT COUNT(*) AS n FROM order_items WHERE slot_id = ?', id);
  if (used.n > 0) throw new HttpError(409, 'This session has bookings. Close or cancel it instead of deleting.');
  await run(env.DB, 'DELETE FROM slots WHERE id = ?', id);
  await audit(env, data.admin.id, 'slot.delete', 'slot', id, null, data.ip);
  return json({ deleted: true });
});
