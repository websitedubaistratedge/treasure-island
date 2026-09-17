// End-to-end tests against a running `wrangler pages dev` with a local D1.
// Stripe is replaced by a mock server on :9999 (see .dev.vars).
//   BASE=http://127.0.0.1:8788 WRANGLER=/path/to/wrangler node --test tests/integration/
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { hmacSha256Hex } from '../../src/lib/crypto.js';

const BASE = process.env.BASE || 'http://127.0.0.1:8788';
const WRANGLER = process.env.WRANGLER;
const OWNER = { email: 'owner@test.local', password: 'Local-Test-Owner-Pass-2026!' };
const WEBHOOK_SECRET = 'whsec_local_mock';
const WEBP_1PX = Uint8Array.from(atob('UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA=='), (c) => c.charCodeAt(0));

function sql(command) {
  execFileSync(WRANGLER, ['d1', 'execute', 'DB', '--local', '--command', command], { env: { ...process.env, CI: 'true' }, stdio: 'pipe' });
}

async function api(path, { method = 'GET', body, cookie, admin = false, headers = {}, raw = false } = {}) {
  const h = { ...headers };
  let payload;
  if (body instanceof Uint8Array) payload = body;
  else if (body !== undefined) { h['content-type'] = 'application/json'; payload = JSON.stringify(body); }
  if (cookie) h.cookie = cookie;
  if (admin) h['x-ti-admin'] = '1';
  const res = await fetch(BASE + path, { method, headers: h, body: payload, redirect: 'manual' });
  if (raw) return res;
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, headers: res.headers };
}

async function signIn(email, password) {
  const res = await api('/api/admin/login', { method: 'POST', body: { email, password }, admin: true });
  const cookie = (res.headers.getSetCookie?.() || [])[0];
  return { ...res, cookie: cookie ? cookie.split(';')[0] : null };
}

const futureDay = (n) => new Date(Date.now() + n * 86400000 + 4 * 3600000).toISOString().slice(0, 10);

// ---- mock Stripe ------------------------------------------------------------
let stripeServer;
const stripeCalls = [];
before(async () => {
  assert.ok(WRANGLER, 'set WRANGLER to the wrangler binary');
  // Reset to a known state: wipe test data and restore the boutique straight
  // from the seed migration, so earlier runs can never leave it altered.
  const seed = readFileSync(new URL('../../migrations/0002_seed_catalog.sql', import.meta.url), 'utf8');
  const productsInsert = seed.slice(seed.indexOf('INSERT INTO products'), seed.indexOf(';', seed.indexOf('INSERT INTO products')) + 1);
  sql(`DELETE FROM login_attempts; DELETE FROM rate_limits; DELETE FROM sessions; DELETE FROM pass_visits; DELETE FROM passes;
       DELETE FROM voucher_redemptions; DELETE FROM order_items; DELETE FROM orders; DELETE FROM vouchers; DELETE FROM slots;
       DELETE FROM stripe_events; DELETE FROM enquiries; DELETE FROM announcements; DELETE FROM admins WHERE email != 'owner@test.local';
       DELETE FROM offerings WHERE slug LIKE 'test-%' OR name LIKE 'Test %'; DELETE FROM products; DELETE FROM media;
       ${productsInsert}
       UPDATE settings SET value = '{"enabled":false}' WHERE key = 'online_booking';
       UPDATE settings SET value = '{"stripe_enabled":false,"hold_minutes":30,"reservation_hold_hours":48}' WHERE key = 'payments';
       UPDATE settings SET value = '{"items":[]}' WHERE key = 'closures';`);
  stripeServer = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const params = new URLSearchParams(body);
      stripeCalls.push({ path: req.url, auth: req.headers.authorization, params });
      const id = `cs_test_${stripeCalls.length}`;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ id, url: `https://checkout.stripe.test/pay/${id}` }));
    });
  });
  await new Promise((r) => stripeServer.listen(9999, '127.0.0.1', r));
  for (let i = 0; i < 40; i++) {
    try { if ((await fetch(`${BASE}/api/config`)).ok) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('dev server did not start');
});
after(() => new Promise((r) => stripeServer.close(r)));

