import { api } from './api.js';
import { html, raw, ico, mount, $, $$, toast, errorToast, values, showErrors, busy, debounce, initials, badge, aed, ago } from './ui.js';

const routes = [
  ['/dashboard', () => import('./views/dashboard.js')],
  ['/orders', () => import('./views/orders.js')],
  ['/orders/:id', () => import('./views/order.js')],
  ['/calendar', () => import('./views/calendar.js')],
  ['/checkin', () => import('./views/checkin.js')],
  ['/programs', () => import('./views/programs.js')],
  ['/boutique', () => import('./views/boutique.js')],
  ['/vouchers', () => import('./views/vouchers.js')],
  ['/passes', () => import('./views/passes.js')],
  ['/enquiries', () => import('./views/enquiries.js')],
  ['/announcements', () => import('./views/announcements.js')],
  ['/settings', () => import('./views/settings.js'), 'manager'],
  ['/team', () => import('./views/team.js'), 'manager'],
  ['/activity', () => import('./views/activity.js'), 'manager'],
  ['/account', () => import('./views/account.js')],
];

const NAV = [
  ['Overview', [['/dashboard', 'Dashboard', 'dashboard']]],
  ['Bookings', [['/orders', 'Orders', 'orders', 'openOrders'], ['/calendar', 'Calendar', 'calendar'], ['/checkin', 'Check-in', 'scan']]],
  ['Catalogue', [['/programs', 'Programmes', 'sparkles'], ['/boutique', 'Boutique', 'bag'], ['/vouchers', 'Gift vouchers', 'gift'], ['/passes', 'Passes', 'ticket']]],
  ['Customers', [['/enquiries', 'Enquiries', 'inbox', 'newEnquiries']]],
  ['Website', [['/announcements', 'Announcements', 'megaphone'], ['/settings', 'Settings', 'settings', null, 'manager']]],
  ['Admin', [['/team', 'Team', 'users', null, 'manager'], ['/activity', 'Activity log', 'activity', null, 'manager']]],
];

const RANK = { staff: 1, manager: 2, owner: 3 };
const state = { me: null, flags: {}, counts: {}, poll: null };
const can = (role) => state.me && RANK[state.me.role] >= RANK[role];

/* ---------- theme ---------- */
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem('ti-theme', t); } catch { /* private mode */ }
}
(() => {
  let t;
  try { t = localStorage.getItem('ti-theme'); } catch { t = null; }
  applyTheme(t || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
})();

/* ---------- login ---------- */
function renderLogin(message) {
  clearInterval(state.poll);
  const app = $('#app');
  app.className = '';
  mount(app, html`
  <div class="auth">
    <section class="auth-art">
      <div class="auth-brand"><img src="/assets/logo@180.webp" alt="" width="54" height="37"><div><b>Treasure Island</b><span>Dubai Mall</span></div></div>
      <div>
        <h1>Everything behind the island, in one place.</h1>
        <p>Bookings, sessions, the boutique, gift vouchers, passes and enquiries, updated live on the website.</p>
      </div>
      <div class="auth-feats">
        <div><i>${ico('calendar')}</i>Sessions that can never be overbooked</div>
        <div><i>${ico('shield')}</i>Encrypted sign-in with lockout protection</div>
        <div><i>${ico('bolt')}</i>Changes appear on the website instantly</div>
      </div>
    </section>
    <section class="auth-form">
      <form class="auth-card form" novalidate>
        <div><h2>Sign in</h2><p class="muted">Use the email and password you were given.</p></div>
        ${message ? html`<div class="callout warn">${ico('alert')}<div>${message}</div></div>` : ''}
        <div class="field"><label for="le">Email</label>
          <div class="input-group">${ico('mail')}<input class="input" id="le" name="email" type="email" autocomplete="username" required></div></div>
        <div class="field"><label for="lp">Password</label>
          <div class="input-group">${ico('lock')}<input class="input" id="lp" name="password" type="password" autocomplete="current-password" required>
          <button type="button" class="btn btn-quiet btn-icon btn-sm pw-toggle" aria-label="Show password">${ico('eye')}</button></div></div>
        <button class="btn btn-primary" type="submit">Sign in</button>
        <div class="auth-foot">${ico('lock')}<span>Forgot your password? The account owner can reset it from Team.</span></div>
      </form>
    </section>
  </div>`);
  const form = $('.auth-card');
  const pw = $('#lp');
  $('.pw-toggle').addEventListener('click', (e) => {
    const show = pw.type === 'password';
    pw.type = show ? 'text' : 'password';
    mount(e.currentTarget, html`${ico(show ? 'eyeOff' : 'eye')}`);
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type=submit]');
    await busy(btn, async () => {
      try {
        const v = values(form);
        await api('/login', { method: 'POST', body: { email: v.email, password: v.password } });
        await start();
      } catch (err) {
        showErrors(form, err.status === 401 || err.status === 429 ? { ...err, field: 'password', message: err.message } : err);
      }
    });
  });
  setTimeout(() => $('#le').focus(), 50);
}

