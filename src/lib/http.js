// Response helpers shared by every Function. All API responses are JSON,
// never cached, and errors never leak internals to the client.

export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

const BASE_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'same-origin',
};

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { ...BASE_HEADERS, ...headers } });
}

export function errorResponse(err) {
  if (err instanceof HttpError) {
    return json({ error: err.message, ...err.extra }, err.status);
  }
  console.error('unhandled', err && err.stack ? err.stack : err);
  return json({ error: 'Something went wrong. Please try again.' }, 500);
}

// Wraps a handler so thrown HttpErrors become proper responses.
export function handle(fn) {
  return async (context) => {
    try {
      return await fn(context);
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export async function readJson(request, maxBytes = 64 * 1024) {
  const type = request.headers.get('content-type') || '';
  if (!type.includes('application/json')) throw new HttpError(415, 'Expected JSON.');
  const text = await request.text();
  if (text.length > maxBytes) throw new HttpError(413, 'Request too large.');
  try {
    const data = JSON.parse(text || '{}');
    if (data === null || typeof data !== 'object' || Array.isArray(data)) throw new Error('not an object');
    return data;
  } catch {
    throw new HttpError(400, 'Malformed JSON.');
  }
}

export function clientIp(request) {
  return request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || '0.0.0.0';
}

// Mutating requests must come from this site. Browsers always send Origin on
// cross-site POST/PATCH/DELETE, so a mismatch means a forged request.
export function assertSameOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin) return;
  const host = new URL(request.url).host;
  let originHost;
  try { originHost = new URL(origin).host; } catch { originHost = ''; }
  if (originHost !== host) throw new HttpError(403, 'Cross-site request refused.');
}
