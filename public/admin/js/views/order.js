import { api } from '../api.js';
import { html, ico, mount, $, aed, badge, fmtDateTime, fmtDate, ago, toast, errorToast, modal, confirmDialog, busy, copyText, waLink, values, initials, raw } from '../ui.js';

export default async function order(root, ctx) {
  const id = ctx.params.id;
  async function load() {
    const d = await api(`/orders/${id}`);
    if (ctx.isCurrent()) render(d);
  }

  function render({ order: o, items, vouchers, passes }) {
    ctx.setCrumbs([{ label: 'Orders', href: '#/orders' }, { label: o.ref }]);
    const live = ['paid', 'confirmed', 'completed'].includes(o.status);
    const balance = Math.max(0, (o.total_fils || 0) - (o.paid_fils || 0));
    const customerLink = `${location.origin}/order?ref=${encodeURIComponent(o.ref)}&t=${encodeURIComponent(o.access_token)}`;
    const actions = [];
    if (['pending', 'awaiting_payment', 'expired'].includes(o.status)) actions.push(['confirm', 'Confirm', 'check', 'btn-ok']);
    if (!['cancelled', 'refunded'].includes(o.status) && balance > 0) actions.push(['mark_paid', 'Record payment', 'money', 'btn-primary']);
    if (['paid', 'confirmed'].includes(o.status)) actions.push(['complete', 'Mark completed', 'star', 'btn-ghost']);
    if (['pending', 'awaiting_payment', 'confirmed', 'expired'].includes(o.status)) actions.push(['cancel', 'Cancel', 'x', 'btn-danger']);
    if (['paid', 'completed'].includes(o.status) && ctx.can('manager')) actions.push(['refund', 'Refund', 'refresh', 'btn-danger']);

    const confirmText = [
      `Hello ${o.customer_name},`, '',
      `Your Treasure Island booking ${o.ref} is ${live ? 'confirmed' : 'received'}.`, '',
      ...items.map((i) => `• ${i.name}${i.qty > 1 ? ` × ${i.qty}` : ''}`), '',
      `Details: ${customerLink}`, '', 'See you on the island!',
    ].join('\n');

    mount(root, html`
    <div class="page-head">
      <div>
        <div class="row wrap"><h1 class="mono">${o.ref}</h1>${badge(o.status)}<span class="tag">${o.channel}</span></div>
        <p>Created ${fmtDateTime(o.created_at)} · updated ${ago(o.updated_at)}</p>
      </div>
      <div class="page-actions">${actions.map(([a, l, i, c]) => html`<button class="btn ${c}" data-action="${a}">${ico(i)} ${l}</button>`)}</div>
    </div>

    ${o.status === 'pending' && o.hold_expires_at ? html`<div class="callout warn">${ico('clock')}<div>Spots are held until <b>${fmtDateTime(o.hold_expires_at)}</b>. Confirm the booking to keep them.</div></div><br>` : ''}
    ${o.internal_notes && o.internal_notes.includes('hold expired') ? html`<div class="callout warn">${ico('alert')}<div>This was paid after its hold expired. Check the session is not over capacity.</div></div><br>` : ''}

    <div class="layout-side">
      <div class="stack">
        <div class="card">
          <div class="card-head"><div class="h2">Items</div><span class="sub">${items.length} line${items.length === 1 ? '' : 's'}</span></div>
          <div class="list">${items.map((i) => html`<div class="list-row">
            <span class="kpi-ico ${i.kind === 'voucher' ? 'tone-leaf' : i.kind === 'product' ? 'tone-grape' : 'tone-navy'}">${ico(i.kind === 'voucher' ? 'gift' : i.kind === 'product' ? 'bag' : i.meta.offering_kind === 'pass' ? 'ticket' : 'calendar')}</span>
            <div class="grow"><div class="cell-main">${i.name}</div>
              ${(i.meta.children || []).length ? html`<div class="chips">${i.meta.children.map((c) => html`<span class="tag">${ico('child')} ${c.name}${c.age != null ? ` · ${c.age}` : ''}</span>`)}</div>` : ''}
              ${i.meta.recipient ? html`<div class="cell-sub">For ${i.meta.recipient}${i.meta.message ? ` · “${i.meta.message}”` : ''}</div>` : ''}</div>
            <div class="right"><div class="cell-main nums">${i.unit_fils == null ? 'Ask for price' : aed(i.line_fils)}</div><div class="cell-sub">× ${i.qty}</div></div></div>`)}</div>
          <div class="card-body"><dl class="kv">
            <dt>Subtotal</dt><dd class="nums right">${aed(o.subtotal_fils, { ask: false })}</dd>
            ${o.discount_fils ? html`<dt>Gift voucher</dt><dd class="nums right">− ${aed(o.discount_fils)}</dd>` : ''}
            <dt>Total</dt><dd class="nums right"><b>${aed(o.total_fils, { ask: false })}</b></dd>
            ${o.due_now_fils && o.due_now_fils < o.total_fils ? html`<dt>Deposit due</dt><dd class="nums right">${aed(o.due_now_fils)}</dd>` : ''}
            <dt>Paid</dt><dd class="nums right">${aed(o.paid_fils)}${o.payment_method ? ` · ${o.payment_method}` : ''}</dd>
            <dt>Balance</dt><dd class="nums right"><b>${aed(balance)}</b></dd>
          </dl></div>
        </div>

        ${vouchers.length || passes.length ? html`<div class="card"><div class="card-head"><div class="h2">Issued</div></div><div class="card-body stack">
          ${vouchers.map((v) => html`<div class="stack"><div class="row-between"><span class="row">${ico('gift')} <b>Gift voucher · ${aed(v.initial_fils)}</b></span>${badge(v.status)}</div>
            <div class="code-box"><span>${v.code}</span><button class="btn btn-ghost btn-sm" data-copy>${ico('copy')} Copy</button></div>
            <div class="help">Balance ${aed(v.balance_fils)}${v.expires_at ? ` · expires ${fmtDate(v.expires_at)}` : ''}</div></div>`)}
          ${passes.map((p) => html`<div class="stack"><div class="row-between"><span class="row">${ico('ticket')} <b>${p.name}</b></span>${badge(p.status)}</div>
            <div class="code-box"><span>${p.code}</span><button class="btn btn-ghost btn-sm" data-copy>${ico('copy')} Copy</button></div>
            <div class="help">${p.visits_total - p.visits_used} of ${p.visits_total} visits left${p.expires_at ? ` · expires ${fmtDate(p.expires_at)}` : ''}</div></div>`)}
        </div></div>` : ''}

        <form class="card" data-notes><div class="card-head"><div class="h2">Internal notes</div><span class="sub">Staff only</span></div>
          <div class="card-body stack"><textarea class="textarea" name="internal_notes" rows="3" placeholder="Allergies, special requests, who took the booking…">${o.internal_notes || ''}</textarea>
          <div class="row-between"><span class="help">Saved notes are kept in the activity log.</span><button class="btn btn-ghost btn-sm" type="submit">${ico('check')} Save notes</button></div></div></form>
      </div>

      <div class="stack">
        <div class="card"><div class="card-body stack">
          <div class="row"><span class="avatar">${initials(o.customer_name)}</span><div class="grow"><div class="cell-main">${o.customer_name}</div><div class="cell-sub">${o.customer_phone}</div></div></div>
          ${o.notes ? html`<div class="callout">${ico('info')}<div>${o.notes}</div></div>` : ''}
          <div class="grid-2">
            <a class="btn btn-ghost" href="tel:${o.customer_phone}">${ico('phone')} Call</a>
            <a class="btn btn-ghost" href="${waLink(o.customer_phone)}" target="_blank" rel="noopener">${ico('whatsapp')} WhatsApp</a>
          </div>
          ${o.customer_email ? html`<a class="btn btn-quiet" href="mailto:${o.customer_email}">${ico('mail')} ${o.customer_email}</a>` : ''}
          <a class="btn btn-dark" href="${waLink(o.customer_phone, confirmText)}" target="_blank" rel="noopener">${ico('whatsapp')} Send confirmation</a>
          <button class="btn btn-quiet btn-sm" data-copy="${customerLink}">${ico('copy')} Copy customer's order link</button>
        </div></div>
        <div class="card"><div class="card-head"><div class="h2">Details</div></div><div class="card-body"><dl class="kv">
          <dt>Channel</dt><dd>${o.channel}</dd>
          <dt>Created</dt><dd>${fmtDateTime(o.created_at)}</dd>
          ${o.paid_at ? html`<dt>Paid at</dt><dd>${fmtDateTime(o.paid_at)}</dd>` : ''}
          ${o.hold_expires_at ? html`<dt>Hold until</dt><dd>${fmtDateTime(o.hold_expires_at)}</dd>` : ''}
          ${o.stripe_payment_intent ? html`<dt>Stripe</dt><dd class="mono truncate">${o.stripe_payment_intent}</dd>` : ''}
        </dl></div></div>
      </div>
    </div>`);
  }

  root.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-action]');
    if (!b) return;
    const action = b.dataset.action;
    try {
      if (action === 'mark_paid') {
        const current = await api(`/orders/${id}`);
        const due = Math.max(0, current.order.total_fils - current.order.paid_fils);
        await modal({
          title: 'Record a payment',
          body: html`<form class="form" data-pay>
            <div class="field"><label>Method</label><select class="select" name="method"><option value="card">Card</option><option value="cash">Cash</option><option value="bank">Bank transfer</option><option value="other">Other</option></select></div>
            <div class="field"><label>Amount</label><div class="input-group has-suffix"><input class="input" name="amount" type="number" step="0.01" min="0" value="${due ? due / 100 : ''}"><span class="suffix">AED</span></div></div></form>`,
          actions: [{ label: 'Cancel', value: null }, { label: 'Record payment', cls: 'btn-primary', onClick: async (m) => {
            const v = values(m.querySelector('form'));
            await api(`/orders/${id}`, { method: 'PATCH', body: { action, method: v.method, amount: v.amount } });
            toast('Payment recorded');
          } }],
        });
      } else {
        const labels = { confirm: ['Confirm this booking?', 'The spots stay held with no expiry, and any passes or vouchers become active.', 'Confirm', false],
          complete: ['Mark as completed?', 'Use this once the visit or party has happened.', 'Mark completed', false],
          cancel: ['Cancel this order?', 'Its spots are released and any vouchers or passes it issued are voided.', 'Cancel order', true],
          refund: ['Mark as refunded?', 'This records the refund and voids what it issued. Refund the card itself in Stripe.', 'Mark refunded', true] };
        const [title, message, confirm, danger] = labels[action];
        if (!(await confirmDialog({ title, message, confirm, danger }))) return;
        await busy(b, () => api(`/orders/${id}`, { method: 'PATCH', body: { action } }));
        toast('Order updated');
      }
      window.dispatchEvent(new CustomEvent('ti:counts'));
      await load();
    } catch (err) { errorToast(err); }
  });
  root.addEventListener('submit', async (e) => {
    if (!e.target.matches('[data-notes]')) return;
    e.preventDefault();
    await busy(e.target.querySelector('button'), async () => {
      try { await api(`/orders/${id}`, { method: 'PATCH', body: { action: 'notes', internal_notes: e.target.elements.internal_notes.value } }); toast('Notes saved'); } catch (err) { errorToast(err); }
    });
  });
  await load();
}
