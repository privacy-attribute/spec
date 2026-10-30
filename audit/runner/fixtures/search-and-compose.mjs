// Live search, a rich-text chat composer, a bio with a character counter, and a delivery map picker.
// Widgets a careful integrator would block carry data-audit-block.
const CATALOGUE = [
  'Camera strap', 'Lens cap 52mm', 'Pregnancy test 2-pack', 'Prenatal vitamins', 'Tripod mini',
  'Memory card 64GB', 'Hair loss shampoo', 'Nicotine patches', 'Camera bag', 'Lens cleaning kit',
];

export default {
  page: 'search-and-compose',
  html: () => `<!doctype html><html><head><title>Search</title><style>
.w{margin:6px;padding:4px;border:1px solid #ccc;display:inline-block;vertical-align:top;max-width:440px}
#composer{min-height:40px;width:300px;border:1px solid #999;padding:4px}
#map{position:relative;width:300px;height:200px;background:#cde3c0;cursor:crosshair}
#pin{position:absolute;width:12px;height:12px;margin:-6px 0 0 -6px;border-radius:6px;background:#e33;display:none}
</style></head><body>
<section class="w">
  <label for="q" data-audit-category="public" data-audit-pattern="P-public-next-to-private">Search the store</label>
  <input id="q" type="search" autocomplete="off" data-audit-category="personal" data-audit-pattern="P-search-as-you-type">
  <div id="count" data-audit-category="personal" data-audit-pattern="P-search-as-you-type">${CATALOGUE.length} products</div>
  <ul id="results" data-audit-category="personal" data-audit-pattern="P-search-as-you-type"></ul>
</section>

<section class="w">
  <h3 data-audit-category="public" data-audit-pattern="P-public-next-to-private">Message support</h3>
  <div id="composer" contenteditable="true" role="textbox" data-audit-category="personal" data-audit-pattern="P-chat-composer"></div>
  <button id="send" data-audit-category="public" data-audit-pattern="P-public-next-to-private">Send</button>
</section>

<section class="w">
  <label for="bio" data-audit-category="public" data-audit-pattern="P-public-next-to-private">Short bio</label><br>
  <textarea id="bio" rows="3" cols="40" maxlength="140" data-audit-category="personal" data-audit-pattern="P-char-counter"></textarea>
  <div id="counter" data-audit-category="personal" data-audit-pattern="P-char-counter">0 / 140</div>
</section>

<section class="w">
  <h3 data-audit-category="public" data-audit-pattern="P-public-next-to-private">Choose a delivery location</h3>
  <div id="map" data-audit-category="personal" data-audit-pattern="P-map-picker" data-audit-block>
    <img src="/img.svg?c=cde3c0" width="300" height="200" alt="" style="position:absolute;left:0;top:0">
    <canvas id="mapc" width="300" height="200" style="position:absolute;left:0;top:0"></canvas>
    <div id="pin"></div>
  </div>
  <div id="where" data-audit-category="personal" data-audit-pattern="P-map-picker"></div>
</section>

<script>
const $=id=>document.getElementById(id);
const CAT=${JSON.stringify(CATALOGUE)};
const render=q=>{const m=CAT.filter(n=>n.toLowerCase().includes(q.toLowerCase()));$('results').innerHTML=m.map(n=>'<li>'+n+'</li>').join('');$('count').textContent=m.length?m.length+' results for "'+q+'"':'No results for "'+q+'"';};
$('q').addEventListener('input',e=>{const q=e.target.value;render(q);history.replaceState(null,'',location.pathname+location.search.replace(/&q=.*$/,'')+'&q='+encodeURIComponent(q));document.title='Search: '+q;fetch('/api?q='+encodeURIComponent(q))});
$('bio').addEventListener('input',e=>{$('counter').textContent=e.target.value.length+' / 140'+(e.target.value.length>100?' (almost full)':'')});
const mc=$('mapc').getContext('2d');
$('map').addEventListener('click',e=>{const r=$('map').getBoundingClientRect();const x=e.clientX-r.left,y=e.clientY-r.top;
  $('pin').style.display='block';$('pin').style.left=x+'px';$('pin').style.top=y+'px';
  mc.clearRect(0,0,300,200);mc.beginPath();mc.arc(x,y,8,0,7);mc.stroke();
  const lat=(52.2+(200-y)/1000).toFixed(4),lng=(4.8+x/1000).toFixed(4);
  $('where').textContent='Deliver to '+lat+', '+lng;fetch('/api?q='+lat+','+lng)});
</script></body></html>`,
  journeys: [
    {
      pattern: 'P-search-as-you-type',
      values: ['cam', 'pregnancy test'],
      async run(h, q) {
        await h.fill('#q', q, 120);
        await h.wait(200);
      },
    },
    {
      pattern: 'P-chat-composer',
      values: ['hi', 'I need to cancel my order because I lost my job last week'],
      async run(h, msg) {
        await h.fill('#composer', msg, 70);
        // Select the last word, as before a correction.
        await h.page.keyboard.down('Shift');
        await h.press('ArrowLeft', 2);
        await h.page.keyboard.up('Shift');
        await h.wait(150);
      },
    },
    {
      pattern: 'P-char-counter',
      values: ['Hi', 'Mother of three, recovering from burnout, living in Utrecht since my divorce in 2019. I love long walks and quiet cafes.'],
      async run(h, bio) {
        await h.fill('#bio', bio, 30);
      },
    },
    {
      pattern: 'P-map-picker',
      values: [[0.2, 0.3], [0.85, 0.75]],
      async run(h, [fx, fy]) {
        await h.click('#map', fx, fy);
      },
    },
  ],
};
