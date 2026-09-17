import { api } from '../api.js';
import { html, ico, mount, $, fmtDate, fmtDateTime, ago, badge, debounce, drawer, modal, toast, errorToast, busy, values, showErrors, confirmDialog, raw } from '../ui.js';

const TABS = [['', 'All'], ['active', 'Active'], ['used_up', 'Used up'], ['pending', 'Awaiting payment'], ['expired', 'Expired'], ['void', 'Void']];

export default async function passes(root, ctx) {
  ctx.setCrumbs([{ label: 'Passes' }]);
  const manager = ctx.can('manager');
  const st = { status: '', q: '' };
  const passTypes = manager ? (await api('/offerings')).rows.filter((o) => o.kind === 'pass') : [];

  mount(root, html`
  <div class="page-head">
    <div><h1>Passes</h1><p>Multi-visit passes and how many visits each family has left.</p></div>
    <div class="page-actions"><a class="btn btn-ghost" href="#/checkin">${ico('scan')} Check-in mode</a>
      ${manager ? html`<button class="btn btn-primary" data-issue>${ico('plus')} Issue pass</button>` : ''}</div>
  </div>
  <div class="card">
    <div class="toolbar">
      <div class="tabs">${TABS.map(([v, l]) => html`<button class="tab ${st.status === v ? 'on' : ''}" data-status="${v}">${l}</button>`)}</div>
      <div class="input-group">${ico('search')}<input class="input" type="search" data-q placeholder="Code, name or phone"></div>
    </div>
    <div data-list></div>
  </div>`);

  async function load() {
    const q = new URLSearchParams();
    if (st.status) q.set('status', st.status);
    if (st.q) q.set('q', st.q);
    const { rows } = await api(`/passes?${q}`);
    if (!ctx.isCurrent()) return;
    mount($('[data-list]', root), rows.length ? html`<div class="table-wrap"><table class="table">
      <thead><tr><th>Pass</th><th>Holder</th><th>Visits</th><th>Status</th><th>Last visit</th></tr></thead>
      <tbody>${rows.map((p) => {
        const left = p.visits_total - p.visits_used;
        return html`<tr class="click" data-id="${p.id}">
          <td><div class="mono cell-main">${p.code}</div><div class="cell-sub">${p.name}</div></td>
          <td><div class="cell-main">${p.holder_name}</div><div class="cell-sub">${p.holder_phone || ''}</div></td>
          <td><div class="cell-main nums">${left} left</div><div class="bar ${left === 0 ? 'full' : left <= 1 ? 'hot' : ''}"><i data-w="${(p.visits_used / p.visits_total) * 100}"></i></div><div class="cell-sub">${p.visits_used} of ${p.visits_total} used</div></td>
          <td>${badge(p.status)}${p.expires_at ? html`<div class="cell-sub">until ${fmtDate(p.expires_at)}</div>` : ''}</td>
          <td>${p.last_visit ? ago(p.last_visit) : '—'}</td></tr>`;
      })}</tbody></table></div>`
      : html`<div class="empty"><div class="empty-ico">${ico('ticket')}</div><b>No passes${st.q || st.status ? ' match' : ' yet'}</b></div>`);
  }

  async function openPass(id) {
    const d = drawer({ title: 'Pass' });
    const draw = async () => {
      const { row: p, visits } = await api(`/passes/${id}`);
      const kids = JSON.parse(p.children || '[]');
      const left = p.visits_total - p.visits_used;
      d.setTitle(p.name);
      mount(d.body, html`<div class="stack">
        <div class="code-box"><span>${p.code}</span><button class="btn btn-ghost btn-sm" data-copy>${ico('copy')} Copy</button></div>
        <div class="grid-2"><div class="card card-pad"><div class="eyebrow">Visits left</div><div class="kpi-val nums">${left}<small>/ ${p.visits_total}</small></div></div>
          <div class="card card-pad"><div class="eyebrow">Status</div>${badge(p.status)}<div class="help">${p.expires_at ? `Expires ${fmtDate(p.expires_at)}` : 'No expiry'}</div></div></div>
        <dl class="kv"><dt>Holder</dt><dd>${p.holder_name}</dd><dt>Phone</dt><dd>${p.holder_phone || '—'}</dd>
          ${kids.length ? html`<dt>Children</dt><dd>${kids.map((c) => c.name).join(', ')}</dd>` : ''}<dt>Issued</dt><dd>${fmtDateTime(p.created_at)}</dd>
          ${p.order_id ? html`<dt>Order</dt><dd><a href="#/orders/${p.order_id}">View order</a></dd>` : ''}</dl>
        <div class="card"><div class="card-head"><div class="h2">Visits</div><span class="sub">${visits.length}</span></div>
          ${visits.length ? html`<div class="list">${visits.map((v, i) => html`<div class="list-row"><span class="tag nums">#${visits.length - i}</span><div class="grow"><div class="cell-main">${fmtDateTime(v.created_at)}</div><div class="cell-sub">${v.admin_name || ''}${v.note ? ` · ${v.note}` : ''}</div></div></div>`)}</div>` : html`<div class="empty"><b>No visits yet</b></div>`}</div>
      </div>`);
      d.setFoot(html`${manager && ['active', 'used_up', 'pending'].includes(p.status) ? html`<button class="btn btn-danger" data-act="void">Void</button>` : ''}
        ${manager && p.status === 'void' ? html`<button class="btn btn-ghost" data-act="reactivate">Reactivate</button>` : ''}
        <div class="top-spacer"></div>
        ${manager ? html`<button class="btn btn-ghost" data-act="add_visits">${ico('plus')} Add visits</button>` : ''}
        ${p.status === 'active' && left > 0 ? html`<button class="btn btn-ok" data-checkin>${ico('check')} Check in now</button>` : ''}`);
      return p;
    };
    let pass;
    try { pass = await draw(); } catch (err) { errorToast(err); d.close(); return; }
    d.el.addEventListener('click', async (e) => {
      try {
        if (e.target.closest('[data-checkin]')) {
          await busy(e.target.closest('[data-checkin]'), () => api('/passes/checkin', { method: 'POST', body: { code: pass.code } }));
          toast('Visit recorded'); pass = await draw(); load();
        }
        const b = e.target.closest('[data-act]');
        if (!b) return;
        let body = { action: b.dataset.act };
        if (b.dataset.act === 'void' && !(await confirmDialog({ title: 'Void this pass?', message: 'It will be refused at check-in.', confirm: 'Void', danger: true }))) return;
        if (b.dataset.act === 'add_visits') {
          const n = await modal({ title: 'Add visits', body: html`<div class="field"><label>Number of visits</label><input class="input" type="number" min="1" value="1" data-n></div>`,
            actions: [{ label: 'Cancel', value: null }, { label: 'Add', cls: 'btn-primary', onClick: (m) => m.querySelector('[data-n]').value }] });
          if (!n) return;
          body = { action: 'add_visits', visits: Number(n) };
        }
        await api(`/passes/${id}`, { method: 'PATCH', body });
        toast('Pass updated'); pass = await draw(); load();
      } catch (err) { errorToast(err); }
    });
  }

  function openIssue() {
    const d = drawer({ title: 'Issue a pass' });
    mount(d.body, html`<form class="form" novalidate>
      ${passTypes.length ? html`<div class="field"><label>Pass type</label><select class="select" name="offeringId"><option value="">Custom</option>${passTypes.map((t) => html`<option value="${t.id}">${t.name} · ${t.visits} visits</option>`)}</select></div>` : ''}
      <div class="grid-2"><div class="field"><label>Visits *</label><input class="input" name="visits" type="number" min="1" value="10"></div>
        <div class="field"><label>Valid for</label><div class="input-group has-suffix"><input class="input" name="validity_days" type="number" min="1" value="90"><span class="suffix">days</span></div></div></div>
      <div class="field"><label>Name on the pass</label><input class="input" name="name" placeholder="e.g. 10-Visit Play Pass"></div>
      <div class="grid-2"><div class="field"><label>Parent name *</label><input class="input" name="holder_name"></div>
        <div class="field"><label>Phone</label><input class="input" name="holder_phone" type="tel"></div></div>
      <div class="field"><label>Children</label><input class="input" name="children" placeholder="Names, separated by commas"></div>
    </form>`);
    d.setFoot(html`<button class="btn btn-ghost" data-cancel>Cancel</button><button class="btn btn-primary" data-save>${ico('ticket')} Issue pass</button>`);
    d.el.addEventListener('change', (e) => {
      if (e.target.name !== 'offeringId') return;
      const t = passTypes.find((x) => String(x.id) === e.target.value);
      const f = $('form', d.body);
      if (t) { f.elements.visits.value = t.visits; if (t.validity_days) f.elements.validity_days.value = t.validity_days; f.elements.name.value = t.name; }
    });
    d.el.addEventListener('click', async (e) => {
      if (e.target.closest('[data-cancel]')) d.close();
      const save = e.target.closest('[data-save]');
      if (!save) return;
      const v = values($('form', d.body));
      const body = { ...v, offeringId: v.offeringId ? Number(v.offeringId) : null, children: (v.children || '').split(',').map((s) => s.trim()).filter(Boolean).map((name) => ({ name })) };
      await busy(save, async () => {
        try {
          const { row } = await api('/passes', { method: 'POST', body });
          load(); d.close(); toast(`Pass ${row.code} issued`); openPass(row.id);
        } catch (err) { showErrors(d.body, err); }
      });
    });
  }

  root.addEventListener('click', (e) => {
    const t = e.target.closest('[data-status]');
    if (t) { st.status = t.dataset.status; root.querySelectorAll('.tab').forEach((x) => x.classList.toggle('on', x === t)); load().catch(errorToast); }
    const r = e.target.closest('tr[data-id]');
    if (r) openPass(Number(r.dataset.id));
    if (e.target.closest('[data-issue]')) openIssue();
  });
  $('[data-q]', root).addEventListener('input', debounce((e) => { st.q = e.target.value.trim(); load().catch(errorToast); }));
  await load();
  if (ctx.query.get('open')) openPass(Number(ctx.query.get('open')));
}
