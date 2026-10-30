// Health questionnaire: native radios and checkboxes, div switches, answer cards, a pain scale and sliders.
// Widgets a careful integrator would block carry data-audit-block. All data is made up.
const PUB = 'data-audit-category="public" data-audit-pattern="P-public-next-to-private"';
const SYMPTOMS = ['cough', 'fever', 'chest-pain', 'night-sweats', 'weight-loss', 'fatigue'];
const SWITCHES = ['Currently pregnant', 'Daily smoker', 'Taking antidepressants', 'Receiving fertility treatment'];
const SEGMENTS = ['None', 'Monthly', 'Weekly', 'Daily'];
const CARDS = ['Straight', 'Gay or lesbian', 'Bisexual', 'Prefer not to say'];

export default {
  page: 'questionnaire',
  html: () => `<!doctype html><html><head><title>Health questionnaire</title><style>
body{font:12px sans-serif;margin:6px}
.w{margin:4px;padding:4px;border:1px solid #ccc;display:inline-block;vertical-align:top}
.sw{width:36px;height:18px;border-radius:9px;background:#ccc;display:inline-block;vertical-align:middle;cursor:pointer}.sw.on{background:#2a2}
.row{margin:3px 0}.seg{display:inline-block;padding:3px 8px;border:1px solid #999;cursor:pointer}.seg.on{background:#acf}
.card{display:inline-block;width:110px;height:36px;margin:2px;border:2px solid #ccc;cursor:pointer;text-align:center}.card:hover,.card.hov{border-color:#888}.card.sel{border-color:blue}
.pt{display:inline-block;width:26px;height:26px;margin:1px;border:1px solid #999;text-align:center;line-height:26px;cursor:pointer}.pt.hov{background:#fe9}.pt.on{background:#f80}
#cs{position:relative;width:400px;height:20px;background:#eee;touch-action:none}#thumb{position:absolute;left:0;top:0;width:12px;height:20px;background:#333;cursor:grab}
</style></head><body>
<h2 ${PUB}>Health questionnaire</h2>
<p ${PUB}>Your answers are shared only with your care team.</p>

<div class="w"><span ${PUB}>Have you ever tested positive for HIV?</span>
  <div data-audit-category="personal" data-audit-pattern="P-checkbox-radio" data-audit-block>
    <label><input type="radio" name="hiv" value="yes" id="hiv-yes">Yes</label>
    <label><input type="radio" name="hiv" value="no" id="hiv-no">No</label>
    <label><input type="radio" name="hiv" value="unsure" id="hiv-unsure">Not sure</label>
    <div>Symptoms in the last month:</div>
    ${SYMPTOMS.map((s) => `<label><input type="checkbox" id="sym-${s}" value="${s}">${s.replace('-', ' ')}</label>`).join(' ')}
  </div>
</div>

<div class="w"><span ${PUB}>About you</span>
  <div data-audit-category="personal" data-audit-pattern="P-custom-toggle" data-audit-block>
    ${SWITCHES.map((s, i) => `<div class="row"><div class="sw" id="sw-${i}" role="switch" aria-checked="false" tabindex="0"></div> ${s}</div>`).join('')}
    <div class="row">Alcohol: <span role="radiogroup">${SEGMENTS.map((s, i) => `<span class="seg${i === 0 ? ' on' : ''}" id="seg-${i}" role="radio" aria-checked="${i === 0}">${s}</span>`).join('')}</span></div>
  </div>
</div>

<div class="w"><span ${PUB}>Which best describes your sexual orientation?</span>
  <div id="cards" data-audit-category="personal" data-audit-pattern="P-choice-buttons" data-audit-block>
    ${CARDS.map((c, i) => `<div class="card" id="card-${i}" role="button" aria-pressed="false">${c}</div>`).join('')}
  </div>
</div>

<div class="w"><span ${PUB}>How bad is your pain today? (1 = none, 10 = worst)</span>
  <div id="pain" role="slider" aria-valuemin="1" aria-valuemax="10" aria-valuenow="0" data-audit-category="personal" data-audit-pattern="P-rating" data-audit-block>
    ${Array.from({ length: 10 }, (_, i) => `<span class="pt" id="pt-${i + 1}" data-n="${i + 1}">${i + 1}</span>`).join('')}
  </div>
</div>

<div class="w"><label for="salary" ${PUB}>Household income per year</label><br>
  <input type="range" id="salary" min="0" max="300000" step="1000" value="0" style="width:400px" data-audit-category="personal" data-audit-pattern="P-slider-secret">
  <output id="salary-out" data-audit-category="personal" data-audit-pattern="P-slider-secret">€0</output>
  <div ${PUB}>Body weight</div>
  <div id="cs" role="slider" aria-valuemin="0" aria-valuemax="200" aria-valuenow="0" data-audit-category="personal" data-audit-pattern="P-slider-secret" data-audit-block><div id="thumb"></div></div>
  <span id="cs-out" data-audit-category="personal" data-audit-pattern="P-slider-secret">0 kg</span>
</div>

<button id="next" ${PUB}>Next</button>

<script>
const $=id=>document.getElementById(id);
document.querySelectorAll('.sw').forEach(s=>s.onclick=()=>{s.classList.toggle('on');s.setAttribute('aria-checked',s.classList.contains('on'))});
document.querySelectorAll('.seg').forEach(s=>s.onclick=()=>{document.querySelectorAll('.seg').forEach(x=>{x.classList.remove('on');x.setAttribute('aria-checked','false')});s.classList.add('on');s.setAttribute('aria-checked','true')});
document.querySelectorAll('.card').forEach(c=>{c.onmouseenter=()=>c.classList.add('hov');c.onmouseleave=()=>c.classList.remove('hov');
 c.onclick=()=>{document.querySelectorAll('.card').forEach(x=>{x.classList.remove('sel');x.setAttribute('aria-pressed','false')});c.classList.add('sel');c.setAttribute('aria-pressed','true')}});
const pts=[...document.querySelectorAll('.pt')];
pts.forEach(p=>{p.onmouseenter=()=>pts.forEach(x=>x.classList.toggle('hov',+x.dataset.n<=+p.dataset.n));
 p.onclick=()=>{pts.forEach(x=>x.classList.toggle('on',+x.dataset.n<=+p.dataset.n));$('pain').setAttribute('aria-valuenow',p.dataset.n);$('pain').setAttribute('aria-valuetext',p.dataset.n+' out of 10')}});
$('pain').onmouseleave=()=>pts.forEach(x=>x.classList.remove('hov'));
$('salary').oninput=e=>{$('salary-out').textContent='€'+(+e.target.value).toLocaleString('en-US')};
const cs=$('cs'),th=$('thumb');let drag=false;
const setW=x=>{const r=cs.getBoundingClientRect();const f=Math.max(0,Math.min(1,(x-r.left)/r.width));const kg=Math.round(f*200);th.style.left=(f*(r.width-12))+'px';cs.setAttribute('aria-valuenow',kg);$('cs-out').textContent=kg+' kg'};
th.addEventListener('pointerdown',e=>{drag=true;th.setPointerCapture(e.pointerId)});
th.addEventListener('pointermove',e=>{if(drag)setW(e.clientX)});
th.addEventListener('pointerup',()=>{drag=false});
</script></body></html>`,
  journeys: [
    {
      pattern: 'P-checkbox-radio',
      values: [{ hiv: 'no', symptoms: ['cough'] }, { hiv: 'yes', symptoms: ['chest-pain', 'night-sweats', 'weight-loss', 'fatigue'] }],
      async run(h, v) {
        await h.click(`#hiv-${v.hiv}`);
        for (const s of v.symptoms) await h.click(`#sym-${s}`);
      },
    },
    {
      pattern: 'P-custom-toggle',
      values: [{ on: [1], seg: 1 }, { on: [0, 2, 3], seg: 3 }],
      async run(h, v) {
        for (const i of v.on) await h.click(`#sw-${i}`);
        await h.click(`#seg-${v.seg}`);
      },
    },
    {
      pattern: 'P-choice-buttons',
      values: [0, 3],
      async run(h, i) {
        // Hover over the cards up to the chosen one, as a reader scanning the options would.
        for (let k = 0; k <= i; k++) await h.move(`#card-${k}`);
        await h.click(`#card-${i}`);
      },
    },
    {
      pattern: 'P-rating',
      values: [2, 9],
      async run(h, n) {
        for (let k = 1; k <= n; k++) await h.move(`#pt-${k}`);
        await h.click(`#pt-${n}`);
      },
    },
    {
      pattern: 'P-slider-secret',
      // Income 9,000 vs 255,000 and weight 58 vs 142 kg: different digit counts on both sliders.
      values: [{ salary: 0.03, weight: 0.29 }, { salary: 0.85, weight: 0.71 }],
      async run(h, v) {
        const r = await h.box('#salary');
        const thumbX = r.x + 8; // native thumb sits at the left edge for value 0
        await h.drag([[thumbX, r.y + r.height / 2], [r.x + 8 + (r.width - 16) * v.salary, r.y + r.height / 2]]);
        const t = await h.box('#thumb');
        const c = await h.box('#cs');
        await h.drag([[t.x + t.width / 2, t.y + t.height / 2], [c.x + c.width * v.weight, c.y + c.height / 2]]);
      },
    },
  ],
};
