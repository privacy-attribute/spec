// Account profile form: every input type, selects, pickers, uploads and identity fields.
// Widgets a careful integrator would block carry data-audit-block. All data is made up.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PUB = 'data-audit-category="public" data-audit-pattern="P-public-next-to-private"';
const lbl = (id, text) => `<label for="${id}" ${PUB}>${text}</label>`;
const TYPED = ['text', 'password', 'email', 'tel', 'number', 'search', 'url'];
const TYPED_LABEL = { text: 'Full name', password: 'Password', email: 'Email', tel: 'Phone', number: 'Annual income', search: 'Search help', url: 'Website' };
const DIAG = ['None', 'Asthma', 'Depression', 'Type 2 diabetes', 'HIV', 'Epilepsy'];
const RELIGION = ['Prefer not to say', 'Christian', 'Muslim', 'Jewish', 'Hindu', 'Buddhist', 'None'];

// Files for upload journeys are written to a temp dir at run time, named after the journey value.
let tmp;
function tmpFile(name, content) {
  tmp ??= fs.mkdtempSync(path.join(os.tmpdir(), 'audit-profile-form-'));
  const p = path.join(tmp, name);
  fs.writeFileSync(p, content);
  return p;
}
const svgFile = (fill, size) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" fill="${fill}"/><circle cx="${size / 2}" cy="${size / 2}" r="${size / 4}" fill="#fff"/></svg>`;

