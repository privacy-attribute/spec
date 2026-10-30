// Sign-in, sign-up and verification widgets. Widgets a careful integrator would block carry data-audit-block.
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

export default {
  page: 'login',
  html: (v) => `<!doctype html><html><head><title>Sign in</title><style>
.w{margin:6px;padding:4px;border:1px solid #ccc;display:inline-block;vertical-align:top}
.meter{height:6px;width:160px;background:#eee}.meter>div{height:6px;background:#c33}.meter.fair>div{background:#e90}.meter.strong>div{background:#3a3}
.otp input{width:24px;text-align:center}
.err{color:#b00}input[aria-invalid="true"]{border-color:#b00}
.dots{-webkit-text-security:disc}
</style></head><body>
<h2 data-audit-category="public" data-audit-pattern="P-public-next-to-private">Sign in to your account</h2>

<div class="w">
  <label for="pw" data-audit-category="public" data-audit-pattern="P-public-next-to-private">Password</label>
  <input id="pw" type="password" autocomplete="current-password" data-audit-category="secret" data-audit-pattern="P-password">
</div>

<div class="w">
  <label for="email" data-audit-category="public" data-audit-pattern="P-public-next-to-private">Email</label>
  <input id="email" type="email" aria-invalid="false" aria-describedby="email-msg" data-audit-category="personal" data-audit-pattern="P-validation">
  <span id="email-msg" class="err" data-audit-category="personal" data-audit-pattern="P-validation"></span>
  <button id="email-go" data-audit-category="public" data-audit-pattern="P-public-next-to-private">Continue</button>
</div>

<div class="w">
  <label for="pw2" data-audit-category="public" data-audit-pattern="P-public-next-to-private">New password</label>
  <input id="pw2" type="password" autocomplete="new-password" data-audit-category="secret" data-audit-pattern="P-password-reveal">
  <button id="eye" aria-pressed="false" aria-label="Show password" data-audit-category="public" data-audit-pattern="P-public-next-to-private">show</button>
</div>

<div class="w">
  <label for="af-name" data-audit-category="public" data-audit-pattern="P-public-next-to-private">Full name</label>
  <input id="af-name" autocomplete="name" data-audit-category="personal" data-audit-pattern="P-autofill">
  <label for="af-email" data-audit-category="public" data-audit-pattern="P-public-next-to-private">Email</label>
  <input id="af-email" type="email" autocomplete="email" data-audit-category="personal" data-audit-pattern="P-autofill">
</div>

<div class="w">
  <label for="saved-pw" data-audit-category="public" data-audit-pattern="P-public-next-to-private">Saved password</label>
  <input id="saved-pw" type="password" value="${esc(v['P-prefilled'].pw)}" autocomplete="current-password" data-audit-category="secret" data-audit-pattern="P-prefilled">
  <label for="saved-notes" data-audit-category="public" data-audit-pattern="P-public-next-to-private">Recovery notes</label>
  <textarea id="saved-notes" data-audit-category="secret" data-audit-pattern="P-prefilled">${esc(v['P-prefilled'].notes)}</textarea>
</div>

<div class="w">
  <label for="vk" data-audit-category="public" data-audit-pattern="P-public-next-to-private">Display name</label>
  <input id="vk" autocomplete="nickname" data-audit-category="personal" data-audit-pattern="P-viewport-keyboard">
</div>

<div class="w">
  <label for="otp1" data-audit-category="public" data-audit-pattern="P-public-next-to-private">Code from SMS</label>
  <input id="otp1" inputmode="numeric" autocomplete="one-time-code" data-audit-category="secret" data-audit-pattern="P-otp-single">
</div>

<div class="w otp" id="otp" data-audit-category="secret" data-audit-pattern="P-otp-split" data-audit-block>
  ${Array.from({ length: 6 }, (_, i) => `<input class="d" data-i="${i}" maxlength="1" inputmode="numeric" aria-label="digit ${i + 1}">`).join('')}
</div>
<button id="otp-clear" data-audit-category="public" data-audit-pattern="P-public-next-to-private">Clear code</button>

<div class="w">
  <label for="spw" data-audit-category="public" data-audit-pattern="P-public-next-to-private">Choose a password</label>
  <input id="spw" type="password" autocomplete="new-password" data-audit-category="secret" data-audit-pattern="P-strength-meter">
  <div id="meter" class="meter weak" role="meter" aria-valuemin="0" aria-valuemax="4" aria-valuenow="0" data-audit-category="secret" data-audit-pattern="P-strength-meter" data-audit-block><div id="bar" style="width:0%"></div></div>
  <span id="strength" data-audit-category="secret" data-audit-pattern="P-strength-meter">Too short</span>
</div>

<div class="w">
  <label for="mdisp" data-audit-category="public" data-audit-pattern="P-public-next-to-private">Card PIN</label>
  <input id="mdisp" class="dots" inputmode="numeric" autocomplete="off" data-audit-category="secret" data-audit-pattern="P-masked-display">
  <div id="mdiv" class="dots" data-audit-category="secret" data-audit-pattern="P-masked-display"></div>
</div>

<script>
const $=id=>document.getElementById(id);
const email=$('email');const check=()=>{const x=email.value;const msg=!x.includes('@')?'Email must contain @':!/@[^@]+\\.[a-z]{2,}$/i.test(x)?'Add a domain such as example.com after @':x.length>30?x+' is already registered':'';email.setAttribute('aria-invalid',String(!!msg));$('email-msg').textContent=msg;};
email.addEventListener('input',check);$('email-go').onclick=check;
$('eye').onclick=()=>{const t=$('pw2').type==='password'?'text':'password';$('pw2').type=t;$('eye').setAttribute('aria-pressed',String(t==='text'));$('eye').textContent=t==='text'?'hide':'show'};
const ds=[...document.querySelectorAll('.d')];
ds.forEach((d,i)=>{d.addEventListener('input',()=>{if(d.value&&ds[i+1])ds[i+1].focus()});
  d.addEventListener('keydown',e=>{if(e.key==='Backspace'&&!d.value&&ds[i-1])ds[i-1].focus()});
  d.addEventListener('paste',e=>{e.preventDefault();const t=(e.clipboardData.getData('text')||'').replace(/\\D/g,'').slice(0,6);t.split('').forEach((c,k)=>{ds[k].value=c;ds[k].dispatchEvent(new Event('input',{bubbles:true}))});ds[Math.min(t.length,5)].focus()})});
$('otp-clear').onclick=()=>{ds.forEach(d=>d.value='');ds[0].focus()};
$('spw').addEventListener('input',e=>{const p=e.target.value;const s=(p.length>=8)+(p.length>=12)+/[A-Z]/.test(p)+/[^A-Za-z0-9]/.test(p);$('bar').style.width=(p.length?25+s*18.75:0)+'%';$('meter').className='meter '+(s>=3?'strong':s>=2?'fair':'weak');$('meter').setAttribute('aria-valuenow',String(s));$('strength').textContent=p.length<8?'Too short':s>=3?'Strong':'Fair, add a symbol'});
$('mdisp').addEventListener('input',e=>{$('mdiv').textContent=e.target.value});
</script></body></html>`,
  journeys: [
    {
      pattern: 'P-password',
      values: ['abc', 'correct horse battery'],
      async run(h, pw) {
        await h.fill('#pw', pw);
      },
    },
    {
      pattern: 'P-validation',
      // Live validation while typing, then on submit.
      values: ['mila@x', 'joost.vandermeer.longname@example.org'],
      async run(h, email) {
        await h.fill('#email', email);
        await h.click('#email-go');
      },
    },
    {
      pattern: 'P-password-reveal',
      values: [{ a: 'hun', b: 'ter' }, { a: 'Tr0ub4dor', b: '&3-staple-99' }],
      async run(h, v) {
        await h.fill('#pw2', v.a);
        await h.click('#eye');
        await h.click('#pw2', 0.95, 0.5);
        await h.press('End');
        await h.type(v.b);
        await h.click('#eye');
      },
    },
    {
      pattern: 'P-autofill',
      // Browser autofill sets values without key presses; Chrome's real autofill cannot be driven headless,
      // so the fill is simulated the way Chrome dispatches it (value set, then input and change events).
      values: [{ name: 'Al Wu', email: 'al@x.io' }, { name: 'Henrietta Oosterhuis-Vandenberg', email: 'henrietta.oosterhuis@example.org' }],
      async run(h, v) {
        await h.click('#af-name');
        await h.page.evaluate((v) => {
          for (const [id, val] of [['af-name', v.name], ['af-email', v.email]]) {
            const el = document.getElementById(id);
            el.value = val;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }, v);
        await h.wait(150);
      },
    },
    {
      pattern: 'P-prefilled',
      // Fields load with a saved value; the user clears both. finish() forces a new full snapshot.
      values: [{ pw: 'old1', notes: 'none' }, { pw: 'Saved-Passw0rd-2019!', notes: 'Backup codes: 8812 4471 9930, ask Petra' }],
      async run(h, v) {
        for (const [sel, val] of [['#saved-pw', v.pw], ['#saved-notes', v.notes]]) {
          await h.click(sel);
          await h.press('End');
          await h.press('Backspace', val.length);
        }
      },
    },
    {
      pattern: 'P-viewport-keyboard',
      // Phone-sized viewport; the soft keyboard shrinks the viewport on focus and restores it on blur.
      // Only width and height change: switching isMobile or hasTouch in puppeteer reloads the page.
      values: ['Bo', 'Wilhelmina de Groot-Zandvoort'],
      async run(h, name) {
        await h.page.setViewport({ width: 390, height: 844 });
        await h.wait(150);
        await h.click('#vk');
        await h.page.setViewport({ width: 390, height: 508 });
        await h.type(name);
        await h.page.evaluate(() => document.activeElement.blur());
        await h.page.setViewport({ width: 390, height: 844 });
        await h.wait(150);
      },
    },
    {
      pattern: 'P-otp-single',
      values: ['4829', '48291736'],
      async run(h, code) {
        await h.fill('#otp1', code, 120);
      },
    },
    {
      pattern: 'P-otp-split',
      // Type the code with auto-advance, clear it, then paste it.
      values: ['123456', '900000'],
      async run(h, code) {
        await h.fill('.d[data-i="0"]', code, 120);
        await h.click('#otp-clear');
        await h.page.evaluate((code) => {
          const dt = new DataTransfer();
          dt.setData('text/plain', code);
          document.activeElement.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
        }, code);
        await h.wait(150);
      },
    },
    {
      pattern: 'P-strength-meter',
      values: ['abc', 'Tr0ub4dor&3-horse'],
      async run(h, pw) {
        await h.fill('#spw', pw);
      },
    },
    {
      pattern: 'P-masked-display',
      values: ['12', '9876543210'],
      async run(h, pin) {
        await h.fill('#mdisp', pin);
      },
    },
  ],
};
