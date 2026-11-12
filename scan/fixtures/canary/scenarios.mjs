const snapshotText = 'snapshot-text';
const snapshotAttr = 'snapshot-attribute';
const mutationText = 'mutation-text';
const mutationAttr = 'mutation-attribute';
const added = 'mutation-add';

const probe = (name, channel, secret, field) => ({
  name, channel, private: secret,
  marker: `Cny${secret ? 'Private' : 'Public'}${name.replaceAll(/[^a-zA-Z0-9]/g, '')}Z9`,
  ...(field && { field }),
});

export const appProbes = [
  { name: 'heading', marker: 'CanaryPublicHeading', channel: snapshotText },
  { name: 'notes label', marker: 'CanaryPublicNotesLabel', channel: snapshotText },
  { name: 'notes hint', marker: 'CanaryPublicHint', channel: snapshotText },
  { name: 'help text', marker: 'CanaryPublicHelp', channel: snapshotText },
  { name: 'help title', marker: 'CanaryPublicTitle', channel: snapshotAttr, field: 'title' },
  { name: 'button text', marker: 'CanaryPublicButton', channel: snapshotText },
  { name: 'idle status', marker: 'CanaryPublicIdle', channel: snapshotText },
  probe('active status', mutationText, false),
  probe('name snapshot', snapshotText, true),
  probe('name mutation', mutationText, true),
  probe('contact snapshot', snapshotText, true),
  probe('contact mutation', mutationText, true),
  probe('input snapshot', snapshotAttr, true, 'value'),
  probe('input value attribute mutation', mutationAttr, true, 'value'),
  probe('input event', 'input', true),
  probe('key snapshot', snapshotAttr, true, 'data-token'),
  probe('key attribute mutation', mutationAttr, true, 'data-token'),
  probe('key text mutation', mutationText, true),
];

export const capabilityProbes = [
  probe('plain text snapshot', snapshotText, false),
  probe('plain text mutation', mutationText, false),
  probe('plain title mutation', mutationAttr, false, 'title'),
  probe('mask descendant text snapshot', snapshotText, true),
  probe('mask descendant text mutation', mutationText, true),
  probe('mask added descendant', added, true),
  probe('mask title snapshot', snapshotAttr, true, 'title'),
  probe('mask title mutation', mutationAttr, true, 'title'),
  probe('mask aria label snapshot', snapshotAttr, true, 'aria-label'),
  probe('mask aria label mutation', mutationAttr, true, 'aria-label'),
  probe('mask placeholder snapshot', snapshotAttr, true, 'placeholder'),
  probe('mask placeholder mutation', mutationAttr, true, 'placeholder'),
  probe('mask input snapshot', snapshotAttr, true, 'value'),
  probe('mask input attribute mutation', mutationAttr, true, 'value'),
  probe('mask input event', 'input', true),
  probe('mask textarea snapshot', snapshotAttr, true, 'value'),
  probe('mask textarea event', 'input', true),
  probe('unknown token snapshot', snapshotText, true),
  probe('empty token snapshot', snapshotText, true),
  probe('case sensitive token snapshot', snapshotText, true),
  probe('nested mask snapshot', snapshotText, true),
  probe('blocked descendant snapshot', snapshotText, true),
  probe('blocked own attribute snapshot', snapshotAttr, true, 'data-token'),
  probe('blocked added descendant', added, true),
  probe('mask enabled then mutated', mutationText, true),
  probe('mutated then mask relaxed same turn', mutationText, true),
  probe('mutated after mask relaxed', mutationText, false),
  probe('moved under mask', added, true),
  probe('moved outside mask', mutationText, false),
  probe('shadow mask descendant snapshot', snapshotText, true),
  probe('shadow mask descendant mutation', mutationText, true),
  probe('shadow mask added descendant', added, true),
  probe('public shadow snapshot', snapshotText, false),
  probe('blocked shadow descendant snapshot', snapshotText, true),
];

const markerLookup = (probes) => Object.fromEntries(probes.map(({ name, marker }) => [name, marker]));

