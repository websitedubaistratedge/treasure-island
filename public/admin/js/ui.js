import { icon } from './icons.js';

/* ---------- safe templating ------------------------------------------------
   html`` escapes every interpolation unless it is wrapped in raw(). Views
   build markup only through this, so customer-entered text can never become
   markup in the admin panel. */
class Raw { constructor(v) { this.v = v; } }
export const raw = (v) => new Raw(v);
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
function render(v) {
  if (v == null || v === false || v === true) return '';
  if (v instanceof Raw) return v.v;
  if (Array.isArray(v)) return v.map(render).join('');
  return esc(v);
}
export function html(strings, ...vals) {
  let out = strings[0];
  for (let i = 0; i < vals.length; i++) out += render(vals[i]) + strings[i + 1];
  return new Raw(out);
}
export const ico = (name, cls) => raw(icon(name, cls));
// The CSP forbids inline style attributes, so widths are declared as data-w
// and applied through the CSSOM, which the policy allows.
export function paint(root) {
  root.querySelectorAll('[data-w]').forEach((el) => { el.style.width = `${Math.max(0, Math.min(100, Number(el.dataset.w) || 0))}%`; });
}
export function mount(el, tpl) { el.innerHTML = render(tpl); paint(el); return el; }
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export function on(root, type, selector, fn) {
  root.addEventListener(type, (e) => {
    const t = e.target.closest(selector);
    if (t && root.contains(t)) fn(e, t);
  });
}

/* ---------- Dubai time and money ------------------------------------------ */
const TZ = 'Asia/Dubai';
const dtf = (o) => new Intl.DateTimeFormat('en-GB', { timeZone: TZ, ...o });
const F = {
  date: dtf({ day: 'numeric', month: 'short', year: 'numeric' }),
  dt: dtf({ day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }),
  time: dtf({ hour: '2-digit', minute: '2-digit', hour12: false }),
  day: dtf({ weekday: 'short', day: 'numeric', month: 'short' }),
  parts: new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }),
};
export const fmtDate = (iso) => (iso ? F.date.format(new Date(iso)) : '—');
export const fmtDateTime = (iso) => (iso ? F.dt.format(new Date(iso)) : '—');
export const fmtTime = (iso) => F.time.format(new Date(iso));
export const fmtDay = (iso) => F.day.format(new Date(iso));
export function dubaiParts(iso) {
  const p = Object.fromEntries(F.parts.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  const hour = p.hour === '24' ? '00' : p.hour;
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${hour}:${p.minute}` };
}
export const dubaiToIso = (date, time) => new Date(`${date}T${time}:00+04:00`).toISOString();
export const todayDubai = () => dubaiParts(new Date().toISOString()).date;
export function addDays(day, n) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function ago(iso) {
  if (!iso) return '—';
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  if (s < 7 * 86400) return `${Math.round(s / 86400)} d ago`;
  return fmtDate(iso);
}
export function aed(fils, { ask = true, short = false } = {}) {
  if (fils == null) return ask ? 'Ask for price' : '—';
  const v = fils / 100;
  if (short && Math.abs(v) >= 10000) return `${(v / 1000).toFixed(v >= 100000 ? 0 : 1)}k AED`;
  return `${v.toLocaleString('en-US', { minimumFractionDigits: fils % 100 ? 2 : 0, maximumFractionDigits: 2 })} AED`;
}
export const toAed = (fils) => (fils == null ? '' : String(fils / 100));
export const initials = (name) => String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
export const waLink = (phone, text = '') => `https://wa.me/${String(phone || '').replace(/\D/g, '')}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
export const debounce = (fn, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

/* ---------- status badges -------------------------------------------------- */
const STATUS = {
  pending: ['b-warn', 'Pending'], awaiting_payment: ['b-info', 'Awaiting payment'], paid: ['b-ok', 'Paid'],
  confirmed: ['b-ok', 'Confirmed'], completed: ['b-neutral', 'Completed'], cancelled: ['b-bad', 'Cancelled'],
  refunded: ['b-violet', 'Refunded'], expired: ['b-neutral', 'Expired'], active: ['b-ok', 'Active'],
  redeemed: ['b-neutral', 'Redeemed'], void: ['b-bad', 'Void'], used_up: ['b-neutral', 'Used up'],
  new: ['b-warn', 'New'], in_progress: ['b-info', 'In progress'], closed: ['b-neutral', 'Closed'], spam: ['b-bad', 'Spam'],
  open: ['b-ok', 'Open'], owner: ['b-violet', 'Owner'], manager: ['b-info', 'Manager'], staff: ['b-neutral', 'Staff'],
  live: ['b-ok', 'Live'], scheduled: ['b-info', 'Scheduled'], ended: ['b-neutral', 'Ended'], off: ['b-neutral', 'Off'],
};
export function badge(status, label) {
  const [cls, text] = STATUS[status] || ['b-neutral', String(status || '').replace(/_/g, ' ')];
  return html`<span class="badge ${cls}">${label || text}</span>`;
}
export const KIND_LABEL = { program: 'Programme', camp: 'Camp', party: 'Party', workshop: 'Workshop', event: 'Event', pass: 'Pass' };

/* ---------- toasts ---------------------------------------------------------- */
export function toast(message, type = 'ok') {
  const host = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  mount(el, html`${ico(type === 'bad' ? 'alert' : type === 'info' ? 'info' : 'check')}<div>${message}</div>`);
  host.appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 320); }, type === 'bad' ? 6000 : 3400);
}
export function errorToast(err) { toast(err && err.message ? err.message : 'Something went wrong.', 'bad'); }

