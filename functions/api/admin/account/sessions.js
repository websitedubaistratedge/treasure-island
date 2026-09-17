import { handle, json } from '../../../../src/lib/http.js';
import { all, run } from '../../../../src/lib/db.js';
import { audit, readCookie, SESSION_COOKIE } from '../../../../src/lib/auth.js';
import { sha256Hex } from '../../../../src/lib/crypto.js';

export const onRequestGet = handle(async ({ request, env, data }) => {
  const mine = await sha256Hex(readCookie(request, SESSION_COOKIE) || '');
  const rows = await all(env.DB, 'SELECT token_hash, ip, user_agent, created_at, last_seen_at, expires_at FROM sessions WHERE admin_id = ? AND expires_at > ? ORDER BY last_seen_at DESC', data.admin.id, new Date().toISOString());
  return json({ rows: rows.map((r) => ({ current: r.token_hash === mine, ip: r.ip, user_agent: r.user_agent, created_at: r.created_at, last_seen_at: r.last_seen_at })) });
});

// Signs out every other device.
export const onRequestDelete = handle(async ({ request, env, data }) => {
  const mine = await sha256Hex(readCookie(request, SESSION_COOKIE) || '');
  await run(env.DB, 'DELETE FROM sessions WHERE admin_id = ? AND token_hash != ?', data.admin.id, mine);
  await audit(env, data.admin.id, 'account.sessions_revoked', 'admin', data.admin.id, null, data.ip);
  return json({ ok: true });
});
