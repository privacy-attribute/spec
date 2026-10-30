// Design-system web components: an address field whose input, echo text and state attribute live in an open shadow root.
export default {
  page: 'components',
  html: () => `<!doctype html><html><head><title>Delivery address</title><style>
.w{margin:6px;padding:4px;border:1px solid #ccc;display:inline-block;vertical-align:top}
</style></head><body>
<h2 data-audit-category="public" data-audit-pattern="P-public-next-to-private">Delivery address</h2>

<div class="w">
  <span data-audit-category="public" data-audit-pattern="P-public-next-to-private">Street and number</span><br>
  <ds-text-field id="addr" label="Street and number" data-audit-category="personal" data-audit-pattern="P-web-component"></ds-text-field>
  <button id="addr-save" data-audit-category="public" data-audit-pattern="P-public-next-to-private">Save address</button>
</div>

<script>
customElements.define('ds-text-field', class extends HTMLElement {
  connectedCallback() {
    const r = this.attachShadow({ mode: 'open' });
    r.innerHTML = '<style>input{width:280px}.hint{font-size:12px;color:#555}</style>'
      + '<label part="label" for="in">' + this.getAttribute('label') + '</label> '
      + '<input id="in" part="input" autocomplete="street-address" data-state="empty">'
      + '<div class="hint" id="hint">We deliver Monday to Saturday</div>';
    const input = r.getElementById('in');
    input.addEventListener('input', () => {
      input.setAttribute('data-state', input.value.length > 20 ? 'long' : input.value ? 'filled' : 'empty');
      this.setAttribute('value', input.value);
    });
    this.save = () => { r.getElementById('hint').textContent = 'Deliver to ' + input.value; };
  }
});
document.getElementById('addr-save').onclick = () => document.getElementById('addr').save();
</script></body></html>`,
  journeys: [
    {
      pattern: 'P-web-component',
      // Type into the shadow input (reached with the >>> deep selector), then save so the shadow hint echoes it.
      values: ['Dam 1', 'Jan van Galenstraat 112, 1056 CB Amsterdam'],
      async run(h, address) {
        await h.fill('#addr >>> #in', address, 60);
        await h.click('#addr-save');
      },
    },
  ],
};
