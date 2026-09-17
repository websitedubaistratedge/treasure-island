import { handle, json, readJson, HttpError } from '../../../src/lib/http.js';
import { getSettings, saveSetting } from '../../../src/lib/settings.js';
import { audit, requireRole } from '../../../src/lib/auth.js';
import { bool, int, str, email, phone } from '../../../src/lib/validate.js';

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export const onRequestGet = handle(async ({ env }) => json({
  settings: await getSettings(env.DB),
  env: {
    stripeKeys: !!(env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET),
    stripeTestMode: String(env.STRIPE_SECRET_KEY || '').startsWith('sk_test_'),
    emailConfigured: !!(env.RESEND_API_KEY && env.EMAIL_FROM),
  },
}));

// Each setting is validated on its own shape; payments are owner-only.
export const onRequestPut = handle(async ({ request, env, data }) => {
  requireRole(data.admin, 'manager');
  const { key, value } = await readJson(request);
  let clean;
  if (key === 'online_booking') {
    clean = { enabled: bool(value && value.enabled) };
  } else if (key === 'payments') {
    requireRole(data.admin, 'owner');
    clean = {
      stripe_enabled: bool(value && value.stripe_enabled),
      hold_minutes: int(value && value.hold_minutes, 'hold_minutes', { required: true, min: 31, max: 1440, label: 'Payment hold' }),
      reservation_hold_hours: int(value && value.reservation_hold_hours, 'reservation_hold_hours', { required: true, min: 1, max: 720, label: 'Reservation hold' }),
    };
  } else if (key === 'business') {
    const wa = str(value && value.whatsapp, 'whatsapp', { required: true, max: 20, label: 'WhatsApp number' }).replace(/\D/g, '');
    if (!/^\d{8,15}$/.test(wa)) throw new HttpError(422, 'WhatsApp number must be digits with country code, e.g. 971504738452.', { field: 'whatsapp' });
    clean = { name: str(value.name, 'name', { required: true, max: 80 }), whatsapp: wa, phone: phone(value.phone, 'phone') };
  } else if (key === 'opening_hours') {
    const days = value && Array.isArray(value.days) ? value.days : [];
    if (days.length !== 7) throw new HttpError(422, 'Provide hours for all 7 days.');
    clean = { days: days.map((d, i) => {
      if (d.closed) return { closed: true };
      if (!TIME.test(d.open) || !TIME.test(d.close) || d.close <= d.open) throw new HttpError(422, 'Each day needs an opening time before its closing time.', { field: `days.${i}` });
      return { open: d.open, close: d.close };
    }) };
  } else if (key === 'closures') {
    const items = value && Array.isArray(value.items) ? value.items.slice(0, 60) : [];
    clean = { items: items.map((c, i) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(c.date || '')) throw new HttpError(422, 'Each closure needs a date.', { field: `items.${i}.date` });
      const item = { date: c.date, label: str(c.label, `items.${i}.label`, { max: 80 }) || 'Special hours' };
      if (c.closed) item.closed = true;
      else if (TIME.test(c.open || '') && TIME.test(c.close || '') && c.close > c.open) { item.open = c.open; item.close = c.close; }
      else throw new HttpError(422, 'Special hours need an opening time before the closing time, or mark the day closed.', { field: `items.${i}` });
      return item;
    }).sort((a, b) => a.date.localeCompare(b.date)) };
  } else if (key === 'notifications') {
    clean = { email: email(value && value.email, 'email') };
  } else {
    throw new HttpError(422, 'Unknown setting.');
  }
  await saveSetting(env.DB, key, clean);
  await audit(env, data.admin.id, 'settings.update', 'settings', key, clean, data.ip);
  return json({ settings: await getSettings(env.DB) });
});
