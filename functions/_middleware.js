import { publicConfig } from '../src/lib/settings.js';
import { all } from '../src/lib/db.js';
import { scriptJson } from '../src/lib/html.js';
import { productCard } from '../src/lib/boutique.js';
import { galleriesFor, firstVideo, firstImage, mediaUrl, posterUrl } from '../src/lib/media.js';

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
  let productMedia = new Map();
  let films = [];
  try {
    config = await publicConfig(env);
    if (boutiquePage) {
      products = await all(env.DB,
        'SELECT id, slug, name, description, price_fils, image_id, image_url, stock, featured FROM products WHERE active = 1 ORDER BY sort, id');
      productMedia = await galleriesFor(env.DB, 'product', products.map((p) => p.id));
    }
    // A video added to a programme in the admin replaces the film in that
    // block, so the team can refresh what plays without a developer.
    const offerings = await all(env.DB, 'SELECT id, slug FROM offerings WHERE active = 1');
    const galleries = await galleriesFor(env.DB, 'offering', offerings.map((o) => o.id));
    films = offerings
      .map((o) => ({ slug: o.slug, video: firstVideo(galleries.get(o.id)), image: firstImage(galleries.get(o.id)) }))
      .filter((f) => f.video);
  } catch (err) {
    console.error('live layer skipped', err);
    return res;
  }

  const siteUrl = env.SITE_URL || new URL(request.url).origin;
  const cardOpts = { number: config.business.whatsapp, siteUrl, cart: config.booking.enabled };
  let rw = new HTMLRewriter()
    .on('head', { element(el) { el.append('<link rel="stylesheet" href="/assets/css/live.css?v=6">', { html: true }); } })
    .on('body', {
      element(el) {
        el.append(`<script id="ti-config" type="application/json">${scriptJson(config)}</script><script src="/assets/js/live.js?v=5" defer></script>`, { html: true });
      },
    });

  if (products.length) {
    const withMedia = (p) => ({ ...p, media: productMedia.get(p.id) || [] });
    const grid = products.map((p) => productCard(withMedia(p), { ...cardOpts, variant: 'grid' })).join('\n');
    const featured = products.filter((p) => p.featured);
    const rail = (featured.length ? featured : products).map((p) => productCard(withMedia(p), { ...cardOpts, variant: 'rail' })).join('\n');
    rw = rw
      .on('.shop-grid', { element(el) { el.setInnerContent(grid, { html: true }); } })
      .on('[data-rail-track]', { element(el) { el.setInnerContent(rail, { html: true }); } });
  }

  for (const film of films) {
    const sel = `[data-film="${film.slug}"]`;
    const src = mediaUrl(film.video.id);
    const poster = posterUrl(film.video) || (film.image ? mediaUrl(film.image.id) : null);
    rw = rw
      .on(`${sel} .rfilm-full source`, { element(el) { el.setAttribute('data-src', src); el.setAttribute('type', film.video.mime || 'video/mp4'); } })
      // The short hover loop belongs to the old film. Remove the whole player
      // rather than just its source: an empty one would still be faded in over
      // the cover image and show a black panel.
      .on(`${sel} .rfilm-loop`, { element(el) { el.remove(); } });
    if (poster) {
      rw = rw
        .on(`${sel} .rfilm-poster`, { element(el) { el.setAttribute('src', poster); el.removeAttribute('srcset'); el.removeAttribute('sizes'); } })
        .on(`${sel} .rfilm-full`, { element(el) { el.setAttribute('poster', poster); } });
    }
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
