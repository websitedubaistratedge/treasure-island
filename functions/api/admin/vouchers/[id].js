import { handle, json, readJson, HttpError } from '../../../../src/lib/http.js';
import { one, all, run, nowIso } from '../../../../src/lib/db.js';
import { audit, requireRole } from '../../../../src/lib/auth.js';
import { int, oneOf } from '../../../../src/lib/validate.js';

export const onRequestGet = handle(async ({ env, params }) => {
  const id = int(params.id, 'id', { required: true, min: 1 });
  const row = await one(env.DB, 'SELECT * FROM vouchers WHERE id = ?', id);
  if (!row) throw new HttpError(404, 'Voucher not found.');
  const redemptions = await all(env.DB, `SELECT r.*, a.name AS admin_name, o.ref AS order_ref FROM voucher_redemptions r
    LEFT JOIN admins a ON a.id = r.admin_id LEFT JOIN orders o ON o.id = r.order_id WHERE r.voucher_id = ? ORDER BY r.id DESC`, id);
  return json({ row, redemptions });
});

export const onRequestPatch = handle(async ({ request, env, params, data }) => {
  requireRole(data.admin, 'manager');
  const id = int(params.id, 'id', { required: true, min: 1 });
  const body = await readJson(request);
  const action = oneOf(body.action, 'action', ['void', 'extend', 'reactivate']);
  const now = nowIso();
  if (action === 'void') await run(env.DB, "UPDATE vouchers SET status = 'void', updated_at = ? WHERE id = ?", now, id);
  if (action === 'reactivate') await run(env.DB, "UPDATE vouchers SET status = CASE WHEN balance_fils > 0 THEN 'active' ELSE 'redeemed' END, updated_at = ? WHERE id = ? AND status IN ('void','expired')", now, id);
  if (action === 'extend') {
    const days = int(body.days, 'days', { required: true, min: 1, max: 3650 });
    await run(env.DB, `UPDATE vouchers SET expires_at = strftime('%Y-%m-%dT%H:%M:%fZ', MAX(COALESCE(expires_at, ?), ?), '+' || ? || ' days'),
      status = CASE WHEN status = 'expired' AND balance_fils > 0 THEN 'active' ELSE status END, updated_at = ? WHERE id = ?`, now, now, days, now, id);
  }
  await audit(env, data.admin.id, `voucher.${action}`, 'voucher', id, body, data.ip);
  return json({ row: await one(env.DB, 'SELECT * FROM vouchers WHERE id = ?', id) });
});
