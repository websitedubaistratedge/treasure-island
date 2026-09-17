import { api } from '../api.js';
import { html, ico, mount, $, toast, busy, values, showErrors, todayDubai, raw } from '../ui.js';

const DAYS = [[1, 'Monday'], [2, 'Tuesday'], [3, 'Wednesday'], [4, 'Thursday'], [5, 'Friday'], [6, 'Saturday'], [0, 'Sunday']];

export default async function settings(root, ctx) {
  ctx.setCrumbs([{ label: 'Settings' }]);
  const owner = ctx.can('owner');
  let data = await api('/settings');
  const hookUrl = `${location.origin}/api/stripe/webhook`;

  function draw() {
    const s = data.settings;
    const env = data.env;
    mount(root, html`
    <div class="page-head"><div><h1>Settings</h1><p>How the website takes bookings, when you are open, and who gets alerts.</p></div></div>
    <div class="stack">

      <form class="card" data-key="online_booking">
        <div class="card-head"><div><div class="h2">Online booking</div><div class="sub">Off by default, so the website looks exactly as it does today.</div></div>${s.online_booking.enabled ? html`<span class="badge b-ok">Live</span>` : html`<span class="badge b-neutral">Off</span>`}</div>
        <div class="card-body stack">
          <label class="switch"><input type="checkbox" name="enabled" ${s.online_booking.enabled ? raw('checked') : ''}><span class="track"></span><span><b>Let families book and buy on the website</b>
            <div class="help">Adds a “Book online” button to programmes, “Add to cart” on priced boutique items, gift vouchers and passes, and a cart. Without card payments, bookings arrive here as reservations and the customer is sent to WhatsApp to confirm.</div></span></label>
          <div class="row-between"><span class="help">Changes appear on the website within a minute.</span><button class="btn btn-primary" type="submit">${ico('check')} Save</button></div>
        </div>
      </form>

      <form class="card" data-key="payments">
        <div class="card-head"><div><div class="h2">Card payments (Stripe)</div><div class="sub">Cards, Apple Pay and Google Pay in AED.</div></div>
          ${env.stripeKeys && s.payments.stripe_enabled ? html`<span class="badge b-ok">${env.stripeTestMode ? 'Test mode' : 'Live'}</span>` : html`<span class="badge b-neutral">Not connected</span>`}</div>
        <div class="card-body stack">
          ${env.stripeKeys ? html`<div class="callout ok">${ico('check')}<div>Stripe keys are installed${env.stripeTestMode ? html` in <b>test mode</b> (no real money moves)` : ''}.</div></div>`
            : html`<div class="callout warn">${ico('lock')}<div><b>Stripe is not connected yet.</b> In Cloudflare, open the <b>treasure-island</b> project → Settings → Variables and Secrets, and add two <b>secrets</b>: <span class="mono">STRIPE_SECRET_KEY</span> (from Stripe → Developers → API keys) and <span class="mono">STRIPE_WEBHOOK_SECRET</span>. For the webhook, add an endpoint in Stripe pointing to <span class="mono">${hookUrl}</span> with the events <span class="mono">checkout.session.completed</span> and <span class="mono">checkout.session.expired</span>.</div></div>`}
          <label class="switch"><input type="checkbox" name="stripe_enabled" ${s.payments.stripe_enabled ? raw('checked') : ''} ${owner && env.stripeKeys ? '' : raw('disabled')}><span class="track"></span><span><b>Take card payments at checkout</b><div class="help">${owner ? 'Only works once both keys are installed.' : 'Only the owner can change payments.'}</div></span></label>
          <div class="grid-2">
            <div class="field"><label>Hold spots while paying</label><div class="input-group has-suffix"><input class="input" type="number" min="31" max="1440" name="hold_minutes" value="${s.payments.hold_minutes}" ${owner ? '' : raw('disabled')}><span class="suffix">min</span></div><div class="help">Stripe needs at least 31 minutes.</div></div>
            <div class="field"><label>Hold unpaid reservations for</label><div class="input-group has-suffix"><input class="input" type="number" min="1" max="720" name="reservation_hold_hours" value="${s.payments.reservation_hold_hours}" ${owner ? '' : raw('disabled')}><span class="suffix">hours</span></div><div class="help">After this the spots are released unless you confirm.</div></div>
          </div>
          ${owner ? html`<div class="row-between"><span></span><button class="btn btn-primary" type="submit">${ico('check')} Save</button></div>` : ''}
        </div>
      </form>

      <div class="layout-2">
        <form class="card" data-key="opening_hours">
          <div class="card-head"><div><div class="h2">Opening hours</div><div class="sub">Used by the “Now open” badge on the website.</div></div></div>
          <div class="card-body stack">${DAYS.map(([i, name]) => {
            const day = s.opening_hours.days[i] || {};
            return html`<div class="hours-row" data-day="${i}"><b>${name}</b>
              <input class="input" type="time" data-k="open" value="${day.open || '10:00'}" ${day.closed ? raw('disabled') : ''} aria-label="${name} opens">
              <input class="input" type="time" data-k="close" value="${day.close || '22:00'}" ${day.closed ? raw('disabled') : ''} aria-label="${name} closes">
              <label class="check"><input type="checkbox" data-k="closed" ${day.closed ? raw('checked') : ''}><span>Closed</span></label></div>`;
          })}
          <div class="row-between"><span></span><button class="btn btn-primary" type="submit">${ico('check')} Save hours</button></div></div>
        </form>

        <div class="stack">
          <form class="card" data-key="business">
            <div class="card-head"><div class="h2">Business details</div></div>
            <div class="card-body form">
              <div class="field"><label>Name</label><input class="input" name="name" value="${s.business.name}"></div>
              <div class="field"><label>WhatsApp number for bookings</label><input class="input" name="whatsapp" value="${s.business.whatsapp}"><div class="help">Digits with country code, no + (e.g. 971504738452). Every WhatsApp button uses it.</div></div>
              <div class="field"><label>Phone</label><input class="input" name="phone" value="${s.business.phone}"></div>
              <button class="btn btn-primary" type="submit">${ico('check')} Save</button>
            </div>
          </form>
          <form class="card" data-key="notifications">
            <div class="card-head"><div class="h2">Alerts</div>${env.emailConfigured ? html`<span class="badge b-ok">Email ready</span>` : html`<span class="badge b-neutral">Email not set up</span>`}</div>
            <div class="card-body form">
              <div class="field"><label>Email me new bookings and enquiries</label><input class="input" type="email" name="email" value="${s.notifications.email || ''}" placeholder="bookings@treasureislanddxb.com"></div>
              ${env.emailConfigured ? '' : html`<div class="help">Email sending needs a free Resend account: add <span class="mono">RESEND_API_KEY</span> and <span class="mono">EMAIL_FROM</span> as secrets in Cloudflare. Until then everything still appears here in the panel.</div>`}
              <button class="btn btn-primary" type="submit">${ico('check')} Save</button>
            </div>
          </form>
        </div>
      </div>

      <form class="card" data-key="closures">
        <div class="card-head"><div><div class="h2">Closures and special hours</div><div class="sub">Holidays, private events or shorter days. Past dates are ignored.</div></div>
          <button type="button" class="btn btn-ghost btn-sm" data-add-closure>${ico('plus')} Add date</button></div>
        <div class="card-body stack" data-closures>${(s.closures.items || []).length ? '' : html`<div class="help">No special dates.</div>`}
          ${(s.closures.items || []).map((c, i) => closureRow(c, i))}</div>
        <div class="card-body row-between"><span></span><button class="btn btn-primary" type="submit">${ico('check')} Save dates</button></div>
      </form>
    </div>`);
  }

  const closureRow = (c, i) => html`<div class="hours-row" data-closure="${i}">
    <input class="input" type="date" data-k="date" value="${c.date || todayDubai()}" aria-label="Date">
    <input class="input" data-k="label" value="${c.label || ''}" placeholder="e.g. Eid Al Adha" aria-label="Label">
    <div class="row"><input class="input" type="time" data-k="open" value="${c.open || '12:00'}" ${c.closed ? raw('disabled') : ''} aria-label="Opens"><input class="input" type="time" data-k="close" value="${c.close || '20:00'}" ${c.closed ? raw('disabled') : ''} aria-label="Closes"></div>
    <div class="row"><label class="check"><input type="checkbox" data-k="closed" ${c.closed ? raw('checked') : ''}><span>Closed</span></label>
      <button type="button" class="btn btn-quiet btn-icon btn-sm" data-remove-closure="${i}" aria-label="Remove">${ico('trash')}</button></div></div>`;

  function readHours(form) {
    const days = Array(7);
    form.querySelectorAll('[data-day]').forEach((row) => {
      const g = (k) => row.querySelector(`[data-k="${k}"]`);
      days[Number(row.dataset.day)] = g('closed').checked ? { closed: true } : { open: g('open').value, close: g('close').value };
    });
    return { days };
  }
  function readClosures(form) {
    return { items: [...form.querySelectorAll('[data-closure]')].map((row) => {
      const g = (k) => row.querySelector(`[data-k="${k}"]`);
      return g('closed').checked ? { date: g('date').value, label: g('label').value, closed: true } : { date: g('date').value, label: g('label').value, open: g('open').value, close: g('close').value };
    }) };
  }

  root.addEventListener('change', (e) => {
    if (e.target.dataset.k === 'closed') {
      const row = e.target.closest('.hours-row');
      row.querySelectorAll('input[type=time]').forEach((t) => { t.disabled = e.target.checked; });
    }
  });
  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-add-closure]')) {
      const form = $('[data-key="closures"]', root);
      data.settings.closures.items = readClosures(form).items.concat([{ date: todayDubai(), label: '', closed: true }]);
      draw();
    }
    const rm = e.target.closest('[data-remove-closure]');
    if (rm) {
      const items = readClosures($('[data-key="closures"]', root)).items;
      items.splice(Number(rm.dataset.removeClosure), 1);
      data.settings.closures.items = items;
      draw();
    }
  });
  root.addEventListener('submit', async (e) => {
    const form = e.target.closest('form[data-key]');
    if (!form) return;
    e.preventDefault();
    const key = form.dataset.key;
    const v = values(form);
    let value;
    if (key === 'online_booking') value = { enabled: v.enabled };
    if (key === 'payments') value = { stripe_enabled: v.stripe_enabled, hold_minutes: Number(v.hold_minutes), reservation_hold_hours: Number(v.reservation_hold_hours) };
    if (key === 'business') value = { name: v.name, whatsapp: v.whatsapp, phone: v.phone };
    if (key === 'notifications') value = { email: v.email };
    if (key === 'opening_hours') value = readHours(form);
    if (key === 'closures') value = readClosures(form);
    await busy(form.querySelector('button[type=submit]'), async () => {
      try {
        const r = await api('/settings', { method: 'PUT', body: { key, value } });
        data = { ...data, settings: r.settings };
        toast('Saved. The website updates within a minute.');
        draw();
      } catch (err) { showErrors(form, err); }
    });
  });
  draw();
}