async function stripeWebhook(event, secret = WEBHOOK_SECRET) {
  const body = JSON.stringify(event);
  const t = Math.floor(Date.now() / 1000);
  const sig = await hmacSha256Hex(secret, `${t}.${body}`);
  const res = await fetch(`${BASE}/api/stripe/webhook`, { method: 'POST', body, headers: { 'content-type': 'application/json', 'stripe-signature': `t=${t},v1=${sig}` } });
  return { status: res.status, data: await res.json() };
}

// ---- state shared across the ordered tests ---------------------------------
const S = {};

test('public site: config starts with online booking off, and pages render products from D1', async () => {
  const cfg = await api('/api/config');
  assert.equal(cfg.status, 200);
  assert.equal(cfg.data.booking.enabled, false);
  assert.equal(cfg.data.payments.online, false);

  const home = await api('/');
  assert.equal(home.status, 200);
  assert.match(home.data, /id="ti-config"/);
  assert.match(home.data, /Sonic Plush Toy/);
  assert.doesNotMatch(home.data, /data-add-product/, 'no cart buttons while booking is off');
  const play = await api('/play');
  assert.equal(play.status, 200);
  assert.equal((play.data.match(/class="shop-card"/g) || []).length, 10, 'all 10 products on the Boutique grid');

  const css = await fetch(`${BASE}/assets/css/style.css`);
  assert.equal(css.status, 200, 'static assets unaffected');

  const blocked = await api('/api/checkout', { method: 'POST', body: { customer: {}, items: [] } });
  assert.equal(blocked.status, 403, 'checkout refused while booking is off');
});

test('auth: wrong passwords are rejected and locked out after 5 tries', async () => {
  const unknown = await signIn('nobody@test.local', 'whatever-password');
  assert.equal(unknown.status, 401);
  for (let i = 0; i < 4; i++) assert.equal((await signIn('nobody@test.local', 'nope-nope')).status, 401);
  const locked = await signIn('nobody@test.local', 'nope-nope');
  assert.equal(locked.status, 429, 'sixth attempt is locked');

  const noSession = await api('/api/admin/me');
  assert.equal(noSession.status, 401);

  const ok = await signIn(OWNER.email, OWNER.password);
  assert.equal(ok.status, 200);
  assert.ok(ok.cookie && ok.cookie.startsWith('ti_admin='));
  const setCookie = ok.headers.getSetCookie()[0];
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Strict/);
  assert.match(setCookie, /Path=\/api\/admin/);
  S.owner = ok.cookie;
  const me = await api('/api/admin/me', { cookie: S.owner });
  assert.equal(me.data.admin.role, 'owner');
});

test('auth: forged requests are refused', async () => {
  const noHeader = await api('/api/admin/settings', { method: 'PUT', cookie: S.owner, body: { key: 'online_booking', value: { enabled: true } } });
  assert.equal(noHeader.status, 403, 'missing X-TI-Admin header');
  const foreign = await api('/api/admin/settings', { method: 'PUT', cookie: S.owner, admin: true, headers: { origin: 'https://evil.example' }, body: { key: 'online_booking', value: { enabled: true } } });
  assert.equal(foreign.status, 403, 'cross-site origin');
  const badCookie = await api('/api/admin/me', { cookie: 'ti_admin=forged-token-value-that-is-long-enough' });
  assert.equal(badCookie.status, 401);
});