export function appFixture(render) {
  const marker = markerLookup(appProbes);
  const root = render({
    user: { fullName: marker['name snapshot'], notes: marker['input snapshot'] },
    customer: { handleCode: marker['contact snapshot'] },
    account: { apiKey: marker['key snapshot'] },
  });
  const select = (id) => root.querySelector(`#canary-${id}`);
  select('button').onclick = () => { select('status').firstChild.data = marker['active status']; };
  return {
    root,
    async drive({ fill, settle }) {
      select('button').click();
      select('name').firstChild.data = marker['name mutation'];
      select('customer').firstChild.data = marker['contact mutation'];
      select('key').setAttribute('data-token', marker['key attribute mutation']);
      select('key').firstChild.data = marker['key text mutation'];
      select('notes').setAttribute('value', marker['input value attribute mutation']);
      await settle();
      await fill('#canary-notes', marker['input event']);
    },
  };
}

function element(tag, text, attributes = {}) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  if (text) node.textContent = text;
  return node;
}

export function capabilityFixture() {
  const m = markerLookup(capabilityProbes);
  const root = element('main');
  const privacy = (value) => ({ 'data-privacy': value });
  const plain = element('p', m['plain text snapshot']);
  const masked = element('section', null, { ...privacy('mask'), title: m['mask title snapshot'], 'aria-label': m['mask aria label snapshot'] });
  const maskedText = element('span', m['mask descendant text snapshot']);
  const input = element('input', null, { id: 'capability-input', value: m['mask input snapshot'], placeholder: m['mask placeholder snapshot'] });
  const textarea = element('textarea', m['mask textarea snapshot'], { id: 'capability-textarea' });
  masked.append(maskedText, input, textarea, element('span', m['nested mask snapshot'], privacy('unmask')));
  const blocked = element('section', null, { ...privacy('block'), 'data-token': m['blocked own attribute snapshot'] });
  blocked.append(element('span', m['blocked descendant snapshot'], privacy('unmask')));
  const plainDestination = element('div');
  const maskDestination = element('div', null, privacy('mask'));
  const moving = element('p', 'Canary move control');
  plainDestination.append(moving);
  const toggle = element('div', 'Canary transition control');
  const shadow = element('div', null, privacy('mask'));
  const shadowRoot = shadow.attachShadow({ mode: 'open' });
  const shadowChild = element('span', m['shadow mask descendant snapshot']);
  shadowRoot.append(shadowChild);
  const publicShadow = element('div');
  publicShadow.attachShadow({ mode: 'open' }).append(element('span', m['public shadow snapshot']));
  const blockedShadow = element('div', null, privacy('block'));
  blockedShadow.attachShadow({ mode: 'open' }).append(element('span', m['blocked shadow descendant snapshot']));
  root.append(
    plain, masked, blocked, plainDestination, maskDestination, toggle, shadow, publicShadow, blockedShadow,
    element('p', m['unknown token snapshot'], privacy('msak')),
    element('p', m['empty token snapshot'], privacy('')),
    element('p', m['case sensitive token snapshot'], privacy('MASK')),
  );
  return {
    root,
    async drive({ fill, settle }) {
      plain.firstChild.data = m['plain text mutation'];
      plain.setAttribute('title', m['plain title mutation']);
      maskedText.firstChild.data = m['mask descendant text mutation'];
      masked.append(element('span', m['mask added descendant']));
      masked.setAttribute('title', m['mask title mutation']);
      masked.setAttribute('aria-label', m['mask aria label mutation']);
      input.setAttribute('placeholder', m['mask placeholder mutation']);
      input.setAttribute('value', m['mask input attribute mutation']);
      blocked.append(element('span', m['blocked added descendant']));
      shadowChild.firstChild.data = m['shadow mask descendant mutation'];
      shadowRoot.append(element('span', m['shadow mask added descendant']));
      toggle.setAttribute('data-privacy', 'mask');
      toggle.firstChild.data = m['mask enabled then mutated'];
      moving.firstChild.data = m['moved under mask'];
      maskDestination.append(moving);
      await settle();
      toggle.firstChild.data = m['mutated then mask relaxed same turn'];
      toggle.removeAttribute('data-privacy');
      await settle();
      toggle.firstChild.data = m['mutated after mask relaxed'];
      plainDestination.append(moving);
      await settle();
      moving.firstChild.data = m['moved outside mask'];
      await fill('#capability-input', m['mask input event']);
      await fill('#capability-textarea', m['mask textarea event']);
    },
  };
}
