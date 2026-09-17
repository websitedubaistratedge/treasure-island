import { handle, json, readJson, clientIp, assertSameOrigin } from '../../src/lib/http.js';
import { rateLimit } from '../../src/lib/ratelimit.js';
import { str, phone, email, oneOf } from '../../src/lib/validate.js';
import { run } from '../../src/lib/db.js';
import { getSettings } from '../../src/lib/settings.js';
import { sendEmail } from '../../src/lib/email.js';

export const onRequestPost = handle(async ({ request, env }) => {
  assertSameOrigin(request);
  const body = await readJson(request, 16 * 1024);
  // Bots fill every field, people never see this one.
  if (body.website) return json({ ok: true });
  await rateLimit(env.DB, `enquiry:${clientIp(request)}`, 8, 3600);

  const kind = oneOf(body.kind || 'contact', 'kind', ['contact', 'birthday', 'event', 'other']);
  const name = str(body.name, 'name', { max: 120, label: 'Name' });
  // Never lose an enquiry over formatting: a phone or email that does not
  // validate is kept as typed in the payload instead of rejecting the message.
  const extra = {};
  let tel = null;
  let mail = null;
  try { tel = phone(body.phone, 'phone', { required: false }); } catch { extra.phone_as_typed = String(body.phone).slice(0, 40); }
  try { mail = email(body.email, 'email'); } catch { extra.email_as_typed = String(body.email).slice(0, 120); }
  const message = str(body.message, 'message', { max: 3000, label: 'Message' });
  if (body.fields && typeof body.fields === 'object') {
    for (const [k, v] of Object.entries(body.fields).slice(0, 30)) {
      if (typeof k === 'string' && k.length <= 60 && (typeof v === 'string' || typeof v === 'number')) extra[k] = String(v).slice(0, 500);
    }
  }
  const page = str(body.page, 'page', { max: 200 });
  await run(env.DB,
    'INSERT INTO enquiries (kind, name, phone, email, message, payload, source_page) VALUES (?, ?, ?, ?, ?, ?, ?)',
    kind, name, tel, mail, message, JSON.stringify(extra), page);

  const settings = await getSettings(env.DB);
  await sendEmail(env, {
    to: settings.notifications.email,
    subject: `New ${kind} enquiry${name ? ` from ${name}` : ''}`,
    text: [name, tel, mail, message, ...Object.entries(extra).map(([k, v]) => `${k}: ${v}`)].filter(Boolean).join('\n'),
  });
  return json({ ok: true }, 201);
});
