import { handle, json, readJson } from '../../../../src/lib/http.js';
import { all, one, run } from '../../../../src/lib/db.js';
import { audit, requireRole } from '../../../../src/lib/auth.js';
import { str, int, oneOf } from '../../../../src/lib/validate.js';
import { toFils } from '../../../../src/lib/money.js';
import { makeVoucherCode } from '../../../../src/lib/orders.js';

export const onRequestGet = handle(async ({ request, env }) => {
  const q = new URL(request.url).searchParams;
  const where = [];
  const params = [];
  const status = q.get('status');
  if (status) { where.push('status = ?'); params.push(oneOf(status, 'status', ['pending', 'active', 'redeemed', 'void', 'expired'])); }
  const search = (q.get('q') || '').trim().replace(/[%_]/g, '');
  if (search) { where.push('(code LIKE ? OR recipient_name LIKE ? OR purchaser_name LIKE ?)'); params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
  const rows = await all(env.DB, `SELECT * FROM vouchers ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY id DESC LIMIT 200`, ...params);
  return json({ rows });
});

export const onRequestPost = handle(async ({ request, env, data }) => {
  requireRole(data.admin, 'manager');
  const body = await readJson(request);
  const amount = toFils(body.amount, 'amount', { nullable: false });
  const days = int(body.validity_days ?? 365, 'validity_days', { min: 1, max: 3650 });
  const code = makeVoucherCode();
  const expires = new Date(Date.now() + days * 86400000).toISOString();
  await run(env.DB, `INSERT INTO vouchers (code, initial_fils, balance_fils, status, purchaser_name, recipient_name, message, expires_at, created_by)
    VALUES (?, ?, ?, 'active', ?, ?, ?, ?, ?)`,
    code, amount, amount, str(body.purchaser, 'purchaser', { max: 120 }), str(body.recipient, 'recipient', { max: 120 }),
    str(body.message, 'message', { max: 300 }), expires, data.admin.id);
  const row = await one(env.DB, 'SELECT * FROM vouchers WHERE code = ?', code);
  await audit(env, data.admin.id, 'voucher.issue', 'voucher', row.id, { code, amount }, data.ip);
  return json({ row }, 201);
});