export default {
  page: 'profile-form',
  html: () => `<!doctype html><html><head><title>Your profile</title><style>
body{font:12px sans-serif;margin:6px}
.w{margin:3px;padding:3px;border:1px solid #ccc;display:inline-block;vertical-align:top}
.f{display:inline-block;margin:2px 4px}.f label{display:block;font-size:11px}
.f input,.f select,.f textarea{width:150px;font-size:11px}
#it-ce{width:150px;min-height:16px;border:1px solid #999}
#cs-list,#ac-list{position:absolute;background:#fff;border:1px solid #999;margin:0;padding:0;list-style:none;z-index:5;width:180px}
[role=option]{padding:2px 4px;cursor:pointer}[role=option][aria-selected=true]{background:#acf}
.cal td{width:20px;height:16px;text-align:center;cursor:pointer}.cal td[aria-selected=true]{background:#acf}
#avatar-img{width:48px;height:48px;border:1px solid #999}#swatch{display:inline-block;width:20px;height:20px;border:1px solid #000}
#drop{width:180px;height:30px;border:1px dashed #999}
</style></head><body>
<h2 ${PUB}>Your profile</h2>

<div class="w" style="width:960px">
  <h3 ${PUB}>Personal details</h3>
  ${TYPED.map((t) => `<div class="f">${lbl(`it-${t}`, TYPED_LABEL[t])}<input type="${t}" id="it-${t}" data-audit-category="${t === 'password' ? 'secret' : 'personal'}" data-audit-pattern="P-input-types"></div>`).join('')}
  <div class="f">${lbl('it-range', 'Income bracket')}<input type="range" id="it-range" min="0" max="200000" step="1" value="0" style="width:300px" data-audit-category="personal" data-audit-pattern="P-input-types"></div>
  <div class="f">${lbl('it-date', 'Date of birth')}<input type="date" id="it-date" data-audit-category="personal" data-audit-pattern="P-input-types"></div>
  <div class="f">${lbl('it-time', 'Usual medication time')}<input type="time" id="it-time" data-audit-category="personal" data-audit-pattern="P-input-types"></div>
  <div class="f">${lbl('it-dtl', 'Last appointment')}<input type="datetime-local" id="it-dtl" style="width:200px" data-audit-category="personal" data-audit-pattern="P-input-types"></div>
  <div class="f">${lbl('it-month', 'Moved in')}<input type="month" id="it-month" data-audit-category="personal" data-audit-pattern="P-input-types"></div>
  <div class="f">${lbl('it-week', 'Due week')}<input type="week" id="it-week" data-audit-category="personal" data-audit-pattern="P-input-types"></div>
  <div class="f">${lbl('it-color', 'Favourite colour')}<input type="color" id="it-color" data-audit-category="personal" data-audit-pattern="P-input-types"></div>
  <input type="hidden" id="it-hidden" data-audit-category="personal" data-audit-pattern="P-input-types">
  <div class="f">${lbl('it-file', 'Attachment')}<input type="file" id="it-file" data-audit-category="personal" data-audit-pattern="P-input-types"></div>
  <div class="f">${lbl('it-textarea', 'About you')}<textarea id="it-textarea" rows="2" data-audit-category="personal" data-audit-pattern="P-input-types"></textarea></div>
  <div class="f">${lbl('it-select', 'Condition')}<select id="it-select" data-audit-category="personal" data-audit-pattern="P-input-types">${DIAG.map((d) => `<option>${d}</option>`).join('')}</select></div>
  <div class="f"><span ${PUB}>Notes</span><div id="it-ce" contenteditable="true" data-audit-category="personal" data-audit-pattern="P-input-types"></div></div>
</div>

<div class="w">${lbl('diag', 'Main diagnosis')}
  <select id="diag" data-audit-category="personal" data-audit-pattern="P-native-select">${DIAG.map((d) => `<option>${d}</option>`).join('')}</select>
  <span id="diag-out" data-audit-category="personal" data-audit-pattern="P-native-select">Selected: None</span>
</div>

<div class="w" style="position:relative"><span ${PUB}>Religion</span>
  <div data-audit-category="personal" data-audit-pattern="P-custom-select" data-audit-block style="display:inline-block">
    <div id="cs-btn" role="combobox" aria-expanded="false" aria-controls="cs-list" tabindex="0" style="border:1px solid #999;width:170px;padding:2px">${RELIGION[0]}</div>
    <ul id="cs-list" role="listbox" hidden>${RELIGION.map((r, i) => `<li role="option" id="cs-${i}" aria-selected="${i === 0}">${r}</li>`).join('')}</ul>
  </div>
</div>

<div class="w">${lbl('name', 'Preferred name')}
  <input id="name" data-audit-category="personal" data-audit-pattern="P-echo-greeting">
  <h3 id="greet" data-audit-category="personal" data-audit-pattern="P-echo-greeting">Hi there</h3>
</div>

<div class="w" style="position:relative">${lbl('ac', 'Home address')}
  <div data-audit-category="personal" data-audit-pattern="P-autocomplete" data-audit-block style="display:inline-block">
    <input id="ac" autocomplete="off" role="combobox" aria-expanded="false" aria-controls="ac-list" style="width:180px">
    <ul id="ac-list" role="listbox" hidden></ul>
  </div>
</div>

<div class="w"><span ${PUB}>Date of birth (calendar)</span>
  <div id="cal" data-audit-category="personal" data-audit-pattern="P-date-picker" data-audit-block>
    <button id="cal-prev" aria-label="previous year">&lsaquo;</button><span id="cal-head">January 2000</span><button id="cal-next" aria-label="next year">&rsaquo;</button>
    <table class="cal"><tr>${Array.from({ length: 31 }, (_, i) => `<td data-d="${i + 1}" role="gridcell">${i + 1}</td>${(i + 1) % 7 === 0 ? '</tr><tr>' : ''}`).join('')}</tr></table>
    <span id="cal-out">No date chosen</span>
  </div>
</div>

<div class="w">${lbl('upload', 'Upload a document')}
  <div data-audit-category="personal" data-audit-pattern="P-file-upload" data-audit-block>
    <input type="file" id="upload"><div id="drop">Drop files here</div><span id="upload-out"></span>
  </div>
</div>

<div class="w">${lbl('avatar', 'Profile photo')}
  <input type="file" id="avatar" accept="image/*" data-audit-category="personal" data-audit-pattern="P-media-preview">
  <div data-audit-category="personal" data-audit-pattern="P-media-preview" data-audit-block>
    <img id="avatar-img" alt="preview" src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=="><canvas id="avatar-cv" width="48" height="48"></canvas>
  </div>
</div>

<div class="w">${lbl('gov', 'National ID number')}
  <input id="gov" placeholder="123-45-6789" data-audit-category="secret" data-audit-pattern="P-gov-id">
  <span id="gov-msg" data-audit-category="secret" data-audit-pattern="P-gov-id">Format: 123-45-6789</span>
</div>

<div class="w"><span ${PUB}>Security question: name of your first school?</span><br>
  <textarea id="secq" rows="1" style="width:200px;overflow:hidden;resize:none" data-audit-category="secret" data-audit-pattern="P-security-question"></textarea>
</div>

<div class="w">${lbl('hl', 'High-contrast highlight colour')}
  <input type="color" id="hl" value="#000000" data-audit-category="personal" data-audit-pattern="P-color-picker">
  <span id="swatch" data-audit-category="personal" data-audit-pattern="P-color-picker" data-audit-block style="background:#000000"></span>
</div>

<button id="save" ${PUB}>Save profile</button>

<script>
const $=id=>document.getElementById(id);
$('it-text').addEventListener('change',e=>{$('it-hidden').value='ref-'+e.target.value.length});
$('diag').addEventListener('change',e=>{$('diag-out').textContent='Selected: '+e.target.value});
$('cs-btn').onclick=()=>{const open=$('cs-list').hidden;$('cs-list').hidden=!open;$('cs-btn').setAttribute('aria-expanded',open)};
document.querySelectorAll('#cs-list [role=option]').forEach(o=>o.onclick=()=>{document.querySelectorAll('#cs-list [role=option]').forEach(x=>x.setAttribute('aria-selected','false'));o.setAttribute('aria-selected','true');$('cs-btn').textContent=o.textContent;$('cs-btn').setAttribute('aria-activedescendant',o.id);$('cs-list').hidden=true;$('cs-btn').setAttribute('aria-expanded','false')});
$('name').oninput=e=>{$('greet').textContent='Hi '+e.target.value;document.title='Welcome, '+e.target.value};
const STREETS=['Kerkstraat','Marktplein','Molenweg','Dorpsstraat','Stationsweg'];
$('ac').oninput=e=>{const q=e.target.value;const m=q.length<2?[]:[q+' 1, Amsterdam',q+' 12, Utrecht',q+' 120, Rotterdam',...STREETS.filter(s=>s.toLowerCase().startsWith(q.toLowerCase()))];
 $('ac-list').innerHTML=m.map((s,i)=>'<li role="option" data-i="'+i+'">'+s+'</li>').join('');$('ac-list').hidden=!m.length;$('ac').setAttribute('aria-expanded',!!m.length);
 if(q.length>=2)fetch('/api?q='+encodeURIComponent(q))};
$('ac-list').onclick=e=>{const li=e.target.closest('li');if(!li)return;$('ac').value=li.textContent;$('ac-list').hidden=true;$('ac').setAttribute('aria-expanded','false')};
let y=2000;const head=()=>$('cal-head').textContent='January '+y;
$('cal-prev').onclick=()=>{y--;head()};$('cal-next').onclick=()=>{y++;head()};
document.querySelectorAll('.cal td').forEach(td=>td.onclick=()=>{document.querySelectorAll('.cal td').forEach(x=>x.removeAttribute('aria-selected'));td.setAttribute('aria-selected','true');$('cal-out').textContent='Born '+y+'-01-'+String(td.dataset.d).padStart(2,'0')});
$('upload').onchange=e=>{const f=e.target.files[0];$('upload-out').textContent=f.name+' ('+f.size+' bytes)';$('drop').textContent='1 file attached'};
$('avatar').onchange=e=>{const r=new FileReader();r.onload=()=>{$('avatar-img').src=r.result;const im=new Image();im.onload=()=>$('avatar-cv').getContext('2d').drawImage(im,0,0,48,48);im.src=r.result};r.readAsDataURL(e.target.files[0])};
$('gov').oninput=e=>{const ok=/^\\d{3}-\\d{2}-\\d{4}$/.test(e.target.value);$('gov-msg').textContent=ok?'Looks valid':'Format: 123-45-6789 ('+e.target.value.length+'/11)';$('gov').setAttribute('aria-invalid',!ok)};
$('secq').oninput=e=>{e.target.style.height='auto';e.target.style.height=e.target.scrollHeight+'px'};
$('hl').addEventListener('input',e=>{$('swatch').style.background=e.target.value;$('swatch').title=e.target.value});
</script></body></html>`,
  journeys: [
    {
      pattern: 'P-input-types',
      values: [
        { text: 'Al Wu', password: 'abc', email: 'al@x.io', tel: '112', number: '42', search: 'flu', url: 'http://a.io', range: 0.08, date: { y: '1990', m: '01', d: '02' }, time: ['09', '05', 'AM'], month: { y: '1990', m: '01' }, week: ['05', '1990'], color: '#000080', file: 'cv.txt', textarea: 'ok', select: 'Asthma', ce: 'hi' },
        { text: 'Bartholomew Featherstonehaugh', password: 'correct horse battery staple', email: 'bartholomew.longname@example.org', tel: '+31 6 12345678', number: '125000', search: 'hiv clinic near me', url: 'https://example.org/patients/123456/records', range: 0.625, date: { y: '1955', m: '12', d: '28' }, time: ['11', '55', 'PM'], month: { y: '1955', m: '12' }, week: ['52', '1955'], color: '#ff8800', file: 'psychiatric-evaluation-2026.pdf', textarea: 'I was diagnosed with bipolar disorder last year', select: 'Epilepsy', ce: 'Please cancel my appointment at the oncology ward' },
      ],
      async run(h, v) {
        for (const t of TYPED) await h.fill(`#it-${t}`, v[t], 50);
        await h.click('#it-range', v.range, 0.5);
        // Segmented date/time inputs: click the first segment and type each part; Chrome advances segments.
        // Segment order follows the browser locale (mm/dd/yyyy or dd/mm/yyyy), so read it from Intl first.
        const order = await h.page.evaluate(() => new Intl.DateTimeFormat(undefined, { year: 'numeric', month: '2-digit', day: '2-digit' })
          .formatToParts(new Date(2000, 0, 2)).filter((p) => p.type !== 'literal').map((p) => p.type[0]));
        const dateParts = (d) => order.filter((k) => d[k]).map((k) => d[k]);
        // Numeric segments auto-advance, but the 6-digit year and the month-name segment do not: ArrowRight moves on
        // (a no-op on the last segment, so it is safe where the locale does auto-advance).
        const seg = async (sel, parts, always = false) => {
          await h.click(sel, 0.08, 0.5);
          for (const p of parts) { await h.type(p, 40); if (always || p.length === 4) await h.press('ArrowRight'); }
        };
        await seg('#it-date', dateParts(v.date));
        await seg('#it-time', v.time);
        await seg('#it-dtl', [...dateParts(v.date), ...v.time]);
        await seg('#it-month', dateParts(v.month), true);
        await seg('#it-week', v.week);
        // Native colour picker dialog cannot be driven: set the value and dispatch input/change like the picker does.
        await h.page.$eval('#it-color', (el, c) => { el.value = c; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }, v.color);
        // Native file chooser cannot be driven: uploadFile sets the files and fires change.
        await (await h.page.$('#it-file')).uploadFile(tmpFile(v.file, 'x'.repeat(v.file.length * 10)));
        await h.fill('#it-textarea', v.textarea, 30);
        // Native select popup: focus by click, then select the option (page.select fires input/change).
        await h.click('#it-select'); await h.press('Escape'); await h.page.select('#it-select', v.select);
        await h.fill('#it-ce', v.ce, 30);
        // Leaving the text field fires change, which fills the hidden field.
        await h.click('#it-text'); await h.press('Tab');
      },
    },
    {
      pattern: 'P-native-select',
      values: ['Asthma', 'HIV'],
      async run(h, d) {
        // Native select popup: focus by click, then select the option (page.select fires input/change).
        await h.click('#diag'); await h.press('Escape');
        await h.page.select('#diag', d);
      },
    },
    {
      pattern: 'P-custom-select',
      values: [1, 5],
      async run(h, i) {
        await h.click('#cs-btn');
        await h.move(`#cs-${i}`);
        await h.click(`#cs-${i}`);
      },
    },
    {
      pattern: 'P-echo-greeting',
      values: ['Al', 'Bartholomew Featherstonehaugh'],
      async run(h, name) {
        await h.fill('#name', name);
      },
    },
    {
      pattern: 'P-autocomplete',
      values: [{ q: 'Ma', pick: 0 }, { q: 'Kerkstraat 14', pick: 2 }],
      async run(h, v) {
        await h.fill('#ac', v.q, 80);
        await h.wait(150);
        await h.click(`#ac-list li[data-i="${v.pick}"]`);
      },
    },
    {
      pattern: 'P-date-picker',
      values: [{ back: 2, day: 5 }, { back: 27, day: 28 }],
      async run(h, v) {
        for (let i = 0; i < v.back; i++) await h.click('#cal-prev');
        await h.click(`.cal td[data-d="${v.day}"]`);
      },
    },
    {
      pattern: 'P-file-upload',
      values: ['cv.pdf', 'hiv-test-result-positive-2026.pdf'],
      async run(h, name) {
        await h.move('#upload');
        // Native file chooser cannot be driven: uploadFile sets the files and fires change.
        await (await h.page.$('#upload')).uploadFile(tmpFile(name, 'x'.repeat(name.length * 40)));
        await h.wait(150);
      },
    },
    {
      pattern: 'P-media-preview',
      values: [{ name: 'me-red.svg', fill: '#c00', size: 40 }, { name: 'me-blue-portrait.svg', fill: '#03c', size: 96 }],
      async run(h, v) {
        await h.move('#avatar');
        // Native file chooser cannot be driven: uploadFile sets the files and fires change.
        await (await h.page.$('#avatar')).uploadFile(tmpFile(v.name, svgFile(v.fill, v.size)));
        await h.wait(300);
      },
    },
    {
      pattern: 'P-gov-id',
      values: ['4721', '901-23-4567'],
      async run(h, id) {
        await h.fill('#gov', id);
      },
    },
    {
      pattern: 'P-security-question',
      values: ['Oak', 'Saint Bartholomew Featherstonehaugh Primary School on the Long Meadow Road in Little Whinging'],
      async run(h, answer) {
        await h.fill('#secq', answer, 30);
      },
    },
    {
      pattern: 'P-color-picker',
      values: ['#1e90ff', '#ffd700'],
      async run(h, c) {
        await h.click('#hl');
        await h.press('Escape');
        // Native colour picker dialog cannot be driven: set the value and dispatch input/change like the picker does.
        await h.page.$eval('#hl', (el, c) => { el.value = c; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }, c);
      },
    },
  ],
};
