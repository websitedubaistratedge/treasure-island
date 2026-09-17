import { escapeHtml as e } from './html.js';

// The site's existing shots are stored as a base path ("assets/img/shop/sonic-plush")
// with @400/@600/@800 WebP variants; uploads from the admin are one WebP in /media.
export function productImage(p, siteUrl) {
  if (p.image_id) {
    const src = `/media/${p.image_id}`;
    return { src, srcsetGrid: null, srcsetRail: null, absolute: `${siteUrl}${src}` };
  }
  if (p.image_url) {
    const base = `/${p.image_url.replace(/^\/+/, '')}`;
    return {
      src: `${base}@400.webp`,
      srcsetGrid: `${base}@400.webp 400w, ${base}@600.webp 600w, ${base}@800.webp 800w`,
      srcsetRail: `${base}@400.webp 400w, ${base}@600.webp 600w`,
      absolute: `${siteUrl}${base}@800.webp`,
    };
  }
  return { src: null, srcsetGrid: null, srcsetRail: null, absolute: null };
}

export function productWhatsappUrl(number, p, siteUrl) {
  const img = productImage(p, siteUrl);
  const body = [
    'Hello Treasure Island,', '',
    "I'd like to order this from the Boutique.", '',
    `• Product: ${p.name}`,
    `• Price: ${p.price_fils == null ? 'Please confirm' : `${p.price_fils / 100} AED`}`,
    '• Quantity:',
    '• Collect in store or delivery:', '',
    ...(img.absolute ? [`Photo: ${img.absolute}`, ''] : []),
    '— Sent from the Treasure Island website (Boutique)',
  ].join('\n');
  return `https://wa.me/${number}?text=${encodeURIComponent(body)}`;
}

// Same markup the static cards use, so the design is unchanged; the only
// addition is an "Add to cart" button when online booking is switched on and
// the product has a price.
export function productCard(p, { number, siteUrl, variant, cart }) {
  const img = productImage(p, siteUrl);
  const wa = e(productWhatsappUrl(number, p, siteUrl));
  const sizes = variant === 'rail' ? '(max-width:699px) 42vw, 240px' : '(max-width:699px) 44vw, (max-width:1023px) 29vw, 22vw';
  const srcset = variant === 'rail' ? img.srcsetRail : img.srcsetGrid;
  const soldOut = p.stock === 0;
  const price = p.price_fils == null
    ? `<a class="shop-price shop-price--ask" href="${wa}" target="_blank" rel="noopener">Ask for price</a>`
    : `<span class="shop-price">${e(p.price_fils / 100)} <small>AED</small></span>`;
  const addToCart = cart && p.price_fils != null && !soldOut
    ? `<button type="button" class="btn btn--navy btn--sm shop-order shop-add" data-add-product="${p.id}" data-name="${e(p.name)}" data-price="${p.price_fils}">Add to cart</button>`
    : '';
  return `<article class="shop-card"${variant === 'grid' ? ' data-reveal' : ''}>
          <figure>${img.src ? `<img class="lazy" src="${e(img.src)}"${srcset ? ` srcset="${e(srcset)}" sizes="${sizes}"` : ''} alt="${e(p.name)} at the Treasure Island Boutique" width="800" height="800" loading="lazy" decoding="async">` : ''}</figure>
          <div class="shop-body">
            <h3 class="shop-name">${e(p.name)}</h3>
            <p class="shop-desc">${e(p.description)}</p>
            <div class="shop-foot">${soldOut ? '<span class="shop-price shop-price--ask">Sold out</span>' : price}</div>
            ${addToCart}<a class="btn btn--gold btn--sm shop-order" href="${wa}" target="_blank" rel="noopener" aria-label="Order ${e(p.name)} on WhatsApp">Order on WhatsApp</a>
          </div>
        </article>`;
}
