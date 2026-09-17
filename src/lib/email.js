// Staff notifications. Sends through Resend when RESEND_API_KEY and EMAIL_FROM
// are configured; otherwise it is a no-op and everything still shows up in the
// admin panel.
export async function sendEmail(env, { to, subject, text }) {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM || !to) return false;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: env.EMAIL_FROM, to: [to], subject, text }),
    });
    if (!res.ok) console.error('email failed', res.status);
    return res.ok;
  } catch (err) {
    console.error('email error', err);
    return false;
  }
}