test('admin: turn on booking, create a camp and recurring sessions', async () => {
  const on = await api('/api/admin/settings', { method: 'PUT', cookie: S.owner, admin: true, body: { key: 'online_booking', value: { enabled: true } } });
  assert.equal(on.status, 200);
  assert.equal(on.data.settings.online_booking.enabled, true);

  const camp = await api('/api/admin/offerings', { method: 'POST', cookie: S.owner, admin: true,
    body: { name: 'Test Camp', slug: 'test-camp', kind: 'camp', price: 150, price_unit: 'child', max_children: 4, active: true } });
  assert.equal(camp.status, 201, JSON.stringify(camp.data));
  S.camp = camp.data.row;
  await api('/api/admin/offerings/' + S.camp.id, { method: 'PATCH', cookie: S.owner, admin: true, body: { slug: 'ignored' } });
  sql(`UPDATE offerings SET slug = 'test-camp' WHERE id = ${S.camp.id}`);

  const day = futureDay(3);
  const slots = await api('/api/admin/slots', { method: 'POST', cookie: S.owner, admin: true,
    body: { offeringId: S.camp.id, startDate: day, endDate: futureDay(9), weekdays: [0, 1, 2, 3, 4, 5, 6], times: [{ start: '09:00', end: '12:00' }], capacity: 3 } });
  assert.equal(slots.status, 201, JSON.stringify(slots.data));
  assert.equal(slots.data.created, 7);

  const tiny = await api('/api/admin/slots', { method: 'POST', cookie: S.owner, admin: true,
    body: { offeringId: S.camp.id, startDate: futureDay(12), times: [{ start: '15:00', end: '16:00' }], capacity: 1 } });
  assert.equal(tiny.data.created, 1);

  const cat = await api('/api/catalog');
  const mine = cat.data.slots.filter((s) => s.offering_id === S.camp.id);
  assert.equal(mine.length, 8);
  S.slot = mine[0];
  S.campSlots = mine.filter((x) => x.capacity === 3);
  S.tinySlot = mine.find((s) => s.capacity === 1);
  assert.equal(S.slot.remaining, 3);
  assert.ok(S.slot.starts_at.endsWith('05:00:00.000Z'), '09:00 Dubai is 05:00 UTC');

  const bad = await api('/api/admin/slots', { method: 'POST', cookie: S.owner, admin: true,
    body: { offeringId: S.camp.id, startDate: day, times: [{ start: '12:00', end: '09:00' }], capacity: 3 } });
  assert.equal(bad.status, 422);
});

test('booking: reservation holds seats, and a full session refuses more', async () => {
  const customer = { name: 'Layla Test', phone: '050 111 2233', email: 'layla@example.com' };
  const first = await api('/api/checkout', { method: 'POST', body: { customer, items: [{ type: 'offering', offeringId: S.camp.id, slotId: S.slot.id, children: [{ name: 'Adam', age: 6 }, { name: 'Sara', age: 4 }] }] } });
  assert.equal(first.status, 200, JSON.stringify(first.data));
  assert.equal(first.data.status, 'pending');
  assert.match(first.data.whatsapp, /^https:\/\/wa\.me\/971504738452\?text=/);
  assert.match(decodeURIComponent(first.data.whatsapp), new RegExp(first.data.ref));
  S.firstOrder = first.data;

  const cat = await api('/api/catalog');
  assert.equal(cat.data.slots.find((s) => s.id === S.slot.id).remaining, 1);

  const tooMany = await api('/api/checkout', { method: 'POST', body: { customer, items: [{ type: 'offering', offeringId: S.camp.id, slotId: S.slot.id, children: [{ name: 'A', age: 5 }, { name: 'B', age: 5 }] }] } });
  assert.equal(tooMany.status, 409);
  assert.match(tooMany.data.error, /Only 1 place left/);

  const view = await api(`/api/orders/${first.data.ref}?t=${first.data.token}`);
  assert.equal(view.status, 200);
  assert.equal(view.data.items[0].children.length, 2);
  const wrongToken = await api(`/api/orders/${first.data.ref}?t=nope`);
  assert.equal(wrongToken.status, 404, 'order page needs the secret token');

  const noKids = await api('/api/checkout', { method: 'POST', body: { customer, items: [{ type: 'offering', offeringId: S.camp.id, slotId: S.slot.id, children: [] }] } });
  assert.equal(noKids.status, 422);
  const badPhone = await api('/api/checkout', { method: 'POST', body: { customer: { ...customer, phone: '12' }, items: [{ type: 'offering', offeringId: S.camp.id, slotId: S.slot.id, children: [{ name: 'A', age: 5 }] }] } });
  assert.equal(badPhone.status, 422);
});

