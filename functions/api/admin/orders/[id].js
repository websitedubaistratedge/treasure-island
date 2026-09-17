import { handle, json, readJson, HttpError } from '../../../../src/lib/http.js';
import { run, nowIso } from '../../../../src/lib/db.js';
import { audit, requireRole } from '../../../../src/lib/auth.js';
import { orderDetail, fulfilOrder, cancelOrder } from '../../../../src/lib/orders.js';
import { str, int, oneOf } from '../../../../src/lib/validate.js';
import { toFils } from '../../../../src/lib/money.js';

async function load(env, params) {
  const id = int(params.id, 'id', { required: true, min: 1 });
  const detail = await orderDetail(env.DB, id);
  if (!detail) throw new HttpError(404, 'Order not found.');
  return detail;
}

export const onRequestGet = handle(async ({ env, params }) => json(await load(env, params)));

export const onRequestPatch = handle(async ({ request, env, params, data }) => {
  const { order } = await load(env, params);
  const body = await readJson(request);
  const action = oneOf(body.action, 'action', ['confirm', 'mark_paid', 'complete', 'cancel', 'refund', 'notes']);
  const now = nowIso();

  if (action === 'notes') {
    await run(env.DB, 'UPDATE orders SET internal_notes = ?, updated_at = ? WHERE id = ?',
      str(body.internal_notes, 'internal_notes', { max: 4000 }), now, order.id);
  } else if (action === 'confirm') {
    await fulfilOrder(env, order.id, { method: null, paidFils: 0, adminId: data.admin.id });
  } else if (action === 'mark_paid') {
    const method = oneOf(body.method, 'method', ['cash', 'card', 'bank', 'other']);
    const paidFils = toFils(body.amount, 'amount', { nullable: false });
    if (['paid', 'confirmed', 'completed'].includes(order.status)) {
      await run(env.DB, `UPDATE orders SET paid_fils = paid_fils + ?, payment_method = ?, paid_at = COALESCE(paid_at, ?),
                          status = CASE WHEN status = 'confirmed' THEN 'paid' ELSE status END, updated_at = ? WHERE id = ?`,
        paidFils, method, now, now, order.id);
    } else {
      await fulfilOrder(env, order.id, { method, paidFils, adminId: data.admin.id });
    }
  } else if (action === 'complete') {
    await run(env.DB, "UPDATE orders SET status = 'completed', updated_at = ? WHERE id = ? AND status IN ('paid','confirmed')", now, order.id);
  } else if (action === 'cancel') {
    await cancelOrder(env, order.id, { status: 'cancelled' });
  } else if (action === 'refund') {
    requireRole(data.admin, 'manager');
    await cancelOrder(env, order.id, { status: 'refunded' });
  }
  await audit(env, data.admin.id, `order.${action}`, 'order', order.id, { ref: order.ref }, data.ip);
  return json(await orderDetail(env.DB, order.id));
});