/* ---------- layout ---------- */
function renderShell() {
  const app = $('#app');
  app.className = '';
  const me = state.me;
  mount(app, html`
  <div class="shell">
    <aside class="side">
      <a class="side-brand" href="#/dashboard"><img src="/assets/logo@180.webp" alt="" width="38" height="26"><div><b>Treasure Island</b><span>Admin</span></div></a>
      <nav class="side-nav" aria-label="Admin">
        ${NAV.map(([group, items]) => {
          const visible = items.filter((it) => !it[4] || can(it[4]));
          return visible.length ? html`<div class="side-group">${group}</div>
            ${visible.map(([path, label, icon, count]) => html`<a class="nav-a" href="#${path}" data-path="${path}">${ico(icon)}<span>${label}</span>${count ? html`<b class="nav-count" data-count="${count}" hidden></b>` : ''}</a>`)}` : '';
        })}
      </nav>
      <div class="side-foot">
        <a class="side-me" href="#/account"><span class="avatar">${initials(me.name)}</span><div class="grow"><div class="cell-main">${me.name}</div><small>${me.role}</small></div></a>
      </div>
    </aside>
    <div class="scrim"></div>
    <div class="main">
      <header class="top">
        <button class="btn btn-quiet btn-icon top-menu" aria-label="Menu">${ico('menu')}</button>
        <div class="crumbs"></div>
        <div class="top-spacer"></div>
        <button class="search-btn" data-palette>${ico('search')}<span>Search or jump to…</span><kbd>⌘K</kbd></button>
        <button class="btn btn-quiet btn-icon" data-theme-toggle aria-label="Toggle dark mode">${ico(document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon')}</button>
        <a class="btn btn-quiet btn-icon" href="/" target="_blank" rel="noopener" aria-label="Open the website">${ico('external')}</a>
        <button class="btn btn-quiet btn-icon" data-logout aria-label="Sign out">${ico('logout')}</button>
      </header>
      <main class="content" id="view" tabindex="-1"></main>
    </div>
  </div>`);
  const shell = $('.shell');
  $('.top-menu').addEventListener('click', () => shell.classList.toggle('nav-open'));
  $('.scrim').addEventListener('click', () => shell.classList.remove('nav-open'));
  $('[data-theme-toggle]').addEventListener('click', (e) => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    mount(e.currentTarget, html`${ico(next === 'dark' ? 'sun' : 'moon')}`);
    window.dispatchEvent(new CustomEvent('ti:theme'));
  });
  $('[data-logout]').addEventListener('click', async () => {
    try { await api('/logout', { method: 'POST' }); } catch { /* already signed out */ }
    renderLogin();
  });
  $('[data-palette]').addEventListener('click', openPalette);
}

function setCrumbs(parts) {
  const el = $('.crumbs');
  if (!el) return;
  mount(el, html`${parts.map((p, i) => html`${i ? html`<span class="sep">/</span>` : ''}${p.href ? html`<a href="${p.href}">${p.label}</a>` : html`<span>${p.label}</span>`}`)}`);
  document.title = `${parts[parts.length - 1].label} · Treasure Island Admin`;
}