test('booking: 6 parents racing for the last place, exactly one wins', async () => {
  const attempts = await Promise.all(Array.from({ length: 6 }, (_, i) => api('/api/checkout', { method: 'POST',
    body: { customer: { name: `Racer ${i}`, phone: `+97150000000${i}` }, items: [{ type: 'offering', offeringId: S.camp.id, slotId: S.tinySlot.id, children: [{ name: `Kid ${i}`, age: 5 }] }] } })));
  const wins = attempts.filter((a) => a.status === 200);
  const losses = attempts.filter((a) => a.status === 409);
  assert.equal(wins.length, 1, `statuses: ${attempts.map((a) => a.status).join(',')}`);
  assert.equal(losses.length, 5);
  const cat = await api('/api/catalog');
  assert.equal(cat.data.slots.find((s) => s.id === S.tinySlot.id).remaining, 0);
  const leftovers = await api('/api/admin/orders?q=Racer', { cookie: S.owner });
  assert.equal(leftovers.data.total, 1, 'losing orders were fully removed');
});

test('admin: orders list, confirm, mark paid, notes, class list and CSV export', async () => {
  const list = await api('/api/admin/orders?status=open', { cookie: S.owner });
  assert.equal(list.status, 200);
  const row = list.data.rows.find((r) => r.ref === S.firstOrder.ref);
  assert.ok(row);
  const confirm = await api(`/api/admin/orders/${row.id}`, { method: 'PATCH', cookie: S.owner, admin: true, body: { action: 'confirm' } });
  assert.equal(confirm.data.order.status, 'confirmed');
  assert.equal(confirm.data.order.hold_expires_at, null, 'confirmed orders hold seats with no expiry');
  const paid = await api(`/api/admin/orders/${row.id}`, { method: 'PATCH', cookie: S.owner, admin: true, body: { action: 'mark_paid', method: 'cash', amount: 300 } });
  assert.equal(paid.data.order.status, 'paid');
  assert.equal(paid.data.order.paid_fils, 30000);
  await api(`/api/admin/orders/${row.id}`, { method: 'PATCH', cookie: S.owner, admin: true, body: { action: 'notes', internal_notes: '=HYPERLINK("x")' } });

  const cls = await api(`/api/admin/slots/${S.slot.id}`, { cookie: S.owner });
  assert.equal(cls.data.slot.taken, 2);
  assert.deepEqual(cls.data.attendees[0].children.map((c) => c.name), ['Adam', 'Sara']);

  const csv = await api('/api/admin/orders/export', { cookie: S.owner, raw: true });
  assert.equal(csv.status, 200);
  assert.match(csv.headers.get('content-type'), /text\/csv/);
  const text = await csv.text();
  assert.match(text, /Layla Test/);
  assert.match(text, /"'\+971501112233"/, "a leading + is prefixed with ' so spreadsheets do not run it as a formula");

  const desk = await api('/api/admin/orders', { method: 'POST', cookie: S.owner, admin: true,
    body: { customer: { name: 'Walk In', phone: '0501234567' }, items: [{ type: 'offering', offeringId: S.camp.id, slotId: S.slot.id, children: [{ name: 'Omar', age: 7 }] }], payment: { method: 'card', amount: 150 } } });
  assert.equal(desk.status, 201, JSON.stringify(desk.data));
  assert.equal(desk.data.order.status, 'paid');
  assert.equal(desk.data.order.channel, 'desk');
  assert.equal(desk.data.order.paid_fils, 15000, 'the desk payment was recorded');
  assert.equal(desk.data.order.payment_method, 'card');
  const deskReserve = await api('/api/admin/orders', { method: 'POST', cookie: S.owner, admin: true,
    body: { status: 'pending', customer: { name: 'Phone Hold', phone: '0501239876' }, items: [{ type: 'offering', offeringId: S.camp.id, slotId: S.campSlots[2].id, children: [{ name: 'Ali', age: 6 }] }] } });
  assert.equal(deskReserve.data.order.status, 'pending');
  assert.equal(deskReserve.data.order.hold_expires_at, null, 'a desk hold does not expire on its own');
});

