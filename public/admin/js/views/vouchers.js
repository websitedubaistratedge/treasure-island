import { api } from '../api.js';
import { html, ico, mount, $, aed, fmtDate, fmtDateTime, ago, badge, debounce, drawer, modal, toast, errorToast, busy, values, showErrors, confirmDialog, waLink, raw } from '../ui.js';

const TABS = [['', 'All'], ['active', 'Active'], ['redeemed', 'Used up'], ['pending', 'Awaiting payment'], ['void', 'Void'], ['expired', 'Expired']];

export default async function vouchers(root, ctx) {
  ctx.setCrumbs([{ label: 'Gift vouchers' }]);
  const manager = ctx.can('manager');
  const st = { status: '', q: '' };

  mount(root, html`
  <div class="page-head">
    <div><h1>Gift vouchers</h1><p>Redeem at the desk, issue new ones, and see what is still unspent.</p></div>
    ${manager ? html`<div class="page-actions"><button class="btn btn-primary" data-issue>${ico('plus')} Issue voucher</button></div>` : ''}
  </div>
  <div class="layout-side">
    <div class="card">
      <div class="toolbar">
        <div class="tabs">${TABS.map(([v, l]) => html`<button class="tab ${st.status === v ? 'on' : ''}" data-status="${v}">${l}</button>`)}</div>
        <div class="input-group">${ico('search')}<input class="input" type="search" data-q placeholder="Code or name"></div>
      </div>
      <div data-list></div>
    </div>
    <form class="card" data-redeem novalidate>
      <div class="card-head"><div class="h2">Redeem at the desk</div>${ico('gift')}</div>
      <div class="card-body form">
        <div class="field"><label>Voucher code</label><input class="input mono" name="code" placeholder="GIFT-XXXX-XXXX" autocomplete="off"></div>
        <div class="field"><label>Amount to use</label><div class="input-group has-suffix"><input class="input" name="amount" type="number" step="0.01" min="0"><span class="suffix">AED</span></div></div>
        <div class="field"><label>Note</label><input class="input" name="note" placeholder="e.g. Birthday balance"></div>
        <button class="btn btn-primary" type="submit">${ico('check')} Redeem</button>
        <div data-result></div>
      </div>
    </form>
  </div>`);

  async function load() {
    const q = new URLSearchParams();
    if (st.status) q.set('status', st.status);
    if (st.q) q.set('q', st.q);
    const { rows } = await api(`/vouchers?${q}`);
    if (!ctx.isCurrent()) return;
    mount($('[data-list]', root), rows.length ? html`<div class="table-wrap"><table class="table">
      <thead><tr><th>Code</th><th>For</th><th>Balance</th><th>Status</th><th>Expires</th></tr></thead>
      <tbody>${rows.map((v) => html`<tr class="click" data-id="${v.id}">
        <td class="mono cell-main">${v.code}</td>
        <td><div class="cell-main">${v.recipient_name || '—'}</div><div class="cell-sub">${v.purchaser_name ? `from ${v.purchaser_name}` : ''}</div></td>
        <td><div class="nums cell-main">${aed(v.balance_fils)}</div><div class="bar"><i data-w="${(v.balance_fils / v.initial_fils) * 100}"></i></div><div class="cell-sub">of ${aed(v.initial_fils)}</div></td>
        <td>${badge(v.status)}</td><td>${fmtDate(v.expires_at)}</td></tr>`)}</tbody></table></div>`
      : html`<div class="empty"><div class="empty-ico">${ico('gift')}</div><b>No vouchers${st.q || st.status ? ' match' : ' yet'}</b></div>`);
  }

  async function openVoucher(id) {
    const d = drawer({ title: 'Gift voucher' });
    const draw = async () => {
      const { row: v, redemptions } = await api(`/vouchers/${id}`);
      d.setTitle(v.code);
      mount(d.body, html`<div class="stack">
        <div class="code-box"><span>${v.code}</span><button class="btn btn-ghost btn-sm" data-copy>${ico('copy')} Copy</button></div>
        <div class="grid-2"><div class="card card-pad"><div class="eyebrow">Balance</div><div class="kpi-val nums">${aed(v.balance_fils)}</div></div>
          <div class="card card-pad"><div class="eyebrow">Status</div><div>${badge(v.status)}</div><div class="help">Expires ${fmtDate(v.expires_at)}</div></div></div>
        <dl class="kv"><dt>Value</dt><dd>${aed(v.initial_fils)}</dd><dt>For</dt><dd>${v.recipient_name || '—'}</dd><dt>From</dt><dd>${v.purchaser_name || '—'}</dd>
          ${v.message ? html`<dt>Message</dt><dd>“${v.message}”</dd>` : ''}<dt>Issued</dt><dd>${fmtDateTime(v.created_at)}</dd>
          ${v.order_id ? html`<dt>Order</dt><dd><a href="#/orders/${v.order_id}">View order</a></dd>` : ''}</dl>
        <div class="card"><div class="card-head"><div class="h2">Used</div><span class="sub">${redemptions.length}</span></div>
          ${redemptions.length ? html`<div class="list">${redemptions.map((r) => html`<div class="list-row"><div class="grow"><div class="cell-main nums">− ${aed(r.amount_fils)}</div><div class="cell-sub">${r.note || (r.order_ref ? `Order ${r.order_ref}` : '')}${r.admin_name ? ` · ${r.admin_name}` : ''}</div></div><span class="sub">${ago(r.created_at)}</span></div>`)}</div>` : html`<div class="empty"><b>Not used yet</b></div>`}</div>
      </div>`);
      if (manager) d.setFoot(html`${['active', 'pending'].includes(v.status) ? html`<button class="btn btn-danger" data-act="void">Void</button>` : ''}
        ${['void', 'expired'].includes(v.status) ? html`<button class="btn btn-ghost" data-act="reactivate">Reactivate</button>` : ''}
        <div class="top-spacer"></div><button class="btn btn-ghost" data-act="extend">${ico('clock')} Extend expiry</button>`);
    };
    try { await draw(); } catch (err) { errorToast(err); d.close(); return; }
    d.el.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      try {
        if (b.dataset.act === 'void' && !(await confirmDialog({ title: 'Void this voucher?', message: 'It can no longer be used. You can reactivate it later.', confirm: 'Void', danger: true }))) return;
        let body = { action: b.dataset.act };
        if (b.dataset.act === 'extend') {
          const days = await modal({ title: 'Extend expiry', body: html`<div class="field"><label>Add days</label><input class="input" type="number" min="1" value="90" data-days></div>`,
            actions: [{ label: 'Cancel', value: null }, { label: 'Extend', cls: 'btn-primary', onClick: (m) => m.querySelector('[data-days]').value }] });
          if (!days) return;
          body = { action: 'extend', days: Number(days) };
        }
        await api(`/vouchers/${id}`, { method: 'PATCH', body });
        toast('Voucher updated');
        await draw(); load();
      } catch (err) { errorToast(err); }
    });
  }

  function openIssue() {
    const d = drawer({ title: 'Issue a gift voucher' });
    mount(d.body, html`<form class="form" novalidate>
      <div class="field"><label>Amount *</label><div class="input-group has-suffix"><input class="input" name="amount" type="number" min="1" step="0.01" value="200"><span class="suffix">AED</span></div></div>
      <div class="grid-2"><div class="field"><label>For</label><input class="input" name="recipient" placeholder="Recipient's name"></div>
        <div class="field"><label>From</label><input class="input" name="purchaser" placeholder="Who is giving it"></div></div>
      <div class="field"><label>Message</label><textarea class="textarea" name="message" rows="2" maxlength="300" placeholder="Happy birthday!"></textarea></div>
      <div class="field"><label>Valid for</label><div class="input-group has-suffix"><input class="input" name="validity_days" type="number" min="1" value="365"><span class="suffix">days</span></div></div>
    </form>`);
    d.setFoot(html`<button class="btn btn-ghost" data-cancel>Cancel</button><button class="btn btn-primary" data-save>${ico('gift')} Issue voucher</button>`);
    d.el.addEventListener('click', async (e) => {
      if (e.target.closest('[data-cancel]')) d.close();
      const save = e.target.closest('[data-save]');
      if (!save) return;
      const v = values($('form', d.body));
      await busy(save, async () => {
        try {
          const { row } = await api('/vouchers', { method: 'POST', body: v });
          load();
          const share = `🎁 A Treasure Island gift voucher${row.recipient_name ? ` for ${row.recipient_name}` : ''}!\n\nValue: ${aed(row.initial_fils)}\nCode: ${row.code}\nValid until ${fmtDate(row.expires_at)}\n\nShow this code at Treasure Island, Galeries Lafayette, The Dubai Mall.`;
          mount(d.body, html`<div class="stack"><div class="callout ok">${ico('check')}<div><b>Voucher issued.</b> Share the code with the customer.</div></div>
            <div class="code-box"><span>${row.code}</span><button class="btn btn-ghost btn-sm" data-copy>${ico('copy')} Copy</button></div>
            <dl class="kv"><dt>Value</dt><dd>${aed(row.initial_fils)}</dd><dt>Expires</dt><dd>${fmtDate(row.expires_at)}</dd></dl></div>`);
          d.setFoot(html`<button class="btn btn-ghost" data-copy="${share}">${ico('copy')} Copy message</button><a class="btn btn-dark" href="${waLink('', share)}" target="_blank" rel="noopener">${ico('whatsapp')} Share on WhatsApp</a>`);
        } catch (err) { showErrors(d.body, err); }
      });
    });
  }

  root.addEventListener('click', (e) => {
    const t = e.target.closest('[data-status]');
    if (t) { st.status = t.dataset.status; root.querySelectorAll('.tab').forEach((x) => x.classList.toggle('on', x === t)); load().catch(errorToast); }
    const r = e.target.closest('tr[data-id]');
    if (r) openVoucher(Number(r.dataset.id));
    if (e.target.closest('[data-issue]')) openIssue();
  });
  $('[data-q]', root).addEventListener('input', debounce((e) => { st.q = e.target.value.trim(); load().catch(errorToast); }));
  $('[data-redeem]', root).addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const v = values(form);
    const out = $('[data-result]', form);
    await busy(form.querySelector('button[type=submit]'), async () => {
      try {
        const { row } = await api('/vouchers/redeem', { method: 'POST', body: v });
        mount(out, html`<div class="result ok"><div class="big nums">${aed(row.balance_fils)}</div><div>left on <b class="mono">${row.code}</b></div></div>`);
        form.elements.amount.value = ''; form.elements.note.value = '';
        load();
      } catch (err) {
        mount(out, html`<div class="result bad"><b>${err.message}</b></div>`);
        showErrors(form, err);
      }
    });
  });
  await load();
  if (ctx.query.get('open')) openVoucher(Number(ctx.query.get('open')));
  if (ctx.query.get('new') && manager) openIssue();
}
