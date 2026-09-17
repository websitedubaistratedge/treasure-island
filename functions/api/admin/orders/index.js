import { handle, json, readJson } from '../../../../src/lib/http.js';
import { all, one } from '../../../../src/lib/db.js';
import { audit } from '../../../../src/lib/auth.js';
import { parseCustomer, priceCart, createOrder, fulfilOrder, expireStaleOrders } from '../../../../src/lib/orders.js';
import { str, int, oneOf } from '../../../../src/lib/validate.js';
import { toFils } from '../../../../src/lib/money.js';

const STATUSES = ['pending', 'awaiting_payment', 'paid', 'confirmed', 'completed', 'cancelled', 'refunded', 'expired'];

export const onRequestGet = handle(async ({ request, env }) => {
  await expireStaleOrders(env.DB);
  const q = new URL(request.url).searchParams;
  const where = [];
  const params = [];
  const status = q.get('status');
  if (status === 'open') where.push("o.status IN ('pending','awaiting_payment')");
  else if (status && STATUSES.includes(status)) { where.push('o.status = ?'); params.push(status); }
  const search = (q.get('q') || '').trim();
  if (search) {
    where.push('(o.ref LIKE ? OR o.customer_name LIKE ? OR o.customer_phone LIKE ? OR o.customer_email LIKE ?)');
    const like = `%${search.replace(/[%_]/g, '')}%`;
    params.push(like, like, like, like);
  }
  const slot = int(q.get('slot'), 'slot', { min: 1 });
  if (slot) { where.push('EXISTS (SELECT 1 FROM order_items x WHERE x.order_id = o.id AND x.slot_id = ?)'); params.push(slot); }
  const page = int(q.get('page') || 1, 'page', { min: 1, max: 10000 });
  const size = 25;
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [rows, count] = await Promise.all([
    all(env.DB, `SELECT o.id, o.ref, o.status, o.channel, o.customer_name, o.customer_phone, o.total_fils, o.paid_fils,
                        o.due_now_fils, o.created_at, o.hold_expires_at,
                        (SELECT GROUP_CONCAT(name, ' | ') FROM order_items WHERE order_id = o.id) AS summary
                   FROM orders o ${clause} ORDER BY o.id DESC LIMIT ? OFFSET ?`, ...params, size, (page - 1) * size),
    one(env.DB, `SELECT COUNT(*) AS n FROM orders o ${clause}`, ...params),
  ]);
  return json({ rows, total: count.n, page, pages: Math.max(1, Math.ceil(count.n / size)) });
});

// A booking taken at the desk or on the phone.
export const onRequestPost = handle(async ({ request, env, data }) => {
  const body = await readJson(request);
  const customer = parseCustomer(body.customer);
  const pricing = await priceCart(env.DB, body.items, { voucherCode: body.voucherCode || null });
  const status = oneOf(body.status || 'confirmed', 'status', ['pending', 'confirmed']);
  // Always written as pending first, then fulfilled: fulfilOrder skips orders
  // that are already confirmed, so creating one as "confirmed" would silently
  // drop the payment and never activate its passes, vouchers or stock.
  const order = await createOrder(env, {
    customer, pricing, channel: 'desk', status: 'pending', createdBy: data.admin.id,
    internalNotes: str(body.internal_notes, 'internal_notes', { max: 2000 }),
  });
  let result = order;
  if (body.payment && body.payment.method) {
    const method = oneOf(body.payment.method, 'payment.method', ['cash', 'card', 'bank', 'other']);
    const paidFils = toFils(body.payment.amount, 'payment.amount', { nullable: false });
    result = await fulfilOrder(env, order.id, { method, paidFils, adminId: data.admin.id });
  } else if (status === 'confirmed') {
    result = await fulfilOrder(env, order.id, { method: null, paidFils: 0, adminId: data.admin.id });
  }
  await audit(env, data.admin.id, 'order.create', 'order', order.id, { ref: order.ref }, data.ip);
  return json({ order: result }, 201);
});