test('vouchers: issue, check, redeem, and no double-spend under concurrent redemptions', async () => {
  const issued = await api('/api/admin/vouchers', { method: 'POST', cookie: S.owner, admin: true, body: { amount: 200, recipient: 'Mira' } });
  assert.equal(issued.status, 201);
  const code = issued.data.row.code;
  assert.match(code, /^GIFT-[A-Z2-9]{4}-[A-Z2-9]{4}$/);

  const check = await api('/api/vouchers/check', { method: 'POST', body: { code: code.toLowerCase() } });
  assert.deepEqual([check.data.valid, check.data.balance_fils], [true, 20000]);

  const r1 = await api('/api/admin/vouchers/redeem', { method: 'POST', cookie: S.owner, admin: true, body: { code, amount: 50 } });
  assert.equal(r1.data.row.balance_fils, 15000);
  const tooMuch = await api('/api/admin/vouchers/redeem', { method: 'POST', cookie: S.owner, admin: true, body: { code, amount: 200 } });
  assert.equal(tooMuch.status, 409);

  const race = await Promise.all([1, 2, 3].map(() => api('/api/admin/vouchers/redeem', { method: 'POST', cookie: S.owner, admin: true, body: { code, amount: 100 } })));
  assert.equal(race.filter((r) => r.status === 200).length, 1, `statuses: ${race.map((r) => r.status)}`);
  const detail = await api(`/api/admin/vouchers/${issued.data.row.id}`, { cookie: S.owner });
  assert.equal(detail.data.row.balance_fils, 5000);
  assert.equal(detail.data.redemptions.length, 2, 'a redemption row exists only for successful deductions');
  S.voucherCode = code;
});

test('passes: visits count down and stop at zero', async () => {
  const pass = await api('/api/admin/passes', { method: 'POST', cookie: S.owner, admin: true, body: { visits: 2, validity_days: 30, holder_name: 'Hala', holder_phone: '0502223344', children: [{ name: 'Yusuf' }] } });
  assert.equal(pass.status, 201, JSON.stringify(pass.data));
  const code = pass.data.row.code;
  const v1 = await api('/api/admin/passes/checkin', { method: 'POST', cookie: S.owner, admin: true, body: { code } });
  assert.equal(v1.data.row.visits_used, 1);
  const v2 = await api('/api/admin/passes/checkin', { method: 'POST', cookie: S.owner, admin: true, body: { code: code.toLowerCase() } });
  assert.equal(v2.data.row.status, 'used_up');
  const v3 = await api('/api/admin/passes/checkin', { method: 'POST', cookie: S.owner, admin: true, body: { code } });
  assert.equal(v3.status, 409);
  const more = await api(`/api/admin/passes/${pass.data.row.id}`, { method: 'PATCH', cookie: S.owner, admin: true, body: { action: 'add_visits', visits: 1 } });
  assert.equal(more.data.row.status, 'active');
});

test('a browser revalidating its cached page still gets the current settings', async () => {
  const first = await fetch(`${BASE}/`);
  await first.text();
  assert.equal(first.headers.get('etag'), null, 'no validator is handed out for live pages');
  assert.equal(first.headers.get('cache-control'), 'no-cache');
  // Even a browser holding the raw file's ETag must get a full, fresh page.
  const raw = await fetch(`${BASE}/assets/css/style.css`);
  const again = await fetch(`${BASE}/`, { headers: { 'if-none-match': raw.headers.get('etag') || '"anything"', 'if-modified-since': new Date().toUTCString() } });
  assert.equal(again.status, 200);
  assert.match(await again.text(), /id="ti-config"/);
});

