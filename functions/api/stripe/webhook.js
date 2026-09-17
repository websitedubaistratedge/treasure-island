import { json } from '../../../src/lib/http.js';
import { one, run } from '../../../src/lib/db.js';
import { verifyStripeSignature } from '../../../src/lib/stripe.js';
import { fulfilOrder } from '../../../src/lib/orders.js';
import { audit } from '../../../src/lib/auth.js';

export async function onRequestPost({ request, env }) {
  const raw = await request.text();
  const ok = await verifyStripeSignature(env.STRIPE_WEBHOOK_SECRET, raw, request.headers.get('stripe-signature'));
  if (!ok) return json({ error: 'Invalid signature.' }, 400);

  const event = JSON.parse(raw);
  const first = await run(env.DB, 'INSERT OR IGNORE INTO stripe_events (id, type) VALUES (?, ?)', event.id, event.type);
  if (!first.meta || first.meta.changes === 0) return json({ received: true, duplicate: true });

  try {
    const session = event.data && event.data.object;
    const ref = session && (session.client_reference_id || (session.metadata && session.metadata.order_ref));
    const order = ref && await one(env.DB, 'SELECT id, status FROM orders WHERE ref = ?', ref);
    if (!order) return json({ received: true, ignored: 'no matching order' });

    if (event.type === 'checkout.session.completed' && session.payment_status === 'paid') {
      await fulfilOrder(env, order.id, {
        method: 'stripe', paidFils: session.amount_total || 0,
        stripeSessionId: session.id, stripePaymentIntent: session.payment_intent || null,
      });
      await audit(env, null, 'order.paid_online', 'order', order.id, { stripe_session: session.id });
    } else if (event.type === 'checkout.session.expired' && order.status === 'awaiting_payment') {
      await run(env.DB, "UPDATE orders SET status = 'expired', hold_expires_at = NULL, updated_at = ? WHERE id = ?", new Date().toISOString(), order.id);
      await run(env.DB, "UPDATE vouchers SET status = 'void' WHERE order_id = ? AND status = 'pending'", order.id);
      await run(env.DB, "UPDATE passes SET status = 'void' WHERE order_id = ? AND status = 'pending'", order.id);
    }
    return json({ received: true });
  } catch (err) {
    // Let Stripe retry: forget the event so the retry is processed.
    await run(env.DB, 'DELETE FROM stripe_events WHERE id = ?', event.id);
    console.error('webhook failed', err);
    return json({ error: 'Processing failed.' }, 500);
  }
}
