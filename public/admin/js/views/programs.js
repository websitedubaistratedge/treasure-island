import { api } from '../api.js';
import { html, ico, mount, $, aed, toAed, drawer, toast, errorToast, busy, values, showErrors, confirmDialog, KIND_LABEL, raw } from '../ui.js';
import { imagePicker, imageSrc } from '../media.js';

const KINDS = [['program', 'Programme'], ['camp', 'Camp'], ['party', 'Party'], ['workshop', 'Workshop'], ['event', 'Event'], ['pass', 'Multi-visit pass']];

export default async function programs(root, ctx) {
  ctx.setCrumbs([{ label: 'Programmes' }]);
  const manager = ctx.can('manager');
  async function load() {
    const { rows } = await api('/offerings');
    if (!ctx.isCurrent()) return;
    mount(root, html`
    <div class="page-head">
      <div><h1>Programmes</h1><p>What families can book: programmes, camps, parties, events and passes.</p></div>
      ${manager ? html`<div class="page-actions"><button class="btn btn-primary" data-new>${ico('plus')} New programme</button></div>` : ''}
    </div>
    ${rows.length ? html`<div class="tiles">${rows.map((o) => {
      const img = imageSrc(o);
      const price = o.price_fils == null ? 'Ask for price' : `${aed(o.price_fils)} ${o.price_unit === 'child' ? 'per child' : o.kind === 'pass' ? 'per pass' : 'per booking'}`;
      return html`<div class="card tile ${o.active ? '' : 'off'}">
        <div class="tile-flags">${o.active ? '' : html`<span class="badge b-neutral">Hidden</span>`}</div>
        <button class="tile-img k-${o.kind}" data-edit="${o.id}" aria-label="Edit ${o.name}">${img ? html`<img src="${img}" alt="" loading="lazy">` : html`<span class="kpi-ico tone-navy">${ico(o.kind === 'pass' ? 'ticket' : o.kind === 'party' ? 'star' : 'sparkles')}</span>`}</button>
        <div class="tile-body">
          <div class="row-between"><span class="tag">${KIND_LABEL[o.kind]}</span>${o.kind === 'pass' ? html`<span class="sub">${o.visits} visits</span>` : html`<span class="sub">${o.upcoming_slots} upcoming</span>`}</div>
          <div class="tile-name">${o.name}</div>
          <div class="sub">${price}${o.deposit_fils != null ? ` · ${aed(o.deposit_fils)} deposit` : ''}</div>
          <div class="row-between">
            ${manager ? html`<label class="switch"><input type="checkbox" data-active="${o.id}" ${o.active ? raw('checked') : ''}><span class="track"></span><span class="sub">Bookable</span></label>` : html`<span></span>`}
            ${o.kind !== 'pass' && manager ? html`<a class="btn btn-quiet btn-sm" href="#/calendar?new=1&offering=${o.id}">${ico('calendar')} Dates</a>` : ''}
          </div>
        </div></div>`;
    })}</div>` : html`<div class="card"><div class="empty"><div class="empty-ico">${ico('sparkles')}</div><b>No programmes yet</b></div></div>`}`);
    root._rows = rows;
  }

  function openEditor(row) {
    const o = row || { kind: 'program', price_unit: 'child', max_children: 6, active: 1 };
    const d = drawer({ title: row ? row.name : 'New programme', wide: true });
    let imageId = o.image_id || null;
    const draw = (kind) => mount(d.body, html`<form class="form" novalidate>
      <div data-image></div>
      <div class="grid-2">
        <div class="field"><label>Name *</label><input class="input" name="name" value="${o.name || ''}"></div>
        <div class="field"><label>Type</label><select class="select" name="kind">${KINDS.map(([v, l]) => html`<option value="${v}" ${kind === v ? raw('selected') : ''}>${l}</option>`)}</select></div>
      </div>
      <div class="field"><label>Short summary</label><input class="input" name="summary" value="${o.summary || ''}" maxlength="300" placeholder="One line shown on the booking page"></div>
      <div class="field"><label>Description</label><textarea class="textarea" name="description" rows="4">${o.description || ''}</textarea></div>
      <div class="divider"></div>
      <div class="eyebrow">Price</div>
      <div class="grid-3">
        <div class="field"><label>Price</label><div class="input-group has-suffix"><input class="input" name="price" type="number" step="0.01" min="0" value="${toAed(o.price_fils)}" placeholder="Ask for price"><span class="suffix">AED</span></div><div class="help">Leave empty to take reservations without a price.</div></div>
        <div class="field"><label>Charged</label><select class="select" name="price_unit">${[['child', 'Per child'], ['booking', kind === 'pass' ? 'Per pass' : 'Per booking']].map(([v, l]) => html`<option value="${v}" ${o.price_unit === v ? raw('selected') : ''}>${l}</option>`)}</select></div>
        <div class="field"><label>Deposit</label><div class="input-group has-suffix"><input class="input" name="deposit" type="number" step="0.01" min="0" value="${toAed(o.deposit_fils)}" placeholder="None"><span class="suffix">AED</span></div><div class="help">Paid online; the rest at the venue.</div></div>
      </div>
      <div class="grid-3">
        <div class="field"><label>Max children per booking</label><input class="input" name="max_children" type="number" min="1" value="${o.max_children}"></div>
        <div class="field"><label>Min age</label><input class="input" name="min_age" type="number" min="0" max="17" value="${o.min_age ?? ''}"></div>
        <div class="field"><label>Max age</label><input class="input" name="max_age" type="number" min="0" max="17" value="${o.max_age ?? ''}"></div>
      </div>
      ${kind === 'pass' ? html`<div class="grid-2">
        <div class="field"><label>Visits *</label><input class="input" name="visits" type="number" min="1" value="${o.visits ?? 10}"></div>
        <div class="field"><label>Valid for</label><div class="input-group has-suffix"><input class="input" name="validity_days" type="number" min="1" value="${o.validity_days ?? 90}"><span class="suffix">days</span></div></div></div>` : ''}
      <label class="switch"><input type="checkbox" name="active" ${o.active ? raw('checked') : ''}><span class="track"></span><span><b>Bookable</b><div class="help">Hidden programmes keep their history but cannot be booked.</div></span></label>
    </form>`);
    const mountImage = () => imagePicker($('[data-image]', d.body), { current: imageSrc({ ...o, image_id: imageId }), onChange: (m) => { imageId = m.id; } });
    draw(o.kind); mountImage();
    d.el.addEventListener('change', (e) => {
      if (e.target.name === 'kind') {
        const keep = values($('form', d.body));
        Object.assign(o, { name: keep.name, summary: keep.summary, description: keep.description, max_children: keep.max_children, active: keep.active });
        draw(e.target.value); mountImage();
      }
    });
    d.setFoot(html`${row ? html`<button class="btn btn-danger" data-del>${ico('trash')} Delete</button>` : ''}<div class="top-spacer"></div>
      <button class="btn btn-ghost" data-cancel>Cancel</button><button class="btn btn-primary" data-save>${ico('check')} Save</button>`);
    d.el.addEventListener('click', async (e) => {
      if (e.target.closest('[data-cancel]')) d.close();
      const save = e.target.closest('[data-save]');
      if (save) {
        const v = values($('form', d.body));
        const body = { name: v.name, kind: v.kind, summary: v.summary, description: v.description, price: v.price, price_unit: v.price_unit, deposit: v.deposit,
          max_children: v.max_children, min_age: v.min_age, max_age: v.max_age, active: v.active, image_id: imageId };
        if (v.kind === 'pass') Object.assign(body, { visits: v.visits, validity_days: v.validity_days });
        await busy(save, async () => {
          try {
            await api(row ? `/offerings/${row.id}` : '/offerings', { method: row ? 'PATCH' : 'POST', body });
            toast(row ? 'Programme saved' : 'Programme created');
            d.close(); load();
          } catch (err) { showErrors(d.body, err); }
        });
      }
      if (e.target.closest('[data-del]')) {
        if (!(await confirmDialog({ title: `Delete ${row.name}?`, message: 'If it already has bookings it is hidden instead, so history is kept.', confirm: 'Delete', danger: true }))) return;
        try { const r = await api(`/offerings/${row.id}`, { method: 'DELETE' }); toast(r.archived ? 'Hidden (it has bookings)' : 'Deleted'); d.close(); load(); } catch (err) { errorToast(err); }
      }
    });
  }

  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-new]')) openEditor(null);
    const ed = e.target.closest('[data-edit]');
    if (ed && manager) openEditor(root._rows.find((r) => r.id === Number(ed.dataset.edit)));
  });
  root.addEventListener('change', async (e) => {
    const t = e.target.closest('[data-active]');
    if (!t) return;
    try { await api(`/offerings/${t.dataset.active}`, { method: 'PATCH', body: { active: t.checked } }); toast(t.checked ? 'Now bookable' : 'Hidden from booking'); load(); } catch (err) { t.checked = !t.checked; errorToast(err); }
  });
  await load();
}
