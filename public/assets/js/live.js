/* =============================================================
   Treasure Island live layer
   Loaded on every page by the server, with the admin's settings in
   #ti-config. With online booking switched off it only shows an
   announcement (if one is live), keeps the open/closed badge in line
   with the real hours, and copies enquiry forms to the admin inbox.
   Everything else (book online, cart, checkout) appears only once the
   admin switches online booking on.
   ============================================================= */
(function () {
  'use strict';
  var node = document.getElementById('ti-config');
  if (!node) return;
  var CFG;
  try { CFG = JSON.parse(node.textContent); } catch (e) { return; }

  var TZ = 'Asia/Dubai';
  var BOOKING = !!(CFG.booking && CFG.booking.enabled);
  var ONLINE = !!(CFG.payments && CFG.payments.online);
  var WA = (CFG.business && CFG.business.whatsapp) || '971504738452';
  var PAGE = location.pathname.replace(/\.html$/, '').replace(/\/+$/, '') || '/';

  /* ---------- helpers ---------- */
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  var ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return ESC[c]; }); }
  function aed(fils) {
    if (fils == null) return 'Ask for price';
    var v = fils / 100;
    return (v % 1 ? v.toFixed(2) : String(v)) + ' AED';
  }
  function safeHref(u) { return /^(https?:\/\/|\/(?!\/))/.test(u || '') ? u : '#'; }
  // Fixed names: Intl gives "Sept" in en-GB.
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var F = {
    day: { format: function (dt) { var d = dubai(dt).date; return F.wk.format(dt) + ' ' + Number(d.slice(8)) + ' ' + MONTHS[Number(d.slice(5, 7)) - 1]; } },
    dayNum: new Intl.DateTimeFormat('en-GB', { timeZone: TZ, day: 'numeric' }),
    wk: new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday: 'short' }),
    time: new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }),
    date: new Intl.DateTimeFormat('en-GB', { timeZone: TZ, day: 'numeric', month: 'long', year: 'numeric' }),
    parts: new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }),
  };
  function dubai(date) {
    var p = {};
    F.parts.formatToParts(date || new Date()).forEach(function (x) { p[x.type] = x.value; });
    var hour = p.hour === '24' ? 0 : Number(p.hour);
    var ymd = p.year + '-' + p.month + '-' + p.day;
    return { date: ymd, minutes: hour * 60 + Number(p.minute), weekday: new Date(ymd + 'T00:00:00Z').getUTCDay() };
  }
  var ICON = {
    x: '<path d="M18 6L6 18M6 6l12 12"/>',
    cart: '<path d="M6 6h15l-1.5 9h-12z"/><path d="M6 6L5 3H2"/><circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/>',
    check: '<path d="M20 6L9 17l-5-5"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="3"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M5 12v9h14v-9"/><path d="M12 8S10.5 3 8 3.5 7 8 12 8zm0 0s1.5-5 4-4.5S17 8 12 8z"/>',
    ticket: '<path d="M3 8a2 2 0 0 0 0 4v4a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4a2 2 0 0 0 0-4V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2z"/>',
    bag: '<path d="M5 8h14l-1 13H6z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    alert: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
  };
  function icon(n) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICON[n] || '') + '</svg>'; }
  var WA_ICON = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.9-4.45 9.9-9.91A9.9 9.9 0 0 0 12.04 2zm5.8 14.1c-.24.68-1.42 1.3-1.95 1.38-.5.07-1.13.1-1.82-.12-.42-.13-.96-.31-1.65-.61-2.9-1.25-4.8-4.17-4.94-4.36-.14-.2-1.18-1.57-1.18-3s.75-2.13 1.02-2.42c.27-.29.58-.36.78-.36h.56c.18 0 .42-.07.66.5.24.58.83 2.01.9 2.16.07.14.12.31.02.5-.1.2-.14.31-.29.48-.14.17-.3.38-.43.51-.14.14-.29.3-.13.59.17.29.74 1.21 1.58 1.96 1.09.97 2 1.27 2.29 1.41.29.14.46.12.63-.07.17-.2.72-.84.92-1.13.19-.29.39-.24.66-.14.27.1 1.7.8 1.99.95.29.14.48.22.55.34.07.12.07.7-.17 1.38z"/></svg>';

  var toastTimer;
  function toast(msg) {
    var t = $('.ti-toast');
    if (!t) { t = document.createElement('div'); t.className = 'ti-toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.innerHTML = icon('check') + '<span>' + esc(msg) + '</span>';
    requestAnimationFrame(function () { t.classList.add('show'); });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2600);
  }
  function post(url, body) {
    return fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(body) })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          if (!res.ok) { var e = new Error(data.error || 'Something went wrong. Please try again.'); e.status = res.status; e.field = data.field; throw e; }
          return data;
        });
      }, function () { throw new Error('No connection. Please check your internet and try again.'); });
  }
  function getJson(url) {
    return fetch(url, { credentials: 'same-origin' }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) { var e = new Error(data.error || 'Could not load.'); e.status = res.status; throw e; }
        return data;
      });
    });
  }
  var catalogPromise;
  function catalog() { return catalogPromise || (catalogPromise = getJson('/api/catalog')); }
  function imageOf(row, size) {
    if (row.image_id) return '/media/' + row.image_id;
    if (row.image_url) return '/' + String(row.image_url).replace(/^\/+/, '') + '@' + (size || 600) + '.webp';
    return null;
  }

  /* ---------- 1. announcement banner ---------- */
  function announcement() {
    var a = CFG.announcement;
    if (!a) return;
    var key = 'ti-bar-' + a.id;
    try { if (sessionStorage.getItem(key)) return; } catch (e) { /* storage blocked */ }
    var bar = document.createElement('div');
    bar.className = 'ti-bar ti-bar--' + (['gold', 'navy', 'coral'].indexOf(a.tone) > -1 ? a.tone : 'gold');
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', 'Announcement');
    bar.innerHTML = '<span>' + esc(a.message) + (a.link_url ? ' <a href="' + esc(safeHref(a.link_url)) + '">' + esc(a.link_label || 'Find out more') + ' →</a>' : '') +
      '</span><button type="button" class="ti-bar-x" aria-label="Dismiss announcement">' + icon('x') + '</button>';
    document.body.insertBefore(bar, document.body.firstChild);
    var nav = $('.nav');
    var ticking = false;
    function sync() {
      ticking = false;
      var h = bar.offsetHeight;
      document.documentElement.style.setProperty('--ti-bar', h + 'px');
      document.body.classList.add('ti-has-bar');
      if (nav) nav.style.top = Math.max(0, h - window.scrollY) + 'px';
    }
    function onScroll() { if (!ticking) { ticking = true; requestAnimationFrame(sync); } }
    sync();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', sync);
    bar.querySelector('.ti-bar-x').addEventListener('click', function () {
      try { sessionStorage.setItem(key, '1'); } catch (e) { /* storage blocked */ }
      // Stand everything down so nothing keeps writing to the nav afterwards.
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', sync);
      bar.remove();
      document.body.classList.remove('ti-has-bar');
      document.documentElement.style.removeProperty('--ti-bar');
      if (nav) nav.style.top = '';
    });
  }

  /* ---------- 2. open / closed badge ---------- */
  function openingHours() {
    var old = $('[data-open-now]');
    if (!old || !CFG.hours || CFG.hours.length !== 7) return;
    // app.js keeps a reference to the original badge and rewrites it every
    // minute with fixed 10 AM - 10 PM hours; swapping in a clone detaches it.
    var el = old.cloneNode(true);
    old.parentNode.replaceChild(el, old);
    var label = el.parentNode.querySelector('b');
    var toMin = function (t) { return Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)); };
    var nice = function (t) { var h = Number(t.slice(0, 2)); var m = t.slice(3, 5); return (h % 12 || 12) + (m === '00' ? '' : ':' + m) + ' ' + (h >= 12 ? 'PM' : 'AM'); };
    function dayHours(date, weekday) {
      var special = (CFG.closures || []).filter(function (c) { return c.date === date; })[0];
      return special || CFG.hours[weekday] || { open: '10:00', close: '22:00' };
    }
    function addDays(ymd, n) { var d = new Date(ymd + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
    function refresh() {
      var now = dubai();
      var today = dayHours(now.date, now.weekday);
      var set = function (b, s, open) { if (label) label.textContent = b; el.textContent = s; el.classList.toggle('is-open', open); };
      if (!today.closed && now.minutes >= toMin(today.open) && now.minutes < toMin(today.close)) return set('Now open', 'until ' + nice(today.close), true);
      if (!today.closed && now.minutes < toMin(today.open)) return set('Opening today', 'at ' + nice(today.open), false);
      for (var i = 1; i <= 14; i++) {
        var d = addDays(now.date, i);
        var h = dayHours(d, (now.weekday + i) % 7);
        if (!h.closed) {
          var when = i === 1 ? 'tomorrow' : new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone: 'UTC' }).format(new Date(d + 'T12:00:00Z'));
          return set(today.closed && today.label ? 'Closed today' : 'Closed now', 'opens ' + when + ' at ' + nice(h.open), false);
        }
      }
      set('Closed', 'see announcements', false);
    }
    refresh();
    setInterval(refresh, 60000);
  }

  /* ---------- 3. enquiry forms → admin inbox (WhatsApp still opens) ---------- */
  function enquiries() {
    $$('form[data-wa]').forEach(function (form) {
      form.addEventListener('submit', function () {
        try {
          var title = (form.getAttribute('data-wa-title') || '').toLowerCase();
          var body = { kind: title.indexOf('birthday') > -1 ? 'birthday' : title.indexOf('event') > -1 ? 'event' : 'contact', fields: {}, page: location.pathname };
          $$('input, select, textarea', form).forEach(function (f) {
            if (!f.name || !f.value || f.type === 'submit' || f.type === 'hidden' || (f.type === 'checkbox' && !f.checked)) return;
            var lbl = form.querySelector('label[for="' + f.id + '"]');
            var key = (lbl ? lbl.textContent : f.name).replace(/\*/g, '').trim();
            if (!body.phone && (f.type === 'tel' || /phone|mobile|whatsapp/i.test(f.name))) body.phone = f.value;
            else if (!body.email && (f.type === 'email' || /email/i.test(f.name))) body.email = f.value;
            else if (!body.name && /name/i.test(f.name) && !/child|kid/i.test(f.name)) body.name = f.value;
            else if (!body.message && f.tagName === 'TEXTAREA') body.message = f.value;
            else body.fields[key] = f.value;
          });
          fetch('/api/enquiries', { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'same-origin', keepalive: true, body: JSON.stringify(body) }).catch(function () {});
        } catch (e) { /* never block the WhatsApp hand-off */ }
      }, true);
    });
  }

  /* ---------- 4. drawer ---------- */
  function drawer(title) {
    var scrim = document.createElement('div');
    scrim.className = 'ti-scrim';
    var el = document.createElement('aside');
    el.className = 'ti-drawer';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', title);
    el.innerHTML = '<div class="ti-drawer-head"><h2>' + esc(title) + '</h2><button type="button" class="ti-icon-btn" data-close aria-label="Close">' + icon('x') + '</button></div><div class="ti-drawer-body"></div><div class="ti-drawer-foot" hidden></div>';
    document.body.appendChild(scrim);
    document.body.appendChild(el);
    var prevOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    requestAnimationFrame(function () { scrim.classList.add('show'); el.classList.add('show'); });
    function close() {
      scrim.classList.remove('show'); el.classList.remove('show');
      document.documentElement.style.overflow = prevOverflow;
      document.removeEventListener('keydown', onKey);
      setTimeout(function () { scrim.remove(); el.remove(); }, 450);
    }
    function onKey(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', onKey);
    scrim.addEventListener('click', close);
    el.querySelector('[data-close]').addEventListener('click', close);
    setTimeout(function () { el.querySelector('[data-close]').focus(); }, 80);
    return { el: el, body: el.querySelector('.ti-drawer-body'), foot: el.querySelector('.ti-drawer-foot'), close: close };
  }

  /* ---------- 5. cart ---------- */
  var CART_KEY = 'ti-cart-v1';
  function loadCart() { try { var c = JSON.parse(localStorage.getItem(CART_KEY) || '[]'); return Array.isArray(c) ? c : []; } catch (e) { return []; } }
  var cart = loadCart();
  function saveCart() { try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch (e) { /* private mode */ } renderFab(); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function lineQty(it) { return it.type === 'product' ? it.qty : it.type === 'offering' && it.unit === 'child' ? Math.max(1, (it.children || []).length) : 1; }
  function linePrice(it) { if (it.type === 'voucher') return Math.round(Number(it.amount) * 100); return it.price_fils == null ? null : it.price_fils * lineQty(it); }
  function cartCount() { return cart.reduce(function (n, it) { return n + (it.type === 'product' ? it.qty : 1); }, 0); }

  function renderFab() {
    if (!BOOKING) return;
    var host = $('.floaties');
    if (!host) return;
    var fab = $('.fab--cart', host);
    if (!fab) {
      fab = document.createElement('button');
      fab.type = 'button';
      fab.className = 'fab fab--cart';
      fab.setAttribute('aria-label', 'Open cart');
      fab.innerHTML = icon('cart') + '<span class="fab-count"></span>';
      fab.addEventListener('click', openCart);
      host.insertBefore(fab, host.firstChild);
    }
    var n = cartCount();
    fab.hidden = n === 0;
    fab.querySelector('.fab-count').textContent = n > 9 ? '9+' : String(n);
  }
  function addToCart(item) {
    if (item.type === 'product') {
      var same = cart.filter(function (c) { return c.type === 'product' && c.productId === item.productId; })[0];
      if (same) { same.qty = Math.min(20, same.qty + (item.qty || 1)); saveCart(); bump(); toast('Added to your cart'); return; }
    }
    item.key = uid();
    cart.push(item);
    saveCart();
    bump();
    toast('Added to your cart');
  }
  function bump() { var f = $('.fab--cart'); if (f) { f.classList.remove('bump'); void f.offsetWidth; f.classList.add('bump'); } }

  function openCart() {
    var d = drawer('Your cart');
    var voucher = null;
    var saved = {};
    try { saved = JSON.parse(localStorage.getItem('ti-customer') || '{}'); } catch (e) { saved = {}; }

    function draw(error) {
      if (!cart.length) {
        d.body.innerHTML = '<div class="ti-empty">' + icon('cart') + '<b>Your cart is empty</b><span>Book a session, a party, a pass or a gift voucher.</span><a class="btn btn--gold" href="/book">Browse and book</a></div>';
        d.foot.hidden = true;
        return;
      }
      var unpriced = cart.some(function (it) { return linePrice(it) == null; });
      var total = cart.reduce(function (s, it) { return s + (linePrice(it) || 0); }, 0);
      var discount = voucher && !unpriced ? Math.min(voucher.balance_fils, total) : 0;
      d.body.innerHTML =
        cart.map(function (it) {
          var img = it.image ? '<img src="' + esc(it.image) + '" alt="" loading="lazy">' : icon(it.type === 'voucher' ? 'gift' : it.type === 'product' ? 'bag' : it.kind === 'pass' ? 'ticket' : 'calendar');
          var sub = it.sub ? esc(it.sub) : '';
          if (it.children && it.children.length) sub += (sub ? ' · ' : '') + esc(it.children.map(function (c) { return c.name; }).join(', '));
          if (it.type === 'voucher' && it.recipient) sub += (sub ? ' · ' : '') + 'For ' + esc(it.recipient);
          var price = linePrice(it);
          return '<div class="ti-line"><div class="ti-line-img">' + img + '</div><div><b>' + esc(it.label) + '</b>' + (sub ? '<small>' + sub + '</small>' : '') + '</div>' +
            '<div class="ti-line-side"><span class="ti-line-price">' + (price == null ? 'Ask' : aed(price)) + '</span>' +
            (it.type === 'product' ? '<span class="ti-stepper"><button type="button" data-dec="' + it.key + '" aria-label="One less">−</button><span>' + it.qty + '</span><button type="button" data-inc="' + it.key + '" aria-label="One more">+</button></span>' : '') +
            '<button type="button" class="ti-link" data-remove="' + it.key + '">Remove</button></div></div>';
        }).join('') +
        '<a class="ti-link" href="/book">+ Add more</a>' +
        '<form class="form" data-checkout novalidate>' +
          '<div class="ti-row"><div class="field"><label for="ti-vc">Gift voucher code</label><input id="ti-vc" name="voucher" autocomplete="off" placeholder="GIFT-XXXX-XXXX" value="' + esc(voucher ? voucher.code : '') + '"></div>' +
          '<button type="button" class="btn btn--ghost btn--sm" data-apply>' + (voucher ? 'Applied' : 'Apply') + '</button></div>' +
          (voucher ? '<div class="ti-ok">' + aed(voucher.balance_fils) + ' available on this voucher.</div>' : '') +
          '<div class="field"><label for="ti-name">Parent name *</label><input id="ti-name" name="name" autocomplete="name" value="' + esc(saved.name || '') + '"></div>' +
          '<div class="field-2"><div class="field"><label for="ti-phone">Mobile *</label><input id="ti-phone" name="phone" type="tel" autocomplete="tel" placeholder="050 123 4567" value="' + esc(saved.phone || '') + '"></div>' +
          '<div class="field"><label for="ti-email">Email</label><input id="ti-email" name="email" type="email" autocomplete="email" value="' + esc(saved.email || '') + '"></div></div>' +
          '<div class="field"><label for="ti-notes">Anything we should know?</label><textarea id="ti-notes" name="notes" rows="2" placeholder="Allergies, a birthday theme…">' + esc(saved.notes || '') + '</textarea></div>' +
        '</form>' + (error ? '<div class="ti-err" role="alert">' + esc(error) + '</div>' : '');
      d.foot.hidden = false;
      d.foot.innerHTML =
        (discount ? '<div class="ti-total"><span>Gift voucher</span><span>− ' + aed(discount) + '</span></div>' : '') +
        '<div class="ti-total"><span>' + (unpriced ? 'Total (some prices confirmed by us)' : 'Total') + '</span><b>' + aed(total - discount) + '</b></div>' +
        '<button type="button" class="btn btn--gold btn--lg" data-submit>' + (ONLINE && !unpriced ? 'Pay securely' : 'Reserve and confirm on WhatsApp') + '</button>' +
        '<p class="ti-note">' + (ONLINE && !unpriced ? 'Card, Apple Pay or Google Pay through Stripe. Your spots are held while you pay.' : 'We hold your spots for ' + 48 + ' hours and confirm with you on WhatsApp. You pay at Treasure Island.') + '</p>';
    }

    function readForm() {
      var f = $('[data-checkout]', d.body);
      var v = { name: f.name.value.trim(), phone: f.phone.value.trim(), email: f.email.value.trim(), notes: f.notes.value.trim() };
      try { localStorage.setItem('ti-customer', JSON.stringify(v)); } catch (e) { /* private */ }
      saved = v;
      return v;
    }
    d.el.addEventListener('click', function (e) {
      var t = e.target.closest('button, a');
      if (!t) return;
      var key;
      if ((key = t.getAttribute('data-remove'))) { if ($('[data-checkout]', d.body)) readForm(); cart = cart.filter(function (c) { return c.key !== key; }); saveCart(); draw(); }
      if ((key = t.getAttribute('data-inc')) || (key = t.getAttribute('data-dec'))) {
        if ($('[data-checkout]', d.body)) readForm();
        var it = cart.filter(function (c) { return c.key === key; })[0];
        if (it) { it.qty = Math.max(1, Math.min(20, it.qty + (t.hasAttribute('data-inc') ? 1 : -1))); saveCart(); draw(); }
      }
      if (t.hasAttribute('data-apply')) {
        readForm();
        var code = $('#ti-vc', d.body).value.trim();
        if (!code) return;
        t.classList.add('is-busy');
        post('/api/vouchers/check', { code: code }).then(function (r) {
          if (!r.valid) { voucher = null; draw('That gift voucher code is not valid.'); return; }
          voucher = { code: code.toUpperCase(), balance_fils: r.balance_fils };
          draw();
        }, function (err) { draw(err.message); });
      }
      if (t.hasAttribute('data-submit')) {
        var c = readForm();
        t.classList.add('is-busy');
        t.textContent = 'One moment…';
        var items = cart.map(function (it) {
          if (it.type === 'product') return { type: 'product', productId: it.productId, qty: it.qty };
          if (it.type === 'voucher') return { type: 'voucher', amount: it.amount, recipient: it.recipient, message: it.message, from: c.name };
          return { type: 'offering', offeringId: it.offeringId, slotId: it.slotId || undefined, children: it.children || [] };
        });
        post('/api/checkout', { customer: c, items: items, voucherCode: voucher ? voucher.code : undefined }).then(function (r) {
          try { sessionStorage.setItem('ti-last-order', JSON.stringify({ ref: r.ref, whatsapp: r.whatsapp || null })); } catch (e) { /* private */ }
          cart = [];
          saveCart();
          if (r.redirect) { location.href = r.redirect; return; }
          location.href = '/order?ref=' + encodeURIComponent(r.ref) + '&t=' + encodeURIComponent(r.token) + '&new=1';
        }, function (err) { draw(err.message); if (err.status === 409) catalogPromise = null; });
      }
    });
    draw();
  }

  /* ---------- 6. "Book online" on the homepage service blocks ---------- */
  var BLOCKS = {
    'treasure-island-adventure': 'adventure', 'royal-birthday': 'royal', playgroup: 'playgroup', 'talent-centre': 'talent',
    'weekend-activities': 'weekend', 'holiday-camps': 'camps', 'school-nursery-visit': 'schoolvisit',
  };
  function bookButtons() {
    if (!BOOKING || !$('.svc-cta')) return;
    catalog().then(function (cat) {
      cat.offerings.forEach(function (o) {
        var id = BLOCKS[o.slug];
        var section = id && document.getElementById(id);
        var cta = section && $('.svc-cta', section);
        if (!cta || $('.ti-book-online', cta)) return;
        var bookable = o.kind === 'pass' || cat.slots.some(function (s) { return s.offering_id === o.id && s.remaining > 0; });
        if (!bookable) return;
        var a = document.createElement('a');
        a.className = 'btn ' + (section.classList.contains('svc-block--dark') ? 'btn--light' : 'btn--navy') + ' ti-book-online';
        a.href = '/book?o=' + encodeURIComponent(o.slug);
        a.innerHTML = icon('calendar') + ' Book online';
        cta.appendChild(a);
      });
    }, function () { /* the WhatsApp buttons still work */ });
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-add-product]');
    if (!b || !BOOKING) return;
    e.preventDefault();
    var card = b.closest('.shop-card');
    var img = card && $('img', card);
    addToCart({ type: 'product', productId: Number(b.getAttribute('data-add-product')), qty: 1, label: b.getAttribute('data-name'),
      price_fils: Number(b.getAttribute('data-price')), image: img ? (img.currentSrc || img.src) : null });
  });

  /* ---------- 7. booking page ---------- */
  var KIND = { program: 'Programme', camp: 'Holiday camp', party: 'Birthday party', workshop: 'Workshop', event: 'Event', pass: 'Multi-visit pass' };
  function bookPage(root) {
    if (!BOOKING) {
      root.innerHTML = '<div class="ti-status wait"><div class="ti-status-ico">' + icon('calendar') + '</div><h1>Online booking opens soon</h1>' +
        '<p class="lead">For now our team books everything on WhatsApp, usually within the hour.</p>' +
        '<a class="btn btn--gold btn--lg" href="https://wa.me/' + esc(WA) + '?text=' + encodeURIComponent('Hello Treasure Island,\n\nI would like to make a booking.') + '" target="_blank" rel="noopener">' + WA_ICON + ' Book on WhatsApp</a></div>';
      return;
    }
    root.innerHTML = '<div class="ti-empty"><b>Loading what is on…</b></div>';
    catalog().then(function (cat) {
      var slotsOf = function (o) { return cat.slots.filter(function (s) { return s.offering_id === o.id; }); };
      var sessions = cat.offerings.filter(function (o) { return o.kind !== 'pass' && slotsOf(o).length; });
      var passes = cat.offerings.filter(function (o) { return o.kind === 'pass'; });
      var card = function (o) {
        var img = imageOf(o, 600);
        var unit = o.price_fils == null ? '' : o.price_unit === 'child' ? ' <small>per child</small>' : o.kind === 'pass' ? ' <small>per pass</small>' : ' <small>per booking</small>';
        var left = slotsOf(o).filter(function (s) { return s.remaining > 0; }).length;
        return '<article class="ti-offer" id="o-' + esc(o.slug) + '" data-offer="' + o.id + '">' +
          '<div class="ti-offer-img">' + (img ? '<img src="' + esc(img) + '" alt="" loading="lazy">' : icon(o.kind === 'pass' ? 'ticket' : 'calendar')) + '</div>' +
          '<div class="ti-offer-body"><span class="ti-offer-kind">' + esc(KIND[o.kind] || o.kind) + (o.min_age != null || o.max_age != null ? ' · ages ' + esc(o.min_age != null ? o.min_age : 1) + '–' + esc(o.max_age != null ? o.max_age : 10) : '') + '</span>' +
          '<h3>' + esc(o.name) + '</h3>' + (o.summary ? '<p>' + esc(o.summary) + '</p>' : '') +
          '<div class="ti-offer-foot"><span class="ti-price">' + aed(o.price_fils) + unit + (o.deposit_fils != null ? '<br><small>' + aed(o.deposit_fils) + ' deposit to book</small>' : '') + '</span>' +
          (o.kind !== 'pass' && !left ? '<span class="ti-note">Fully booked</span>' : '<button type="button" class="btn btn--navy btn--sm" data-open="' + o.id + '">' + (o.kind === 'pass' ? 'Get this pass' : 'Choose a date') + '</button>') +
          '</div></div></article>';
      };
      root.innerHTML =
        (sessions.length ? '<div class="ti-offers">' + sessions.map(card).join('') + '</div>' : '<div class="ti-empty">' + icon('calendar') + '<b>No dates open right now</b><span>Message us and we will find a time that works.</span></div>') +
        (passes.length ? '<div class="ti-section-title"><h2>Passes</h2><span class="ti-note">Save on regular visits</span></div><div class="ti-offers">' + passes.map(card).join('') + '</div>' : '') +
        '<div class="ti-section-title"><h2>Gift vouchers</h2><span class="ti-note">Delivered as a code, valid for a year</span></div>' +
        '<div class="ti-offers"><article class="ti-offer" data-voucher><div class="ti-offer-img">' + icon('gift') + '</div><div class="ti-offer-body"><span class="ti-offer-kind">Gift</span><h3>Treasure Island gift voucher</h3>' +
        '<p>Spend it on play, parties, programmes or the boutique.</p><div class="ti-offer-foot"><span class="ti-price">50 – 2,000 AED</span><button type="button" class="btn btn--navy btn--sm" data-open-voucher>Choose amount</button></div></div></article></div>';

      function openPicker(article) {
        $$('.ti-offer.open', root).forEach(function (a) { if (a !== article) { a.classList.remove('open'); var p = $('.ti-picker', a); if (p) p.remove(); } });
        if ($('.ti-picker', article)) { article.classList.remove('open'); $('.ti-picker', article).remove(); return; }
        article.classList.add('open');
        var picker = document.createElement('div');
        picker.className = 'ti-picker';
        article.appendChild(picker);

        if (article.hasAttribute('data-voucher')) {
          var st = { amount: 200 };
          var drawV = function (err) {
            picker.innerHTML = '<div><div class="ti-label">Amount</div><div class="ti-amounts">' + [100, 200, 300, 500].map(function (a) {
              return '<button type="button" class="ti-time' + (st.amount === a ? ' on' : '') + '" data-amt="' + a + '">' + a + ' AED</button>'; }).join('') + '</div></div>' +
              '<div class="field"><label for="ti-va">Or another amount (50–2,000)</label><input id="ti-va" type="number" min="50" max="2000" value="' + esc(st.amount) + '"></div>' +
              '<div class="field-2"><div class="field"><label for="ti-vr">For</label><input id="ti-vr" placeholder="Their name" value="' + esc(st.recipient || '') + '"></div>' +
              '<div class="field"><label for="ti-vm">Message</label><input id="ti-vm" maxlength="300" placeholder="Happy birthday!" value="' + esc(st.message || '') + '"></div></div>' +
              (err ? '<div class="ti-err">' + esc(err) + '</div>' : '') +
              '<button type="button" class="btn btn--gold" data-add>' + icon('plus') + ' Add ' + esc(st.amount) + ' AED voucher to cart</button>';
          };
          drawV();
          picker.addEventListener('input', function (e) {
            if (e.target.id === 'ti-va') st.amount = Number(e.target.value) || 0;
            if (e.target.id === 'ti-vr') st.recipient = e.target.value;
            if (e.target.id === 'ti-vm') st.message = e.target.value;
            var btn = $('[data-add]', picker); if (btn) btn.innerHTML = icon('plus') + ' Add ' + esc(st.amount) + ' AED voucher to cart';
          });
          picker.addEventListener('click', function (e) {
            var a = e.target.closest('[data-amt]');
            if (a) { st.amount = Number(a.getAttribute('data-amt')); drawV(); }
            if (e.target.closest('[data-add]')) {
              if (!(st.amount >= 50 && st.amount <= 2000)) { drawV('Choose an amount between 50 and 2,000 AED.'); return; }
              addToCart({ type: 'voucher', amount: st.amount, recipient: st.recipient || '', message: st.message || '', label: 'Gift voucher · ' + st.amount + ' AED' });
              article.classList.remove('open'); picker.remove();
            }
          });
          return;
        }

        var o = cat.offerings.filter(function (x) { return x.id === Number(article.getAttribute('data-offer')); })[0];
        var slots = slotsOf(o);
        var days = [];
        slots.forEach(function (s) { var d = dubai(new Date(s.starts_at)).date; if (days.indexOf(d) < 0) days.push(d); });
        var state = { day: days[0], slot: null, kids: [{ name: '', age: '' }] };
        var kidLabel = o.kind === 'party' ? 'Birthday child' : 'Children';
        function addLabel(qty) { return icon('plus') + ' Add to cart' + (o.price_fils != null ? ' · ' + aed(o.price_fils * qty) : ''); }
        function drawP(err) {
          var daySlots = slots.filter(function (s) { return dubai(new Date(s.starts_at)).date === state.day; });
          var sel = slots.filter(function (s) { return s.id === state.slot; })[0];
          var named = state.kids.filter(function (k) { return k.name.trim(); }).length;
          var qty = o.price_unit === 'child' ? Math.max(1, named) : 1;
          picker.innerHTML =
            (o.description ? '<p>' + esc(o.description) + '</p>' : '') +
            (o.kind !== 'pass' ? '<div><div class="ti-label">Choose a day</div><div class="ti-days">' + days.map(function (d) {
              var dt = new Date(d + 'T08:00:00Z');
              return '<button type="button" class="ti-day' + (state.day === d ? ' on' : '') + '" data-day="' + d + '"><span>' + esc(F.wk.format(dt)) + '</span><b>' + esc(F.dayNum.format(dt)) + '</b><span>' + MONTHS[Number(d.slice(5, 7)) - 1] + '</span></button>';
            }).join('') + '</div></div>' +
            '<div><div class="ti-label">Choose a time</div><div class="ti-times">' + daySlots.map(function (s) {
              return '<button type="button" class="ti-time' + (state.slot === s.id ? ' on' : '') + '" data-slot="' + s.id + '"' + (s.remaining <= 0 ? ' disabled' : '') + '>' +
                esc(F.time.format(new Date(s.starts_at))) + '–' + esc(F.time.format(new Date(s.ends_at))) + '<small>' + (s.remaining <= 0 ? 'full' : s.remaining + ' left') + '</small></button>';
            }).join('') + '</div></div>' : '') +
            '<div><div class="ti-label">' + kidLabel + '</div><div class="form">' + state.kids.map(function (k, i) {
              return '<div class="ti-kid"><input placeholder="Name" value="' + esc(k.name) + '" data-kid="' + i + '" data-k="name" aria-label="Child name">' +
                '<input type="number" min="0" max="17" placeholder="Age" value="' + esc(k.age) + '" data-kid="' + i + '" data-k="age" aria-label="Age">' +
                (state.kids.length > 1 ? '<button type="button" class="ti-icon-btn" data-rmkid="' + i + '" aria-label="Remove">' + icon('x') + '</button>' : '<span></span>') + '</div>';
            }).join('') + (state.kids.length < (o.max_children || 6) ? '<button type="button" class="ti-link" data-addkid>+ Add another child</button>' : '') + '</div></div>' +
            (err ? '<div class="ti-err">' + esc(err) + '</div>' : '') +
            '<button type="button" class="btn btn--gold" data-add>' + addLabel(qty) + '</button>';
          if (sel && sel.remaining < qty) picker.querySelector('[data-add]').insertAdjacentHTML('beforebegin', '<div class="ti-err">Only ' + sel.remaining + ' place' + (sel.remaining === 1 ? '' : 's') + ' left in this session.</div>');
        }
        drawP();
        // Typing only updates the price on the button. The picker is never
        // redrawn while someone is filling it in: a redraw on blur would swap
        // out the button they are about to click, swallowing that click.
        picker.addEventListener('input', function (e) {
          var i = e.target.getAttribute('data-kid');
          if (i == null) return;
          state.kids[Number(i)][e.target.getAttribute('data-k')] = e.target.value;
          var named = state.kids.filter(function (k) { return k.name.trim(); }).length;
          var btn = $('[data-add]', picker);
          if (btn) btn.innerHTML = addLabel(o.price_unit === 'child' ? Math.max(1, named) : 1);
        });
        picker.addEventListener('click', function (e) {
          var t = e.target.closest('button');
          if (!t) return;
          if (t.hasAttribute('data-day')) { state.day = t.getAttribute('data-day'); state.slot = null; drawP(); }
          if (t.hasAttribute('data-slot')) { state.slot = Number(t.getAttribute('data-slot')); drawP(); }
          if (t.hasAttribute('data-addkid')) { state.kids.push({ name: '', age: '' }); drawP(); }
          if (t.hasAttribute('data-rmkid')) { state.kids.splice(Number(t.getAttribute('data-rmkid')), 1); drawP(); }
          if (t.hasAttribute('data-add')) {
            var kids = state.kids.filter(function (k) { return k.name.trim(); }).map(function (k) { return { name: k.name.trim(), age: k.age === '' ? null : Number(k.age) }; });
            if (o.kind !== 'pass' && !state.slot) { drawP('Choose a date and time first.'); return; }
            if (o.price_unit === 'child' && !kids.length) { drawP('Add the name of at least one child.'); return; }
            var s = slots.filter(function (x) { return x.id === state.slot; })[0];
            addToCart({ type: 'offering', kind: o.kind, offeringId: o.id, slotId: state.slot, unit: o.price_unit, price_fils: o.price_fils, children: kids,
              label: o.name, sub: s ? F.day.format(new Date(s.starts_at)) + ', ' + F.time.format(new Date(s.starts_at)) : (o.visits ? o.visits + ' visits' : ''), image: imageOf(o, 400) });
            article.classList.remove('open');
            picker.remove();
          }
        });
        article.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }

      root.addEventListener('click', function (e) {
        var b = e.target.closest('[data-open], [data-open-voucher]');
        if (b) openPicker(b.closest('.ti-offer'));
      });
      var want = new URLSearchParams(location.search).get('o');
      var target = want && document.getElementById('o-' + want);
      if (target && $('[data-open]', target)) openPicker(target);
    }, function (err) {
      root.innerHTML = '<div class="ti-err">' + esc(err.message) + '</div>';
    });
  }

  /* ---------- 8. order page ---------- */
  function orderPage(root) {
    var q = new URLSearchParams(location.search);
    var ref = q.get('ref');
    var token = q.get('t');
    if (!ref || !token) {
      root.innerHTML = '<div class="ti-status bad"><div class="ti-status-ico">' + icon('alert') + '</div><h1>Order not found</h1><p class="lead">Open the link from your confirmation message.</p></div>';
      return;
    }
    var last = {};
    try { last = JSON.parse(sessionStorage.getItem('ti-last-order') || '{}'); } catch (e) { last = {}; }
    var polls = 0;
    function load() {
      getJson('/api/orders/' + encodeURIComponent(ref) + '?t=' + encodeURIComponent(token)).then(render, function (err) {
        root.innerHTML = '<div class="ti-status bad"><div class="ti-status-ico">' + icon('alert') + '</div><h1>' + (err.status === 404 ? 'Order not found' : 'Could not load your order') + '</h1><p class="lead">' + esc(err.message) + '</p></div>';
      });
    }
    function render(o) {
      var live = ['paid', 'confirmed', 'completed'].indexOf(o.status) > -1;
      var waiting = o.status === 'awaiting_payment' && q.get('paid') && polls < 20;
      var head;
      if (live) head = ['ok', 'check', o.status === 'paid' ? 'You’re booked and paid!' : 'You’re booked!', 'See you on the island. Show this page at the desk.'];
      else if (waiting) head = ['wait', 'clock', 'Confirming your payment…', 'This usually takes a few seconds.'];
      else if (o.status === 'pending') head = ['wait', 'clock', 'Reservation received', 'Your spots are held' + (o.hold_expires_at ? ' until ' + F.day.format(new Date(o.hold_expires_at)) + ', ' + F.time.format(new Date(o.hold_expires_at)) : '') + '. Confirm with us on WhatsApp to lock them in.'];
      else if (o.status === 'awaiting_payment') head = ['wait', 'clock', 'Payment not finished', q.get('cancelled') ? 'The payment was cancelled. Your cart is empty, but nothing was charged.' : 'Your spots are held for a short time while you pay.'];
      else head = ['bad', 'alert', 'This order is ' + o.status.replace('_', ' '), 'Message us if you think this is a mistake.'];
      var wa = last.ref === o.ref && last.whatsapp ? last.whatsapp :
        'https://wa.me/' + WA + '?text=' + encodeURIComponent('Hello Treasure Island,\n\nThis is about my booking ' + o.ref + '.');
      root.innerHTML =
        '<div class="ti-status ' + head[0] + '"><div class="ti-status-ico">' + icon(head[1]) + '</div><span class="ti-ref">' + esc(o.ref) + '</span><h1>' + esc(head[2]) + '</h1><p class="lead">' + esc(head[3]) + '</p>' +
        (o.status === 'pending' ? '<a class="btn btn--gold btn--lg" href="' + esc(wa) + '" target="_blank" rel="noopener">' + WA_ICON + ' Confirm on WhatsApp</a>' : '') + '</div>' +
        '<div class="ti-order-grid"><div class="ti-card"><h2>Your booking</h2>' +
        o.items.map(function (i) {
          return '<div class="ti-line"><div class="ti-line-img">' + icon(i.kind === 'voucher' ? 'gift' : i.kind === 'product' ? 'bag' : 'calendar') + '</div><div><b>' + esc(i.name) + '</b>' +
            (i.children.length ? '<small>' + esc(i.children.map(function (c) { return c.name; }).join(', ')) + '</small>' : '') + '</div><div class="ti-line-side"><span class="ti-line-price">' + (i.qty > 1 ? '× ' + i.qty : '') + '</span></div></div>';
        }).join('') +
        '<dl class="ti-kv">' + (o.discount_fils ? '<dt>Gift voucher</dt><dd>− ' + aed(o.discount_fils) + '</dd>' : '') +
        '<dt>Total</dt><dd>' + (o.total_fils ? aed(o.total_fils) : 'Confirmed by our team') + '</dd>' +
        (o.paid_fils ? '<dt>Paid</dt><dd>' + aed(o.paid_fils) + '</dd>' : '') +
        (o.total_fils && o.paid_fils < o.total_fils && live ? '<dt>To pay at the venue</dt><dd>' + aed(o.total_fils - o.paid_fils) + '</dd>' : '') + '</dl></div>' +
        '<div class="ti-card" data-codes><h2>' + (o.passes.length || o.vouchers.length ? 'Your codes' : 'Where to find us') + '</h2>' +
        (o.passes.length || o.vouchers.length ? '<p class="ti-note">Show the QR code at the desk. Screenshot this page to keep it handy.</p>' +
          o.passes.map(function (p) { return '<div class="ti-code" data-qr="' + esc(p.code) + '"><span></span><div><small class="ti-offer-kind">' + esc(p.name) + '</small><br><b>' + esc(p.code) + '</b><br><small>' + (p.visits_total - p.visits_used) + ' of ' + p.visits_total + ' visits left' + (p.expires_at ? ' · until ' + esc(F.date.format(new Date(p.expires_at))) : '') + '</small></div></div>'; }).join('') +
          o.vouchers.map(function (v) { return '<div class="ti-code" data-qr="' + esc(v.code) + '"><span></span><div><small class="ti-offer-kind">Gift voucher' + (v.recipient_name ? ' for ' + esc(v.recipient_name) : '') + '</small><br><b>' + esc(v.code) + '</b><br><small>' + aed(v.balance_fils) + (v.expires_at ? ' · until ' + esc(F.date.format(new Date(v.expires_at))) : '') + '</small></div></div>'; }).join('')
          : '<p>Level 2, Galeries Lafayette, The Dubai Mall. Open daily 10 AM – 10 PM.</p><a class="btn btn--ghost" href="/contact">Directions</a>') +
        '</div></div>';
      if ($('[data-qr]', root)) {
        import('/assets/js/qr.js').then(function (qr) {
          $$('[data-qr]', root).forEach(function (el) { el.querySelector('span').innerHTML = qr.svg(el.getAttribute('data-qr')); });
        }).catch(function () { /* codes are still shown as text */ });
      }
      if (waiting) { polls++; setTimeout(load, 3000); }
    }
    load();
  }

  /* ---------- boot ---------- */
  function boot() {
    announcement();
    openingHours();
    enquiries();
    renderFab();
    bookButtons();
    var book = $('[data-live-page="book"]');
    if (book) bookPage(book);
    var order = $('[data-live-page="order"]');
    if (order) orderPage(order);
    window.addEventListener('storage', function (e) { if (e.key === CART_KEY) { cart = loadCart(); renderFab(); } });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
