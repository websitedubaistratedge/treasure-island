import { handle, json } from '../../../src/lib/http.js';
import { logout, audit } from '../../../src/lib/auth.js';

export const onRequestPost = handle(async ({ request, env, data }) => {
  const cookie = await logout(env, request);
  await audit(env, data.admin.id, 'auth.logout', 'admin', data.admin.id, null, data.ip);
  return json({ ok: true }, 200, { 'set-cookie': cookie });
});
