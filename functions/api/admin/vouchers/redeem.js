import { handle, json, readJson, HttpError } from '../../../../src/lib/http.js';
import { one, nowIso } from '../../../../src/lib/db.js';
import { audit } from '../../../../src/lib/auth.js';
import { str } from '../../../../src/lib/validate.js';
import { toFils } from '../../../../src/lib/money.js';

// Deducts at the desk. The guarded UPDATE means two staff redeeming the same
// voucher at once can never take it below zero.
export const onRequestPost = handle(async ({ request, env, data }) => {
  const body = await readJson(request);
  const code = (str(body.code, 'code', { required: true, max: 40, label: 'Code' }) || '').toUpperCase();
  const amount = toFils(body.amount, 'amount', { nullable: false });
  if (amount <= 0) throw new HttpError(422, 'Enter an amount above zero.', { field: 'amount' });
  const v = await one(env.DB, 'SELECT * FROM vouchers WHERE code = ?', code);
  const now = nowIso();
  if (!v) throw new HttpError(404, 'No voucher with that code.', { field: 'code' });
  if (v.status !== 'active') throw new HttpError(409, `This voucher is ${v.status}.`, { field: 'code' });
  if (v.expires_at && v.expires_at <= now) throw new HttpError(409, 'This voucher has expired.', { field: 'code' });
  if (v.balance_fils < amount) throw new HttpError(409, `Only ${v.balance_fils / 100} AED left on this voucher.`, { field: 'amount' });
  const [upd] = await env.DB.batch([
    env.DB.prepare(`UPDATE vouchers SET balance_fils = balance_fils - ?, status = CASE WHEN balance_fils - ? = 0 THEN 'redeemed' ELSE status END, updated_at = ?
                     WHERE id = ? AND status = 'active' AND balance_fils >= ?`).bind(amount, amount, now, v.id, amount),
    env.DB.prepare(`INSERT INTO voucher_redemptions (voucher_id, amount_fils, admin_id, note)
                     SELECT ?, ?, ?, ? WHERE changes() = 1`).bind(v.id, amount, data.admin.id, str(body.note, 'note', { max: 200 })),
  ]);
  if (!upd.meta.changes) throw new HttpError(409, 'The balance changed a moment ago. Look the voucher up again.');
  await audit(env, data.admin.id, 'voucher.redeem', 'voucher', v.id, { code, amount }, data.ip);
  return json({ row: await one(env.DB, 'SELECT * FROM vouchers WHERE id = ?', v.id) });
});
