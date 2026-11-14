import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { inventory } from '../review/inventory.mjs';
import { spansFor } from '../templates.mjs';

function fixture(t, sources) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'privacy-review-inventory-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const [file, source] of Object.entries(sources)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), source);
  }
  return root;
}

function assertExact(site, source) {
  assert.equal(source.slice(site.start, site.end), site.expression);
  const lines = source.slice(0, site.start).split('\n');
  assert.equal(site.line, lines.length);
  assert.equal(site.column, lines.at(-1).length);
  assert.ok(source.slice(site.target.start, site.target.open_end).startsWith(`<${site.tag}`));
}

test('inventories exact JSX slots without classifying privacy or including static layout and handlers', (t) => {
  const app = [
    'import { makeValue } from "../data.js";',
    'import { Display } from "./parts";',
    'export const App = ({ status, value, result, name, email, extra }) => (',
    '  <section className="layout" style={{ padding: 4 }} key={result} ref={extra}>',
    '    <h1>Account 🎉</h1>',
    '    <span title={status} aria-label={name} data-current={result}>{value ?? email}</span>',
    '    <span>{name || email}</span>',
    '    {status && <output>{result}</output>}',
    '    <Display value={value} result={result} {...extra} onClick={() => makeValue()}>Help</Display>',
    '    <input type="checkbox" onChange={() => {}} />',
    '    <input defaultValue={value} className={status ? "ok" : "warning"} />',
    '    <textarea />',
    '  </section>',
    ');',
    '',
  ].join('\r\n');
  const root = fixture(t, {
    'ui/App.tsx': app,
    'ui/parts/index.tsx': 'export const Display = ({ value }) => <p>{value}</p>;',
    'data.ts': 'throw new Error("This app module must not be executed."); export const makeValue = () => 0;',
  });

  const result = inventory(root, { include: ['ui/App.tsx'] });
  assert.equal(result.schema_version, 1);
  assert.equal(result.root, fs.realpathSync(root));
  assert.deepEqual(result.failures, []);
  assert.deepEqual(result.files, [{
    file: 'ui/App.tsx',
    sha256: createHash('sha256').update(app).digest('hex'),
    language: 'tsx',
    status: 'parsed',
    imports: ['data.ts', 'ui/parts/index.tsx'],
    component_uses: [{ tag: 'Display', line: 9, column: 4 }],
  }]);
  assert.deepEqual(result, inventory(root, { include: ['./ui/App.tsx', 'ui/App.tsx'] }));
  assert.equal(new Set(result.sites.map(({ id }) => id)).size, result.sites.length);
  for (const site of result.sites) {
    assertExact(site, app);
    assert.ok(!Object.hasOwn(site, 'category'));
    assert.match(site.id, /^S-[a-f0-9]{64}$/);
  }
  assert.deepEqual(result.sites.map(({ start }) => start), result.sites.map(({ start }) => start).sort((a, b) => a - b));

  const at = (tag, channel) => result.sites.filter((site) => site.tag === tag && site.channel === channel);
  assert.deepEqual(at('h1', 'text').map(({ expression }) => expression), ['Account 🎉']);
  assert.deepEqual(at('span', 'text').map(({ expression }) => expression), ['value', 'email', 'name', 'email']);
  assert.deepEqual(at('span', 'conditional'), []);
  assert.equal(at('span', 'attribute:title')[0].expression, 'status');
  assert.equal(at('span', 'attribute:aria-label')[0].expression, 'name');
  assert.equal(at('span', 'attribute:data-current')[0].expression, 'result');
  assert.equal(at('section', 'conditional')[0].expression, 'status');
  assert.deepEqual(at('Display', 'prop:value').map(({ expression, native }) => [expression, native]), [['value', false]]);
  assert.equal(at('Display', 'prop:result')[0].expression, 'result');
  assert.equal(at('Display', 'spread')[0].expression, 'extra');
  assert.equal(at('Display', 'text')[0].expression, 'Help');
  assert.equal(at('input', 'input:checked').length, 1);
  assert.equal(at('input', 'input:defaultValue')[0].expression, 'value');
  assert.equal(at('input', 'attribute:className')[0].expression, 'status ? "ok" : "warning"');
  assert.equal(at('textarea', 'input').length, 1);
  assert.ok(result.sites.every(({ channel }) => !/:(?:key|ref|style|onClick|onChange)$/.test(channel)));
});