test('enquiries, announcements and opening hours reach the public site', async () => {
  const e = await api('/api/enquiries', { method: 'POST', body: { kind: 'birthday', name: 'Rana', phone: '0503334455', message: 'Party for 12 kids', fields: { date: '2026-10-10' } } });
  assert.equal(e.status, 201);
  const bot = await api('/api/enquiries', { method: 'POST', body: { name: 'Bot', website: 'http://spam.example', message: 'buy' } });
  assert.equal(bot.status, 200);
  const inbox = await api('/api/admin/enquiries', { cookie: S.owner });
  assert.equal(inbox.data.total, 1, 'honeypot submission was not stored');
  assert.equal(inbox.data.rows[0].payload.date, '2026-10-10');

  const ann = await api('/api/admin/announcements', { method: 'POST', cookie: S.owner, admin: true, body: { message: 'Summer camp registration is open', link_url: '/programs', link_label: 'See camps', tone: 'navy' } });
  assert.equal(ann.status, 201);
  const cfg = await api('/api/config');
  assert.equal(cfg.data.announcement.message, 'Summer camp registration is open');

  const closure = await api('/api/admin/settings', { method: 'PUT', cookie: S.owner, admin: true, body: { key: 'closures', value: { items: [{ date: futureDay(20), label: 'Eid', closed: true }] } } });
  assert.equal(closure.status, 200);
  assert.equal((await api('/api/config')).data.closures[0].label, 'Eid');
  const badHours = await api('/api/admin/settings', { method: 'PUT', cookie: S.owner, admin: true, body: { key: 'opening_hours', value: { days: [{ open: '22:00', close: '10:00' }, {}, {}, {}, {}, {}, {}] } } });
  assert.equal(badHours.status, 422);
});

test('boutique: price, stock and an uploaded photo show up on the public pages', async () => {
  const products = await api('/api/admin/products', { cookie: S.owner });
  const sonic = products.data.rows.find((p) => p.slug === 'sonic-plush');
  const up = await api('/api/admin/media', { method: 'POST', cookie: S.owner, admin: true, body: WEBP_1PX, headers: { 'content-type': 'image/webp', 'x-width': '1', 'x-height': '1' } });
  assert.equal(up.status, 201, JSON.stringify(up.data));
  const liar = await api('/api/admin/media', { method: 'POST', cookie: S.owner, admin: true, body: new TextEncoder().encode('<svg onload=alert(1)>'), headers: { 'content-type': 'image/png' } });
  assert.equal(liar.status, 415, 'a file pretending to be an image is refused');

  const upd = await api(`/api/admin/products/${sonic.id}`, { method: 'PATCH', cookie: S.owner, admin: true, body: { price: 89, stock: 5, image_id: up.data.id } });
  assert.equal(upd.data.row.price_fils, 8900);
  const img = await fetch(`${BASE}/media/${up.data.id}`);
  assert.equal(img.status, 200);
  assert.equal(img.headers.get('content-type'), 'image/webp');
  assert.match(img.headers.get('cache-control'), /immutable/);

  const play = await api('/play');
  assert.match(play.data, new RegExp(`/media/${up.data.id}`));
  assert.match(play.data, /89 <small>AED<\/small>/);
  assert.match(play.data, new RegExp(`data-add-product="${sonic.id}"`), 'cart button appears once booking is on and a price is set');
  S.sonic = sonic;
});

