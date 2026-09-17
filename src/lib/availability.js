import { all, nowIso } from './db.js';

// Seats taken on a slot: every live order holds its seats, and an unpaid order
// only holds them until its hold expires. No cleanup job is needed; expired
// holds simply stop counting.
export const HOLDING = "'pending','awaiting_payment','paid','confirmed','completed'";

export function takenSql(slotRef) {
  return `(SELECT COALESCE(SUM(oi.qty), 0) FROM order_items oi JOIN orders o ON o.id = oi.order_id
            WHERE oi.slot_id = ${slotRef} AND o.status IN (${HOLDING})
              AND (o.hold_expires_at IS NULL OR o.hold_expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now')))`;
}

export async function slotsWithAvailability(db, { offeringId = null, from = nowIso(), to = null, openOnly = true, limit = 500 } = {}) {
  const where = ['s.starts_at >= ?'];
  const params = [from];
  if (to) { where.push('s.starts_at < ?'); params.push(to); }
  if (offeringId) { where.push('s.offering_id = ?'); params.push(offeringId); }
  if (openOnly) where.push("s.status = 'open'");
  params.push(limit);
  return all(db,
    `SELECT s.id, s.offering_id, s.starts_at, s.ends_at, s.capacity, s.status, s.note,
            ${takenSql('s.id')} AS taken
       FROM slots s WHERE ${where.join(' AND ')}
      ORDER BY s.starts_at LIMIT ?`, ...params)
    .then((rows) => rows.map((r) => ({ ...r, remaining: Math.max(0, r.capacity - r.taken) })));
}