async function refreshCounts() {
  try {
    state.counts = await api('/counts');
    $$('[data-count]').forEach((b) => {
      const n = state.counts[b.dataset.count] || 0;
      b.textContent = n > 99 ? '99+' : String(n);
      b.hidden = n === 0;
    });
  } catch { /* shown elsewhere */ }
}

/* ---------- router ---------- */
function match(path) {
  for (const [pattern, loader, role] of routes) {
    const keys = [];
    const re = new RegExp(`^${pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; })}$`);
    const m = path.match(re);
    if (m) return { loader, role, params: Object.fromEntries(keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])) };
  }
  return null;
}

let renderToken = 0;
async function route() {
  if (!state.me) return;
  const hash = location.hash.slice(1) || '/dashboard';
  const [path, qs] = hash.split('?');
  const hit = match(path);
  if (!hit) { location.hash = '#/dashboard'; return; }
  const view = $('#view');
  $('.shell').classList.remove('nav-open');
  $$('.nav-a').forEach((a) => a.classList.toggle('on', path === a.dataset.path || path.startsWith(`${a.dataset.path}/`)));
  if (hit.role && !can(hit.role)) {
    mount(view, html`<div class="card"><div class="empty"><div class="empty-ico">${ico('lock')}</div><b>Not available for your role</b><div>Ask an owner or manager if you need access.</div></div></div>`);
    return;
  }
  const token = ++renderToken;
  mount(view, html`<div class="card">${raw('<div class="card-body"><div class="skel skel-block"></div></div>')}</div>`);
  try {
    const mod = await hit.loader();
    if (token !== renderToken) return;
    view.scrollTop = 0;
    window.scrollTo(0, 0);
    await mod.default(view, {
      me: state.me, flags: state.flags, params: hit.params, query: new URLSearchParams(qs || ''),
      can, setCrumbs, refreshCounts, navigate: (to) => { location.hash = `#${to}`; },
      isCurrent: () => token === renderToken,
    });
  } catch (err) {
    if (token !== renderToken) return;
    if (err && err.status === 401) return;
    console.error(err);
    mount(view, html`<div class="card"><div class="empty"><div class="empty-ico">${ico('alert')}</div><b>This page could not load</b><div>${err && err.message}</div>
      <button class="btn btn-ghost" data-retry>${ico('refresh')} Try again</button></div></div>`);
    view.querySelector('[data-retry]').addEventListener('click', route);
  }
}