/* ---------- overlays --------------------------------------------------------- */
const layers = [];
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && layers.length) { e.preventDefault(); layers[layers.length - 1].close(); }
});

function makeLayer(panel, { overDrawer = false } = {}) {
  const overlay = document.createElement('div');
  overlay.className = `overlay${overDrawer ? ' over-drawer' : ''}`;
  const previous = document.activeElement;
  document.body.append(overlay, panel);
  requestAnimationFrame(() => { overlay.classList.add('show'); panel.classList.add('show'); });
  let closed = false;
  const layer = {
    close() {
      if (closed) return;
      closed = true;
      layers.splice(layers.indexOf(layer), 1);
      overlay.classList.remove('show');
      panel.classList.remove('show');
      setTimeout(() => { overlay.remove(); panel.remove(); }, 380);
      if (previous && previous.focus) previous.focus();
      if (layer.onClose) layer.onClose();
    },
  };
  overlay.addEventListener('click', () => layer.close());
  layers.push(layer);
  return layer;
}

export function drawer({ title, wide = false, onClose } = {}) {
  const el = document.createElement('aside');
  el.className = `drawer${wide ? ' wide' : ''}`;
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  mount(el, html`<div class="drawer-head"><h2>${title}</h2><button class="btn btn-quiet btn-icon" data-close aria-label="Close">${ico('x')}</button></div>
    <div class="drawer-body"></div><div class="drawer-foot" hidden></div>`);
  const layer = makeLayer(el);
  layer.onClose = onClose;
  el.querySelector('[data-close]').addEventListener('click', () => layer.close());
  const d = {
    el, body: el.querySelector('.drawer-body'), foot: el.querySelector('.drawer-foot'), close: () => layer.close(),
    setTitle(t) { el.querySelector('.drawer-head h2').textContent = t; },
    setFoot(tpl) { mount(d.foot, tpl); d.foot.hidden = false; },
  };
  setTimeout(() => { const f = el.querySelector('.drawer-body input, .drawer-body select, .drawer-body textarea'); if (f) f.focus(); }, 60);
  return d;
}

export function modal({ title, body, actions = [], overDrawer = true }) {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'modal';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    mount(el, html`<div class="modal-body"><h3>${title}</h3>${body}</div>
      <div class="modal-foot">${actions.map((a, i) => html`<button class="btn ${a.cls || 'btn-ghost'}" data-i="${i}">${a.label}</button>`)}</div>`);
    const layer = makeLayer(el, { overDrawer });
    let value;
    layer.onClose = () => resolve(value);
    el.querySelectorAll('[data-i]').forEach((b) => b.addEventListener('click', async () => {
      const a = actions[Number(b.dataset.i)];
      if (a.onClick) {
        b.classList.add('loading');
        try { value = await a.onClick(el); } catch (err) { b.classList.remove('loading'); errorToast(err); return; }
        if (value === false) { b.classList.remove('loading'); return; }
      } else value = a.value;
      layer.close();
    }));
    setTimeout(() => { const f = el.querySelector('input,select,textarea') || el.querySelector('.modal-foot .btn:last-child'); if (f) f.focus(); }, 60);
  });
}

export function confirmDialog({ title, message, confirm = 'Confirm', danger = false }) {
  return modal({
    title, body: html`<p class="muted">${message}</p>`,
    actions: [{ label: 'Cancel', value: false }, { label: confirm, value: true, cls: danger ? 'btn-danger' : 'btn-primary' }],
  }).then((v) => v === true);
}

