import { all, one, run, nowIso, parseJson } from './db.js';
import { todayInDubai } from './time.js';

const DEFAULTS = {
  online_booking: { enabled: false },
  payments: { stripe_enabled: false, hold_minutes: 30, reservation_hold_hours: 48 },
  business: { name: 'Treasure Island', whatsapp: '971504738452', phone: '+97143827333' },
  opening_hours: { days: Array.from({ length: 7 }, () => ({ open: '10:00', close: '22:00' })) },
  closures: { items: [] },
  notifications: { email: null },
};
export const SETTING_KEYS = Object.keys(DEFAULTS);

export async function getSettings(db) {
  const rows = await all(db, 'SELECT key, value FROM settings');
  const out = structuredClone(DEFAULTS);
  for (const { key, value } of rows) {
    if (key in out) out[key] = { ...out[key], ...parseJson(value, {}) };
  }
  return out;
}

export async function saveSetting(db, key, value) {
  await run(db,
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    key, JSON.stringify(value), nowIso());
}

// Online card payment is only offered when the admin switch is on AND both
// Stripe secrets exist, so flipping the switch early can never break checkout.
export const stripeReady = (env, settings) =>
  !!(settings.payments.stripe_enabled && env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET);

export async function activeAnnouncement(db) {
  const now = nowIso();
  return one(db,
    `SELECT id, message, link_url, link_label, tone FROM announcements
      WHERE active = 1 AND (starts_at IS NULL OR starts_at <= ?) AND (ends_at IS NULL OR ends_at > ?)
      ORDER BY id DESC LIMIT 1`, now, now);
}

export async function publicConfig(env) {
  const settings = await getSettings(env.DB);
  const today = todayInDubai();
  return {
    booking: { enabled: !!settings.online_booking.enabled },
    payments: { online: stripeReady(env, settings) },
    business: { whatsapp: settings.business.whatsapp, phone: settings.business.phone },
    hours: settings.opening_hours.days,
    closures: (settings.closures.items || []).filter((c) => c && c.date >= today).slice(0, 20),
    announcement: await activeAnnouncement(env.DB),
  };
}
