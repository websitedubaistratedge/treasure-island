import { api } from '../api.js';
import { html, ico, mount, $, aed, ago, badge, debounce, drawer, values, showErrors, busy, toast, errorToast, fmtDay, fmtTime, KIND_LABEL, raw } from '../ui.js';

const TABS = [['', 'All'], ['open', 'Needs action'], ['paid', 'Paid'], ['confirmed', 'Confirmed'], ['completed', 'Completed'], ['cancelled', 'Cancelled'], ['expired', 'Expired']];

export default async function orders(root, ctx) {
  ctx.setCrumbs([{ label: 'Orders' }]);
  const st = { status: ctx.query.get('status') || '', q: ctx.query.get('q') || '', page: 1 };

  mount(root, html`
  <div class="page-head">
    <div><h1>Orders</h1><p>Every booking, reservation and purchase, online or at the desk.</p></div>
    <div class="page-actions">
      ${ctx.can('manager') ? html`<button class="btn btn-ghost" data-export>${ico('download')} Export CSV</button>` : ''}
      <button class="btn btn-primary" data-new>${ico('plus')} New booking</button>
    </div>
  </div>
  <div class="card">
    <div class="toolbar">
      <div class="tabs" role="tablist">${TABS.map(([v, l]) => html`<button class="tab ${st.status === v ? 'on' : ''}" data-status="${v}">${l}</button>`)}</div>
      <div class="input-group">${ico('search')}<input class="input" data-q type="search" placeholder="Reference, name, phone or email" value="${st.q}"></div>
    </div>
    <div data-list></div>
  </div>`);

  const list = $('[data-list]', root);
  async function load() {
    const q = new URLSearchParams({ page: st.page });
    if (st.status) q.set('status', st.status);
    if (st.q) q.set('q', st.q);
    const r = await api(`/orders?${q}`);
    if (!ctx.isCurrent()) return;
    if (!r.rows.length) {
      mount(list, html`<div class="empty"><div class="empty-ico">${ico('orders')}</div><b>No orders${st.q || st.status ? ' match' : ' yet'}</b>
        <div>${st.q || st.status ? 'Try another filter or search.' : 'Take a desk booking, or switch on online booking in Settings.'}</div></div>`);
      return;
    }
    mount(list, html`<div class="table-wrap"><table class="table">
      <thead><tr><th>Order</th><th>Customer</th><th>Items</th><th>Status</th><th class="right">Total</th></tr></thead>
      <tbody>${r.rows.map((o) => html`<tr class="click" data-id="${o.id}">
        <td><div class="cell-main mono">${o.ref}</div><div class="cell-sub">${ago(o.created_at)} · ${o.channel}</div></td>
        <td><div class="cell-main">${o.customer_name}</div><div class="cell-sub">${o.customer_phone}</div></td>
        <td><div class="truncate">${(o.summary || '').split(' | ').join(', ')}</div></td>
        <td>${badge(o.status)}${o.status === 'pending' && o.hold_expires_at ? html`<div class="cell-sub">held until ${fmtDay(o.hold_expires_at)}</div>` : ''}</td>
        <td class="right"><div class="cell-main nums">${aed(o.total_fils, { ask: false })}</div>${o.paid_fils ? html`<div class="cell-sub nums">${aed(o.paid_fils)} paid</div>` : ''}</td>
      </tr>`)}</tbody></table></div>
      <div class="pager"><span>${r.total} order${r.total === 1 ? '' : 's'}</span>
        <div class="row"><button class="btn btn-ghost btn-sm" data-page="${r.page - 1}" ${r.page <= 1 ? raw('disabled') : ''}>${ico('chevronLeft')}</button>
        <span class="nums">Page ${r.page} of ${r.pages}</span>
        <button class="btn btn-ghost btn-sm" data-page="${r.page + 1}" ${r.page >= r.pages ? raw('disabled') : ''}>${ico('chevronRight')}</button></div></div>`);
  }

  root.addEventListener('click', async (e) => {
    const tab = e.target.closest('[data-status]');
    if (tab) { st.status = tab.dataset.status; st.page = 1; root.querySelectorAll('.tab').forEach((t) => t.classList.toggle('on', t === tab)); load().catch(errorToast); return; }
    const pg = e.target.closest('[data-page]');
    if (pg) { st.page = Number(pg.dataset.page); load().catch(errorToast); return; }
    const row = e.target.closest('tr[data-id]');
    if (row) { ctx.navigate(`/orders/${row.dataset.id}`); return; }
    if (e.target.closest('[data-new]')) openBooking({ onDone: (o) => ctx.navigate(`/orders/${o.id}`) });
    const ex = e.target.closest('[data-export]');
    if (ex) {
      await busy(ex, async () => {
        const res = await api('/orders/export', { raw: true });
        if (!res.ok) { errorToast({ message: 'Export failed.' }); return; }
        const url = URL.createObjectURL(await res.blob());
        const a = Object.assign(document.createElement('a'), { href: url, download: `treasure-island-orders-${new Date().toISOString().slice(0, 10)}.csv` });
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      });
    }
  });
  $('[data-q]', root).addEventListener('input', debounce((e) => { st.q = e.target.value.trim(); st.page = 1; load().catch(errorToast); }, 250));

  await load();
  if (ctx.query.get('new')) openBooking({ onDone: (o) => ctx.navigate(`/orders/${o.id}`) });
}

