// Logged-in account page: profile, balance, notifications, settings, 2FA setup and API keys.
// Widgets a careful integrator would block carry data-audit-block.

// A QR-like image: an 8x8 grid derived from the secret, as an SVG data URL.
const qrCells = (s) => Array.from({ length: 64 }, (_, i) => (s.charCodeAt(i % s.length) * (i + 7)) % 3 === 0);
const qrSvg = (s) => 'data:image/svg+xml;base64,' + Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#fff"/>${qrCells(s).map((on, i) => (on ? `<rect x="${(i % 8) * 8}" y="${Math.floor(i / 8) * 8}" width="8" height="8"/>` : '')).join('')}</svg>`,
).toString('base64');

const TABS = ['personal', 'business', 'premium'];
const SECTIONS = [
  ['debts', 'Debt repayment plan'],
  ['claims', 'Medical insurance claims'],
  ['divorce', 'Divorce settlement payments'],
];

export default {
  page: 'account',
  html: (v) => {
    const pii = v['P-pii-text'];
    const bars = v['P-svg-text'].series;
    const max = Math.max(...bars);
    return `<!doctype html><html><head><title>Account · ${pii.name}</title><style>
.w{margin:6px;padding:4px;border:1px solid #ccc;display:inline-block;vertical-align:top;max-width:440px}
.tab{padding:4px 8px}.tab[aria-selected=true]{background:#2b5cad;color:#fff}
.bal::before{content:attr(data-balance)}
#greet::after{content:"${v['P-css-content'].name}"}
#toast{min-height:18px}
</style></head><body>
<header class="w">
  <span data-audit-category="public" data-audit-pattern="P-public-next-to-private">Signed in as</span>
  <b id="hdr-name" data-audit-category="personal" data-audit-pattern="P-pii-text">${pii.name}</b>
</header>

<section id="profile" class="w">
  <h3 data-audit-category="public" data-audit-pattern="P-public-next-to-private">Profile</h3>
  <div data-audit-category="personal" data-audit-pattern="P-pii-text">
    <p>${pii.name}</p>
    <p><a href="mailto:${pii.email}" title="${pii.email}" data-email="${pii.email}">${pii.email}</a></p>
    <p>${pii.addr}</p>
    <p>IBAN ${pii.iban}</p>
  </div>
  <a href="/profile/edit" data-audit-category="public" data-audit-pattern="P-public-next-to-private">Edit profile</a>
</section>

<section class="w">
  <span data-audit-category="public" data-audit-pattern="P-public-next-to-private">Available balance</span>
  <span id="mbal" data-audit-category="personal" data-audit-pattern="P-masked-width">${v['P-masked-width']}</span>
  <br><span data-audit-category="public" data-audit-pattern="P-public-next-to-private">Savings</span>
  <span id="cssbal" class="bal" data-balance="${v['P-css-content'].balance}" data-audit-category="personal" data-audit-pattern="P-css-content"></span>
  <span id="greet" data-audit-category="personal" data-audit-pattern="P-css-content"></span>
</section>

<section class="w">
  <h3 data-audit-category="public" data-audit-pattern="P-public-next-to-private">Balance history</h3>
  <svg id="chart" width="220" height="90" data-audit-category="personal" data-audit-pattern="P-svg-text">
    <title>Balance ${v['P-svg-text'].label}</title>
    ${bars.map((b, i) => `<rect x="${10 + i * 34}" y="${70 - (b / max) * 55}" width="26" height="${(b / max) * 55}" fill="#2b5cad"/>`).join('')}
    <text x="10" y="86" font-size="11">${v['P-svg-text'].label}</text>
  </svg>
</section>

<section class="w">
  <button id="save" data-audit-category="public" data-audit-pattern="P-public-next-to-private">Save settings</button>
  <div id="toast" role="status" data-audit-category="personal" data-audit-pattern="P-toast"></div>
</section>

<section class="w">
  <div role="tablist" data-audit-category="public" data-audit-pattern="P-public-next-to-private">
    ${TABS.map((t, i) => `<button class="tab" role="tab" id="tab-${t}" aria-selected="${i === 0}">${t[0].toUpperCase() + t.slice(1)}</button>`).join('')}
  </div>
  <div id="tabpanel" data-audit-category="personal" data-audit-pattern="P-tabs" data-plan="personal">Account type and plan details</div>
</section>

<section class="w" id="faq">
  ${SECTIONS.map(([id, label]) => `<details id="acc-${id}" data-audit-category="personal" data-audit-pattern="P-accordion"><summary>${label}</summary><p>Section details for ${label.toLowerCase()}.</p></details>`).join('')}
</section>


<section class="w">
  <span data-audit-category="public" data-audit-pattern="P-public-next-to-private">Your referral code</span>
  <code id="refcode" data-audit-category="secret" data-audit-pattern="P-copy-button">${v['P-copy-button']}</code>
  <button id="copy" data-audit-category="public" data-audit-pattern="P-public-next-to-private">Copy</button>
  <div id="copied" data-audit-category="secret" data-audit-pattern="P-copy-button"></div>
</section>

<section class="w">
  <h3 data-audit-category="public" data-audit-pattern="P-public-next-to-private">Set up two-factor authentication</h3>
  <div id="qr" data-audit-category="secret" data-audit-pattern="P-qr-secret" data-audit-block>
    <img id="qrimg" src="${qrSvg(v['P-qr-secret'])}" width="64" height="64" alt="otpauth://totp/Acme:me?secret=${v['P-qr-secret']}">
    <canvas id="qrc" width="64" height="64"></canvas>
  </div>
</section>

<section class="w">
  <span data-audit-category="public" data-audit-pattern="P-public-next-to-private">API key</span>
  <code id="apikey" data-audit-category="secret" data-audit-pattern="P-reveal-secret">••••••••••••</code>
  <button id="reveal" data-audit-category="public" data-audit-pattern="P-public-next-to-private">Show</button>
</section>

<section class="w">
  <h3 data-audit-category="public" data-audit-pattern="P-public-next-to-private">Conditions on file</h3>
  <div id="diag" data-audit-category="personal" data-audit-pattern="P-blocked-size" data-audit-block>
    <ul>${v['P-blocked-size'].map((d) => `<li>${d}</li>`).join('')}</ul>
  </div>
</section>

<script>
const $=id=>document.getElementById(id);
const toast=${JSON.stringify(v['P-toast'])};
$('save').onclick=()=>{$('toast').textContent='Saved. '+toast.unread+' new messages from '+toast.from;document.title='('+toast.unread+') '+document.title};
document.querySelectorAll('.tab').forEach(t=>t.onclick=()=>{document.querySelectorAll('.tab').forEach(o=>o.setAttribute('aria-selected',String(o===t)));$('tabpanel').dataset.plan=t.id.slice(4);$('tabpanel').textContent=t.textContent+' account: plan details'});
$('copy').onclick=async()=>{const c=$('refcode').textContent;try{await navigator.clipboard.writeText(c)}catch(e){}$('copied').textContent='Copied '+c};
const secret=${JSON.stringify(v['P-reveal-secret'])};
$('reveal').onclick=()=>{$('apikey').textContent=secret;$('reveal').textContent='Hide'};
const qc=$('qrc').getContext('2d');${JSON.stringify(qrCells(v['P-qr-secret']))}.forEach((on,i)=>{if(on)qc.fillRect((i%8)*8,Math.floor(i/8)*8,8,8)});
</script></body></html>`;
  },
  journeys: [
    {
      pattern: 'P-pii-text',
      values: [
        { name: 'Al Wu', email: 'al@mail.example', addr: 'Kade 2, Delft', iban: 'NL01 BANK 0000 0000 01' },
        { name: 'Bartholomew Featherstonehaugh', email: 'b.featherstonehaugh@clinic.example', addr: 'Kerkstraat 114-3, 1017 GM Amsterdam', iban: 'GB33 BUKB 2020 1555 5555 55' },
      ],
      async run(h) {
        await h.move('#profile');
        await h.move('#hdr-name');
      },
    },
    {
      pattern: 'P-masked-width',
      values: ['€9', '€12,480,301.75'],
      async run(h) {
        await h.move('#mbal');
      },
    },
    {
      pattern: 'P-toast',
      values: [{ unread: 1, from: 'Jo' }, { unread: 37, from: 'Dr. Maximilian Oppenheimer' }],
      async run(h) {
        await h.click('#save');
      },
    },
    {
      pattern: 'P-tabs',
      values: ['business', 'premium'],
      async run(h, tab) {
        await h.click(`#tab-${tab}`);
      },
    },
    {
      pattern: 'P-accordion',
      values: ['debts', 'divorce'],
      async run(h, id) {
        await h.click(`#acc-${id} summary`);
        await h.move(`#acc-${id} p`);
      },
    },
    {
      pattern: 'P-blocked-size',
      values: [['Flu'], ['HIV', 'Hepatitis C', 'Major depressive disorder', 'Type 1 diabetes', 'Epilepsy', 'Bipolar II disorder']],
      async run(h) {
        await h.move('#diag');
      },
    },
    {
      pattern: 'P-svg-text',
      values: [{ label: '€9', series: [3, 5, 9, 4, 6, 9] }, { label: '€184,302.55', series: [120, 95, 160, 184, 70, 30] }],
      async run(h) {
        await h.move('#chart');
      },
    },
    {
      pattern: 'P-copy-button',
      values: ['AL7Q', 'REF-BFEATHER-948372'],
      async run(h) {
        await h.click('#copy');
      },
    },
    {
      pattern: 'P-qr-secret',
      values: ['JBSWY3DPEHPK3PXP', 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'],
      async run(h) {
        await h.move('#qr');
      },
    },
    {
      pattern: 'P-reveal-secret',
      values: ['sk_test_51Ab', 'sk_test_4eC39HqLyjWDarjtT1zdp7dc9f8e7d6c5b4a'],
      async run(h) {
        await h.click('#reveal');
      },
    },
    {
      pattern: 'P-css-content',
      values: [{ balance: '€40', name: 'Al' }, { balance: '€73,915.20', name: 'Bartholomew' }],
      async run(h) {
        await h.move('#cssbal');
      },
    },
  ],
};
