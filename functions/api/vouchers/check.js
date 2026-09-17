import { handle, json, readJson, clientIp, assertSameOrigin } from '../../../src/lib/http.js';
import { rateLimit } from '../../../src/lib/ratelimit.js';
import { str } from '../../../src/lib/validate.js';
import { one, nowIso } from '../../../src/lib/db.js';

export const onRequestPost = handle(async ({ request, env }) => {
  assertSameOrigin(request);
  await rateLimit(env.DB, `voucher-check:${clientIp(request)}`, 20, 3600);
  const { code } = await readJson(request, 2048);
  const c = (str(code, 'code', { required: true, max: 40, label: 'Code' }) || '').toUpperCase();
  const v = await one(env.DB, 'SELECT balance_fils, status, expires_at FROM vouchers WHERE code = ?', c);
  const valid = !!v && v.status === 'active' && v.balance_fils > 0 && (!v.expires_at || v.expires_at > nowIso());
  return json(valid ? { valid, balance_fils: v.balance_fils, expires_at: v.expires_at } : { valid: false });
});
