// Pointer and touch secret entry. Widgets a careful integrator would block carry data-audit-block.
const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0];

export default {
  page: 'secure-entry',
  html: (v) => `<!doctype html><html><head><title>Unlock</title><style>
.w{margin:6px;padding:4px;border:1px solid #ccc;display:inline-block;vertical-align:top}
.k{width:40px;height:40px;margin:1px}.k.on{background:#ccc}
.dot{width:36px;height:36px;margin:6px;border-radius:18px;background:#ddd;display:inline-block}.dot.hit{background:#e33}
.pic{width:48px;height:48px;margin:2px;display:inline-block;border:2px solid transparent}.pic.sel{border-color:blue}
</style></head><body>
<h2 data-audit-category="public" data-audit-pattern="P-public-next-to-private">Enter your PIN</h2>

<div id="pin" class="w" data-audit-category="secret" data-audit-pattern="P-pin-pad" data-audit-block>
  <div id="pin-dots"></div>
  <div id="pad">${digits.map((d) => `<button class="k" data-key="${d}" aria-label="digit ${d}">${d}</button>${d % 3 === 0 ? '<br>' : ''}`).join('')}</div>
</div>
<a href="/forgot" data-audit-category="public" data-audit-pattern="P-public-next-to-private">Forgot PIN?</a>

<div id="spad" class="w" data-audit-category="secret" data-audit-pattern="P-shuffled-pad" data-audit-block>
  <div id="spad-dots"></div>
  <div id="skeys">${digits.map((_, i) => `<button class="k s">?</button>${i % 3 === 2 ? '<br>' : ''}`).join('')}</div>
</div>

<div id="vkb" class="w" data-audit-category="secret" data-audit-pattern="P-virtual-keyboard" data-audit-block>
  <input id="vkb-out" type="password" readonly>
  <div>${'qwertyuiop|asdfghjkl|zxcvbnm'.split('|').map((r) => r.split('').map((c) => `<button class="k v" data-c="${c}">${c}</button>`).join('')).join('<br>')}<br><button id="shift" class="k" style="width:60px">shift</button></div>
</div>

<div id="plock" class="w" style="width:150px;touch-action:none" data-audit-category="secret" data-audit-pattern="P-pattern-lock" data-audit-block>
  ${Array.from({ length: 9 }, (_, i) => `<div class="dot" data-i="${i}"></div>`).join('')}
</div>

<div id="pics" class="w" style="width:170px" data-audit-category="secret" data-audit-pattern="P-picture-password" data-audit-block>
  ${['cat', 'dog', 'sun', 'car', 'tree', 'boat'].map((n, i) => `<div class="pic" data-i="${i}" title="${n}" style="background:hsl(${i * 60},70%,60%)">${n}</div>`).join('')}
</div>

<div class="w" data-audit-category="personal" data-audit-pattern="P-signature-pad" data-audit-block>
  <canvas id="sig" width="200" height="100"></canvas>
</div>

<script>
let pin='';document.querySelectorAll('#pad .k').forEach(b=>{b.onpointerdown=()=>b.classList.add('on');b.onpointerup=()=>b.classList.remove('on');b.onclick=()=>{pin+=b.dataset.key;document.getElementById('pin-dots').textContent='•'.repeat(pin.length)}});
let s=${Number(v['P-shuffled-pad'].seed)};const rnd=()=>{s=(s*9301+49297)%233280;return s/233280};const order=[0,1,2,3,4,5,6,7,8,9].sort(()=>rnd()-0.5);
let spin='';document.querySelectorAll('.s').forEach((b,i)=>{b.textContent=order[i];b.dataset.key=order[i];b.onclick=()=>{spin+=b.dataset.key;document.getElementById('spad-dots').textContent='•'.repeat(spin.length)}});
let up=false;document.getElementById('shift').onclick=()=>{up=!up;document.getElementById('vkb').classList.toggle('shift',up)};
document.querySelectorAll('.v').forEach(b=>b.onclick=()=>{document.getElementById('vkb-out').value+=up?b.dataset.c.toUpperCase():b.dataset.c});
let drawing=false;document.getElementById('plock').addEventListener('pointerdown',()=>{drawing=true});document.addEventListener('pointerup',()=>{drawing=false});
document.querySelectorAll('.dot').forEach(d=>d.addEventListener('pointerenter',()=>{if(drawing)d.classList.add('hit')}));
document.querySelectorAll('.pic').forEach(p=>p.onclick=()=>p.classList.add('sel'));
const c=document.getElementById('sig'),x=c.getContext('2d');let pen=false;c.onpointerdown=e=>{pen=true;x.beginPath();x.moveTo(e.offsetX,e.offsetY)};c.onpointermove=e=>{if(pen){x.lineTo(e.offsetX,e.offsetY);x.stroke()}};c.onpointerup=()=>pen=false;
</script></body></html>`,
  journeys: [
    {
      pattern: 'P-pin-pad',
      values: ['1397', '8240'],
      async run(h, pin) {
        for (const d of pin) await h.click(`#pad .k[data-key="${d}"]`);
      },
    },
    {
      pattern: 'P-shuffled-pad',
      // Same PIN, different per-session key order: tests whether the order reaches the recording.
      values: [{ seed: 1, pin: '1397' }, { seed: 7, pin: '1397' }],
      async run(h, v) {
        for (const d of v.pin) {
          const idx = await h.page.$$eval('.s', (bs, d) => bs.findIndex((b) => b.textContent === d), d);
          await h.click(`#skeys .s:nth-of-type(${idx + 1})`);
        }
      },
    },
    {
      pattern: 'P-virtual-keyboard',
      values: ['cat', 'SeCret'],
      async run(h, pw) {
        let up = false;
        for (const ch of pw) {
          const isUp = ch !== ch.toLowerCase();
          if (isUp !== up) { await h.click('#shift'); up = isUp; }
          await h.click(`.v[data-c="${ch.toLowerCase()}"]`);
        }
      },
    },
    {
      pattern: 'P-pattern-lock',
      values: [[0, 1, 2, 5, 8], [6, 3, 0, 4, 8]],
      async run(h, seq) {
        const pts = [];
        for (const i of seq) {
          const b = await h.box(`.dot[data-i="${i}"]`);
          pts.push([b.x + b.width / 2, b.y + b.height / 2]);
        }
        await h.drag(pts);
      },
    },
    {
      pattern: 'P-picture-password',
      values: [[0, 3, 5], [5, 1, 2]],
      async run(h, picks) {
        for (const i of picks) await h.click(`.pic[data-i="${i}"]`);
      },
    },
    {
      pattern: 'P-signature-pad',
      values: ['circle', 'zigzag'],
      async run(h, shape) {
        const b = await h.box('#sig');
        const pts = shape === 'circle'
          ? Array.from({ length: 12 }, (_, i) => [100 + 40 * Math.cos(i / 1.9), 50 + 30 * Math.sin(i / 1.9)])
          : [[20, 20], [180, 20], [20, 80], [180, 80]];
        await h.drag(pts.map(([x, y]) => [b.x + x, b.y + y]));
      },
    },
  ],
};
