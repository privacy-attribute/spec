// Public baseline page. lib/shell.mjs already wraps every page in a public nav, hero and footer; this page adds
// public tabs, a carousel, a style toggle, an FAQ, a long scrolling list and public help next to a private field.
// Every journey has two identical values: the differential must show no difference, and the fidelity check
// confirms the public content and the states the interactions produce survive in the recording.
const PRODUCTS = [['Compact X100', '€399', '2b5cad'], ['Mirrorless Z5', '€1,149', 'c0392b'], ['Lens 35mm f/1.8', '€249', '27ae60']];

export default {
  page: 'shell',
  html: () => `<!doctype html><html><head><title>Acme Camera Store</title><style>
.w{margin:6px;padding:4px;border:1px solid #ccc;display:inline-block;vertical-align:top}
.tab[aria-selected="true"]{background:#acf;font-weight:bold}
#carousel{width:220px;overflow:hidden;white-space:nowrap}
#track{transition:transform .3s}
.slide{display:inline-block;width:220px}
.cards{display:flex;gap:8px;transition:gap .3s}
.cards.compact{gap:2px;font-size:12px}
.card{border:1px solid #ddd;padding:4px;width:140px}
.cards.compact .card{width:110px}
.long p{margin:40px 0}
</style></head><body>
<section class="w" id="tabs">
  <button class="tab" role="tab" id="t-details" aria-selected="true" data-audit-category="public" data-audit-pattern="P-public-text">Details</button>
  <button class="tab" role="tab" id="t-shipping" aria-selected="false" data-audit-category="public" data-audit-pattern="P-public-text">Shipping</button>
  <p id="tab-body" data-audit-category="public" data-audit-pattern="P-public-text">24 megapixel sensor, weather sealed body.</p>
</section>

<section class="w">
  <div id="carousel" data-audit-category="public" data-audit-pattern="P-public-media"><div id="track">${PRODUCTS.map(([n, p, c]) => `<span class="slide"><img src="/img.svg?c=${c}" alt="${n}" width="40" height="40" data-audit-category="public" data-audit-pattern="P-public-media"> ${n} ${p}</span>`).join('')}</div></div>
  <button id="c-prev" data-audit-category="public" data-audit-pattern="P-public-media">‹</button>
  <button id="c-next" data-audit-category="public" data-audit-pattern="P-public-media">›</button>
</section>

<section class="w">
  <button id="density" aria-pressed="false" data-audit-category="public" data-audit-pattern="P-public-style">Compact view</button>
  <div id="cards" class="cards" data-audit-category="public" data-audit-pattern="P-public-style">${PRODUCTS.map(([n, p]) => `<div class="card">${n}<br>${p}</div>`).join('')}</div>
</section>

<section class="w">
  <details id="faq1" data-audit-category="public" data-audit-pattern="P-public-interaction"><summary>What is your return policy?</summary><p>30 days, free returns in the EU.</p></details>
  <details id="faq2" data-audit-category="public" data-audit-pattern="P-public-interaction"><summary>Do you ship abroad?</summary><p>Yes, to 28 countries.</p></details>
</section>

<section class="w">
  <label for="news-email" data-audit-category="public" data-audit-pattern="P-public-next-to-private">Newsletter email</label>
  <input id="news-email" type="email" autocomplete="email" data-audit-category="personal" data-audit-pattern="P-input-types">
  <button id="news-help" aria-expanded="false" data-audit-category="public" data-audit-pattern="P-public-next-to-private">What is this?</button>
  <p id="news-help-text" hidden data-audit-category="public" data-audit-pattern="P-public-next-to-private">One email a month with new lenses. Unsubscribe any time.</p>
  <button id="news-go" data-audit-category="public" data-audit-pattern="P-public-next-to-private">Subscribe</button>
</section>

<section class="long" data-audit-category="public" data-audit-pattern="P-public-interaction">
${Array.from({ length: 14 }, (_, i) => `<p>Buying guide ${i + 1}: choosing a lens for ${['portraits', 'landscapes', 'travel', 'sports', 'macro', 'video', 'street'][i % 7]}.</p>`).join('\n')}
</section>

<script>
const $=id=>document.getElementById(id);
document.querySelectorAll('.tab').forEach(t=>t.onclick=()=>{document.querySelectorAll('.tab').forEach(x=>x.setAttribute('aria-selected','false'));t.setAttribute('aria-selected','true');
  $('tab-body').textContent=t.id==='t-details'?'24 megapixel sensor, weather sealed body.':'Ships in 2 working days, free over €50.'});
let slide=0;const go=d=>{slide=(slide+d+${PRODUCTS.length})%${PRODUCTS.length};$('track').style.transform='translateX(-'+(slide*220)+'px)'};
$('c-next').onclick=()=>go(1);$('c-prev').onclick=()=>go(-1);
$('density').onclick=()=>{const on=$('cards').classList.toggle('compact');$('density').setAttribute('aria-pressed',String(on));$('density').textContent=on?'Comfortable view':'Compact view'};
$('news-help').onclick=()=>{const t=$('news-help-text');t.hidden=!t.hidden;$('news-help').setAttribute('aria-expanded',String(!t.hidden))};
</script></body></html>`,
  journeys: [
    {
      pattern: 'P-public-text',
      values: ['shipping-tab', 'shipping-tab'],
      async run(h) {
        await h.click('#t-shipping');
      },
    },
    {
      pattern: 'P-public-style',
      values: ['compact', 'compact'],
      async run(h) {
        await h.click('#density');
        await h.wait(400);
      },
    },
    {
      pattern: 'P-public-media',
      values: ['next-next', 'next-next'],
      async run(h) {
        await h.click('#c-next');
        await h.click('#c-next');
        await h.wait(400);
      },
    },
    {
      pattern: 'P-public-interaction',
      // Hover the Products menu, open an FAQ entry, scroll down the buying guides and back up.
      values: ['menu-faq-scroll', 'menu-faq-scroll'],
      async run(h) {
        await h.move('.audit-menu');
        await h.wait(300);
        await h.click('#faq1 summary');
        await h.page.mouse.wheel({ deltaY: 600 });
        await h.wait(300);
        await h.page.mouse.wheel({ deltaY: -600 });
        await h.wait(300);
      },
    },
    {
      pattern: 'P-public-next-to-private',
      values: ['help', 'help'],
      async run(h) {
        await h.click('#news-help');
      },
    },
  ],
};
