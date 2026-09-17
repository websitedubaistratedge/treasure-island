import { HttpError } from './http.js';
import { one, all, nowIso } from './db.js';
import { randomString, randomToken, CODE_ALPHABET } from './crypto.js';
import { str, int, phone, email } from './validate.js';
import { toFils } from './money.js';
import { takenSql } from './availability.js';
import { formatDubai } from './time.js';

export const makeRef = () => `TI-${randomString(6, CODE_ALPHABET)}`;
export const makeVoucherCode = () => `GIFT-${randomString(4, CODE_ALPHABET)}-${randomString(4, CODE_ALPHABET)}`;
export const makePassCode = () => `PASS-${randomString(4, CODE_ALPHABET)}-${randomString(4, CODE_ALPHABET)}`;

const MAX_ITEMS = 20;
export const PAID_STATUSES = ['paid', 'confirmed', 'completed'];

export function parseCustomer(input = {}) {
  return {
    name: str(input.name, 'customer.name', { required: true, max: 120, label: 'Name' }),
    phone: phone(input.phone, 'customer.phone'),
    email: email(input.email, 'customer.email'),
    notes: str(input.notes, 'customer.notes', { max: 1000, label: 'Notes' }),
  };
}

function parseChildren(list, max, i) {
  const arr = Array.isArray(list) ? list : [];
  if (arr.length > max) throw new HttpError(422, `You can add up to ${max} children per booking.`, { field: `items.${i}.children` });
  return arr.map((c, j) => ({
    name: str(c && c.name, `items.${i}.children.${j}.name`, { required: true, max: 80, label: 'Child name' }),
    age: int(c && c.age, `items.${i}.children.${j}.age`, { min: 0, max: 17, label: 'Child age' }),
  }));
}

