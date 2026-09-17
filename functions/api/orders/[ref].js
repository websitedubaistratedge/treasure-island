import { handle, json, HttpError } from '../../../src/lib/http.js';
import { one } from '../../../src/lib/db.js';
import { timingSafeEqual } from '../../../src/lib/crypto.js';
import { orderDetail } from '../../../src/lib/orders.js';

// A customer's own order page. The ref alone is not enough: the unguessable
// token from their confirmation link is required too.
export const onRequestGet = handle(async ({ request, env, params }) => {
  const token = new URL(request.url).searchParams.get('t') || '';
  const row = await one(env.DB, 'SELECT id, access_token FROM orders WHERE ref = ?', String(params.ref || '').toUpperCase());
  if (!row || !timingSafeEqual(token, row.access_token)) throw new HttpError(404, 'Order not found.');
  const { order, items, vouchers, passes } = await orderDetail(env.DB, row.id);
  const live = ['paid', 'confirmed', 'completed'].includes(order.status);
  return json({
    ref: order.ref, status: order.status, created_at: order.created_at, customer_name: order.customer_name,
    subtotal_fils: order.subtotal_fils, discount_fils: order.discount_fils, total_fils: order.total_fils,
    due_now_fils: order.due_now_fils, paid_fils: order.paid_fils, hold_expires_at: order.hold_expires_at,
    items: items.map((i) => ({ name: i.name, qty: i.qty, line_fils: i.line_fils, kind: i.kind, children: i.meta.children || [] })),
    vouchers: live ? vouchers.map((v) => ({ code: v.code, balance_fils: v.balance_fils, recipient_name: v.recipient_name, expires_at: v.expires_at, status: v.status })) : [],
    passes: live ? passes.map((p) => ({ code: p.code, name: p.name, visits_total: p.visits_total, visits_used: p.visits_used, expires_at: p.expires_at, status: p.status })) : [],
  });
});