/* ---------------------------------------------------------------------------
   Desk booking: sessions, passes, boutique items and gift vouchers in one
   order. Prices shown here are a preview; the server prices the order. */
export async function openBooking({ slotId = null, onDone } = {}) {
  const d = drawer({ title: 'New booking', wide: true });
  mount(d.body, html`<div class="skel skel-block"></div>`);
  let cat;
  try {
    const res = await fetch('/api/catalog', { credentials: 'same-origin' });
    cat = await res.json();
  } catch (err) { errorToast(err); d.close(); return; }

  const bookable = cat.offerings.filter((o) => o.kind !== 'pass');
  const passes = cat.offerings.filter((o) => o.kind === 'pass');
  const presetSlot = slotId && cat.slots.find((s) => s.id === Number(slotId));
  const items = [presetSlot ? { type: 'offering', offeringId: presetSlot.offering_id, slotId: presetSlot.id, children: [{ name: '', age: '' }] }
    : { type: 'offering', offeringId: bookable[0] && bookable[0].id, slotId: null, children: [{ name: '', age: '' }] }];

  mount(d.body, html`<form class="form" novalidate>
    <div class="eyebrow">Customer</div>
    <div class="grid-2">
      <div class="field"><label>Parent name *</label><input class="input" name="customer.name" autocomplete="off"></div>
      <div class="field"><label>Phone *</label><input class="input" name="customer.phone" type="tel" placeholder="050 123 4567"></div>
    </div>
    <div class="grid-2">
      <div class="field"><label>Email</label><input class="input" name="customer.email" type="email"></div>
      <div class="field"><label>Notes from the customer</label><input class="input" name="customer.notes"></div>
    </div>
    <div class="divider"></div>
    <div class="row-between"><div class="eyebrow">Items</div>
      <div class="row wrap">
        <button type="button" class="btn btn-ghost btn-sm" data-add="offering">${ico('calendar')} Session</button>
        ${passes.length ? html`<button type="button" class="btn btn-ghost btn-sm" data-add="pass">${ico('ticket')} Pass</button>` : ''}
        <button type="button" class="btn btn-ghost btn-sm" data-add="product">${ico('bag')} Product</button>
        <button type="button" class="btn btn-ghost btn-sm" data-add="voucher">${ico('gift')} Voucher</button>
      </div></div>
    <div class="stack" data-items></div>
    <div class="divider"></div>
    <div class="eyebrow">Payment</div>
    <div class="chips" data-pay>
      <button type="button" class="chip on" data-mode="confirm">Confirmed, pay later</button>
      <button type="button" class="chip" data-mode="pending">Hold as pending</button>
      <button type="button" class="chip" data-mode="paid">Paid now</button>
    </div>
    <div class="grid-2" data-paid hidden>
      <div class="field"><label>Method</label><select class="select" name="payment.method"><option value="card">Card</option><option value="cash">Cash</option><option value="bank">Bank transfer</option><option value="other">Other</option></select></div>
      <div class="field"><label>Amount received</label><div class="input-group has-suffix"><input class="input" name="payment.amount" type="number" min="0" step="0.01" data-field="payment.amount"><span class="suffix">AED</span></div></div>
    </div>
    <div class="field"><label>Internal note</label><input class="input" name="internal_notes" placeholder="Only visible to staff"></div>
    <div class="callout"><div class="grow row-between"><span>Estimated total</span><b class="nums" data-total>—</b></div></div>
  </form>`);
  d.setFoot(html`<button class="btn btn-ghost" data-cancel>Cancel</button><button class="btn btn-primary" data-save>${ico('check')} Create booking</button>`);

  const form = $('form', d.body);
  const host = $('[data-items]', d.body);
  let mode = 'confirm';

  const slotLabel = (s) => `${fmtDay(s.starts_at)} ${fmtTime(s.starts_at)} · ${s.remaining} of ${s.capacity} left`;
  function renderItems() {
    mount(host, html`${items.map((it, i) => {
      const head = (icon, title) => html`<div class="row-between"><div class="row">${ico(icon)}<b>${title}</b></div>
        <button type="button" class="btn btn-quiet btn-icon btn-sm" data-remove="${i}" aria-label="Remove">${ico('trash')}</button></div>`;
      if (it.type === 'offering' || it.type === 'pass') {
        const pool = it.type === 'pass' ? passes : bookable;
        const off = pool.find((o) => o.id === Number(it.offeringId)) || pool[0];
        const slots = off ? cat.slots.filter((s) => s.offering_id === off.id) : [];
        return html`<div class="card card-pad stack" data-item="${i}">
          ${head(it.type === 'pass' ? 'ticket' : 'calendar', it.type === 'pass' ? 'Pass' : 'Session booking')}
          <div class="grid-2">
            <div class="field"><label>${it.type === 'pass' ? 'Pass type' : 'Programme'}</label><select class="select" data-k="offeringId">
              ${pool.map((o) => html`<option value="${o.id}" ${off && o.id === off.id ? raw('selected') : ''}>${o.name}${o.price_fils != null ? ` · ${aed(o.price_fils)}${o.price_unit === 'child' ? '/child' : ''}` : ''}</option>`)}</select></div>
            ${it.type === 'offering' ? html`<div class="field" data-field="items.${i}.slotId"><label>Date and time</label><select class="select" data-k="slotId">
              <option value="">Choose a session…</option>
              ${slots.map((s) => html`<option value="${s.id}" ${Number(it.slotId) === s.id ? raw('selected') : ''} ${s.remaining <= 0 ? raw('disabled') : ''}>${slotLabel(s)}</option>`)}</select>
              ${slots.length ? '' : html`<div class="help">No upcoming sessions. Add some in Calendar.</div>`}</div>` : html`<div class="field"><label>Visits</label><input class="input" value="${off ? off.visits : ''}" disabled></div>`}
          </div>
          <div class="field" data-field="items.${i}.children"><label>Children</label>
            <div class="stack">${it.children.map((c, j) => html`<div class="row">
              <input class="input grow" placeholder="Child's name" value="${c.name}" data-child="${j}" data-ck="name" aria-label="Child's name">
              <input class="input age" type="number" min="0" max="17" placeholder="Age" value="${c.age}" data-child="${j}" data-ck="age" aria-label="Age">
              <button type="button" class="btn btn-quiet btn-icon btn-sm" data-remove-child="${j}" aria-label="Remove child">${ico('x')}</button></div>`)}</div>
            <button type="button" class="btn btn-quiet btn-sm" data-add-child>${ico('plus')} Add child</button></div>
        </div>`;
      }
      if (it.type === 'product') {
        return html`<div class="card card-pad stack" data-item="${i}">${head('bag', 'Boutique product')}
          <div class="grid-2"><div class="field"><label>Product</label><select class="select" data-k="productId">
            ${cat.products.map((p) => html`<option value="${p.id}" ${Number(it.productId) === p.id ? raw('selected') : ''}>${p.name} · ${aed(p.price_fils)}${p.stock != null ? ` · ${p.stock} in stock` : ''}</option>`)}</select></div>
          <div class="field"><label>Quantity</label><input class="input" type="number" min="1" max="20" value="${it.qty}" data-k="qty"></div></div></div>`;
      }
      return html`<div class="card card-pad stack" data-item="${i}">${head('gift', 'Gift voucher')}
        <div class="grid-2"><div class="field" data-field="items.${i}.amount"><label>Amount</label><div class="input-group has-suffix"><input class="input" type="number" min="50" max="2000" value="${it.amount}" data-k="amount"><span class="suffix">AED</span></div></div>
        <div class="field"><label>For</label><input class="input" value="${it.recipient}" data-k="recipient" placeholder="Recipient's name"></div></div></div>`;
    })}`);
    if (!items.length) mount(host, html`<div class="empty"><b>No items yet</b><div>Add a session, pass, product or voucher.</div></div>`);
    total();
  }
  function total() {
    let sum = 0;
    let unpriced = false;
    for (const it of items) {
      if (it.type === 'offering' || it.type === 'pass') {
        const o = cat.offerings.find((x) => x.id === Number(it.offeringId));
        if (!o || o.price_fils == null) { unpriced = true; continue; }
        const qty = o.price_unit === 'child' ? Math.max(1, it.children.filter((c) => c.name).length) : 1;
        sum += o.price_fils * qty;
      } else if (it.type === 'product') {
        const p = cat.products.find((x) => x.id === Number(it.productId));
        if (!p || p.price_fils == null) { unpriced = true; continue; }
        sum += p.price_fils * (Number(it.qty) || 1);
      } else sum += Math.round((Number(it.amount) || 0) * 100);
    }
    $('[data-total]', d.body).textContent = unpriced ? `${aed(sum)} + items without a price` : aed(sum);
    const amt = form.elements['payment.amount'];
    if (amt && !amt.dataset.touched) amt.value = sum ? String(sum / 100) : '';
  }

  d.el.addEventListener('input', (e) => {
    const card = e.target.closest('[data-item]');
    if (e.target.name === 'payment.amount') e.target.dataset.touched = '1';
    if (!card) return;
    const it = items[Number(card.dataset.item)];
    if (e.target.dataset.child != null) it.children[Number(e.target.dataset.child)][e.target.dataset.ck] = e.target.value;
    else if (e.target.dataset.k) {
      it[e.target.dataset.k] = e.target.value;
      if (e.target.dataset.k === 'offeringId') { it.slotId = null; renderItems(); return; }
    }
    total();
  });
  d.el.addEventListener('click', async (e) => {
    const add = e.target.closest('[data-add]');
    if (add) {
      const t = add.dataset.add;
      if (t === 'offering') items.push({ type: 'offering', offeringId: bookable[0] && bookable[0].id, slotId: null, children: [{ name: '', age: '' }] });
      if (t === 'pass') items.push({ type: 'pass', offeringId: passes[0].id, children: [{ name: '', age: '' }] });
      if (t === 'product') items.push({ type: 'product', productId: cat.products[0] && cat.products[0].id, qty: 1 });
      if (t === 'voucher') items.push({ type: 'voucher', amount: 200, recipient: '' });
      renderItems();
    }
    const rm = e.target.closest('[data-remove]');
    if (rm) { items.splice(Number(rm.dataset.remove), 1); renderItems(); }
    const addChild = e.target.closest('[data-add-child]');
    if (addChild) { items[Number(addChild.closest('[data-item]').dataset.item)].children.push({ name: '', age: '' }); renderItems(); }
    const rmChild = e.target.closest('[data-remove-child]');
    if (rmChild) { const it = items[Number(rmChild.closest('[data-item]').dataset.item)]; it.children.splice(Number(rmChild.dataset.removeChild), 1); renderItems(); }
    const chip = e.target.closest('[data-mode]');
    if (chip) {
      mode = chip.dataset.mode;
      d.body.querySelectorAll('[data-mode]').forEach((c) => c.classList.toggle('on', c === chip));
      $('[data-paid]', d.body).hidden = mode !== 'paid';
    }
    if (e.target.closest('[data-cancel]')) d.close();
    const save = e.target.closest('[data-save]');
    if (save) {
      const v = values(form);
      const body = {
        customer: { name: v['customer.name'], phone: v['customer.phone'], email: v['customer.email'], notes: v['customer.notes'] },
        status: mode === 'pending' ? 'pending' : 'confirmed',
        internal_notes: v.internal_notes,
        items: items.map((it) => {
          const children = (it.children || []).filter((c) => c.name.trim()).map((c) => ({ name: c.name.trim(), age: c.age === '' ? null : Number(c.age) }));
          if (it.type === 'offering') return { type: 'offering', offeringId: Number(it.offeringId), slotId: it.slotId ? Number(it.slotId) : null, children };
          if (it.type === 'pass') return { type: 'offering', offeringId: Number(it.offeringId), children };
          if (it.type === 'product') return { type: 'product', productId: Number(it.productId), qty: Number(it.qty) || 1 };
          return { type: 'voucher', amount: it.amount, recipient: it.recipient };
        }),
      };
      if (mode === 'paid') body.payment = { method: v['payment.method'], amount: v['payment.amount'] };
      await busy(save, async () => {
        try {
          const r = await api('/orders', { method: 'POST', body });
          toast(`Booking ${r.order.ref} created`);
          window.dispatchEvent(new CustomEvent('ti:counts'));
          d.close();
          if (onDone) onDone(r.order);
        } catch (err) { showErrors(d.body, err); }
      });
    }
  });
  renderItems();
}
