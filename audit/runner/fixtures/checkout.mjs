// Checkout: hosted card fields in iframes, own card fields, and a financing quote computed from income.
// Widgets a careful integrator would block carry data-audit-block.
const MONTHS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
const YEARS = [2026, 2027, 2028, 2029, 2030, 2031, 2032];
const BRAND = { visa: '1a1f71', amex: '2e77bb', mc: 'eb001b', unknown: '999999' };

export default {
  page: 'checkout',
  html: (v, env) => `<!doctype html><html><head><title>Checkout</title><style>
.w{margin:6px;padding:4px;border:1px solid #ccc;display:inline-block;vertical-align:top}
iframe{border:1px solid #aaa}
#card{width:200px;letter-spacing:1px}
</style></head><body>
<h2 data-audit-category="public" data-audit-pattern="P-public-next-to-private">Payment</h2>
<p data-audit-category="public" data-audit-pattern="P-public-next-to-private">Order total €249.00, Lens kit 50mm</p>

<div class="w">
  <span data-audit-category="public" data-audit-pattern="P-public-next-to-private">Pay with hosted card field</span><br>
  <iframe id="pay-frame" title="Secure card payment" width="320" height="70"
    src="http://127.0.0.1:${env.port}/frame?f=card&run=${env.run}"
    data-audit-category="secret" data-audit-pattern="P-embedded-iframe" data-audit-block></iframe>
  <iframe id="pay-xo" title="Payment status" width="320" height="40"
    src="http://localhost:${env.port2}/frame?f=status&run=${env.run}&client_secret=${encodeURIComponent(v['P-embedded-iframe'].token)}"
    data-audit-category="secret" data-audit-pattern="P-embedded-iframe" data-audit-block></iframe>
</div>

<div class="w">
  <label for="card" data-audit-category="public" data-audit-pattern="P-public-next-to-private">Card number</label>
  <input id="card" inputmode="numeric" autocomplete="cc-number" data-audit-category="secret" data-audit-pattern="P-card-number">
  <img id="brand" src="/img.svg?c=${BRAND.unknown}" width="24" height="24" alt="card brand" class="brand-unknown" data-audit-category="secret" data-audit-pattern="P-card-number">
  <span id="card-msg" data-audit-category="secret" data-audit-pattern="P-card-number"></span>
</div>

<div class="w">
  <label for="cvv" data-audit-category="public" data-audit-pattern="P-public-next-to-private">CVC</label>
  <input id="cvv" inputmode="numeric" maxlength="4" autocomplete="cc-csc" size="4" data-audit-category="secret" data-audit-pattern="P-cvv-expiry">
  <label for="exp-month" data-audit-category="public" data-audit-pattern="P-public-next-to-private">Expires</label>
  <select id="exp-month" autocomplete="cc-exp-month" data-audit-category="secret" data-audit-pattern="P-cvv-expiry">${MONTHS.map((m) => `<option value="${m}">${m}</option>`).join('')}</select>
  <select id="exp-year" autocomplete="cc-exp-year" data-audit-category="secret" data-audit-pattern="P-cvv-expiry">${YEARS.map((y) => `<option value="${y}">${y}</option>`).join('')}</select>
</div>

<div class="w">
  <span data-audit-category="public" data-audit-pattern="P-public-next-to-private">Pay in 12 instalments</span><br>
  <label for="income" data-audit-category="public" data-audit-pattern="P-public-next-to-private">Annual income (€)</label>
  <input id="income" inputmode="numeric" data-audit-category="personal" data-audit-pattern="P-computed-total">
  <button id="quote-go" data-audit-category="public" data-audit-pattern="P-public-next-to-private">Get quote</button>
  <p id="quote" data-audit-category="personal" data-audit-pattern="P-computed-total">Enter your income for a quote</p>
  <canvas id="quote-bar" width="200" height="16" data-audit-category="personal" data-audit-pattern="P-computed-total" data-audit-block></canvas>
</div>

<script>
const $=id=>document.getElementById(id);
const BRAND=${JSON.stringify(BRAND)};
$('card').addEventListener('input',e=>{const raw=e.target.value.replace(/\\D/g,'').slice(0,19);const amex=/^3[47]/.test(raw);
  e.target.value=amex?raw.replace(/^(\\d{4})(\\d{0,6})(\\d{0,5}).*/,(m,a,b,c)=>[a,b,c].filter(Boolean).join(' ')):raw.replace(/(\\d{4})(?=\\d)/g,'$1 ');
  const brand=raw[0]==='4'?'visa':amex?'amex':/^5[1-5]/.test(raw)?'mc':'unknown';$('brand').className='brand-'+brand;$('brand').src='/img.svg?c='+BRAND[brand];
  let s=0;for(let i=0;i<raw.length;i++){let n=+raw[raw.length-1-i];if(i%2){n*=2;if(n>9)n-=9}s+=n}
  $('card-msg').textContent=raw.length>=(amex?15:16)?(s%10===0?brand.toUpperCase()+' ending '+raw.slice(-4):'Card number is invalid'):''});
const quote=()=>{const inc=+$('income').value||0;const limit=Math.round(inc*0.15);const monthly=(249/12*1.079).toFixed(2);
  $('quote').textContent=inc?(limit>=249?'Approved up to €'+limit.toLocaleString('en-US')+', €'+monthly+' per month':'Credit limit €'+limit+' is below the order total'):'Enter your income for a quote';
  const c=$('quote-bar').getContext('2d');c.clearRect(0,0,200,16);c.fillStyle='#3a3';c.fillRect(0,0,Math.min(200,limit/100),16);
  fetch('/api?q='+encodeURIComponent('income='+inc+'&limit='+limit))};
$('income').addEventListener('input',quote);$('quote-go').onclick=quote;
</script></body></html>`,
  frames: (v) => ({
    card: `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:4px;font:14px sans-serif}</style></head><body>
<label for="fc">Card</label> <input id="fc" inputmode="numeric" autocomplete="cc-number" size="22">
<p id="fp" style="margin:2px 0">Paying as ${v['P-embedded-iframe'].holder}</p></body></html>`,
    status: `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:4px;font:13px sans-serif">Secured by ExamplePay</body></html>`,
  }),
  journeys: [
    {
      pattern: 'P-embedded-iframe',
      // Same-origin hosted card field (typed into), plus a cross-origin status frame with a client secret in its URL.
      values: [
        { card: '4111111111111111', holder: 'Al Wu', token: 'pi_A1_secret_x1' },
        { card: '378282246310005', holder: 'Henrietta Oosterhuis-Vandenberg', token: 'pi_3Nq8ZkLm9TzQ_secret_v7RfK2pW4xYc' },
      ],
      async run(h, v) {
        const frame = await (await h.page.$('#pay-frame')).contentFrame();
        await frame.waitForSelector('#fc');
        const b = await (await frame.$('#fc')).boundingBox();
        await h.page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 10 });
        await h.page.mouse.down();
        await h.wait(60);
        await h.page.mouse.up();
        await h.wait(120);
        await h.type(v.card, 70);
      },
    },
    {
      pattern: 'P-card-number',
      values: ['4111111111111111', '378282246310005'],
      async run(h, card) {
        await h.fill('#card', card, 70);
      },
    },
    {
      pattern: 'P-cvv-expiry',
      // CVC typed, then Tab to the closed selects and pick month and year by typeahead.
      values: [{ cvv: '123', month: '01', year: '2027' }, { cvv: '9472', month: '12', year: '2031' }],
      async run(h, v) {
        await h.fill('#cvv', v.cvv);
        await h.press('Tab');
        await h.type(v.month, 60);
        await h.wait(1100);
        await h.press('Tab');
        await h.type(v.year, 60);
        await h.wait(200);
      },
    },
    {
      pattern: 'P-computed-total',
      values: ['38000', '1250000'],
      async run(h, income) {
        await h.fill('#income', income);
        await h.click('#quote-go');
      },
    },
  ],
};
