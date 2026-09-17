import { api } from '../api.js';
import { html, ico, mount, $, fmtDateTime, badge, drawer, toast, errorToast, busy, values, showErrors, confirmDialog, dubaiParts, dubaiToIso, raw } from '../ui.js';

const state = (a) => {
  const now = new Date().toISOString();
  if (!a.active) return 'off';
  if (a.starts_at && a.starts_at > now) return 'scheduled';
  if (a.ends_at && a.ends_at <= now) return 'ended';
  return 'live';
};
const local = (iso) => { if (!iso) return ''; const p = dubaiParts(iso); return `${p.date}T${p.time}`; };
const fromLocal = (v) => (v ? dubaiToIso(v.slice(0, 10), v.slice(11, 16)) : null);

export default async function announcements(root, ctx) {
  ctx.setCrumbs([{ label: 'Announcements' }]);
  const manager = ctx.can('manager');
  let rows = [];

  async function load() {
    rows = (await api('/announcements')).rows;
    if (!ctx.isCurrent()) return;
    const liveOne = rows.find((a) => state(a) === 'live');
    mount(root, html`
    <div class="page-head">
      <div><h1>Announcements</h1><p>A banner across the top of every page, like “Closed on Eid day 1”.</p></div>
      ${manager ? html`<div class="page-actions"><button class="btn btn-primary" data-new>${ico('plus')} New announcement</button></div>` : ''}
    </div>
    <div class="card card-pad stack">
      <div class="eyebrow">Showing on the website now</div>
      ${liveOne ? html`<div class="announce-preview ${liveOne.tone}">${liveOne.message}${liveOne.link_label ? html` <u>${liveOne.link_label} →</u>` : ''}</div>`
        : html`<div class="help">No banner is live. The newest live announcement is shown when there are several.</div>`}
    </div><br>
    <div class="card">${rows.length ? html`<div class="table-wrap"><table class="table">
      <thead><tr><th>Message</th><th>When</th><th>State</th><th></th></tr></thead>
      <tbody>${rows.map((a) => html`<tr>
        <td><div class="cell-main">${a.message}</div>${a.link_url ? html`<div class="cell-sub">${a.link_label || 'Link'} → ${a.link_url}</div>` : ''}</td>
        <td><div class="cell-sub">${a.starts_at ? `From ${fmtDateTime(a.starts_at)}` : 'Immediately'}</div><div class="cell-sub">${a.ends_at ? `Until ${fmtDateTime(a.ends_at)}` : 'No end'}</div></td>
        <td>${badge(state(a))}</td>
        <td class="right">${manager ? html`<div class="row"><label class="switch"><input type="checkbox" data-toggle="${a.id}" ${a.active ? raw('checked') : ''}><span class="track"></span></label>
          <button class="btn btn-quiet btn-icon btn-sm" data-edit="${a.id}" aria-label="Edit">${ico('edit')}</button>
          <button class="btn btn-quiet btn-icon btn-sm" data-del="${a.id}" aria-label="Delete">${ico('trash')}</button></div>` : ''}</td></tr>`)}</tbody></table></div>`
      : html`<div class="empty"><div class="empty-ico">${ico('megaphone')}</div><b>No announcements yet</b></div>`}</div>`);
  }

  function openEditor(a) {
    const row = a || { tone: 'gold', active: 1 };
    const d = drawer({ title: a ? 'Edit announcement' : 'New announcement' });
    mount(d.body, html`<form class="form" novalidate>
      <div class="field"><label>Preview</label><div class="announce-preview ${row.tone}" data-preview></div></div>
      <div class="field"><label>Message *</label><input class="input" name="message" maxlength="180" value="${row.message || ''}" placeholder="Summer camp registration is now open"><div class="help" data-chars></div></div>
      <div class="grid-2">
        <div class="field"><label>Link (optional)</label><input class="input" name="link_url" value="${row.link_url || ''}" placeholder="/programs"></div>
        <div class="field"><label>Link text</label><input class="input" name="link_label" maxlength="40" value="${row.link_label || ''}" placeholder="See camps"></div>
      </div>
      <div class="field"><label>Colour</label><div class="chips">${[['gold', 'Gold'], ['navy', 'Navy'], ['coral', 'Coral']].map(([v, l]) => html`<button type="button" class="chip ${row.tone === v ? 'on' : ''}" data-tone="${v}">${l}</button>`)}</div></div>
      <div class="grid-2">
        <div class="field"><label>Start showing</label><input class="input" type="datetime-local" name="starts_at" value="${local(row.starts_at)}"><div class="help">Dubai time. Empty means now.</div></div>
        <div class="field"><label>Stop showing</label><input class="input" type="datetime-local" name="ends_at" value="${local(row.ends_at)}"><div class="help">Empty means until switched off.</div></div>
      </div>
      <label class="switch"><input type="checkbox" name="active" ${row.active ? raw('checked') : ''}><span class="track"></span><span><b>Active</b></span></label>
    </form>`);
    let tone = row.tone;
    const preview = () => {
      const v = values($('form', d.body));
      const p = $('[data-preview]', d.body);
      p.className = `announce-preview ${tone}`;
      mount(p, html`${v.message || 'Your message'}${v.link_label ? html` <u>${v.link_label} →</u>` : ''}`);
      $('[data-chars]', d.body).textContent = `${(v.message || '').length}/180`;
    };
    preview();
    d.el.addEventListener('input', preview);
    d.setFoot(html`<button class="btn btn-ghost" data-cancel>Cancel</button><button class="btn btn-primary" data-save>${ico('check')} Save</button>`);
    d.el.addEventListener('click', async (e) => {
      const t = e.target.closest('[data-tone]');
      if (t) { tone = t.dataset.tone; d.body.querySelectorAll('[data-tone]').forEach((c) => c.classList.toggle('on', c === t)); preview(); }
      if (e.target.closest('[data-cancel]')) d.close();
      const save = e.target.closest('[data-save]');
      if (save) {
        const v = values($('form', d.body));
        const body = { message: v.message, link_url: v.link_url, link_label: v.link_label, tone, active: v.active, starts_at: fromLocal(v.starts_at), ends_at: fromLocal(v.ends_at) };
        await busy(save, async () => {
          try { await api(a ? `/announcements/${a.id}` : '/announcements', { method: a ? 'PATCH' : 'POST', body }); toast('Announcement saved'); d.close(); load(); } catch (err) { showErrors(d.body, err); }
        });
      }
    });
  }

  root.addEventListener('click', async (e) => {
    if (e.target.closest('[data-new]')) openEditor(null);
    const ed = e.target.closest('[data-edit]');
    if (ed) openEditor(rows.find((r) => r.id === Number(ed.dataset.edit)));
    const del = e.target.closest('[data-del]');
    if (del && await confirmDialog({ title: 'Delete announcement?', message: 'It will disappear from the website.', confirm: 'Delete', danger: true })) {
      try { await api(`/announcements/${del.dataset.del}`, { method: 'DELETE' }); toast('Deleted'); load(); } catch (err) { errorToast(err); }
    }
  });
  root.addEventListener('change', async (e) => {
    const t = e.target.closest('[data-toggle]');
    if (!t) return;
    try { await api(`/announcements/${t.dataset.toggle}`, { method: 'PATCH', body: { active: t.checked } }); toast(t.checked ? 'Switched on' : 'Switched off'); load(); } catch (err) { t.checked = !t.checked; errorToast(err); }
  });
  await load();
  if (ctx.query.get('new') && manager) openEditor(null);
}