test('team: roles are enforced, passwords are generated once, and password changes sign out other devices', async () => {
  const add = await api('/api/admin/team', { method: 'POST', cookie: S.owner, admin: true, body: { email: 'staff@test.local', name: 'Desk Staff', role: 'staff' } });
  assert.equal(add.status, 201);
  assert.equal(add.data.password.length, 24);
  const staff = await signIn('staff@test.local', add.data.password);
  assert.equal(staff.status, 200);

  const denied = await api('/api/admin/settings', { method: 'PUT', cookie: staff.cookie, admin: true, body: { key: 'online_booking', value: { enabled: false } } });
  assert.equal(denied.status, 403);
  const deniedTeam = await api('/api/admin/team', { cookie: staff.cookie });
  assert.equal(deniedTeam.status, 403);
  const stockOk = await api(`/api/admin/products/${S.sonic.id}`, { method: 'PATCH', cookie: staff.cookie, admin: true, body: { stock: 4 } });
  assert.equal(stockOk.status, 200, 'staff can adjust stock');
  const priceDenied = await api(`/api/admin/products/${S.sonic.id}`, { method: 'PATCH', cookie: staff.cookie, admin: true, body: { price: 1 } });
  assert.equal(priceDenied.status, 403, 'staff cannot change prices');

  const weak = await api('/api/admin/account/password', { method: 'POST', cookie: staff.cookie, admin: true, body: { current: add.data.password, next: 'short' } });
  assert.equal(weak.status, 422);
  const second = await signIn('staff@test.local', add.data.password);
  const changed = await api('/api/admin/account/password', { method: 'POST', cookie: staff.cookie, admin: true, body: { current: add.data.password, next: 'Brand-New-Staff-Pass-99' } });
  assert.equal(changed.status, 200);
  assert.equal((await api('/api/admin/me', { cookie: second.cookie })).status, 401, 'the other device was signed out');
  assert.equal((await api('/api/admin/me', { cookie: staff.cookie })).status, 200, 'this device stays signed in');
  assert.equal((await signIn('staff@test.local', add.data.password)).status, 401, 'old password no longer works');

  const selfDemote = await api(`/api/admin/team/${(await api('/api/admin/me', { cookie: S.owner })).data.admin.id}`, { method: 'PATCH', cookie: S.owner, admin: true, body: { role: 'staff' } });
  assert.equal(selfDemote.status, 409, 'the last owner cannot be demoted');

  const audit = await api('/api/admin/audit', { cookie: S.owner });
  assert.ok(audit.data.rows.some((r) => r.action === 'account.password'));
});

