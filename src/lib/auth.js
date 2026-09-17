import { HttpError, clientIp } from './http.js';
import { one, run, nowIso } from './db.js';
import { randomToken, sha256Hex, verifyPassword } from './crypto.js';

export const SESSION_COOKIE = 'ti_admin';
const SESSION_HOURS = 12;
const ROLE_RANK = { staff: 1, manager: 2, owner: 3 };

// Used when the email is unknown, so a wrong email takes as long to reject as
// a wrong password and response timing cannot reveal which accounts exist.
const DUMMY = { password_salt: 'AAAAAAAAAAAAAAAAAAAAAA==', password_iter: 100000, password_hash: '' };

function cookieAttrs(request) {
  const secure = new URL(request.url).protocol === 'https:';
  return `Path=/api/admin; HttpOnly; SameSite=Strict${secure ? '; Secure' : ''}`;
}

export function readCookie(request, name) {
  const header = request.headers.get('cookie') || '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
}

export const publicAdmin = (a) => a && ({
  id: a.id, email: a.email, name: a.name, role: a.role, active: !!a.active,
  last_login_at: a.last_login_at, created_at: a.created_at,
});

export const roleAtLeast = (admin, role) => (ROLE_RANK[admin.role] || 0) >= ROLE_RANK[role];

export async function audit(env, adminId, action, entity = null, entityId = null, detail = null, ip = null) {
  await run(env.DB,
    'INSERT INTO audit_log (admin_id, action, entity, entity_id, detail, ip) VALUES (?, ?, ?, ?, ?, ?)',
    adminId, action, entity, entityId == null ? null : String(entityId), detail ? JSON.stringify(detail) : null, ip);
}

export async function login(env, request, email, password) {
  const ip = clientIp(request);
  const since = new Date(Date.now() - 15 * 60000).toISOString();
  const [byEmail, byIp] = await Promise.all([
    one(env.DB, 'SELECT COUNT(*) AS n FROM login_attempts WHERE email = ? AND ok = 0 AND created_at > ?', email, since),
    one(env.DB, 'SELECT COUNT(*) AS n FROM login_attempts WHERE ip = ? AND ok = 0 AND created_at > ?', ip, since),
  ]);
  if (byEmail.n >= 5 || byIp.n >= 20) {
    throw new HttpError(429, 'Too many failed attempts. For security, sign-in is paused for 15 minutes.');
  }

  const admin = await one(env.DB, 'SELECT * FROM admins WHERE email = ? AND active = 1', email);
  const matches = await verifyPassword(password, admin || DUMMY);
  const ok = !!admin && matches;
  await run(env.DB, 'INSERT INTO login_attempts (email, ip, ok) VALUES (?, ?, ?)', email, ip, ok ? 1 : 0);
  if (!ok) throw new HttpError(401, 'Email or password is incorrect.');

  const token = randomToken(32);
  const tokenHash = await sha256Hex(token);
  const now = nowIso();
  const expires = new Date(Date.now() + SESSION_HOURS * 3600000).toISOString();
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO sessions (token_hash, admin_id, ip, user_agent, expires_at) VALUES (?, ?, ?, ?, ?)')
      .bind(tokenHash, admin.id, ip, (request.headers.get('user-agent') || '').slice(0, 200), expires),
    env.DB.prepare('UPDATE admins SET last_login_at = ? WHERE id = ?').bind(now, admin.id),
    env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now),
    env.DB.prepare('DELETE FROM login_attempts WHERE created_at < ?').bind(weekAgo),
  ]);
  await audit(env, admin.id, 'auth.login', 'admin', admin.id, null, ip);
  return {
    admin: publicAdmin({ ...admin, last_login_at: now }),
    cookie: `${SESSION_COOKIE}=${token}; ${cookieAttrs(request)}; Max-Age=${SESSION_HOURS * 3600}`,
  };
}

export async function currentAdmin(env, request) {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token || token.length < 20) return null;
  const tokenHash = await sha256Hex(token);
  const row = await one(env.DB,
    `SELECT a.*, s.token_hash, s.last_seen_at AS session_seen
       FROM sessions s JOIN admins a ON a.id = s.admin_id
      WHERE s.token_hash = ? AND s.expires_at > ? AND a.active = 1`,
    tokenHash, nowIso());
  if (!row) return null;
  if (Date.now() - Date.parse(row.session_seen) > 5 * 60000) {
    await run(env.DB, 'UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?', nowIso(), tokenHash);
  }
  return row;
}

export async function logout(env, request) {
  const token = readCookie(request, SESSION_COOKIE);
  if (token) await run(env.DB, 'DELETE FROM sessions WHERE token_hash = ?', await sha256Hex(token));
  return `${SESSION_COOKIE}=; ${cookieAttrs(request)}; Max-Age=0`;
}

export function requireRole(admin, role) {
  if (!admin) throw new HttpError(401, 'Please sign in.');
  if (!roleAtLeast(admin, role)) throw new HttpError(403, 'Your role does not allow this.');
}