export async function showSecret({ title, intro, label, secret }) {
  await modal({
    title,
    body: html`<p class="muted">${intro}</p>
      <div class="secret"><div class="eyebrow">${label}</div><div class="code-box"><span>${secret}</span>
      <button class="btn btn-ghost btn-sm" data-copy>${ico('copy')} Copy</button></div>
      <div class="help">This is shown only once. It is not stored anywhere readable.</div></div>`,
    actions: [{ label: 'I have saved it', cls: 'btn-primary', value: true }],
  });
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-copy]');
  if (!b) return;
  const text = b.dataset.copy || b.closest('.code-box').querySelector('span').textContent;
  copyText(text);
});

/* ---------- forms ------------------------------------------------------------- */
export function values(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name || el.disabled) continue;
    if (el.type === 'checkbox') out[el.name] = el.checked;
    else if (el.type === 'radio') { if (el.checked) out[el.name] = el.value; }
    else out[el.name] = el.value;
  }
  return out;
}
export function clearErrors(root) {
  root.querySelectorAll('.field.invalid').forEach((f) => f.classList.remove('invalid'));
  root.querySelectorAll('.err[data-auto]').forEach((e) => e.remove());
}
export function showErrors(root, err) {
  clearErrors(root);
  const field = err && err.field;
  const target = field && (root.querySelector(`[name="${CSS.escape(field)}"]`) || root.querySelector(`[data-field="${CSS.escape(field)}"]`));
  const wrap = target && target.closest('.field');
  if (wrap) {
    wrap.classList.add('invalid');
    const msg = document.createElement('div');
    msg.className = 'err';
    msg.dataset.auto = '1';
    msg.textContent = err.message;
    wrap.appendChild(msg);
    target.focus && target.focus();
  } else errorToast(err);
}
export async function busy(btn, fn) {
  if (btn) btn.classList.add('loading');
  try { return await fn(); } finally { if (btn) btn.classList.remove('loading'); }
}
export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast('Copied to clipboard'); } catch { toast('Copy failed. Select and copy manually.', 'bad'); }
}

/* ---------- building blocks ------------------------------------------------------ */
export const empty = ({ icon: i = 'inbox', title, text, action }) => html`
  <div class="empty"><div class="empty-ico">${ico(i)}</div><b>${title}</b>${text ? html`<div>${text}</div>` : ''}${action || ''}</div>`;
export const skeleton = (rows = 6) => html`<div class="card-body">${Array.from({ length: rows }, (_, i) => html`<div class="skel skel-line" data-w="${90 - (i % 3) * 18}"></div>`)}</div>`;
export const field = ({ label, name, value = '', type = 'text', help, required, placeholder, attrs = '', suffix }) => html`
  <div class="field"><label for="f-${name}">${label}${required ? ' *' : ''}</label>
  ${suffix ? html`<div class="input-group has-suffix"><input class="input" id="f-${name}" name="${name}" type="${type}" value="${value ?? ''}" placeholder="${placeholder || ''}" ${raw(attrs)}><span class="suffix">${suffix}</span></div>`
    : html`<input class="input" id="f-${name}" name="${name}" type="${type}" value="${value ?? ''}" placeholder="${placeholder || ''}" ${raw(attrs)}>`}
  ${help ? html`<div class="help">${help}</div>` : ''}</div>`;
export const textarea = ({ label, name, value = '', help, rows = 3, placeholder }) => html`
  <div class="field"><label for="f-${name}">${label}</label><textarea class="textarea" id="f-${name}" name="${name}" rows="${rows}" placeholder="${placeholder || ''}">${value ?? ''}</textarea>${help ? html`<div class="help">${help}</div>` : ''}</div>`;
export const select = ({ label, name, value, options, help }) => html`
  <div class="field"><label for="f-${name}">${label}</label><select class="select" id="f-${name}" name="${name}">
  ${options.map(([v, l]) => html`<option value="${v}" ${String(v) === String(value) ? raw('selected') : ''}>${l}</option>`)}</select>${help ? html`<div class="help">${help}</div>` : ''}</div>`;
export const toggle = ({ label, name, checked, help, disabled }) => html`
  <label class="switch"><input type="checkbox" name="${name}" ${checked ? raw('checked') : ''} ${disabled ? raw('disabled') : ''}><span class="track"></span><span><b>${label}</b>${help ? html`<div class="help">${help}</div>` : ''}</span></label>`;
