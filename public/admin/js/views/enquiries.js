import { api } from '../api.js';
import { html, ico, mount, $, ago, fmtDateTime, badge, debounce, toast, errorToast, busy, waLink, initials, raw } from '../ui.js';

const TABS = [['new', 'New'], ['in_progress', 'In progress'], ['closed', 'Closed'], ['spam', 'Spam']];
const KIND = { contact: 'General', birthday: 'Birthday party', event: 'Event', other: 'Other' };

export default async function enquiries(root, ctx) {
  ctx.setCrumbs([{ label: 'Enquiries' }]);
  const st = { status: 'new', q: '', selected: null };
  let rows = [];

  mount(root, html`
  <div class="page-head"><div><h1>Enquiries</h1><p>Messages sent through the forms on the website.</p></div></div>
  <div class="layout-side">
    <div class="card">
      <div class="toolbar"><div class="tabs" data-tabs></div>
        <div class="input-group">${ico('search')}<input class="input" type="search" data-q placeholder="Name, phone, email or text"></div></div>
      <div data-list></div>
    </div>
    <div data-detail><div class="card"><div class="empty"><div class="empty-ico">${ico('inbox')}</div><b>Select an enquiry</b></div></div></div>
  </div>`);

  async function load() {
    const q = new URLSearchParams({ status: st.status });
    if (st.q) q.set('q', st.q);
    const r = await api(`/enquiries?${q}`);
    if (!ctx.isCurrent()) return;
    rows = r.rows;
    mount($('[data-tabs]', root), html`${TABS.map(([v, l]) => html`<button class="tab ${st.status === v ? 'on' : ''}" data-status="${v}">${l}${r.counts[v] ? html`<span class="n">${r.counts[v]}</span>` : ''}</button>`)}`);
    mount($('[data-list]', root), rows.length ? html`<div class="list">${rows.map((e) => html`<button class="list-row ${st.selected === e.id ? 'on' : ''}" data-id="${e.id}" type="button">
      <span class="avatar">${initials(e.name || e.email || '?')}</span>
      <div class="grow"><div class="row-between"><span class="cell-main">${e.name || e.phone || e.email || 'Anonymous'}</span><span class="sub">${ago(e.created_at)}</span></div>
        <div class="cell-sub truncate">${KIND[e.kind]} · ${e.message || Object.values(e.payload).join(' · ')}</div></div></button>`)}</div>`
      : html`<div class="empty"><div class="empty-ico">${ico('inbox')}</div><b>Nothing here</b></div>`);
  }

  function show(id) {
    const e = rows.find((r) => r.id === id);
    if (!e) return;
    st.selected = id;
    root.querySelectorAll('[data-id]').forEach((b) => b.classList.toggle('on', Number(b.dataset.id) === id));
    const first = (e.name || '').split(' ')[0];
    const reply = `Hello${first ? ` ${first}` : ''},\n\nThank you for your ${KIND[e.kind].toLowerCase()} enquiry with Treasure Island. `;
    mount($('[data-detail]', root), html`<div class="card">
      <div class="card-head"><div><div class="h2">${e.name || 'Anonymous'}</div><div class="sub">${KIND[e.kind]} · ${fmtDateTime(e.created_at)}</div></div>${badge(e.status)}</div>
      <div class="card-body stack">
        <div class="row wrap">
          ${e.phone ? html`<a class="btn btn-ghost btn-sm" href="tel:${e.phone}">${ico('phone')} Call</a><a class="btn btn-dark btn-sm" href="${waLink(e.phone, reply)}" target="_blank" rel="noopener">${ico('whatsapp')} Reply on WhatsApp</a>` : ''}
          ${e.email ? html`<a class="btn btn-ghost btn-sm" href="mailto:${e.email}?subject=${encodeURIComponent('Your Treasure Island enquiry')}">${ico('mail')} Email</a>` : ''}
        </div>
        <dl class="kv">${e.phone ? html`<dt>Phone</dt><dd>${e.phone}</dd>` : ''}${e.email ? html`<dt>Email</dt><dd>${e.email}</dd>` : ''}
          ${Object.entries(e.payload).map(([k, v]) => html`<dt>${k.replace(/[_-]/g, ' ')}</dt><dd>${v}</dd>`)}
          ${e.source_page ? html`<dt>From page</dt><dd>${e.source_page}</dd>` : ''}</dl>
        ${e.message ? html`<div class="callout"><div>${e.message}</div></div>` : ''}
        <form class="form" data-update>
          <div class="field"><label>Status</label><div class="chips">${TABS.map(([v, l]) => html`<button type="button" class="chip ${e.status === v ? 'on' : ''}" data-set="${v}">${l}</button>`)}</div></div>
          <div class="field"><label>Internal notes</label><textarea class="textarea" name="internal_notes" rows="3">${e.internal_notes || ''}</textarea></div>
          <button class="btn btn-ghost" type="submit">${ico('check')} Save notes</button>
        </form>
      </div></div>`);
  }

  root.addEventListener('click', async (ev) => {
    const tab = ev.target.closest('[data-status]');
    if (tab) { st.status = tab.dataset.status; st.selected = null; load().catch(errorToast); }
    const item = ev.target.closest('[data-id]');
    if (item) show(Number(item.dataset.id));
    const set = ev.target.closest('[data-set]');
    if (set) {
      try {
        await api(`/enquiries/${st.selected}`, { method: 'PATCH', body: { status: set.dataset.set } });
        toast('Enquiry moved'); window.dispatchEvent(new CustomEvent('ti:counts'));
        st.selected = null; await load();
        mount($('[data-detail]', root), html`<div class="card"><div class="empty"><div class="empty-ico">${ico('check')}</div><b>Moved to ${TABS.find((t) => t[0] === set.dataset.set)[1]}</b></div></div>`);
      } catch (err) { errorToast(err); }
    }
  });
  root.addEventListener('submit', async (ev) => {
    if (!ev.target.matches('[data-update]')) return;
    ev.preventDefault();
    await busy(ev.target.querySelector('button[type=submit]'), async () => {
      try { await api(`/enquiries/${st.selected}`, { method: 'PATCH', body: { internal_notes: ev.target.elements.internal_notes.value } }); toast('Notes saved'); await load(); show(st.selected); } catch (err) { errorToast(err); }
    });
  });
  $('[data-q]', root).addEventListener('input', debounce((e) => { st.q = e.target.value.trim(); load().catch(errorToast); }));
  await load();
  if (rows.length) show(rows[0].id);
}
