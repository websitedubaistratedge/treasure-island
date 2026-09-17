import { publicConfig } from '../src/lib/settings.js';
import { all } from '../src/lib/db.js';
import { scriptJson } from '../src/lib/html.js';
import { productCard } from '../src/lib/boutique.js';

// Runs only for the HTML pages listed in public/_routes.json. It adds the live
// layer (config, announcement banner, cart) and renders boutique products from
// the database. If the database is unreachable the page is served exactly as
// it was built, so the public site can never be taken down by the backend.
export async function onRequest(context) {
  const { request, env, next } = context;
  const path = new URL(request.url).pathname;
  if (path.startsWith('/api/') || path.startsWith('/media/')) return next();

  // The static HTML never changes between deploys, so a revalidating browser
  // would get "304 Not Modified" and keep a copy with yesterday's settings baked
  // in (old announcement, old prices, booking buttons that should be gone).
  // Ask for the full page every time and send no validators back.
  let res;
  if (request.method === 'GET') {
    const headers = new Headers(request.headers);
    headers.delete('if-none-match');
    headers.delete('if-modified-since');
    res = await next(new Request(request.url, { method: 'GET', headers }));
  } else {
    res = await next();
  }
  const type = res.headers.get('content-type') || '';
  if (request.method !== 'GET' || !type.includes('text/html') || !env.DB) return res;

  const boutiquePage = path === '/' || path === '/index.html' || path === '/play' || path === '/play.html';
  let config;
  let products = [];
  try {
    config = await publicConfig(env);
    if (boutiquePage) {
      products = await all(env.DB,
        'SELECT id, slug, name, description, price_fils, image_id, image_url, stock, featured FROM products WHERE active = 1 ORDER BY sort, id');
    }
  } catch (err) {
    console.error('live layer skipped', err);
    return res;
  }

  const siteUrl = env.SITE_URL || new URL(request.url).origin;
  const cardOpts = { number: config.business.whatsapp, siteUrl, cart: config.booking.enabled };
  let rw = new HTMLRewriter()
    .on('head', { element(el) { el.append('<link rel="stylesheet" href="/assets/css/live.css?v=4">', { html: true }); } })
    .on('body', {
      element(el) {
        el.append(`<script id="ti-config" type="application/json">${scriptJson(config)}</script><script src="/assets/js/live.js?v=4" defer></script>`, { html: true });
      },
    });

  if (products.length) {
    const grid = products.map((p) => productCard(p, { ...cardOpts, variant: 'grid' })).join('\n');
    const featured = products.filter((p) => p.featured);
    const rail = (featured.length ? featured : products).map((p) => productCard(p, { ...cardOpts, variant: 'rail' })).join('\n');
    rw = rw
      .on('.shop-grid', { element(el) { el.setInnerContent(grid, { html: true }); } })
      .on('[data-rail-track]', { element(el) { el.setInnerContent(rail, { html: true }); } });
  }

  const out = rw.transform(res);
  const headers = new Headers(out.headers);
  headers.delete('etag');
  headers.delete('last-modified');
  headers.set('cache-control', 'no-cache');
  headers.set('x-content-type-options', 'nosniff');
  headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=()');
  return new Response(out.body, { status: out.status, headers });
}
