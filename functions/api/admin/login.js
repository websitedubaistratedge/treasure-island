import { handle, json, readJson } from '../../../src/lib/http.js';
import { login } from '../../../src/lib/auth.js';
import { str, email } from '../../../src/lib/validate.js';

export const onRequestPost = handle(async ({ request, env }) => {
  const body = await readJson(request, 4096);
  const address = email(body.email, 'email', { required: true });
  const password = str(body.password, 'password', { required: true, max: 200, label: 'Password' });
  const { admin, cookie } = await login(env, request, address, password);
  return json({ admin }, 200, { 'set-cookie': cookie });
});
