import { handle, json } from '../../../src/lib/http.js';
import { all, one } from '../../../src/lib/db.js';
import { HOLDING, slotsWithAvailability } from '../../../src/lib/availability.js';
import { expireStaleOrders } from '../../../src/lib/orders.js';
import { todayInDubai, dubaiToUtcIso, addDays } from '../../../src/lib/time.js';

export const onRequestGet = handle(async ({ env }) => {
  const db = env.DB;
  await expireStaleOrders(db);
  const today = todayInDubai();
  const dayStart = dubaiToUtcIso(today, '00:00');
  const dayEnd = dubaiToUtcIso(addDays(today, 1), '00:00');
  const from30 = dubaiToUtcIso(addDays(today, -29), '00:00');
  const weekEnd = dubaiToUtcIso(addDays(today, 7), '00:00');

  const [revenueRows, todayRow, pendingRow, enquiriesRow, passesRow, vouchersRow, upcoming, recent, lowStock, kinds] = await Promise.all([
    // Paid money per Dubai calendar day for the last 30 days.
    all(db, `SELECT substr(strftime('%Y-%m-%dT%H:%M:%fZ', paid_at, '+4 hours'), 1, 10) AS day, SUM(paid_fils) AS fils, COUNT(*) AS orders
               FROM orders WHERE paid_at >= ? AND status IN ('paid','confirmed','completed') GROUP BY day ORDER BY day`, from30),
    one(db, `SELECT COUNT(DISTINCT o.id) AS bookings, COALESCE(SUM(oi.qty), 0) AS guests
               FROM order_items oi JOIN orders o ON o.id = oi.order_id JOIN slots s ON s.id = oi.slot_id
              WHERE s.starts_at >= ? AND s.starts_at < ? AND o.status IN (${HOLDING})
                AND (o.hold_expires_at IS NULL OR o.hold_expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now'))`, dayStart, dayEnd),
    one(db, "SELECT COUNT(*) AS n FROM orders WHERE status IN ('pending','awaiting_payment')"),
    one(db, "SELECT COUNT(*) AS n FROM enquiries WHERE status = 'new'"),
    one(db, "SELECT COUNT(*) AS n FROM passes WHERE status = 'active'"),
    one(db, "SELECT COUNT(*) AS n, COALESCE(SUM(balance_fils), 0) AS balance FROM vouchers WHERE status = 'active'"),
    slotsWithAvailability(db, { to: weekEnd, limit: 40 }),
    all(db, 'SELECT id, ref, status, channel, customer_name, total_fils, paid_fils, created_at FROM orders ORDER BY id DESC LIMIT 8'),
    all(db, 'SELECT id, name, stock FROM products WHERE active = 1 AND stock IS NOT NULL AND stock <= 3 ORDER BY stock LIMIT 6'),
    all(db, `SELECT oi.kind AS kind, COALESCE(o2.kind, oi.kind) AS sub, SUM(oi.line_fils) AS fils
               FROM order_items oi JOIN orders o ON o.id = oi.order_id LEFT JOIN offerings o2 ON o2.id = oi.offering_id
              WHERE o.paid_at >= ? AND o.status IN ('paid','confirmed','completed') GROUP BY sub`, from30),
  ]);

  const offeringNames = Object.fromEntries((await all(db, 'SELECT id, name FROM offerings')).map((o) => [o.id, o.name]));
  const byDay = Object.fromEntries(revenueRows.map((r) => [r.day, r]));
  const series = Array.from({ length: 30 }, (_, i) => {
    const day = addDays(today, i - 29);
    return { day, fils: byDay[day] ? byDay[day].fils : 0, orders: byDay[day] ? byDay[day].orders : 0 };
  });
  const revenue30 = series.reduce((s, d) => s + d.fils, 0);
  const revenue7 = series.slice(-7).reduce((s, d) => s + d.fils, 0);
  const prev7 = series.slice(-14, -7).reduce((s, d) => s + d.fils, 0);

  return json({
    today,
    kpis: {
      revenue7, revenue30, revenue7Change: prev7 ? (revenue7 - prev7) / prev7 : null,
      bookingsToday: todayRow.bookings, guestsToday: todayRow.guests,
      pending: pendingRow.n, newEnquiries: enquiriesRow.n,
      activePasses: passesRow.n, activeVouchers: vouchersRow.n, voucherBalance: vouchersRow.balance,
    },
    series,
    mix: kinds.map((k) => ({ label: k.sub, fils: k.fils })),
    upcoming: upcoming.slice(0, 12).map((s) => ({ ...s, offering: offeringNames[s.offering_id] })),
    recent, lowStock,
  });
});
