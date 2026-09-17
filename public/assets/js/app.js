/* ============================================================
   TREASURE ISLAND DUBAI — interaction engine
   Zero dependencies. Respects prefers-reduced-motion.
   ============================================================ */
(function () {
  'use strict';

  var REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var IS_TOUCH = window.matchMedia('(hover: none)').matches;
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };
  var lerp = function (a, b, t) { return a + (b - a) * t; };

  /* ---- central rAF ticker so we only ever run one loop ---- */
  var tasks = [];
  function addTask(fn) { tasks.push(fn); }
  function tick() {
    for (var i = 0; i < tasks.length; i++) tasks[i]();
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  /* =========================================================
     1. PRELOADER
     ========================================================= */
  function preloader() {
    var pl = $('#preloader');
    if (!pl) return;
    var finish = function () {
      pl.classList.add('done');
      document.body.classList.remove('is-locked');
      setTimeout(function () { if (pl.parentNode) pl.parentNode.removeChild(pl); }, 700);
      document.documentElement.classList.add('loaded');
      // kick the hero in
      $$('[data-reveal-hero]').forEach(function (el, i) {
        setTimeout(function () { el.classList.add('is-in'); }, i * 90);
      });
    };
    document.body.classList.add('is-locked');
    var min = REDUCED ? 200 : 1450;
    var start = Date.now();
    var done = function () {
      setTimeout(finish, Math.max(0, min - (Date.now() - start)));
    };
    if (document.readyState === 'complete') done();
    else window.addEventListener('load', done);
    // hard safety net — never trap the user behind the loader
    setTimeout(finish, 5000);
  }

  /* =========================================================
     2. SCROLL REVEALS  (IntersectionObserver)
     ========================================================= */
  function reveals() {
    var els = $$('[data-reveal], .split, .swash');
    if (!els.length) return;
    if (REDUCED || !('IntersectionObserver' in window)) {
      els.forEach(function (e) { e.classList.add('is-in'); });
      return;
    }
    // stagger groups
    $$('[data-stagger]').forEach(function (group) {
      var step = parseInt(group.getAttribute('data-stagger'), 10) || 90;
      $$('[data-reveal]', group).forEach(function (child, i) {
        child.style.setProperty('--d', (i * step) + 'ms');
      });
    });
    // split text into words — walks TEXT NODES ONLY so nested
    // markup (<em>, <br>, .swash + its inline <svg>) survives untouched.
    $$('.split').forEach(function (el) {
      if (el.dataset.split === 'done') return;
      var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
        acceptNode: function (node) {
          if (!node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
          // never touch anything inside an <svg>
          var p = node.parentNode;
          while (p && p !== el) {
            if (p.nodeName.toLowerCase() === 'svg') return NodeFilter.FILTER_REJECT;
            p = p.parentNode;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
      });
      var nodes = [], n;
      while ((n = walker.nextNode())) nodes.push(n);

      var i = 0;
      nodes.forEach(function (node) {
        var frag = document.createDocumentFragment();
        node.nodeValue.split(/(\s+)/).forEach(function (part) {
          if (!part) return;
          if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
          var outer = document.createElement('span');
          outer.className = 'w';
          var inner = document.createElement('span');
          inner.textContent = part;
          inner.style.setProperty('--wd', (i++ * 55) + 'ms');
          outer.appendChild(inner);
          frag.appendChild(outer);
        });
        node.parentNode.replaceChild(frag, node);
      });
      el.dataset.split = 'done';
    });

    // NOTE: threshold MUST stay 0. Elements whose resting state uses
    // clip-path (data-reveal="mask") report an intersectionRatio of 0 even
    // when fully on screen, so any non-zero threshold strands them forever.
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.classList.add('is-in');
          io.unobserve(en.target);
        }
      });
    }, { threshold: 0, rootMargin: '0px 0px -12% 0px' });
    els.forEach(function (e) { io.observe(e); });

    // Safety sweep: guarantees nothing is ever left hidden — covers fast
    // scrolling, restored scroll positions and any observer edge case.
    var pending = els.slice();
    function sweep() {
      if (!pending.length) return;
      var vh = window.innerHeight;
      pending = pending.filter(function (e) {
        if (e.classList.contains('is-in')) return false;
        if (e.getBoundingClientRect().top < vh * 0.92) {
          e.classList.add('is-in');
          io.unobserve(e);
          return false;
        }
        return true;
      });
    }
    window.addEventListener('scroll', sweep, { passive: true });
    window.addEventListener('resize', sweep, { passive: true });
    window.addEventListener('load', sweep);
    setTimeout(sweep, 400);
  }

  /* =========================================================
     3. NAV  (scrolled state + hide on scroll down + progress)
     ========================================================= */
  function nav() {
    var bar = $('.nav');
    var prog = $('.progress');
    var last = 0;
    // pages that open on a dark page header need light nav text
    if (bar && $('.phead')) bar.classList.add('nav--light');
    function onScroll() {
      var y = window.pageYOffset;
      if (bar) {
        bar.classList.toggle('scrolled', y > 24);
        if (y > 340 && y > last && !document.body.classList.contains('is-locked')) bar.classList.add('hidden');
        else bar.classList.remove('hidden');
      }
      if (prog) {
        var h = document.documentElement.scrollHeight - window.innerHeight;
        prog.style.transform = 'scaleX(' + (h > 0 ? clamp(y / h, 0, 1) : 0) + ')';
      }
      var top = $('.fab--top');
      if (top) top.classList.toggle('show', y > 620);
      last = y;
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    // mobile drawer
    var burger = $('.burger'), drawer = $('.drawer');
    if (burger && drawer) {
      var links = $$('.drawer-links a', drawer);
      var setOpen = function (open) {
        burger.classList.toggle('open', open);
        drawer.classList.toggle('open', open);
        if (bar) bar.classList.toggle('nav--drawer', open);
        burger.setAttribute('aria-expanded', open ? 'true' : 'false');
        document.body.classList.toggle('is-locked', open);
        links.forEach(function (a, i) {
          a.style.transitionDelay = open ? (120 + i * 65) + 'ms' : '0ms';
        });
      };
      burger.addEventListener('click', function () { setOpen(!drawer.classList.contains('open')); });
      links.forEach(function (a) { a.addEventListener('click', function () { setOpen(false); }); });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && drawer.classList.contains('open')) setOpen(false);
      });
    }

    // mark active nav item. A link carrying a hash (Boutique -> play.html#shop)
    // lights up only when that hash is the one we are on, otherwise Play Zones
    // and Boutique would both read as active on the same page.
    // Cloudflare serves /play while GitHub Pages serves /play.html, so compare
    // page names with the extension stripped: play.html, play and /play match.
    function page(p) {
      p = (p || '').split('#')[0].split('/').pop().replace(/\.html$/, '');
      return p === '' ? 'index' : p;
    }
    var path = page(location.pathname);
    var hash = location.hash;
    var links = $$('.nav-links a, .drawer-links a');
    var exact = links.filter(function (a) {
      var href = a.getAttribute('href') || '';
      var i = href.indexOf('#');
      return hash && i > -1 && page(href) === path && href.slice(i) === hash;
    });
    if (exact.length) {
      exact.forEach(function (a) { a.classList.add('active'); });
    } else {
      links.forEach(function (a) {
        var href = a.getAttribute('href') || '';
        if (href.indexOf('#') > -1) return;
        if (href && page(href) === path) a.classList.add('active');
      });
    }
  }


  /* =========================================================
     BOUTIQUE RAIL  (arrow buttons + disabled state at the ends)
     ========================================================= */
  function shopRail() {
    $$('[data-rail-track]').forEach(function (track) {
      var head = track.closest('section');
      if (!head) return;
      var prev = head.querySelector('[data-rail="prev"]');
      var next = head.querySelector('[data-rail="next"]');
      if (!prev || !next) return;

      function step() {
        var card = track.querySelector('.shop-card');
        if (!card) return track.clientWidth * 0.8;
        var gap = parseFloat(getComputedStyle(track).columnGap || '0') || 0;
        var per = Math.max(1, Math.floor(track.clientWidth / (card.offsetWidth + gap)) - 1);
        return (card.offsetWidth + gap) * per;
      }
      function sync() {
        var max = track.scrollWidth - track.clientWidth - 2;
        prev.disabled = track.scrollLeft <= 2;
        next.disabled = track.scrollLeft >= max;
      }
      prev.addEventListener('click', function () { track.scrollBy({ left: -step(), behavior: REDUCED ? 'auto' : 'smooth' }); });
      next.addEventListener('click', function () { track.scrollBy({ left:  step(), behavior: REDUCED ? 'auto' : 'smooth' }); });
      track.addEventListener('scroll', sync, { passive: true });
      window.addEventListener('resize', sync);
      sync();
    });
  }

  /* =========================================================
     4. PARALLAX  (data-px="speed")
     ========================================================= */
  function parallax() {
    if (REDUCED) return;
    var items = $$('[data-px]').map(function (el) {
      return { el: el, speed: parseFloat(el.getAttribute('data-px')) || 0.12, y: 0, target: 0 };
    });
    if (!items.length) return;
    var vh = window.innerHeight;
    window.addEventListener('resize', function () { vh = window.innerHeight; }, { passive: true });
    addTask(function () {
      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        var r = it.el.getBoundingClientRect();
        if (r.bottom < -200 || r.top > vh + 200) continue;
        var progress = (r.top + r.height / 2 - vh / 2) / vh;   // -1 .. 1
        it.target = -progress * it.speed * 100;
        it.y = lerp(it.y, it.target, 0.09);
        it.el.style.transform = 'translate3d(0,' + it.y.toFixed(2) + 'px,0)';
      }
    });
  }

  /* =========================================================
     5. 3D TILT
     ========================================================= */
  function tilt() {
    if (REDUCED || IS_TOUCH) return;
    $$('[data-tilt]').forEach(function (el) {
      var max = parseFloat(el.getAttribute('data-tilt')) || 8;
      var rx = 0, ry = 0, trx = 0, try_ = 0, sc = 1, tsc = 1, active = false;
      el.addEventListener('mousemove', function (e) {
        var r = el.getBoundingClientRect();
        var px = (e.clientX - r.left) / r.width - 0.5;
        var py = (e.clientY - r.top) / r.height - 0.5;
        try_ = px * max * 2;
        trx = -py * max * 2;
        tsc = 1.02;
        active = true;
      });
      el.addEventListener('mouseleave', function () { trx = 0; try_ = 0; tsc = 1; });
      addTask(function () {
        if (!active && Math.abs(rx) < 0.01 && Math.abs(ry) < 0.01 && Math.abs(sc - 1) < 0.001) return;
        rx = lerp(rx, trx, 0.11); ry = lerp(ry, try_, 0.11); sc = lerp(sc, tsc, 0.11);
        el.style.transform = 'perspective(1000px) rotateX(' + rx.toFixed(2) + 'deg) rotateY(' + ry.toFixed(2) + 'deg) scale(' + sc.toFixed(3) + ')';
        if (Math.abs(rx) < 0.01 && Math.abs(ry) < 0.01) active = false;
      });
    });
  }

  /* =========================================================
     6. MAGNETIC BUTTONS
     ========================================================= */
  function magnetic() {
    if (REDUCED || IS_TOUCH) return;
    $$('[data-magnet]').forEach(function (el) {
      var strength = parseFloat(el.getAttribute('data-magnet')) || 0.28;
      var x = 0, y = 0, tx = 0, ty = 0, live = false;
      el.addEventListener('mousemove', function (e) {
        var r = el.getBoundingClientRect();
        tx = (e.clientX - (r.left + r.width / 2)) * strength;
        ty = (e.clientY - (r.top + r.height / 2)) * strength;
        live = true;
      });
      el.addEventListener('mouseleave', function () { tx = 0; ty = 0; });
      addTask(function () {
        if (!live && Math.abs(x) < 0.05 && Math.abs(y) < 0.05) return;
        x = lerp(x, tx, 0.16); y = lerp(y, ty, 0.16);
        el.style.transform = 'translate3d(' + x.toFixed(2) + 'px,' + y.toFixed(2) + 'px,0)';
        if (Math.abs(x) < 0.05 && Math.abs(y) < 0.05) live = false;
      });
    });
  }

  /* =========================================================
     7. CUSTOM CURSOR
     ========================================================= */
  function cursor() {
    if (REDUCED || IS_TOUCH || window.innerWidth < 1025) return;
    var ring = document.createElement('div'); ring.className = 'cursor';
    var dot = document.createElement('div'); dot.className = 'cursor-dot';
    document.body.appendChild(ring); document.body.appendChild(dot);
    var mx = -100, my = -100, rxp = -100, ryp = -100;
    document.addEventListener('mousemove', function (e) { mx = e.clientX; my = e.clientY; });
    document.addEventListener('mouseleave', function () { ring.classList.add('hide'); dot.classList.add('hide'); });
    document.addEventListener('mouseenter', function () { ring.classList.remove('hide'); dot.classList.remove('hide'); });
    addTask(function () {
      rxp = lerp(rxp, mx, 0.16); ryp = lerp(ryp, my, 0.16);
      ring.style.transform = 'translate3d(' + (rxp - 19) + 'px,' + (ryp - 19) + 'px,0)';
      dot.style.transform = 'translate3d(' + (mx - 3) + 'px,' + (my - 3) + 'px,0)';
    });
    var grow = 'a,button,[data-tilt],.masonry figure,.quote,input,select,textarea,.acc-q';
    document.addEventListener('mouseover', function (e) {
      if (e.target.closest && e.target.closest(grow)) ring.classList.add('grow');
    });
    document.addEventListener('mouseout', function (e) {
      if (e.target.closest && e.target.closest(grow)) ring.classList.remove('grow');
    });
  }

  /* =========================================================
     8. COUNTERS
     ========================================================= */
  function counters() {
    var els = $$('[data-count]');
    if (!els.length) return;
    if (!('IntersectionObserver' in window) || REDUCED) {
      els.forEach(function (el) { el.textContent = el.getAttribute('data-count') + (el.getAttribute('data-suffix') || ''); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var el = en.target;
        io.unobserve(el);
        var end = parseFloat(el.getAttribute('data-count'));
        var suffix = el.getAttribute('data-suffix') || '';
        var dur = 1700, t0 = null;
        var dec = (end % 1 !== 0) ? 1 : 0;
        var fmt = function (v) {
          return v.toFixed(dec).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + suffix;
        };
        // The real figure goes in first. The count-up then plays over the top,
        // so a throttled or paused frame loop can never strand the number on 0.
        el.textContent = fmt(end);
        function step(now) {
          if (t0 === null) t0 = now;
          var p = clamp((now - t0) / dur, 0, 1);
          var e = 1 - Math.pow(1 - p, 3);
          el.textContent = fmt(end * e);
          if (p < 1) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
        setTimeout(function () { el.textContent = fmt(end); }, dur + 900);
      });
    }, { threshold: 0.45 });
    els.forEach(function (e) { io.observe(e); });
  }

  /* =========================================================
     9. PINNED HORIZONTAL TRACK
     ========================================================= */
  function pinned() {
    if (REDUCED) return;
    $$('.pin').forEach(function (pin) {
      var track = $('.pin-track', pin);
      if (!track) return;
      var distance = 0;
      function measure() {
        if (window.innerWidth <= 900) {
          pin.style.height = '';
          track.style.transform = '';
          distance = 0;
          return;
        }
        distance = Math.max(0, track.scrollWidth - window.innerWidth + 40);
        pin.style.height = (window.innerHeight + distance) + 'px';
      }
      measure();
      window.addEventListener('resize', measure, { passive: true });
      var cur = 0;
      addTask(function () {
        if (!distance) return;
        var r = pin.getBoundingClientRect();
        if (r.bottom < 0 || r.top > window.innerHeight) return;
        var p = clamp(-r.top / (pin.offsetHeight - window.innerHeight), 0, 1);
        cur = lerp(cur, p * distance, 0.12);
        track.style.transform = 'translate3d(' + (-cur).toFixed(2) + 'px,0,0)';
      });
    });
  }

  /* =========================================================
     10. LAZY IMAGES (blur-up)
     ========================================================= */
  function lazyImages() {
    var imgs = $$('img[loading="lazy"], img.lazy');
    imgs.forEach(function (img) {
      if (img.complete && img.naturalWidth) img.classList.add('loaded');
      else img.addEventListener('load', function () { img.classList.add('loaded'); }, { once: true });
      img.addEventListener('error', function () { img.classList.add('loaded'); }, { once: true });
    });

    /* Safety sweep. A `load` event can be missed on a slow connection, on a
       bfcache restore, or when an image finishes between the complete check
       and the listener being attached. This catches every one of those, then
       stops itself once nothing is outstanding. */
    var pending = imgs.slice();
    var sweep = setInterval(function () {
      pending = pending.filter(function (img) {
        if (img.classList.contains('loaded')) return false;
        if (img.naturalWidth) { img.classList.add('loaded'); return false; }
        return true;
      });
      if (!pending.length) clearInterval(sweep);
    }, 400);
    window.addEventListener('pageshow', function () {
      imgs.forEach(function (img) { if (img.naturalWidth) img.classList.add('loaded'); });
    });
  }

  /* =========================================================
     11. GALLERY FILTER + LIGHTBOX
     ========================================================= */
  function gallery() {
    var grid = $('.masonry');
    // filters
    $$('.gal-filter button').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var f = btn.getAttribute('data-filter');
        $$('.gal-filter button').forEach(function (b) { b.classList.toggle('active', b === btn); });
        $$('.masonry figure').forEach(function (fig) {
          var match = (f === 'all' || (fig.getAttribute('data-cat') || '').indexOf(f) > -1);
          fig.classList.toggle('hide', !match);
        });
      });
    });
    if (!grid) return;

    // lightbox
    var lb = document.createElement('div');
    lb.className = 'lb';
    lb.setAttribute('role', 'dialog');
    lb.setAttribute('aria-modal', 'true');
    lb.setAttribute('aria-label', 'Photo viewer');
    lb.innerHTML =
      '<button class="lb-btn lb-close" aria-label="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg></button>' +
      '<button class="lb-btn lb-prev" aria-label="Previous"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg></button>' +
      '<button class="lb-btn lb-next" aria-label="Next"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg></button>' +
      '<img alt=""><div class="lb-cap"></div>';
    document.body.appendChild(lb);
    var lbImg = $('img', lb), lbCap = $('.lb-cap', lb), idx = 0, opener = null;
    var figs = function () { return $$('.masonry figure').filter(function (f) { return !f.classList.contains('hide'); }); };

    function show(i) {
      var list = figs();
      if (!list.length) return;
      idx = (i + list.length) % list.length;
      var fig = list[idx], img = $('img', fig);
      lbImg.src = img.getAttribute('data-full') || img.currentSrc || img.src;
      lbImg.alt = img.alt || '';
      var cap = $('figcaption', fig);
      lbCap.textContent = (cap ? cap.textContent : '') + '  ·  ' + (idx + 1) + ' / ' + list.length;
    }
    function open(i, from) {
      opener = from || null;
      show(i);
      lb.classList.add('open');
      document.body.classList.add('is-locked');
      $('.lb-close', lb).focus();
    }
    function close() {
      lb.classList.remove('open');
      document.body.classList.remove('is-locked');
      if (opener) opener.focus();
    }
    grid.addEventListener('click', function (e) {
      var fig = e.target.closest('figure');
      if (!fig) return;
      open(figs().indexOf(fig), fig);
    });
    grid.addEventListener('keydown', function (e) {
      var fig = e.target.closest('figure');
      if (fig && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); open(figs().indexOf(fig), fig); }
    });
    $('.lb-close', lb).addEventListener('click', close);
    $('.lb-prev', lb).addEventListener('click', function () { show(idx - 1); });
    $('.lb-next', lb).addEventListener('click', function () { show(idx + 1); });
    lb.addEventListener('click', function (e) { if (e.target === lb) close(); });
    document.addEventListener('keydown', function (e) {
      if (!lb.classList.contains('open')) return;
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowLeft') show(idx - 1);
      if (e.key === 'ArrowRight') show(idx + 1);
    });
    // swipe
    var sx = 0;
    lb.addEventListener('touchstart', function (e) { sx = e.touches[0].clientX; }, { passive: true });
    lb.addEventListener('touchend', function (e) {
      var dx = e.changedTouches[0].clientX - sx;
      if (Math.abs(dx) > 55) show(idx + (dx < 0 ? 1 : -1));
    }, { passive: true });
  }

  /* =========================================================
     12. ACCORDION
     ========================================================= */
  function accordion() {
    $$('.acc').forEach(function (acc) {
      var single = acc.hasAttribute('data-single');
      $$('.acc-item', acc).forEach(function (item) {
        var q = $('.acc-q', item), a = $('.acc-a', item);
        if (!q || !a) return;
        q.setAttribute('aria-expanded', 'false');
        q.addEventListener('click', function () {
          var willOpen = !item.classList.contains('open');
          if (single) {
            $$('.acc-item.open', acc).forEach(function (o) {
              o.classList.remove('open');
              $('.acc-a', o).style.maxHeight = '';
              $('.acc-q', o).setAttribute('aria-expanded', 'false');
            });
          }
          item.classList.toggle('open', willOpen);
          q.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
          a.style.maxHeight = willOpen ? a.scrollHeight + 'px' : '';
        });
      });
    });
    window.addEventListener('resize', function () {
      $$('.acc-item.open .acc-a').forEach(function (a) { a.style.maxHeight = a.scrollHeight + 'px'; });
    }, { passive: true });
  }

  /* =========================================================
     13. DRAG-SCROLL CAROUSELS
     ========================================================= */
  function dragScroll() {
    $$('.quotes, .pin-track[data-drag]').forEach(function (el) {
      var down = false, startX = 0, startL = 0, moved = false;
      el.addEventListener('mousedown', function (e) {
        down = true; moved = false;
        startX = e.pageX; startL = el.scrollLeft;
        el.classList.add('dragging');
      });
      window.addEventListener('mouseup', function () {
        down = false; el.classList.remove('dragging');
      });
      el.addEventListener('mousemove', function (e) {
        if (!down) return;
        e.preventDefault();
        var d = e.pageX - startX;
        if (Math.abs(d) > 4) moved = true;
        el.scrollLeft = startL - d;
      });
      el.addEventListener('click', function (e) { if (moved) { e.preventDefault(); e.stopPropagation(); } }, true);
    });
  }

  /* =========================================================
     14. HERO / SECTION IMAGE SCROLL-SCRUB ZOOM
     ========================================================= */
  function scrubZoom() {
    if (REDUCED) return;
    var els = $$('[data-zoom]');
    if (!els.length) return;
    addTask(function () {
      var vh = window.innerHeight;
      els.forEach(function (el) {
        var r = el.getBoundingClientRect();
        if (r.bottom < 0 || r.top > vh) return;
        var p = clamp(1 - (r.top + r.height) / (vh + r.height), 0, 1);
        var amt = parseFloat(el.getAttribute('data-zoom')) || 0.12;
        el.style.transform = 'scale(' + (1 + amt - amt * p).toFixed(4) + ')';
      });
    });
  }

  /* =========================================================
     15. WHATSAPP-POWERED FORMS
     ========================================================= */
  function forms() {
    $$('form[data-wa]').forEach(function (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var phone = form.getAttribute('data-wa').replace(/[^\d]/g, '');
        var lines = ['Hello Treasure Island! 👋'];
        var title = form.getAttribute('data-wa-title');
        if (title) lines.push(title);
        lines.push('');
        $$('input, select, textarea', form).forEach(function (f) {
          if (!f.name || !f.value || f.type === 'submit' || f.type === 'checkbox' && !f.checked) return;
          var lbl = form.querySelector('label[for="' + f.id + '"]');
          lines.push('*' + (lbl ? lbl.textContent.trim() : f.name) + ':* ' + f.value);
        });
        var url = 'https://wa.me/' + phone + '?text=' + encodeURIComponent(lines.join('\n'));
        confettiBurst();
        var msg = $('.form-sent', form.parentNode) || null;
        if (msg) msg.hidden = false;
        setTimeout(function () { window.open(url, '_blank', 'noopener'); }, 320);
      });
    });
  }

  /* =========================================================
     16. CONFETTI
     ========================================================= */
  var confettiBurst = function () {};
  function confettiSetup() {
    if (REDUCED) return;
    var canvas, ctx, parts = [], running = false;
    confettiBurst = function () {
      if (!canvas) {
        canvas = document.createElement('canvas');
        canvas.id = 'confetti';
        document.body.appendChild(canvas);
        ctx = canvas.getContext('2d');
      }
      canvas.width = window.innerWidth; canvas.height = window.innerHeight;
      var colors = ['#FFBA1A', '#004368', '#FF6B4A', '#12B5C9', '#46B87A', '#ffffff'];
      for (var i = 0; i < 130; i++) {
        parts.push({
          x: window.innerWidth / 2 + (Math.random() - 0.5) * 220,
          y: window.innerHeight / 2,
          vx: (Math.random() - 0.5) * 13,
          vy: Math.random() * -15 - 4,
          w: 6 + Math.random() * 7, h: 4 + Math.random() * 6,
          rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.34,
          c: colors[(Math.random() * colors.length) | 0],
          life: 1
        });
      }
      if (!running) { running = true; requestAnimationFrame(loop); }
    };
    function loop() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (var i = parts.length - 1; i >= 0; i--) {
        var p = parts[i];
        p.vy += 0.42; p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.vx *= 0.992;
        p.life -= 0.0072;
        if (p.life <= 0 || p.y > canvas.height + 60) { parts.splice(i, 1); continue; }
        ctx.save();
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillStyle = p.c;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      if (parts.length) requestAnimationFrame(loop);
      else { running = false; ctx.clearRect(0, 0, canvas.width, canvas.height); }
    }
  }

  /* =========================================================
     17. MARQUEE — duplicate content for seamless loop
     ========================================================= */
  function marquee() {
    $$('.mq-track').forEach(function (t) {
      if (t.dataset.cloned) return;
      t.innerHTML = t.innerHTML + t.innerHTML;
      t.dataset.cloned = '1';
    });
  }

  /* =========================================================
     18. ANCHOR SCROLL with nav offset
     ========================================================= */
  function anchors() {
    document.addEventListener('click', function (e) {
      var a = e.target.closest('a[href^="#"]');
      if (!a) return;
      var id = a.getAttribute('href');
      if (id === '#' || id.length < 2) return;
      var t = document.querySelector(id);
      if (!t) return;
      e.preventDefault();
      var offset = (document.querySelector('.nav') || {}).offsetHeight || 74;
      var y = t.getBoundingClientRect().top + window.pageYOffset - offset - 14;
      window.scrollTo({ top: y, behavior: REDUCED ? 'auto' : 'smooth' });
      history.replaceState(null, '', id);
    });
  }

  /* =========================================================
     19. YEAR STAMP
     ========================================================= */
  function year() {
    $$('[data-year]').forEach(function (e) { e.textContent = new Date().getFullYear(); });
  }

  /* =========================================================
     20. OPEN / CLOSED LIVE BADGE  (Dubai time, 10:00–22:00 daily)
     ========================================================= */
  function openNow() {
    var els = $$('[data-open-now]');
    if (!els.length) return;
    function refresh() {
      // Gulf Standard Time is UTC+4 year round
      var now = new Date();
      var dubai = new Date(now.getTime() + (now.getTimezoneOffset() * 60000) + 4 * 3600000);
      var h = dubai.getHours() + dubai.getMinutes() / 60;
      var open = h >= 10 && h < 22;
      els.forEach(function (el) {
        // the badge already says "Now open", so this half must not repeat it
        el.textContent = open ? 'until 10 PM' : 'opens at 10 AM';
        el.classList.toggle('is-open', open);
      });
    }
    refresh();
    setInterval(refresh, 60000);
  }


  /* =========================================================
     21. ROYAL FILM
     Nothing is fetched until the panel is actually on screen, and the
     full film (with sound) only downloads when someone asks for it.
     ========================================================= */
  function royalFilm() {
    $$('[data-film]').forEach(function (box) {
      var loop = $('.rfilm-loop', box);
      var full = $('.rfilm-full', box);
      var btn  = $('.rfilm-play', box);
      var started = false;

      function loadSources(v) {
        if (!v || v.dataset.loaded) return;
        $$('source', v).forEach(function (src) {
          if (src.dataset.src) src.src = src.dataset.src;
        });
        v.dataset.loaded = '1';
        v.load();
      }

      // ambient loop: skip it entirely on reduced motion, on a metered
      // connection, or when the visitor has asked to save data
      var conn = navigator.connection || {};
      var thrifty = conn.saveData === true ||
                    /2g/.test(conn.effectiveType || '') ||
                    REDUCED;

      if (loop && !thrifty && 'IntersectionObserver' in window) {
        var io = new IntersectionObserver(function (entries) {
          entries.forEach(function (en) {
            if (box.classList.contains('is-playing')) return;
            if (en.isIntersecting) {
              loadSources(loop);
              var pr = loop.play();
              if (pr && pr.catch) pr.catch(function () {});
              box.classList.add('loop-on');
            } else if (started) {
              loop.pause();
            }
          });
          started = true;
        }, { threshold: 0.25 });
        io.observe(box);
      }

      function openFilm() {
        loadSources(full);
        box.classList.add('is-playing');
        if (loop) { try { loop.pause(); } catch (e) {} }
        full.controls = true;
        var pr = full.play();
        if (pr && pr.catch) pr.catch(function () {});
      }

      if (btn) btn.addEventListener('click', openFilm);
      if (full) {
        full.addEventListener('ended', function () {
          box.classList.remove('is-playing');
          full.controls = false;
        });
      }
    });
  }


  /* =========================================================
     22. HERO SLIDESHOW  (one frame at a time)
     ========================================================= */
  function heroShow() {
    $$('[data-heroshow]').forEach(function (box) {
      var slides = $$('figure', box);
      if (slides.length < 2) return;
      var i = 0, timer = null, visible = true;

      function show(n) {
        slides[i].classList.remove('is-on');
        i = (n + slides.length) % slides.length;
        slides[i].classList.add('is-on');
        // load the next frame ahead of time so the change is never a blank
        var nxt = slides[(i + 1) % slides.length].querySelector('img');
        if (nxt && nxt.loading === 'lazy') { nxt.loading = 'eager'; }
      }
      function start() {
        if (timer || REDUCED) return;
        timer = setInterval(function () { if (visible) show(i + 1); }, 3600);
      }
      function stop() { clearInterval(timer); timer = null; }

      if ('IntersectionObserver' in window) {
        new IntersectionObserver(function (es) {
          es.forEach(function (e) { visible = e.isIntersecting; visible ? start() : stop(); });
        }, { threshold: 0.2 }).observe(box);
      } else { start(); }

      document.addEventListener('visibilitychange', function () {
        document.hidden ? stop() : start();
      });

      // a swipe moves it along on touch
      var x0 = null;
      box.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, { passive: true });
      box.addEventListener('touchend', function (e) {
        if (x0 === null) return;
        var dx = e.changedTouches[0].clientX - x0;
        if (Math.abs(dx) > 40) show(i + (dx < 0 ? 1 : -1));
        x0 = null;
      });
    });
  }

  /* =========================================================
     BOOT
     ========================================================= */
  function boot() {
    preloader(); marquee(); reveals(); nav(); parallax(); tilt(); magnetic();
    cursor(); counters(); pinned(); lazyImages(); gallery(); accordion();
    dragScroll(); scrubZoom(); confettiSetup(); forms(); anchors(); year(); openNow(); royalFilm(); heroShow(); shopRail();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
