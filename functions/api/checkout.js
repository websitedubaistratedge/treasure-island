import { handle, json, readJson, clientIp, assertSameOrigin, HttpError } from '../../src/lib/http.js';
import { rateLimit } from '../../src/lib/ratelimit.js';
import { getSettings, stripeReady } from '../../src/lib/settings.js';
import { parseCustomer, priceCart, createOrder, fulfilOrder, expireStaleOrders, whatsappReservationUrl } from '../../src/lib/orders.js';
import { createCheckoutSession } from '../../src/lib/stripe.js';
import { run } from '../../src/lib/db.js';
import { addMinutesIso } from '../../src/lib/time.js';
import { sendEmail } from '../../src/lib/email.js';

export const onRequestPost = handle(async ({ request, env }) => {
  assertSameOrigin(request);
  const settings = await getSettings(env.DB);
  if (!settings.online_booking.enabled) throw new HttpError(403, 'Online booking is not open yet. Please book on WhatsApp.');
  await rateLimit(env.DB, `checkout:${clientIp(request)}`, 30, 3600);

  const body = await readJson(request);
  const customer = parseCustomer(body.customer);
  await expireStaleOrders(env.DB);
  const pricing = await priceCart(env.DB, body.items, { voucherCode: body.voucherCode || null });
  const siteUrl = env.SITE_URL || new URL(request.url).origin;
  const online = stripeReady(env, settings) && pricing.priced;

  if (online) {
    const order = await createOrder(env, {
      customer, pricing, channel: 'online', status: 'awaiting_payment',
      holdUntil: addMinutesIso(settings.payments.hold_minutes || 30),
    });
    if (order.due_now_fils <= 0) {
      const done = await fulfilOrder(env, order.id, { method: 'voucher', paidFils: 0 });
      return json({ ref: done.ref, token: done.access_token, status: done.status });
    }
    const session = await createCheckoutSession(env, { order, lines: pricing.lines, siteUrl });
    await run(env.DB, 'UPDATE orders SET stripe_session_id = ? WHERE id = ?', session.id, order.id);
    return json({ ref: order.ref, token: order.access_token, redirect: session.url });
  }

  // No online payment for this cart: reserve the seats and hand over to WhatsApp.
  const order = await createOrder(env, {
    customer, pricing, channel: 'whatsapp', status: 'pending',
    holdUntil: addMinutesIso((settings.payments.reservation_hold_hours || 48) * 60),
  });
  await sendEmail(env, {
    to: settings.notifications.email,
    subject: `New reservation ${order.ref}`,
    text: `${customer.name} (${customer.phone}) reserved online.\n\n${pricing.lines.map((l) => `- ${l.name} x${l.qty}`).join('\n')}\n\nOpen the admin panel to confirm.`,
  });
  return json({
    ref: order.ref, token: order.access_token, status: order.status,
    whatsapp: whatsappReservationUrl(settings.business.whatsapp, order, pricing.lines),
  });
});
