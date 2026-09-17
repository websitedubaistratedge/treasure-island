import { api } from '../api.js';
import { html, ico, mount, aed, fmtDay, fmtTime, ago, badge, todayDubai } from '../ui.js';
import { areaChart, sparkline, donut } from '../charts.js';

const MIX = {
  program: ['Programmes', '#1a7bb0'], camp: ['Camps', '#2FA36B'], party: ['Parties', '#F5A50A'], workshop: ['Workshops', '#8B5CF6'],
  event: ['Events', '#FF6B4A'], pass: ['Passes', '#12B5C9'], product: ['Boutique', '#5b6b78'], voucher: ['Gift vouchers', '#d64545'],
};

export default async function dashboard(root, ctx) {
  ctx.setCrumbs([{ label: 'Dashboard' }]);
  const [d, settings, team] = await Promise.all([
    api('/dashboard'),
    ctx.can('manager') ? api('/settings').catch(() => null) : null,
    ctx.can('manager') ? api('/team').catch(() => null) : null,
  ]);
  const k = d.kpis;
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dubai', hour: '2-digit', hour12: false }).format(new Date()));
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const first = String(ctx.me.name).split(' ')[0];
  const change = k.revenue7Change;
  const dateLine = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dubai', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());

  const steps = settings ? [
    ['Add dates for a programme, camp or party', d.upcoming.length > 0, '#/calendar?new=1'],
    ['Switch on online booking', settings.settings.online_booking.enabled, '#/settings'],
    ['Connect Stripe for card payments', settings.env.stripeKeys && settings.settings.payments.stripe_enabled, '#/settings'],
    ['Get email alerts for new bookings', settings.env.emailConfigured && !!settings.settings.notifications.email, '#/settings'],
    ['Invite your team', team && team.rows.length > 1, '#/team'],
  ] : [];
  const stepsDone = steps.filter((s) => s[1]).length;

  const mixTotal = d.mix.reduce((s, m) => s + m.fils, 0);
  const mix = d.mix.filter((m) => m.fils > 0).map((m) => ({ label: (MIX[m.label] || [m.label])[0], color: (MIX[m.label] || [0, '#5b6b78'])[1], value: m.fils }))
    .sort((a, b) => b.value - a.value);

  mount(root, html`
  <div class="page-head">
    <div><h1>${greet}, ${first}</h1><p>${dateLine} · here is how the island is doing.</p></div>
    <div class="page-actions">
      <a class="btn btn-ghost" href="#/checkin">${ico('scan')} Check in</a>
      <a class="btn btn-primary" href="#/orders?new=1">${ico('plus')} New booking</a>
    </div>
  </div>

  <div class="kpis">
    <div class="card kpi">
      <div class="kpi-top"><span class="kpi-ico tone-gold">${ico('money')}</span>
        ${change == null ? '' : html`<span class="delta ${change >= 0 ? 'up' : 'down'}">${change >= 0 ? '▲' : '▼'} ${Math.abs(Math.round(change * 100))}%</span>`}</div>
      <div class="kpi-val nums">${aed(k.revenue7, { short: true }).replace(' AED', '')}<small>AED</small></div>
      <div class="kpi-label">Revenue, last 7 days</div>
      ${sparkline(d.series.slice(-14).map((s) => s.fils))}
    </div>
    <a class="card kpi" href="#/calendar">
      <div class="kpi-top"><span class="kpi-ico tone-navy">${ico('child')}</span></div>
      <div class="kpi-val nums">${k.guestsToday}</div>
      <div class="kpi-label">Children booked today · ${k.bookingsToday} booking${k.bookingsToday === 1 ? '' : 's'}</div>
    </a>
    <a class="card kpi" href="#/orders?status=open">
      <div class="kpi-top"><span class="kpi-ico tone-coral">${ico('clock')}</span>${k.pending ? html`<span class="delta down">Needs action</span>` : ''}</div>
      <div class="kpi-val nums">${k.pending}</div>
      <div class="kpi-label">Reservations to confirm</div>
    </a>
    <a class="card kpi" href="#/enquiries">
      <div class="kpi-top"><span class="kpi-ico tone-grape">${ico('inbox')}</span></div>
      <div class="kpi-val nums">${k.newEnquiries}</div>
      <div class="kpi-label">New enquiries</div>
    </a>
  </div>

  <div class="layout-2">
    <div class="stack">
      <div class="card">
        <div class="card-head"><div><div class="h2">Revenue</div><div class="sub">Last 30 days · <b class="nums">${aed(k.revenue30)}</b> collected</div></div></div>
        <div class="card-body" data-chart></div>
      </div>
      <div class="card">
        <div class="card-head"><div class="h2">Latest orders</div><a class="btn btn-quiet btn-sm" href="#/orders">View all ${ico('chevronRight')}</a></div>
        ${d.recent.length ? html`<div class="table-wrap"><table class="table"><tbody>
          ${d.recent.map((o) => html`<tr class="click" data-href="#/orders/${o.id}">
            <td><div class="cell-main mono">${o.ref}</div><div class="cell-sub">${ago(o.created_at)} · ${o.channel}</div></td>
            <td><div class="cell-main">${o.customer_name}</div></td>
            <td>${badge(o.status)}</td>
            <td class="right nums cell-main">${aed(o.total_fils, { ask: false })}</td></tr>`)}
        </tbody></table></div>` : html`<div class="empty"><div class="empty-ico">${ico('orders')}</div><b>No orders yet</b><div>Desk bookings and online orders appear here.</div></div>`}
      </div>
    </div>

    <div class="stack">
      ${steps.length && stepsDone < steps.length ? html`<div class="card">
        <div class="card-head"><div><div class="h2">Get ready for online booking</div><div class="sub">${stepsDone} of ${steps.length} done</div></div></div>
        <div class="card-body"><div class="bar"><i data-w="${(stepsDone / steps.length) * 100}"></i></div>
          <div class="checklist">${steps.map(([label, done, href]) => html`<a class="check-item ${done ? 'done' : ''}" href="${href}">
            <span class="check-dot">${done ? ico('check') : ''}</span><span class="check-text grow">${label}</span>${done ? '' : ico('chevronRight')}</a>`)}</div></div>
      </div>` : ''}

      <div class="card">
        <div class="card-head"><div class="h2">Next 7 days</div><a class="btn btn-quiet btn-sm" href="#/calendar">Calendar ${ico('chevronRight')}</a></div>
        ${d.upcoming.length ? html`<div class="list">${d.upcoming.map((s) => {
          const pct = s.capacity ? Math.round((s.taken / s.capacity) * 100) : 0;
          const day = new Date(s.starts_at);
          return html`<a class="list-row" href="#/calendar?slot=${s.id}">
            <span class="date-tile"><b>${new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dubai', day: 'numeric' }).format(day)}</b><span>${new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dubai', weekday: 'short' }).format(day)}</span></span>
            <div class="grow"><div class="cell-main">${s.offering}</div><div class="cell-sub">${fmtTime(s.starts_at)} · ${s.taken}/${s.capacity} booked</div>
              <div class="bar ${pct >= 100 ? 'full' : pct >= 75 ? 'hot' : ''}"><i data-w="${pct}"></i></div></div></a>`;
        })}</div>` : html`<div class="empty"><div class="empty-ico">${ico('calendar')}</div><b>No sessions this week</b><a class="btn btn-ghost btn-sm" href="#/calendar?new=1">${ico('plus')} Add sessions</a></div>`}
      </div>

      <div class="card">
        <div class="card-head"><div class="h2">Sales mix</div><span class="sub">Last 30 days</span></div>
        <div class="card-body">${mixTotal ? html`<div class="donut-wrap">${donut(mix)}<div class="legend">${mix.map((m) => html`
          <div class="legend-row"><span class="legend-dot" data-color="${m.color}"></span><span class="grow">${m.label}</span><span class="nums muted">${Math.round((m.value / mixTotal) * 100)}%</span></div>`)}</div></div>`
          : html`<div class="empty"><b>No sales yet</b><div>Paid orders will be broken down here.</div></div>`}</div>
      </div>

      <div class="grid-2">
        <a class="card kpi" href="#/passes"><div class="kpi-top"><span class="kpi-ico tone-aqua">${ico('ticket')}</span></div><div class="kpi-val nums">${k.activePasses}</div><div class="kpi-label">Active passes</div></a>
        <a class="card kpi" href="#/vouchers"><div class="kpi-top"><span class="kpi-ico tone-leaf">${ico('gift')}</span></div><div class="kpi-val nums">${aed(k.voucherBalance, { short: true }).replace(' AED', '')}<small>AED</small></div><div class="kpi-label">Unspent on ${k.activeVouchers} voucher${k.activeVouchers === 1 ? '' : 's'}</div></a>
      </div>

      ${d.lowStock.length ? html`<div class="card"><div class="card-head"><div class="h2">Running low</div><a class="btn btn-quiet btn-sm" href="#/boutique">Boutique ${ico('chevronRight')}</a></div>
        <div class="list">${d.lowStock.map((p) => html`<div class="list-row"><span class="grow cell-main">${p.name}</span>${badge(p.stock === 0 ? 'void' : 'pending', p.stock === 0 ? 'Sold out' : `${p.stock} left`)}</div>`)}</div></div>` : ''}
    </div>
  </div>`);

  root.querySelectorAll('[data-color]').forEach((el) => { el.style.background = el.dataset.color; });
  areaChart(root.querySelector('[data-chart]'), d.series);
  root.querySelectorAll('tr[data-href]').forEach((tr) => tr.addEventListener('click', () => { location.hash = tr.dataset.href; }));
}
