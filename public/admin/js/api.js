export class ApiError extends Error {
  constructor(status, data) {
    super((data && data.error) || `Request failed (${status})`);
    this.status = status;
    this.data = data || {};
    this.field = this.data.field;
  }
}

// Every mutating call sends X-TI-Admin: the server refuses admin writes
// without it, which a cross-site form cannot forge.
export async function api(path, { method = 'GET', body, raw = false, headers = {} } = {}) {
  const init = { method, headers: { ...headers }, credentials: 'same-origin' };
  if (method !== 'GET') init.headers['x-ti-admin'] = '1';
  if (body instanceof Blob || body instanceof ArrayBuffer) init.body = body;
  else if (body !== undefined) {
    init.headers['content-type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(`/api/admin${path}`, init);
  } catch {
    throw new ApiError(0, { error: 'Cannot reach the server. Check the connection and try again.' });
  }
  if (res.status === 401 && path !== '/login') window.dispatchEvent(new CustomEvent('ti:unauthorized'));
  if (raw) return res;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}
