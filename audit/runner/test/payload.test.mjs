import assert from 'node:assert/strict';
import test from 'node:test';
import { inspectPayload, scorePayload } from '../lib/payload.mjs';

const snapshot = (node) => ({ type: 2, data: { node } });
const mutation = (data) => ({ type: 3, data: { source: 0, ...data } });

test('inspects late event data, nested values, and JSON property names across the whole recording', () => {
  const events = [
    snapshot({ childNodes: [{ attributes: { title: 'SecretSnapshot' } }] }),
    ...Array.from({ length: 512 }, () => ({ type: 4, data: { width: 1000 } })),
    { type: 6, data: { nested: [{ 'Secret/Key~Suffix': 'SecretLate' }] } },
  ];
  const { matches, channels } = inspectPayload(events, ['SecretSnapshot', 'SecretLate', 'Secret/Key~Suffix']);
  assert.deepEqual(matches.get('SecretSnapshot'), [
    { event: 0, channel: 'snapshot-attribute', path: '/data/node/childNodes/0/attributes/title' },
  ]);
  assert.deepEqual(matches.get('SecretLate'), [
    { event: 513, channel: 'plugin', path: '/data/nested/0/Secret~1Key~0Suffix' },
  ]);
  assert.deepEqual(matches.get('Secret/Key~Suffix'), [
    { event: 513, channel: 'plugin', path: '/data/nested/0/Secret~1Key~0Suffix', key: true },
  ]);
  assert.equal(channels.metadata, 512);
});

test('requires a positive control for absence and scores public data in its required channel and field', () => {
  const probes = [
    { name: 'hidden title', marker: 'HiddenTitle', private: true, channel: 'snapshot-attribute', field: 'title' },
    { name: 'missing control', marker: 'MissingControl', private: true, channel: 'input' },
    { name: 'cross-channel leak', marker: 'LeakedInput', private: true, channel: 'input' },
    { name: 'public text', marker: 'PublicText', channel: 'mutation-text' },
    { name: 'public title', marker: 'PublicTitle', channel: 'snapshot-attribute', field: 'title' },
    { name: 'public without control', marker: 'PublicAbsent', channel: 'mutation-text' },
  ];
  const reference = [
    snapshot({ attributes: { title: 'HiddenTitle PublicTitle' } }),
    mutation({ texts: [{ value: 'PublicText' }] }),
    { type: 3, data: { source: 5, text: 'LeakedInput' } },
  ];
  const events = [
    snapshot({ attributes: { placeholder: 'PublicTitle' }, textContent: 'PublicText' }),
    { type: 5, data: { payload: ['LeakedInput'] } },
  ];
  const score = scorePayload({ events, reference, probes });
  assert.deepEqual(score.private, { protected: 1, exposed: 1, unverified: 1 });
  assert.deepEqual(score.public, { retained: 0, lost: 2, unverified: 1 });
  assert.deepEqual(score.probes.map(({ status }) => status), ['protected', 'unverified', 'exposed', 'lost', 'lost', 'unverified']);
});

test('distinguishes mutation additions, text, attributes, and input events for positive controls', () => {
  const events = [
    mutation({ adds: [{ node: { textContent: 'Added' } }], texts: [{ value: 'Edited' }], attributes: [{ attributes: { value: 'Attribute' } }] }),
    { type: 3, data: { source: 5, text: 'Input' } },
  ];
  const probes = [
    ['Added', 'mutation-add'], ['Edited', 'mutation-text'], ['Attribute', 'mutation-attribute'], ['Input', 'input'],
  ].map(([marker, channel]) => ({ name: marker, marker, channel }));
  assert.deepEqual(scorePayload({ events, reference: events, probes }).public, { retained: 4, lost: 0, unverified: 0 });
});
