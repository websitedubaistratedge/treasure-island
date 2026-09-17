import { HttpError } from './http.js';
import { hmacSha256Hex, timingSafeEqual } from './crypto.js';

const apiBase = (env) => env.STRIPE_API_BASE || 'https://api.stripe.com';

function form(obj, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === 'object' && !Array.isArray(v)) form(v, key, out);
    else if (Array.isArray(v)) v.forEach((item, i) => (typeof item === 'object' ? form(item, `${key}[${i}]`, out) : out.append(`${key}[${i}]`, String(item))));
    else out.append(key, String(v));
  }
  return out;
}

// One Checkout line for the amount due now. Deposits and gift-voucher
// discounts are already applied, and Stripe's own page lists the description.
export async function createCheckoutSession(env, { order, lines, siteUrl }) {
  const description = lines.map((l) => `${l.name}${l.qty > 1 ? ` ×${l.qty}` : ''}`).join(', ').slice(0, 480);
  const body = form({
    mode: 'payment',
    client_reference_id: order.ref,
    customer_email: order.customer_email || undefined,
    success_url: `${siteUrl}/order?ref=${order.ref}&t=${order.access_token}&paid=1`,
    cancel_url: `${siteUrl}/order?ref=${order.ref}&t=${order.access_token}&cancelled=1`,
    expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
    metadata: { order_ref: order.ref },
    payment_intent_data: { metadata: { order_ref: order.ref }, description: `Treasure Island ${order.ref}` },
    line_items: [{
      quantity: 1,
      price_data: { currency: 'aed', unit_amount: order.due_now_fils, product_data: { name: `Treasure Island · ${order.ref}`, description } },
    }],
  });
  const res = await fetch(`${apiBase(env)}/v1/checkout/sessions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.url) {
    console.error('stripe checkout failed', res.status, data && data.error && data.error.message);
    throw new HttpError(502, 'Online payment is temporarily unavailable. Your booking was not charged.');
  }
  return data;
}

// Verifies Stripe's signature: HMAC-SHA256 of "<timestamp>.<raw body>" must
// match one of the v1 signatures, and the timestamp must be recent.
export async function verifyStripeSignature(secret, rawBody, header, toleranceSec = 300, nowSec = Math.floor(Date.now() / 1000)) {
  if (!secret || !header) return false;
  const parts = header.split(',').map((p) => p.trim().split('='));
  const t = Number((parts.find(([k]) => k === 't') || [])[1]);
  const sigs = parts.filter(([k]) => k === 'v1').map(([, v]) => v);
  if (!Number.isFinite(t) || !sigs.length) return false;
  if (Math.abs(nowSec - t) > toleranceSec) return false;
  const expected = await hmacSha256Hex(secret, `${t}.${rawBody}`);
  return sigs.some((s) => timingSafeEqual(s, expected));
}
