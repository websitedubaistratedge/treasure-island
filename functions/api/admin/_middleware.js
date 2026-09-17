import { handle, HttpError, assertSameOrigin, clientIp } from '../../../src/lib/http.js';
import { currentAdmin } from '../../../src/lib/auth.js';

// Every admin route: mutating requests must be same-origin and carry the
// X-TI-Admin header (which a cross-site form cannot set), and everything
// except sign-in needs a live session.
export const onRequest = handle(async (context) => {
  const { request, env, data, next } = context;
  if (!['GET', 'HEAD'].includes(request.method)) {
    assertSameOrigin(request);
    if (request.headers.get('x-ti-admin') !== '1') throw new HttpError(403, 'Request refused.');
  }
  data.ip = clientIp(request);
  if (new URL(request.url).pathname === '/api/admin/login') return next();
  const admin = await currentAdmin(env, request);
  if (!admin) throw new HttpError(401, 'Your session has ended. Please sign in again.');
  data.admin = admin;
  const res = await next();
  const headers = new Headers(res.headers);
  headers.set('cache-control', 'no-store');
  return new Response(res.body, { status: res.status, headers });
});
