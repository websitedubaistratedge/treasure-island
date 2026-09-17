import { api } from '../api.js';
import { html, ico, mount, $, fmtTime, fmtDay, fmtDateTime, badge, drawer, toast, errorToast, busy, values, showErrors, confirmDialog, dubaiParts, dubaiToIso, todayDubai, addDays, KIND_LABEL, raw } from '../ui.js';
import { openBooking } from './orders.js';

const WEEKDAYS = [['1', 'Mon'], ['2', 'Tue'], ['3', 'Wed'], ['4', 'Thu'], ['5', 'Fri'], ['6', 'Sat'], ['0', 'Sun']];
function mondayOf(day) {
  const dow = new Date(`${day}T00:00:00Z`).getUTCDay();
  return addDays(day, dow === 0 ? -6 : 1 - dow);
}

export default async function calendar(root, ctx) {
  ctx.setCrumbs([{ label: 'Calendar' }]);
  const offerings = (await api('/offerings')).rows;
  const bookable = offerings.filter((o) => o.kind !== 'pass');
  const st = { week: mondayOf(ctx.query.get('week') || todayDubai()), offering: '' };

  mount(root, html`
  <div class="page-head">
    <div><h1>Calendar</h1><p>Sessions, capacity and who is coming, week by week (Dubai time).</p></div>
    <div class="page-actions"><button class="btn btn-primary" data-generate>${ico('plus')} Add sessions</button></div>
  </div>
  <div class="card">
    <div class="toolbar">
      <div class="row"><button class="btn btn-ghost btn-icon btn-sm" data-shift="-7" aria-label="Previous week">${ico('chevronLeft')}</button>
        <button class="btn btn-ghost btn-sm" data-today>Today</button>
        <button class="btn btn-ghost btn-icon btn-sm" data-shift="7" aria-label="Next week">${ico('chevronRight')}</button>
        <b data-label class="nums"></b></div>
      <div class="top-spacer"></div>
      <select class="select" data-filter><option value="">All programmes</option>${bookable.map((o) => html`<option value="${o.id}">${o.name}</option>`)}</select>
    </div>
    <div class="table-wrap" data-grid></div>
  </div>`);

  async function load() {
    const from = dubaiToIso(st.week, '00:00');
    const to = dubaiToIso(addDays(st.week, 7), '00:00');
    const q = new URLSearchParams({ from, to });
    if (st.offering) q.set('offering', st.offering);
    const { rows } = await api(`/slots?${q}`);
    if (!ctx.isCurrent()) return;
    const end = addDays(st.week, 6);
    $('[data-label]', root).textContent = `${fmtDay(`${st.week}T08:00:00Z`)} – ${fmtDay(`${end}T08:00:00Z`)}`;
    const today = todayDubai();
    const days = Array.from({ length: 7 }, (_, i) => addDays(st.week, i));
    mount($('[data-grid]', root), html`<div class="cal">${days.map((day) => {
      const daySlots = rows.filter((s) => dubaiParts(s.starts_at).date === day);
      const dt = new Date(`${day}T08:00:00Z`);
      return html`<div class="cal-day ${day === today ? 'today' : ''}">
        <div class="cal-dh"><b>${dt.getUTCDate()}</b><span>${WEEKDAYS[(dt.getUTCDay() + 6) % 7][1]}</span></div>
        <div class="cal-slots">${daySlots.length ? daySlots.map((s) => {
          const pct = s.capacity ? Math.round((s.taken / s.capacity) * 100) : 100;
          return html`<button class="slot k-${s.kind} ${s.status !== 'open' ? 'closed' : ''}" data-slot="${s.id}">
            <span class="slot-time">${fmtTime(s.starts_at)}–${fmtTime(s.ends_at)}</span>
            <span class="slot-name">${s.offering}</span>
            <span class="bar ${pct >= 100 ? 'full' : pct >= 75 ? 'hot' : ''}"><i data-w="${pct}"></i></span>
            <span class="slot-cap"><span>${s.status === 'open' ? `${s.taken}/${s.capacity} booked` : s.status}</span>${s.remaining === 0 && s.status === 'open' ? html`<span>Full</span>` : ''}</span></button>`;
        }) : html`<div class="help">—</div>`}</div></div>`;
    })}</div>`);
  }

  root.addEventListener('click', async (e) => {
    const sh = e.target.closest('[data-shift]');
    if (sh) { st.week = addDays(st.week, Number(sh.dataset.shift)); load().catch(errorToast); }
    if (e.target.closest('[data-today]')) { st.week = mondayOf(todayDubai()); load().catch(errorToast); }
    const slot = e.target.closest('[data-slot]');
    if (slot) openSlot(Number(slot.dataset.slot));
    if (e.target.closest('[data-generate]')) openGenerator();
  });
  $('[data-filter]', root).addEventListener('change', (e) => { st.offering = e.target.value; load().catch(errorToast); });

  async function openSlot(id) {
    const d = drawer({ title: 'Session', wide: true });
    const draw = async () => {
      const { slot: s, attendees } = await api(`/slots/${id}`);
      const { date, time } = dubaiParts(s.starts_at);
      const children = attendees.reduce((n, a) => n + a.qty, 0);
      d.setTitle(s.offering);
      mount(d.body, html`<div class="stack">
        <div class="print-only"><h2>${s.offering}</h2><p>${fmtDateTime(s.starts_at)} – ${fmtTime(s.ends_at)}</p></div>
        <div class="row wrap"><span class="tag">${KIND_LABEL[s.kind] || s.kind}</span>${badge(s.status)}<b>${fmtDay(s.starts_at)}, ${time}–${fmtTime(s.ends_at)}</b></div>
        <div class="grid-3">
          <div class="card card-pad"><div class="eyebrow">Booked</div><div class="kpi-val nums">${s.taken}</div></div>
          <div class="card card-pad"><div class="eyebrow">Capacity</div><div class="kpi-val nums">${s.capacity}</div></div>
          <div class="card card-pad"><div class="eyebrow">Left</div><div class="kpi-val nums">${s.remaining}</div></div>
        </div>
        <div class="card">
          <div class="card-head"><div class="h2">Class list</div><span class="sub">${children} child${children === 1 ? '' : 'ren'} · ${attendees.length} booking${attendees.length === 1 ? '' : 's'}</span></div>
          ${attendees.length ? html`<div class="table-wrap"><table class="table"><thead><tr><th>Child</th><th>Parent</th><th>Status</th></tr></thead><tbody>
            ${attendees.map((a) => html`<tr>
              <td>${a.children.length ? a.children.map((c) => html`<div class="cell-main">${c.name}${c.age != null ? html` <span class="muted">· ${c.age}</span>` : ''}</div>`) : html`<span class="muted">${a.qty} place${a.qty === 1 ? '' : 's'}</span>`}</td>
              <td><div class="cell-main">${a.customer_name}</div><div class="cell-sub">${a.customer_phone} · <a href="#/orders/${a.order_id}" class="mono">${a.ref}</a></div></td>
              <td>${badge(a.status)}</td></tr>`)}</tbody></table></div>`
            : html`<div class="empty"><b>No bookings yet</b></div>`}
        </div>
        <form class="card no-print" data-edit><div class="card-head"><div class="h2">Edit session</div></div><div class="card-body form">
          <div class="grid-3">
            <div class="field"><label>Date</label><input class="input" type="date" name="date" value="${date}"></div>
            <div class="field"><label>Starts</label><input class="input" type="time" name="start" value="${time}"></div>
            <div class="field"><label>Ends</label><input class="input" type="time" name="end" value="${dubaiParts(s.ends_at).time}"></div>
          </div>
          <div class="grid-2">
            <div class="field"><label>Capacity</label><input class="input" type="number" min="${s.taken}" name="capacity" value="${s.capacity}"><div class="help">Cannot go below the ${s.taken} already booked.</div></div>
            <div class="field"><label>Status</label><select class="select" name="status">${[['open', 'Open for booking'], ['closed', 'Closed (hidden online)'], ['cancelled', 'Cancelled']].map(([v, l]) => html`<option value="${v}" ${s.status === v ? raw('selected') : ''}>${l}</option>`)}</select></div>
          </div>
          <div class="field"><label>Note</label><input class="input" name="note" value="${s.note || ''}" placeholder="e.g. Pirate theme week"></div>
        </div></form>
      </div>`);
      d.setFoot(html`${attendees.length ? '' : html`<button class="btn btn-danger" data-del>${ico('trash')} Delete</button>`}
        <div class="top-spacer"></div>
        <button class="btn btn-ghost" data-print>${ico('printer')} Print list</button>
        <button class="btn btn-ghost" data-book>${ico('plus')} Add booking</button>
        <button class="btn btn-primary" data-save>${ico('check')} Save</button>`);
    };
    try { await draw(); } catch (err) { errorToast(err); d.close(); return; }
    d.el.addEventListener('click', async (e) => {
      if (e.target.closest('[data-print]')) { document.body.classList.add('printing'); window.print(); document.body.classList.remove('printing'); }
      if (e.target.closest('[data-book]')) { d.close(); openBooking({ slotId: id, onDone: (o) => ctx.navigate(`/orders/${o.id}`) }); }
      const save = e.target.closest('[data-save]');
      if (save) {
        const v = values($('[data-edit]', d.body));
        await busy(save, async () => {
          try { await api(`/slots/${id}`, { method: 'PATCH', body: { capacity: v.capacity, status: v.status, note: v.note, date: v.date, start: v.start, end: v.end } }); toast('Session saved'); await draw(); load(); } catch (err) { showErrors(d.body, err); }
        });
      }
      if (e.target.closest('[data-del]')) {
        if (!(await confirmDialog({ title: 'Delete this session?', message: 'It has no bookings, so it will simply disappear.', confirm: 'Delete', danger: true }))) return;
        try { await api(`/slots/${id}`, { method: 'DELETE' }); toast('Session deleted'); d.close(); load(); } catch (err) { errorToast(err); }
      }
    });
  }

  function openGenerator() {
    const d = drawer({ title: 'Add sessions', wide: true });
    const today = todayDubai();
    const pre = ctx.query.get('offering');
    const st2 = { weekdays: new Set(['0', '1', '2', '3', '4', '5', '6']), times: [{ start: '10:00', end: '12:00' }] };
    const draw = () => mount(d.body, html`<form class="form" novalidate>
      ${bookable.length ? '' : html`<div class="callout warn">${ico('alert')}<div>Create a programme first in <a href="#/programs">Programmes</a>.</div></div>`}
      <div class="field"><label>Programme</label><select class="select" name="offeringId">${bookable.map((o) => html`<option value="${o.id}" ${String(o.id) === pre ? raw('selected') : ''}>${o.name}</option>`)}</select></div>
      <div class="grid-2">
        <div class="field"><label>From</label><input class="input" type="date" name="startDate" value="${today}" min="${today}"></div>
        <div class="field"><label>Until</label><input class="input" type="date" name="endDate" value="${addDays(today, 27)}" min="${today}"></div>
      </div>
      <div class="field" data-field="weekdays"><label>On these days</label><div class="chips">${WEEKDAYS.map(([v, l]) => html`<button type="button" class="chip ${st2.weekdays.has(v) ? 'on' : ''}" data-wd="${v}">${l}</button>`)}</div></div>
      <div class="field" data-field="times"><label>Times</label><div class="stack">${st2.times.map((t, i) => html`<div class="row">
        <input class="input" type="time" value="${t.start}" data-t="${i}" data-tk="start"><span class="muted">to</span><input class="input" type="time" value="${t.end}" data-t="${i}" data-tk="end">
        ${st2.times.length > 1 ? html`<button type="button" class="btn btn-quiet btn-icon btn-sm" data-rt="${i}" aria-label="Remove time">${ico('x')}</button>` : ''}</div>`)}</div>
        <button type="button" class="btn btn-quiet btn-sm" data-at>${ico('plus')} Add another time</button></div>
      <div class="grid-2">
        <div class="field"><label>Capacity per session</label><input class="input" type="number" min="1" name="capacity" value="12"><div class="help">Children for programmes, bookings for parties.</div></div>
        <div class="field"><label>Note (optional)</label><input class="input" name="note" placeholder="Shown to staff"></div>
      </div>
      <div class="callout ok">${ico('calendar')}<div data-count></div></div>
    </form>`);
    const count = () => {
      const f = $('form', d.body);
      if (!f) return;
      const v = values(f);
      let n = 0;
      for (let day = v.startDate, g = 0; day && v.endDate && day <= v.endDate && g < 800; day = addDays(day, 1), g++) {
        if (st2.weekdays.has(String(new Date(`${day}T00:00:00Z`).getUTCDay()))) n += st2.times.length;
      }
      $('[data-count]', d.body).textContent = n ? `This will create ${n} session${n === 1 ? '' : 's'}.` : 'No sessions match these dates and days.';
    };
    draw(); count();
    d.setFoot(html`<button class="btn btn-ghost" data-cancel>Cancel</button><button class="btn btn-primary" data-create>${ico('check')} Create sessions</button>`);
    d.el.addEventListener('input', (e) => {
      if (e.target.dataset.t != null) st2.times[Number(e.target.dataset.t)][e.target.dataset.tk] = e.target.value;
      count();
    });
    d.el.addEventListener('click', async (e) => {
      const wd = e.target.closest('[data-wd]');
      if (wd) { st2.weekdays.has(wd.dataset.wd) ? st2.weekdays.delete(wd.dataset.wd) : st2.weekdays.add(wd.dataset.wd); wd.classList.toggle('on'); count(); }
      if (e.target.closest('[data-at]')) { const keep = values($('form', d.body)); st2.times.push({ start: '14:00', end: '16:00' }); draw(); restore(keep); count(); }
      const rt = e.target.closest('[data-rt]');
      if (rt) { const keep = values($('form', d.body)); st2.times.splice(Number(rt.dataset.rt), 1); draw(); restore(keep); count(); }
      if (e.target.closest('[data-cancel]')) d.close();
      const create = e.target.closest('[data-create]');
      if (create) {
        const v = values($('form', d.body));
        await busy(create, async () => {
          try {
            const r = await api('/slots', { method: 'POST', body: { offeringId: Number(v.offeringId), startDate: v.startDate, endDate: v.endDate, weekdays: [...st2.weekdays].map(Number), times: st2.times, capacity: v.capacity, note: v.note } });
            toast(`${r.created} session${r.created === 1 ? '' : 's'} added`);
            d.close();
            st.week = mondayOf(v.startDate);
            load();
          } catch (err) { showErrors(d.body, err); }
        });
      }
    });
    function restore(v) { const f = $('form', d.body); for (const [k, val] of Object.entries(v)) if (f.elements[k]) f.elements[k].value = val; }
  }

  await load();
  const slotParam = ctx.query.get('slot');
  if (slotParam) {
    try { const { slot } = await api(`/slots/${slotParam}`); st.week = mondayOf(dubaiParts(slot.starts_at).date); await load(); openSlot(Number(slotParam)); } catch (err) { errorToast(err); }
  }
  if (ctx.query.get('new')) openGenerator();
}
