import { handle, HttpError } from '../../../../src/lib/http.js';
import { all } from '../../../../src/lib/db.js';
import { requireRole, audit } from '../../../../src/lib/auth.js';

const cell = (v) => {
  const s = v == null ? '' : String(v);
  // Neutralise spreadsheet formulas and quote everything.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
};

export const onRequestGet = handle(async ({ env, data }) => {
  requireRole(data.admin, 'manager');
  const rows = await all(env.DB, `SELECT o.ref, o.status, o.channel, o.customer_name, o.customer_phone, o.customer_email,
      o.total_fils, o.paid_fils, o.payment_method, o.created_at, o.paid_at,
      (SELECT GROUP_CONCAT(name || ' x' || qty, ' | ') FROM order_items WHERE order_id = o.id) AS items
    FROM orders o ORDER BY o.id DESC LIMIT 20000`);
  if (!rows) throw new HttpError(500, 'Export failed.');
  const header = ['Reference', 'Status', 'Channel', 'Customer', 'Phone', 'Email', 'Total AED', 'Paid AED', 'Method', 'Created (UTC)', 'Paid (UTC)', 'Items'];
  const lines = [header.map(cell).join(',')].concat(rows.map((r) => [
    r.ref, r.status, r.channel, r.customer_name, r.customer_phone, r.customer_email,
    (r.total_fils / 100).toFixed(2), (r.paid_fils / 100).toFixed(2), r.payment_method, r.created_at, r.paid_at, r.items,
  ].map(cell).join(',')));
  await audit(env, data.admin.id, 'order.export', 'order', null, { rows: rows.length }, data.ip);
  return new Response('﻿' + lines.join('\r\n'), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="treasure-island-orders-${new Date().toISOString().slice(0, 10)}.csv"`,
      'cache-control': 'no-store',
    },
  });
});