test('lists component uses without treating the tag names as rendered values', (t) => {
  const root = fixture(t, {
    'App.tsx': [
      'import { Dialog } from "./dialog";',
      'export const App = () => <main>',
      '  <Dialog />',
      '  <Dialog.Content><Help onDismiss={() => {}} /></Dialog.Content>',
      '  <span>Continue</span>',
      '</main>;',
    ].join('\n'),
    'dialog.tsx': 'export const Dialog = () => null;',
  });
  const { files, sites, failures } = inventory(root, { include: ['App.tsx'] });
  assert.deepEqual(failures, []);
  assert.deepEqual(files[0].imports, ['dialog.tsx']);
  assert.deepEqual(files[0].component_uses, [
    { tag: 'Dialog', line: 3, column: 2 },
    { tag: 'Dialog.Content', line: 4, column: 2 },
    { tag: 'Help', line: 4, column: 18 },
  ]);
  assert.deepEqual(sites.map(({ expression }) => expression), ['Continue']);
});

test('flags scalar and opaque React portal children without using the caller as their owner', (t) => {
  const source = [
    'import { createPortal as mount } from "react-dom";',
    'import * as ReactDOM from "react-dom";',
    'import { createPortal } from "./unrelated";',
    'export const Popup = ({ shown, email, label, body }) => <main>',
    '  {mount(shown ? email : <span>{label}</span>, document.body)}',
    '  {ReactDOM.createPortal(body, document.body)}',
    '  {ReactDOM.createPortal([null, <span>Help</span>], document.body)}',
    '</main>;',
    'export const other = (email) => createPortal(email);',
  ].join('\n');
  const root = fixture(t, {
    'Overlay.tsx': source,
    'unrelated.ts': 'export const createPortal = (email) => email;',
  });
  const { files, sites, failures } = inventory(root);
  assert.equal(files[0].status, 'unsupported');
  assert.deepEqual(failures.map(({ status, channel, start, end }) => [status, channel, source.slice(start, end)]), [
    ['unsupported', 'portal-child', 'email'],
    ['unsupported', 'portal-child', 'body'],
  ]);
  assert.deepEqual(sites.map(({ tag, channel, expression }) => [tag, channel, expression]), [
    ['span', 'conditional', 'shown'],
    ['span', 'text', 'label'],
    ['span', 'text', 'Help'],
  ]);
});

