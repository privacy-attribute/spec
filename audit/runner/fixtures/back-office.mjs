// Support and admin back office: user table, customer record, live chat, comments,
// a lazy-loaded contact list and a shared document with presence cursors.
// Widgets a careful integrator would block carry data-audit-block.
const PEOPLE_A = ['Ann Lee', 'Bo Chan', 'Cy Diaz', 'Di Eng', 'Ed Fox', 'Flo Gu', 'Gil Ho', 'Hal Ito', 'Ida Jo', 'Jo Ka', 'Kai Lu', 'Lia Mo'];
const PEOPLE_B = ['Maximilian Oppenheimer', 'Nkechi Adeyemi-Okafor', 'Olafur Ragnarsson', 'Priyanka Venkataraman', 'Quentin Beaumont-Laurier', 'Rosalind Fairweather', 'Siddharth Chakraborty', 'Theodora Papadopoulou', 'Ulrich Hohenstein', 'Valentina Castellanos', 'Wilhelmina Vanderbilt', 'Xavier Montgomery'];
const slug = (n) => n.toLowerCase().replace(/[^a-z]+/g, '-');
const color = (n) => [...n].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 0xffffff, 7).toString(16).padStart(6, '0');
const email = (n) => `${slug(n).replace(/-/g, '.')}@corp.example`;