// Prices a cart from the database. The browser only says what it wants;
// every price, limit and seat count is decided here.
export async function priceCart(db, rawItems, { voucherCode = null, now = nowIso() } = {}) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) throw new HttpError(422, 'Your cart is empty.');
  if (rawItems.length > MAX_ITEMS) throw new HttpError(422, `A cart can hold up to ${MAX_ITEMS} items.`);

  const lines = [];
  for (const [i, raw] of rawItems.entries()) {
    const type = raw && raw.type;
    if (type === 'product') {
      const id = int(raw.productId, `items.${i}.productId`, { required: true, min: 1 });
      const qty = int(raw.qty ?? 1, `items.${i}.qty`, { required: true, min: 1, max: 20, label: 'Quantity' });
      const p = await one(db, 'SELECT * FROM products WHERE id = ? AND active = 1', id);
      if (!p) throw new HttpError(409, 'A product in your cart is no longer available.', { item: i });
      if (p.stock != null && p.stock < qty) {
        throw new HttpError(409, p.stock === 0 ? `${p.name} is sold out.` : `Only ${p.stock} left of ${p.name}.`, { item: i });
      }
      const line = p.price_fils == null ? null : p.price_fils * qty;
      lines.push({ kind: 'product', product_id: p.id, offering_id: null, slot_id: null, name: p.name, qty,
        unit_fils: p.price_fils, line_fils: line, due_fils: line, meta: {} });
    } else if (type === 'offering') {
      const id = int(raw.offeringId, `items.${i}.offeringId`, { required: true, min: 1 });
      const o = await one(db, 'SELECT * FROM offerings WHERE id = ? AND active = 1', id);
      if (!o) throw new HttpError(409, 'Something in your cart is no longer offered.', { item: i });
      const children = parseChildren(raw.children, o.max_children, i);
      if (o.price_unit === 'child' && children.length === 0) {
        throw new HttpError(422, 'Add at least one child to this booking.', { field: `items.${i}.children` });
      }
      let slot = null;
      if (o.kind !== 'pass') {
        const slotId = int(raw.slotId, `items.${i}.slotId`, { required: true, min: 1, label: 'Date' });
        slot = await one(db,
          `SELECT s.*, s.capacity - ${takenSql('s.id')} AS remaining FROM slots s WHERE s.id = ? AND s.offering_id = ?`,
          slotId, o.id);
        if (!slot || slot.status !== 'open' || slot.starts_at <= now) {
          throw new HttpError(409, 'That date is no longer available. Please pick another.', { item: i });
        }
      }
      const qty = o.price_unit === 'child' ? children.length : 1;
      if (slot && slot.remaining < qty) {
        throw new HttpError(409, slot.remaining <= 0
          ? 'That session is fully booked. Please pick another date.'
          : `Only ${slot.remaining} place${slot.remaining === 1 ? '' : 's'} left in that session.`, { item: i });
      }
      const line = o.price_fils == null ? null : o.price_fils * qty;
      const due = line == null ? null : (o.deposit_fils != null ? Math.min(o.deposit_fils, line) : line);
      lines.push({
        kind: 'offering', product_id: null, offering_id: o.id, slot_id: slot ? slot.id : null,
        name: slot ? `${o.name} · ${formatDubai(slot.starts_at)}` : o.name,
        qty, unit_fils: o.price_fils, line_fils: line, due_fils: due,
        meta: { children, offering_kind: o.kind, starts_at: slot && slot.starts_at, ends_at: slot && slot.ends_at,
          deposit: o.deposit_fils != null && line != null && due < line },
      });
    } else if (type === 'voucher') {
      const amount = toFils(raw.amount, `items.${i}.amount`, { nullable: false });
      if (amount < 5000 || amount > 200000) {
        throw new HttpError(422, 'Gift vouchers are between 50 and 2,000 AED.', { field: `items.${i}.amount` });
      }
      lines.push({
        kind: 'voucher', product_id: null, offering_id: null, slot_id: null,
        name: `Gift voucher · ${amount / 100} AED`, qty: 1, unit_fils: amount, line_fils: amount, due_fils: amount,
        meta: {
          recipient: str(raw.recipient, `items.${i}.recipient`, { max: 80, label: 'Recipient' }),
          from: str(raw.from, `items.${i}.from`, { max: 80, label: 'From' }),
          message: str(raw.message, `items.${i}.message`, { max: 300, label: 'Message' }),
        },
      });
    } else {
      throw new HttpError(422, 'Unknown item in cart.', { item: i });
    }
  }

  const priced = lines.every((l) => l.line_fils != null);
  const subtotal = priced ? lines.reduce((s, l) => s + l.line_fils, 0) : null;
  let dueNow = priced ? lines.reduce((s, l) => s + l.due_fils, 0) : null;
  let discount = 0;
  let voucher = null;

  if (voucherCode) {
    const code = str(voucherCode, 'voucherCode', { max: 40, label: 'Voucher code' });
    voucher = code && await one(db, 'SELECT * FROM vouchers WHERE code = ?', code.toUpperCase());
    if (!voucher || voucher.status !== 'active' || voucher.balance_fils <= 0 || (voucher.expires_at && voucher.expires_at <= now)) {
      throw new HttpError(422, 'That gift voucher code is not valid.', { field: 'voucherCode' });
    }
    if (lines.some((l) => l.kind === 'voucher')) {
      throw new HttpError(422, 'A gift voucher cannot be used to buy another gift voucher.', { field: 'voucherCode' });
    }
    if (priced) {
      discount = Math.min(voucher.balance_fils, dueNow);
      dueNow -= discount;
    }
  }

  return {
    lines, priced, voucher,
    subtotal_fils: subtotal,
    discount_fils: discount,
    total_fils: priced ? subtotal - discount : null,
    due_now_fils: dueNow,
  };
}

