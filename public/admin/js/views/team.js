import { api } from '../api.js';
import { html, ico, mount, $, ago, badge, drawer, toast, errorToast, busy, values, showErrors, confirmDialog, showSecret, initials, waLink, raw } from '../ui.js';

const ROLES = {
  owner: 'Everything, including card payments, the team and refunds.',
  manager: 'Programmes, sessions, prices, boutique, vouchers, passes, announcements, settings, refunds and exports.',
  staff: 'Bookings, check-in, redeeming vouchers, enquiries and boutique stock. Cannot change prices or settings.',
};

export default async function team(root, ctx) {
  ctx.setCrumbs([{ label: 'Team' }]);
  const owner = ctx.can('owner');
  let rows = [];

  async function load() {
    rows = (await api('/team')).rows;
    if (!ctx.isCurrent()) return;
    mount(root, html`
    <div class="page-head">
      <div><h1>Team</h1><p>Who can sign in to this panel, and what they can do.</p></div>
      ${owner ? html`<div class="page-actions"><button class="btn btn-primary" data-add>${ico('plus')} Add member</button></div>` : ''}
    </div>
    <div class="layout-side">
      <div class="card"><div class="table-wrap"><table class="table">
        <thead><tr><th>Member</th><th>Role</th><th>Last sign-in</th><th>Access</th><th></th></tr></thead>
        <tbody>${rows.map((m) => html`<tr>
          <td><div class="row"><span class="avatar">${initials(m.name)}</span><div><div class="cell-main">${m.name}${m.id === ctx.me.id ? html` <span class="tag">You</span>` : ''}</div><div class="cell-sub">${m.email}</div></div></div></td>
          <td>${owner && m.id !== ctx.me.id ? html`<select class="select" data-role="${m.id}">${Object.keys(ROLES).map((r) => html`<option value="${r}" ${m.role === r ? raw('selected') : ''}>${r[0].toUpperCase() + r.slice(1)}</option>`)}</select>` : badge(m.role)}</td>
          <td>${m.last_login_at ? ago(m.last_login_at) : html`<span class="muted">Never</span>`}</td>
          <td>${owner && m.id !== ctx.me.id ? html`<label class="switch"><input type="checkbox" data-active="${m.id}" ${m.active ? raw('checked') : ''}><span class="track"></span><span class="sub">${m.active ? 'Active' : 'Blocked'}</span></label>` : badge(m.active ? 'active' : 'void', m.active ? 'Active' : 'Blocked')}</td>
          <td class="right">${owner ? html`<div class="row"><button class="btn btn-quiet btn-sm" data-reset="${m.id}">${ico('lock')} Reset password</button>
            ${m.id !== ctx.me.id ? html`<button class="btn btn-quiet btn-icon btn-sm" data-remove="${m.id}" aria-label="Remove">${ico('trash')}</button>` : ''}</div>` : ''}</td>
        </tr>`)}</tbody></table></div></div>
      <div class="card"><div class="card-head"><div class="h2">Roles</div></div><div class="card-body stack">
        ${Object.entries(ROLES).map(([r, text]) => html`<div>${badge(r)}<div class="help">${text}</div></div>`)}
        <div class="callout">${ico('shield')}<div>Passwords are never stored in readable form. After 5 wrong attempts sign-in pauses for 15 minutes.</div></div>
      </div></div>
    </div>`);
  }

  const loginMessage = (m, password) => `Treasure Island admin access\n\nWebsite: ${location.origin}/admin/\nEmail: ${m.email}\nPassword: ${password}\n\nPlease change the password after signing in (My account).`;

  async function reveal(m, password, title) {
    await showSecret({ title, intro: `Share these sign-in details with ${m.name} privately.`, label: 'Password', secret: password });
    await confirmDialog({ title: 'Send the details?', message: 'Copy a ready-made message, or open WhatsApp with it. Delete the message from the chat once they have signed in.', confirm: 'Close' });
  }

  root.addEventListener('click', async (e) => {
    if (e.target.closest('[data-add]')) {
      const d = drawer({ title: 'Add a team member' });
      mount(d.body, html`<form class="form" novalidate>
        <div class="field"><label>Name *</label><input class="input" name="name"></div>
        <div class="field"><label>Email *</label><input class="input" name="email" type="email"><div class="help">This is what they sign in with.</div></div>
        <div class="field"><label>Role</label><div class="stack">${Object.entries(ROLES).map(([r, text]) => html`<label class="check"><input type="radio" name="role" value="${r}" ${r === 'staff' ? raw('checked') : ''}><span><b>${r[0].toUpperCase() + r.slice(1)}</b><div class="help">${text}</div></span></label>`)}</div></div>
        <div class="callout">${ico('lock')}<div>A strong password is generated for them and shown to you once.</div></div>
      </form>`);
      d.setFoot(html`<button class="btn btn-ghost" data-cancel>Cancel</button><button class="btn btn-primary" data-save>${ico('plus')} Add member</button>`);
      d.el.addEventListener('click', async (ev) => {
        if (ev.target.closest('[data-cancel]')) d.close();
        const save = ev.target.closest('[data-save]');
        if (!save) return;
        await busy(save, async () => {
          try {
            const r = await api('/team', { method: 'POST', body: values($('form', d.body)) });
            d.close(); load();
            const msg = loginMessage(r.row, r.password);
            const d2 = drawer({ title: `${r.row.name} added` });
            mount(d2.body, html`<div class="stack"><div class="callout ok">${ico('check')}<div>Share these details privately. The password is shown only once.</div></div>
              <dl class="kv"><dt>Sign in at</dt><dd>${location.origin}/admin/</dd><dt>Email</dt><dd>${r.row.email}</dd></dl>
              <div class="code-box"><span>${r.password}</span><button class="btn btn-ghost btn-sm" data-copy>${ico('copy')} Copy</button></div></div>`);
            d2.setFoot(html`<button class="btn btn-ghost" data-copy="${msg}">${ico('copy')} Copy message</button><a class="btn btn-dark" href="${waLink('', msg)}" target="_blank" rel="noopener">${ico('whatsapp')} Send on WhatsApp</a>`);
          } catch (err) { showErrors(d.body, err); }
        });
      });
    }
    const reset = e.target.closest('[data-reset]');
    if (reset) {
      const m = rows.find((x) => x.id === Number(reset.dataset.reset));
      if (!(await confirmDialog({ title: `Reset ${m.name}'s password?`, message: 'A new password is generated and they are signed out everywhere.', confirm: 'Reset password', danger: true }))) return;
      try {
        const r = await api(`/team/${m.id}`, { method: 'PATCH', body: { resetPassword: true } });
        if (m.id === ctx.me.id) { await showSecret({ title: 'Your new password', intro: 'You will need it the next time you sign in.', label: 'Password', secret: r.password }); }
        else await showSecret({ title: 'New password', intro: `Share it with ${m.name} privately.`, label: 'Password', secret: r.password });
        load();
      } catch (err) { errorToast(err); }
    }
    const rm = e.target.closest('[data-remove]');
    if (rm) {
      const m = rows.find((x) => x.id === Number(rm.dataset.remove));
      if (!(await confirmDialog({ title: `Remove ${m.name}?`, message: 'They lose access immediately. Their past actions stay in the activity log.', confirm: 'Remove', danger: true }))) return;
      try { await api(`/team/${m.id}`, { method: 'DELETE' }); toast('Member removed'); load(); } catch (err) { errorToast(err); }
    }
  });
  root.addEventListener('change', async (e) => {
    const role = e.target.closest('[data-role]');
    const active = e.target.closest('[data-active]');
    try {
      if (role) { await api(`/team/${role.dataset.role}`, { method: 'PATCH', body: { role: role.value } }); toast('Role updated'); }
      if (active) { await api(`/team/${active.dataset.active}`, { method: 'PATCH', body: { active: active.checked } }); toast(active.checked ? 'Access restored' : 'Access blocked and signed out'); }
      load();
    } catch (err) { errorToast(err); load(); }
  });
  await load();
}