export default {
  page: 'back-office',
  html: (v) => {
    const crm = v['P-crm-record'];
    const users = v['P-admin-table'];
    return `<!doctype html><html><head><title>Helpdesk · ${crm.name}</title><style>
.w{margin:6px;padding:4px;border:1px solid #ccc;display:inline-block;vertical-align:top;max-width:460px}
.av{width:20px;height:20px;vertical-align:middle}
td,th{padding:1px 4px;font-size:12px;text-align:left}
#contacts{height:90px;width:260px;overflow:auto}
#contacts li{height:22px}
#doc{position:relative;width:300px;min-height:60px;border:1px solid #999;padding:4px}
.cursor{position:absolute;font-size:10px;background:#fc0;padding:0 2px}
</style></head><body>
<section class="w">
  <h3 data-audit-category="public" data-audit-pattern="P-public-next-to-private">Users</h3>
  <input id="usearch" placeholder="Search users" data-audit-category="third-party" data-audit-pattern="P-admin-table">
  <table id="utable" data-audit-category="third-party" data-audit-pattern="P-admin-table">
    <thead><tr><th id="sort-name">Name</th><th>Email</th><th>Role</th><th>Last login</th></tr></thead>
    <tbody>${users.slice(0, 10).map((n, i) => `<tr><td><img class="av" src="/img.svg?c=${color(n)}" title="${n}" alt="">${n}</td><td>${email(n)}</td><td>${i % 3 ? 'member' : 'admin'}</td><td>2026-10-${String(10 + i).padStart(2, '0')}</td></tr>`).join('')}</tbody>
  </table>
</section>

<section class="w">
  <h3 data-audit-category="public" data-audit-pattern="P-public-next-to-private">Customer</h3>
  <div id="crm" data-audit-category="third-party" data-audit-pattern="P-crm-record" data-customer-id="${crm.id}">
    <img id="crm-photo" src="/img.svg?c=${color(crm.name)}" width="40" height="40" alt="Photo of ${crm.name}">
    <b>${crm.name}</b> <a href="mailto:${crm.email}">${crm.email}</a>
    <p>Notes: ${crm.notes}</p>
    <ul id="orders">${crm.orders.map((o) => `<li>${o}</li>`).join('')}</ul>
  </div>
  <button id="crm-orders" data-audit-category="public" data-audit-pattern="P-public-next-to-private">View orders</button>
</section>

<section class="w">
  <button id="open-chat" data-audit-category="public" data-audit-pattern="P-public-next-to-private">Open conversation</button>
  <div id="msgs" data-audit-category="third-party" data-audit-pattern="P-chat-thread"></div>
  <div id="typing" data-audit-category="third-party" data-audit-pattern="P-chat-thread"></div>
</section>

<section class="w" id="comments">
  <h3 data-audit-category="public" data-audit-pattern="P-public-next-to-private">Comments</h3>
  ${v['P-comments'].map(([n, t], i) => `<div class="cmt" id="cmt-${i}" data-audit-category="third-party" data-audit-pattern="P-comments"><img class="av" src="/img.svg?c=${color(n)}" title="${n}" alt=""><a href="/users/${slug(n)}" data-user="${slug(n)}">${n}</a>: ${t}</div>`).join('')}
</section>

<section class="w">
  <h3 data-audit-category="public" data-audit-pattern="P-public-next-to-private">Contacts</h3>
  <div id="contacts" data-audit-category="third-party" data-audit-pattern="P-virtual-list"><ul id="clist"></ul></div>
</section>

<section class="w">
  <h3 data-audit-category="public" data-audit-pattern="P-public-next-to-private">Q4 plan (shared)</h3>
  <div id="doc" data-audit-category="third-party" data-audit-pattern="P-shared-doc">
    <p id="doctext" contenteditable="true">Quarterly plan draft. Budget review pending.</p>
  </div>
</section>

<script>
const $=id=>document.getElementById(id);
// Users table: search filters rows, sorting by name puts the order in the URL.
$('usearch').addEventListener('input',e=>{const q=e.target.value.toLowerCase();[...$('utable').tBodies[0].rows].forEach(r=>{r.style.display=r.cells[0].textContent.toLowerCase().includes(q)?'':'none'})});
$('sort-name').onclick=()=>{const b=$('utable').tBodies[0];[...b.rows].sort((x,y)=>x.cells[0].textContent.localeCompare(y.cells[0].textContent)).forEach(r=>b.appendChild(r));history.replaceState(null,'',location.pathname+location.search+'&sort=name')};
// Customer record: viewing orders puts the customer id in the URL and title.
const crm=${JSON.stringify(crm)};
$('crm-orders').onclick=()=>{history.replaceState(null,'',location.pathname+location.search+'&customer='+crm.id+'&tab=orders');document.title='Orders · '+crm.name;$('orders').insertAdjacentHTML('beforeend','<li>Total: '+crm.total+'</li>')};
// Chat: messages from the customer arrive after the conversation opens.
const chat=${JSON.stringify(v['P-chat-thread'])};
$('open-chat').onclick=async()=>{for(const m of chat.messages){$('typing').textContent=chat.from+' is typing…';await new Promise(r=>setTimeout(r,120));$('typing').textContent='';const d=document.createElement('div');d.innerHTML='<img class="av" src="/img.svg?c='+chat.color+'" title="'+chat.from+'" alt=""> <b></b>: <span></span>';d.querySelector('b').textContent=chat.from;d.querySelector('span').textContent=m;$('msgs').appendChild(d)}};
// Contacts: rows are rendered lazily as the list scrolls.
const P=${JSON.stringify(v['P-virtual-list'])};let shown=0;
const more=()=>{const c=$('contacts');while(shown<P.length&&shown*22<c.scrollTop+c.clientHeight+22){const li=document.createElement('li');li.textContent=P[shown]+' · '+P[shown].split(' ')[0].toLowerCase()+'@corp.example';$('clist').appendChild(li);shown++}};
more();$('contacts').addEventListener('scroll',more);
// Shared doc: collaborators' presence cursors and edits arrive from the server.
const doc=${JSON.stringify(v['P-shared-doc'])};
window.__collab=()=>{doc.collaborators.forEach((n,i)=>{const c=document.createElement('span');c.className='cursor';c.style.left=(40+i*90)+'px';c.style.top=(30+i*12)+'px';c.textContent=n;$('doc').appendChild(c)});$('doctext').append(' '+doc.edit)};
</script></body></html>`;
  },
  journeys: [
    {
      pattern: 'P-admin-table',
      values: [PEOPLE_A, PEOPLE_B],
      async run(h, people) {
        await h.click('#sort-name');
        await h.fill('#usearch', people[3].slice(0, 3), 110);
      },
    },
    {
      pattern: 'P-crm-record',
      values: [
        { id: 'c-1001', name: 'Ann Lee', email: 'ann@mail.example', notes: 'Prefers email', orders: ['#1001 Lens cap'], total: '€9' },
        { id: 'c-948372', name: 'Maximilian Oppenheimer', email: 'max.oppenheimer@clinic.example', notes: 'Chemotherapy patient, call after 5pm, speak to his wife Ilse', orders: ['#2044 Camera bag', '#2051 Tripod', '#2090 Memory card 64GB'], total: '€1,284.90' },
      ],
      async run(h) {
        await h.move('#crm');
        await h.click('#crm-orders');
      },
    },
    {
      pattern: 'P-chat-thread',
      values: [
        { from: 'Bo', color: 'aa3333', messages: ['hi'] },
        { from: 'Nkechi Adeyemi-Okafor', color: '3355cc', messages: ['Did you get the lab results?', 'My HIV test came back positive', 'Please keep this private'] },
      ],
      async run(h) {
        await h.click('#open-chat');
        await h.wait(600);
      },
    },
    {
      pattern: 'P-comments',
      values: [
        [['Bo Chan', 'nice']],
        [['Priyanka Venkataraman', 'Terrible service, refund me now'], ['Ulrich Hohenstein', 'Agreed, @Priyanka Venkataraman, same here']],
      ],
      async run(h) {
        await h.move('#cmt-0 a');
      },
    },
    {
      pattern: 'P-virtual-list',
      values: [PEOPLE_A, PEOPLE_B],
      async run(h) {
        await h.move('#contacts');
        for (let i = 0; i < 3; i++) {
          await h.page.mouse.wheel({ deltaY: 66 });
          await h.wait(250);
        }
      },
    },
    {
      pattern: 'P-shared-doc',
      values: [
        { collaborators: ['Bo Chan'], edit: 'ok' },
        { collaborators: ['Theodora Papadopoulou', 'Siddharth Chakraborty'], edit: 'Cut Ulrich Hohenstein from the team after his sick leave.' },
      ],
      async run(h) {
        await h.page.evaluate(() => window.__collab());
        await h.wait(100);
        // Select a word in the document, next to the collaborators' cursors.
        const b = await h.box('#doctext');
        await h.page.mouse.click(b.x + 30, b.y + b.height / 2, { clickCount: 2 });
        await h.wait(150);
        // Extend the selection to the end of the paragraph, over the collaborator's edit.
        await h.page.keyboard.down('Shift');
        await h.press('End');
        await h.page.keyboard.up('Shift');
        await h.wait(150);
      },
    },
  ],
};
