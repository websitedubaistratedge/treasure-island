# -*- coding: utf-8 -*-
"""Generates the Boutique product grid on play.html.
Prices live here - edit and re-run to update the page."""
import json, re
from urllib.parse import quote

BASE = "https://treasureislanddxb.com/"
WA   = "971504738452"

# slug, name, description, price in AED (None = not supplied yet)
P = [
 ("plantoys-vegetable-set","PlanToys Assorted Vegetable Set",
  "Wooden cutting board, knife and five vegetables. Plantwood with water-based paints. Ages 18m+.",116),
 ("puzzle-fun-in-the-sun","Fun in the Sun 300-Piece Puzzle",
  "Eurographics XL-piece jigsaw, artwork by Corinne Hartley.",100),
 ("stitch-gift-basket","Stitch Gift Basket",
  "Ready-wrapped gift basket built around a soft Stitch plush.",None),
 ("sonic-plush","Sonic Plush Toy",
  "Soft plush character toy, sized for small hands.",None),
 ("gumball-machine","Mini Gumball Machine",
  "Sweet-Factory dispenser filled with chocolate gems.",None),
 ("candy-dispensers","Rainbow Candy Dispensers",
  "Sweet-Factory novelty dispensers with collectable toppers.",None),
 ("shark-snappers","Shark Snapper",
  "Snapping shark grabber toy, sold singly.",None),
 ("twist-lollipop","Rainbow Twist Lollipop",
  "Large twisted lollipop on a stick.",None),
 ("peach-rings","Sweet-Factory Peach Rings",
  "140g bag of peach ring sweets, made with natural colours.",None),
 ("treasure-island-balloon","Treasure Island Balloon",
  "Gold latex balloon printed with the Treasure Island anchor.",None),
]

def order_link(slug, name, price):
    body = ("Hello Treasure Island,\n\n"
            "I'd like to order this from the Boutique.\n\n"
            f"• Product: {name}\n"
            f"• Price: {str(price) + ' AED' if price else 'Please confirm'}\n"
            "• Quantity:\n"
            "• Collect in store or delivery:\n\n"
            f"Photo: {BASE}assets/img/shop/{slug}@800.webp\n\n"
            "— Sent from the Treasure Island website (Boutique)")
    return "https://wa.me/%s?text=%s" % (WA, quote(body, safe=""))

cards = []
for slug, name, desc, price in P:
    price_html = (f'<span class="shop-price">{price} <small>AED</small></span>'
                  if price else '<span class="shop-price shop-price--ask">Ask for price</span>')
    cards.append(f'''      <article class="shop-card" data-reveal>
        <figure>
          <img class="lazy" src="assets/img/shop/{slug}@400.webp"
               srcset="assets/img/shop/{slug}@400.webp 400w, assets/img/shop/{slug}@600.webp 600w, assets/img/shop/{slug}@800.webp 800w"
               sizes="(max-width:699px) 44vw, (max-width:1023px) 29vw, 22vw"
               alt="{name} at the Treasure Island Boutique" width="800" height="800" loading="lazy" decoding="async">
        </figure>
        <div class="shop-body">
          <h3 class="shop-name">{name}</h3>
          <p class="shop-desc">{desc}</p>
          <div class="shop-foot">{price_html}</div>
          <a class="btn btn--gold btn--sm shop-order" href="{order_link(slug,name,price)}"
             target="_blank" rel="noopener" aria-label="Order {name} on WhatsApp">Order on WhatsApp</a>
        </div>
      </article>''')

section = '''
<!-- ============ BOUTIQUE SHOP ============ -->
<section class="section section--tight" id="shop" aria-labelledby="shop-h">
  <div class="shell">
    <div class="sec-head sec-head--center">
      <span class="eyebrow eyebrow--center">In the Boutique</span>
      <h2 id="shop-h" class="split">Toys, sweets and gifts</h2>
      <p class="lead">A few of the things on our shelves. Tap Order and it opens WhatsApp with the item ready to send &mdash; we confirm stock and price before anything is charged.</p>
    </div>
    <div class="shop-grid">
''' + "\n".join(cards) + '''
    </div>
    <p class="shop-note">Stock changes weekly. Message us for anything you do not see here.</p>
  </div>
</section>
'''

s = open("play.html", encoding="utf-8").read()
anchor = '<section class="section section--paper" id="boutique">'
end = s.index(anchor)
close = s.index("</section>", end) + len("</section>")
s = s[:close] + "\n" + section + s[close:]

# Product structured data for the two items with a confirmed price
prods = [{
  "@type":"Product","name":n,"description":d,
  "image": BASE+"assets/img/shop/%s@800.webp"%sl,
  "brand":{"@type":"Brand","name":"Treasure Island"},
  "offers":{"@type":"Offer","price":str(pr),"priceCurrency":"AED",
            "availability":"https://schema.org/InStock",
            "url":BASE+"play.html#shop",
            "seller":{"@id":BASE+"#business"}}
 } for sl,n,d,pr in P if pr]
ld = ('<script type="application/ld+json">\n'
      + json.dumps({"@context":"https://schema.org","@type":"ItemList","name":"Treasure Island Boutique",
                    "itemListElement":[{"@type":"ListItem","position":i+1,"item":p} for i,p in enumerate(prods)]},
                   indent=1, ensure_ascii=False)
      + '\n</script>\n')
s = s.replace("</head>", ld + "</head>", 1)
open("play.html","w",encoding="utf-8").write(s)
print("inserted %d products (%d priced)" % (len(P), len(prods)))