test('payments: Stripe checkout, signed webhook fulfils, forged and duplicate webhooks are rejected', async () => {
  const on = await api('/api/admin/settings', { method: 'PUT', cookie: S.owner, admin: true, body: { key: 'payments', value: { stripe_enabled: true, hold_minutes: 31, reservation_hold_hours: 48 } } });
  assert.equal(on.status, 200);
  assert.equal((await api('/api/config')).data.payments.online, true);

  const passType = await api('/api/admin/offerings', { method: 'POST', cookie: S.owner, admin: true, body: { name: 'Test 5-Visit Pass', kind: 'pass', price: 300, price_unit: 'booking', visits: 5, validity_days: 90, active: true } });
  assert.equal(passType.status, 201, JSON.stringify(passType.data));
  sql(`UPDATE offerings SET slug = 'test-pass' WHERE id = ${passType.data.row.id}`);

  const checkout = await api('/api/checkout', { method: 'POST', body: {
    customer: { name: 'Nadia Pay', phone: '0505556677', email: 'nadia@example.com' },
    voucherCode: S.voucherCode,
    items: [
      { type: 'offering', offeringId: S.camp.id, slotId: S.campSlots[1].id, children: [{ name: 'Lina', age: 5 }] },
      { type: 'offering', offeringId: passType.data.row.id, children: [{ name: 'Lina', age: 5 }] },
      { type: 'product', productId: S.sonic.id, qty: 2 },
    ] } });
  assert.equal(checkout.status, 200, JSON.stringify(checkout.data));
  assert.match(checkout.data.redirect, /^https:\/\/checkout\.stripe\.test\/pay\//);
  const call = stripeCalls.at(-1);
  assert.equal(call.auth, 'Bearer sk_test_local_mock');
  // 150 + 300 + 2 x 89 = 628 AED, minus the 50 AED left on the voucher = 578 AED due.
  assert.equal(call.params.get('line_items[0][price_data][unit_amount]'), '57800');
  assert.equal(call.params.get('line_items[0][price_data][currency]'), 'aed');

  const before = await api(`/api/orders/${checkout.data.ref}?t=${checkout.data.token}`);
  assert.equal(before.data.status, 'awaiting_payment');
  assert.equal(before.data.passes.length, 0, 'pass codes stay hidden until payment');

  const sessionId = `cs_test_${stripeCalls.length}`;
  const event = { id: `evt_${Date.now()}`, type: 'checkout.session.completed',
    data: { object: { id: sessionId, client_reference_id: checkout.data.ref, payment_status: 'paid', amount_total: 57800, payment_intent: 'pi_test_1' } } };

  const forged = await stripeWebhook(event, 'whsec_attacker');
  assert.equal(forged.status, 400);
  assert.equal((await api(`/api/orders/${checkout.data.ref}?t=${checkout.data.token}`)).data.status, 'awaiting_payment', 'forged webhook changed nothing');

  const real = await stripeWebhook(event);
  assert.equal(real.status, 200);
  const dup = await stripeWebhook(event);
  assert.equal(dup.data.duplicate, true);

  const afterPay = await api(`/api/orders/${checkout.data.ref}?t=${checkout.data.token}`);
  assert.equal(afterPay.data.status, 'paid');
  assert.equal(afterPay.data.paid_fils, 57800);
  assert.equal(afterPay.data.passes.length, 1);
  assert.equal(afterPay.data.passes[0].status, 'active');
  assert.ok(afterPay.data.passes[0].expires_at, 'pass expiry set from its 90-day validity');

  const v = await api('/api/vouchers/check', { method: 'POST', body: { code: S.voucherCode } });
  assert.equal(v.data.valid, false, 'the voucher was fully used as payment');
  const products = await api('/api/admin/products', { cookie: S.owner });
  assert.equal(products.data.rows.find((p) => p.id === S.sonic.id).stock, 2, 'stock 4 minus 2 sold');

  const dash = await api('/api/admin/dashboard', { cookie: S.owner });
  assert.equal(dash.status, 200);
  assert.ok(dash.data.kpis.revenue7 >= 57800 + 30000 + 15000);
  assert.equal(dash.data.series.length, 30);
});

test('gift voucher bought online becomes usable after payment', async () => {
  const buy = await api('/api/checkout', { method: 'POST', body: { customer: { name: 'Gift Giver', phone: '0507778899', email: 'gift@example.com' },
    items: [{ type: 'voucher', amount: 250, recipient: 'Zayn', message: 'Happy birthday!' }] } });
  assert.equal(buy.status, 200, JSON.stringify(buy.data));
  const sessionId = `cs_test_${stripeCalls.length}`;
  await stripeWebhook({ id: `evt_gift_${Date.now()}`, type: 'checkout.session.completed', data: { object: { id: sessionId, client_reference_id: buy.data.ref, payment_status: 'paid', amount_total: 25000 } } });
  const view = await api(`/api/orders/${buy.data.ref}?t=${buy.data.token}`);
  assert.equal(view.data.vouchers.length, 1);
  const check = await api('/api/vouchers/check', { method: 'POST', body: { code: view.data.vouchers[0].code } });
  assert.deepEqual([check.data.valid, check.data.balance_fils], [true, 25000]);

  const noLoop = await api('/api/checkout', { method: 'POST', body: { customer: { name: 'X', phone: '0501231231' }, voucherCode: view.data.vouchers[0].code, items: [{ type: 'voucher', amount: 100 }] } });
  assert.equal(noLoop.status, 422, 'a voucher cannot buy another voucher');
});