test('preserves all supported template targets and source intervals across markup formats', (t) => {
  const sources = {
    'App.vue': [
      '<script setup lang="ts">import { value } from "./data";</script>',
      '<template>',
      '  <Input :value="value" @update="onUpdate"><b>Title {{ status }}</b></Input>',
      '  <div v-if="status" v-bind="attrs" :title="value" class="layout" :style="style">{{ result }}</div>',
      '  <input type="password">',
      '</template>',
    ].join('\n'),
    'App.svelte': [
      '<script lang="ts">import { value } from "./data";</script>',
      '<main>',
      '  {#if status}<Widget value={value} {...rest} on:click={update} />{/if}',
      '  <span title="Value {value}, status {status}">Text {result}</span>',
      '  <textarea bind:value={value} />',
      '  {@html html}',
      '</main>',
    ].join('\n'),
    'index.blade.php': [
      '<div>',
      '  <x-field :value="$value" :status="$status" />',
      '  <span title="{{ $value }}" data-status="{{ $status }}">Status {{ $result }}</span>',
      '  @if($status)<strong>{!! $html !!}</strong>@endif',
      '  <input>',
      '</div>',
    ].join('\n'),
    'index.html': '<DIV><INPUT type="checkbox"><p title="Help">Read this</p></DIV>',
    'data.ts': 'export const value = "value";',
  };
  const result = inventory(fixture(t, sources));
  assert.deepEqual(result.failures, []);
  for (const site of result.sites) {
    assertExact(site, sources[site.file]);
    const span = spansFor(site.file, sources[site.file]).find((span) => span[5] === site.target.start);
    assert.ok(span, site.file);
    assert.deepEqual(site.target, { line: span[0], column: span[4], start: span[5], end: span[6], open_end: span[7] });
  }
  const slots = (file, tag, channel) => result.sites.filter((site) => site.file === file && site.tag === tag && site.channel === channel);
  const show = (file, tag, channel) => slots(file, tag, channel).map(({ expression }) => expression);
  assert.deepEqual(show('App.vue', 'Input', 'prop:value'), ['value']);
  assert.equal(slots('App.vue', 'Input', 'prop:value')[0].native, false);
  assert.deepEqual(show('App.vue', 'b', 'text'), ['Title', 'status']);
  assert.deepEqual(show('App.vue', 'div', 'conditional'), ['status']);
  assert.deepEqual(show('App.vue', 'div', 'spread'), ['attrs']);
  assert.deepEqual(show('App.vue', 'div', 'attribute:style'), ['style']);
  assert.deepEqual(show('App.vue', 'div', 'attribute:class'), []);
  assert.deepEqual(show('App.vue', 'input', 'input'), ['input']);
  assert.deepEqual(show('App.svelte', 'Widget', 'spread'), ['rest']);
  assert.deepEqual(show('App.svelte', 'span', 'attribute:title'), ['Value', 'value', ', status', 'status']);
  assert.deepEqual(show('App.svelte', 'main', 'conditional'), ['status']);
  assert.deepEqual(show('App.svelte', 'main', 'html'), ['html']);
  assert.deepEqual(show('App.svelte', 'textarea', 'input:value'), ['value']);
  assert.deepEqual(show('index.blade.php', 'x-field', 'prop:status'), ['$status']);
  assert.deepEqual(show('index.blade.php', 'span', 'text'), ['Status', '$result']);
  assert.deepEqual(show('index.blade.php', 'strong', 'html'), ['$html']);
  assert.deepEqual(show('index.html', 'INPUT', 'input:checked'), ['INPUT']);
  assert.deepEqual(show('index.html', 'p', 'text'), ['Read this']);
  assert.deepEqual(result.files.filter(({ imports }) => imports).map(({ imports }) => imports), [['data.ts'], ['data.ts']]);
});

test('makes unsupported and failed destinations visible alongside verified element sites', (t) => {
  const root = fixture(t, {
    'Invalid.tsx': 'export const broken = () => <p>',
    'Route.astro': '<p>{status}</p>',
    'view.tsx': [
      'document.title = status;',
      'const result = condition ? <p>{status}</p> : <span>{value}</span>;',
      'export default <>{result}<i>{item}</i></>;',
    ].join('\n'),
    'page.vue': '<template lang="pug">p {{ value }}</template>',
    'a-source.txt': 'explicitly scoped unknown source',
    'bad.js': Buffer.from([0xff, 0xfe]),
  });
  const { files, sites, failures } = inventory(root, { include: ['Invalid.tsx', 'Route.astro', 'view.tsx', 'page.vue', 'a-source.txt', 'bad.js', 'missing.tsx'] });
  assert.deepEqual(files.map(({ file, status }) => [file, status]), [
    ['Invalid.tsx', 'failed'],
    ['Route.astro', 'unsupported'],
    ['a-source.txt', 'unsupported'],
    ['bad.js', 'failed'],
    ['page.vue', 'unsupported'],
    ['view.tsx', 'unsupported'],
  ]);
  assert.equal(files.find(({ file }) => file === 'bad.js').sha256, createHash('sha256').update(Buffer.from([0xff, 0xfe])).digest('hex'));
  assert.deepEqual(failures.filter(({ file }) => file === 'view.tsx').map(({ channel }) => channel), ['title', 'text']);
  assert.equal(failures.find(({ file }) => file === 'missing.tsx').status, 'failed');
  assert.deepEqual(sites.filter(({ channel }) => channel === 'conditional').map(({ tag, expression }) => [tag, expression]), [['p', 'condition'], ['span', 'condition']]);
  assert.deepEqual(sites.filter(({ channel }) => channel === 'text').map(({ expression }) => expression), ['status', 'value', 'item']);
  assert.throws(() => inventory(root, { include: ['../view.tsx'] }), /inside the source root/);
});