/* ---------- command palette ---------- */
function openPalette() {
  if ($('.cmdk')) return;
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  const box = document.createElement('div');
  box.className = 'cmdk';
  const actions = [
    ['New desk booking', 'plus', '/orders?new=1'], ['Add sessions', 'calendar', '/calendar?new=1'],
    ['Check in a pass', 'scan', '/checkin'], ['Redeem a gift voucher', 'gift', '/vouchers'],
    ['Add a product', 'bag', '/boutique?new=1'], ['New announcement', 'megaphone', '/announcements?new=1'],
  ];
  const nav = NAV.flatMap(([, items]) => items.filter((i) => !i[4] || can(i[4])).map(([p, l, i]) => [l, i, p]));
  mount(box, html`<div class="cmdk-in">${ico('search')}<input placeholder="Search orders, passes, vouchers… or jump to a page" aria-label="Search"><kbd>esc</kbd></div><div class="cmdk-list"></div>`);
  document.body.append(overlay, box);
  requestAnimationFrame(() => { overlay.classList.add('show'); box.classList.add('show'); });
  const input = box.querySelector('input');
  const list = box.querySelector('.cmdk-list');
  let items = [];
  let active = 0;
  const close = () => {
    overlay.classList.remove('show'); box.classList.remove('show');
    setTimeout(() => { overlay.remove(); box.remove(); }, 220);
    document.removeEventListener('keydown', keys, true);
  };
  const go = (to) => { close(); location.hash = `#${to}`; };
  const draw = (sections) => {
    items = sections.flatMap((s) => s.items);
    active = Math.min(active, Math.max(0, items.length - 1));
    let i = 0;
    mount(list, sections.length ? html`${sections.map((s) => html`<div class="cmdk-sec">${s.title}</div>${s.items.map((it) => html`<div class="cmdk-item ${i === active ? 'on' : ''}" data-i="${i++}">${ico(it.icon)}<span>${it.label}</span>${it.hint ? html`<small>${it.hint}</small>` : ''}</div>`)}`)}`
      : html`<div class="empty"><b>No matches</b></div>`);
  };
  const base = (q = '') => {
    const f = (arr) => arr.filter(([l]) => l.toLowerCase().includes(q.toLowerCase()));
    return [
      { title: 'Go to', items: f(nav).map(([label, icon, to]) => ({ label, icon, to })) },
      { title: 'Actions', items: f(actions).map(([label, icon, to]) => ({ label, icon, to })) },
    ].filter((s) => s.items.length);
  };
  const search = debounce(async (q) => {
    const sections = base(q);
    if (q.trim().length >= 2) {
      try {
        const up = q.trim().toUpperCase();
        if (up.startsWith('PASS-')) {
          const r = await api(`/passes?q=${encodeURIComponent(q.trim())}`);
          sections.unshift({ title: 'Passes', items: r.rows.slice(0, 6).map((p) => ({ label: `${p.code} · ${p.holder_name}`, icon: 'ticket', to: `/passes?open=${p.id}`, hint: `${p.visits_total - p.visits_used} left` })) });
        } else if (up.startsWith('GIFT-')) {
          const r = await api(`/vouchers?q=${encodeURIComponent(q.trim())}`);
          sections.unshift({ title: 'Vouchers', items: r.rows.slice(0, 6).map((v) => ({ label: `${v.code}`, icon: 'gift', to: `/vouchers?open=${v.id}`, hint: aed(v.balance_fils) })) });
        } else {
          const r = await api(`/orders?q=${encodeURIComponent(q.trim())}`);
          sections.unshift({ title: 'Orders', items: r.rows.slice(0, 7).map((o) => ({ label: `${o.ref} · ${o.customer_name}`, icon: 'orders', to: `/orders/${o.id}`, hint: ago(o.created_at) })) });
        }
      } catch { /* palette search is best-effort */ }
    }
    if (document.body.contains(box)) { active = 0; draw(sections.filter((s) => s.items.length)); }
  }, 180);
  function keys(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); active = (active + 1) % Math.max(1, items.length); $$('.cmdk-item', list).forEach((el) => el.classList.toggle('on', Number(el.dataset.i) === active)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); active = (active - 1 + items.length) % Math.max(1, items.length); $$('.cmdk-item', list).forEach((el) => el.classList.toggle('on', Number(el.dataset.i) === active)); }
    else if (e.key === 'Enter' && items[active]) { e.preventDefault(); go(items[active].to); }
  }
  document.addEventListener('keydown', keys, true);
  overlay.addEventListener('click', close);
  list.addEventListener('click', (e) => { const it = e.target.closest('.cmdk-item'); if (it) go(items[Number(it.dataset.i)].to); });
  input.addEventListener('input', () => search(input.value));
  draw(base());
  setTimeout(() => input.focus(), 30);
}
document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k' && state.me) { e.preventDefault(); openPalette(); }
});

/* ---------- boot ---------- */
async function start() {
  const me = await api('/me');
  state.me = me.admin;
  state.flags = me.flags;
  renderShell();
  await route();
  refreshCounts();
  clearInterval(state.poll);
  state.poll = setInterval(refreshCounts, 60000);
}

window.addEventListener('hashchange', route);
window.addEventListener('ti:unauthorized', () => {
  if (!state.me) return;
  state.me = null;
  renderLogin('Your session ended. Please sign in again.');
});
window.addEventListener('ti:counts', refreshCounts);

start().catch((err) => {
  if (err.status === 401) renderLogin();
  else {
    mount($('#app'), html`<div class="empty"><div class="empty-ico">${ico('alert')}</div><b>The admin panel could not start</b><div>${err.message}</div></div>`);
  }
});