// Writes the order, its lines, and any pending vouchers/passes in one D1
// batch (a transaction). Seat-limited lines are inserted only if the seats are
// still free at that instant; if any line misses, the whole order is removed
// and the customer is told which session filled up.
export async function createOrder(env, { customer, pricing, channel, status, holdUntil = null, createdBy = null, internalNotes = null }) {
  const db = env.DB;
  const ref = makeRef();
  const orderId = `(SELECT id FROM orders WHERE ref = '${ref}')`;
  const stmts = [
    db.prepare(`INSERT INTO orders (ref, access_token, status, channel, customer_name, customer_phone, customer_email, notes,
                  internal_notes, subtotal_fils, discount_fils, total_fils, due_now_fils, voucher_id, hold_expires_at, created_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(ref, randomToken(18), status, channel, customer.name, customer.phone, customer.email, customer.notes,
        internalNotes, pricing.subtotal_fils ?? 0, pricing.discount_fils, pricing.total_fils ?? 0,
        pricing.due_now_fils ?? 0, pricing.voucher ? pricing.voucher.id : null, holdUntil, createdBy),
  ];
  const guarded = [];
  const insertItem = `INSERT INTO order_items (order_id, kind, product_id, offering_id, slot_id, name, qty, unit_fils, line_fils, meta)
                      SELECT ${orderId}, ?, ?, ?, ?, ?, ?, ?, ?, ?`;

  for (const l of pricing.lines) {
    const binds = [l.kind, l.product_id, l.offering_id, l.slot_id, l.name, l.qty, l.unit_fils, l.line_fils ?? 0, JSON.stringify(l.meta)];
    if (l.slot_id) {
      stmts.push(db.prepare(`${insertItem} WHERE (SELECT capacity FROM slots WHERE id = ? AND status = 'open') - ${takenSql('?')} >= ?`)
        .bind(...binds, l.slot_id, l.slot_id, l.qty));
      guarded.push({ index: stmts.length - 1, line: l });
    } else {
      stmts.push(db.prepare(insertItem).bind(...binds));
    }
    if (l.kind === 'voucher') {
      stmts.push(db.prepare(`INSERT INTO vouchers (code, initial_fils, balance_fils, status, purchaser_name, recipient_name, message, order_id)
                             VALUES (?, ?, ?, 'pending', ?, ?, ?, ${orderId})`)
        .bind(makeVoucherCode(), l.line_fils, l.line_fils, l.meta.from || customer.name, l.meta.recipient, l.meta.message));
    }
    if (l.kind === 'offering' && l.meta.offering_kind === 'pass') {
      const o = await one(db, 'SELECT name, visits FROM offerings WHERE id = ?', l.offering_id);
      stmts.push(db.prepare(`INSERT INTO passes (code, offering_id, name, holder_name, holder_phone, children, visits_total, status, order_id)
                             VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ${orderId})`)
        .bind(makePassCode(), l.offering_id, o.name, customer.name, customer.phone, JSON.stringify(l.meta.children), o.visits || 1));
    }
  }

  const results = await db.batch(stmts);
  const missed = guarded.filter((g) => (results[g.index].meta && results[g.index].meta.changes) !== 1);
  if (missed.length) {
    await db.batch([
      db.prepare(`DELETE FROM vouchers WHERE order_id = ${orderId}`),
      db.prepare(`DELETE FROM passes WHERE order_id = ${orderId}`),
      db.prepare('DELETE FROM orders WHERE ref = ?').bind(ref),
    ]);
    throw new HttpError(409, `${missed[0].line.name} just filled up. Please pick another date.`);
  }
  return one(db, 'SELECT * FROM orders WHERE ref = ?', ref);
}

// Marks an order paid/confirmed and brings everything it bought to life:
// vouchers and passes become active, shelf stock is taken, and any gift voucher
// used as payment is drawn down. Safe to call twice.
export async function fulfilOrder(env, orderId, { method, paidFils = 0, adminId = null, stripeSessionId = null, stripePaymentIntent = null }) {
  const db = env.DB;
  const order = await one(db, 'SELECT * FROM orders WHERE id = ?', orderId);
  if (!order) throw new HttpError(404, 'Order not found.');
  if (PAID_STATUSES.includes(order.status)) return order;
  if (['cancelled', 'refunded'].includes(order.status)) throw new HttpError(409, 'This order was cancelled.');

  const now = nowIso();
  const status = paidFils > 0 ? 'paid' : 'confirmed';
  const items = await all(db, 'SELECT * FROM order_items WHERE order_id = ?', orderId);
  const stmts = [
    db.prepare(`UPDATE orders SET status = ?, payment_method = COALESCE(?, payment_method), paid_fils = paid_fils + ?,
                  paid_at = CASE WHEN ? > 0 THEN ? ELSE paid_at END, hold_expires_at = NULL,
                  stripe_session_id = COALESCE(?, stripe_session_id), stripe_payment_intent = COALESCE(?, stripe_payment_intent),
                  internal_notes = CASE WHEN status = 'expired' THEN TRIM(COALESCE(internal_notes, '') || ' [Paid after its hold expired - check capacity.]') ELSE internal_notes END,
                  updated_at = ?
                WHERE id = ?`)
      .bind(status, method, paidFils, paidFils, now, stripeSessionId, stripePaymentIntent, now, orderId),
    db.prepare(`UPDATE vouchers SET status = 'active', expires_at = strftime('%Y-%m-%dT%H:%M:%fZ','now','+365 days'), updated_at = ?
                 WHERE order_id = ? AND status = 'pending'`).bind(now, orderId),
    db.prepare(`UPDATE passes SET status = 'active', updated_at = ?,
                  expires_at = (SELECT CASE WHEN o.validity_days IS NULL THEN NULL
                                ELSE strftime('%Y-%m-%dT%H:%M:%fZ','now','+' || o.validity_days || ' days') END
                                FROM offerings o WHERE o.id = passes.offering_id)
                 WHERE order_id = ? AND status = 'pending'`).bind(now, orderId),
  ];
  for (const it of items) {
    if (it.kind === 'product' && it.product_id) {
      stmts.push(db.prepare('UPDATE products SET stock = MAX(stock - ?, 0), updated_at = ? WHERE id = ? AND stock IS NOT NULL')
        .bind(it.qty, now, it.product_id));
    }
  }
  if (order.voucher_id && order.discount_fils > 0) {
    stmts.push(db.prepare(`UPDATE vouchers SET balance_fils = balance_fils - ?,
                             status = CASE WHEN balance_fils - ? <= 0 THEN 'redeemed' ELSE status END, updated_at = ?
                           WHERE id = ? AND balance_fils >= ?`)
      .bind(order.discount_fils, order.discount_fils, now, order.voucher_id, order.discount_fils));
    stmts.push(db.prepare('INSERT INTO voucher_redemptions (voucher_id, amount_fils, order_id, admin_id, note) VALUES (?, ?, ?, ?, ?)')
      .bind(order.voucher_id, order.discount_fils, orderId, adminId, `Order ${order.ref}`));
  }
  await db.batch(stmts);
  return one(db, 'SELECT * FROM orders WHERE id = ?', orderId);
}

export async function cancelOrder(env, orderId, { status = 'cancelled' } = {}) {
  const db = env.DB;
  const now = nowIso();
  await db.batch([
    db.prepare('UPDATE orders SET status = ?, hold_expires_at = NULL, updated_at = ? WHERE id = ?').bind(status, now, orderId),
    db.prepare("UPDATE vouchers SET status = 'void', updated_at = ? WHERE order_id = ? AND status IN ('pending','active')").bind(now, orderId),
    db.prepare("UPDATE passes SET status = 'void', updated_at = ? WHERE order_id = ? AND status IN ('pending','active')").bind(now, orderId),
  ]);
}

// Unpaid orders whose hold ran out become "expired". Seats were already freed
// the moment the hold passed; this just makes the status tell the truth.
export async function expireStaleOrders(db) {
  const now = nowIso();
  const stale = `SELECT id FROM orders WHERE status IN ('pending','awaiting_payment') AND hold_expires_at IS NOT NULL AND hold_expires_at <= ?`;
  await db.batch([
    db.prepare(`UPDATE vouchers SET status = 'void', updated_at = ? WHERE status = 'pending' AND order_id IN (${stale})`).bind(now, now),
    db.prepare(`UPDATE passes SET status = 'void', updated_at = ? WHERE status = 'pending' AND order_id IN (${stale})`).bind(now, now),
    db.prepare(`UPDATE orders SET status = 'expired', updated_at = ? WHERE id IN (${stale})`).bind(now, now),
  ]);
}

export function whatsappReservationUrl(number, order, lines) {
  const body = [
    'Hello Treasure Island,',
    '',
    `I reserved online and would like to confirm booking ${order.ref}.`,
    '',
    ...lines.map((l) => {
      const kids = (l.meta.children || []).map((c) => `${c.name}${c.age != null ? ` (${c.age})` : ''}`).join(', ');
      return `• ${l.name}${l.qty > 1 ? ` × ${l.qty}` : ''}${kids ? ` - ${kids}` : ''}`;
    }),
    '',
    order.total_fils > 0 ? `Total: ${order.total_fils / 100} AED` : 'Price: please confirm',
    '',
    '— Sent from the Treasure Island website (Online booking)',
  ].join('\n');
  return `https://wa.me/${number}?text=${encodeURIComponent(body)}`;
}

export async function orderDetail(db, orderId) {
  const order = await one(db, 'SELECT * FROM orders WHERE id = ?', orderId);
  if (!order) return null;
  const [items, vouchers, passes] = await Promise.all([
    all(db, 'SELECT * FROM order_items WHERE order_id = ? ORDER BY id', orderId),
    all(db, 'SELECT * FROM vouchers WHERE order_id = ? ORDER BY id', orderId),
    all(db, 'SELECT * FROM passes WHERE order_id = ? ORDER BY id', orderId),
  ]);
  return { order, items: items.map((i) => ({ ...i, meta: JSON.parse(i.meta || '{}') })), vouchers, passes };
}
