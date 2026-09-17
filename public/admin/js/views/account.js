import { api } from '../api.js';
import { html, ico, mount, $, ago, badge, toast, errorToast, busy, values, showErrors, confirmDialog, initials, raw } from '../ui.js';

function strength(pw) {
  let score = 0;
  if (pw.length >= 12) score++;
  if (pw.length >= 16) score++;
  score += [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
  return Math.min(score, 6);
}
const device = (ua = '') => {
  const os = /iPhone|iPad/.test(ua) ? 'iPhone/iPad' : /Android/.test(ua) ? 'Android' : /Mac OS/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'Device';
  const br = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : /Firefox\//.test(ua) ? 'Firefox' : 'Browser';
  return `${br} on ${os}`;
};

export default async function account(root, ctx) {
  ctx.setCrumbs([{ label: 'My account' }]);
  async function load() {
    const { rows } = await api('/account/sessions');
    if (!ctx.isCurrent()) return;
    const me = ctx.me;
    mount(root, html`
    <div class="page-head"><div><h1>My account</h1><p>Your password and where you are signed in.</p></div></div>
    <div class="layout-2">
      <form class="card" data-pw novalidate>
        <div class="card-head"><div class="h2">Change password</div>${ico('lock')}</div>
        <div class="card-body form">
          <div class="field"><label>Current password</label><input class="input" type="password" name="current" autocomplete="current-password"></div>
          <div class="field"><label>New password</label><input class="input" type="password" name="next" autocomplete="new-password">
            <div class="pw-meter"><i data-meter></i></div><div class="help" data-hint>At least 12 characters, using three of: lowercase, uppercase, numbers, symbols.</div></div>
          <div class="field"><label>Repeat new password</label><input class="input" type="password" name="repeat" autocomplete="new-password"></div>
          <div class="row-between"><span class="help">Other devices will be signed out.</span><button class="btn btn-primary" type="submit">${ico('check')} Update password</button></div>
        </div>
      </form>
      <div class="stack">
        <div class="card card-pad"><div class="row"><span class="avatar">${initials(me.name)}</span><div class="grow"><div class="cell-main">${me.name}</div><div class="cell-sub">${me.email}</div></div>${badge(me.role)}</div></div>
        <div class="card">
          <div class="card-head"><div class="h2">Signed in on</div>${rows.length > 1 ? html`<button class="btn btn-ghost btn-sm" data-revoke>Sign out others</button>` : ''}</div>
          <div class="list">${rows.map((s) => html`<div class="list-row"><span class="kpi-ico tone-navy">${ico('shield')}</span>
            <div class="grow"><div class="cell-main">${device(s.user_agent)}${s.current ? html` <span class="badge b-ok">This device</span>` : ''}</div><div class="cell-sub">${s.ip || ''} · active ${ago(s.last_seen_at)}</div></div></div>`)}</div>
        </div>
      </div>
    </div>`);
  }
  root.addEventListener('input', (e) => {
    if (e.target.name !== 'next') return;
    const s = strength(e.target.value);
    const meter = $('[data-meter]', root);
    meter.style.width = `${(s / 6) * 100}%`;
    meter.style.background = s <= 2 ? 'var(--bad)' : s <= 4 ? 'var(--gold-600)' : 'var(--ok)';
    $('[data-hint]', root).textContent = !e.target.value ? 'At least 12 characters, using three of: lowercase, uppercase, numbers, symbols.' : s <= 2 ? 'Weak' : s <= 4 ? 'Good' : 'Strong';
  });
  root.addEventListener('submit', async (e) => {
    if (!e.target.matches('[data-pw]')) return;
    e.preventDefault();
    const form = e.target;
    const v = values(form);
    if (v.next !== v.repeat) { showErrors(form, { field: 'repeat', message: 'The new passwords do not match.' }); return; }
    await busy(form.querySelector('button[type=submit]'), async () => {
      try { await api('/account/password', { method: 'POST', body: { current: v.current, next: v.next } }); toast('Password updated. Other devices were signed out.'); load(); } catch (err) { showErrors(form, err); }
    });
  });
  root.addEventListener('click', async (e) => {
    if (!e.target.closest('[data-revoke]')) return;
    if (!(await confirmDialog({ title: 'Sign out other devices?', message: 'Every other browser signed in as you will need to sign in again.', confirm: 'Sign them out' }))) return;
    try { await api('/account/sessions', { method: 'DELETE' }); toast('Other devices signed out'); load(); } catch (err) { errorToast(err); }
  });
  await load();
}
