import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { find } from '../find.mjs';
import { applyAnnotations, uncoveredSites } from '../patch.mjs';
import { spansFor } from '../templates.mjs';

const file = 'Screen.tsx';
const annotation = (match, values = {}) => ({ file, line: 1, match, value: 'mask', category: 'personal', ...values });
const cli = fileURLToPath(new URL('../cli.mjs', import.meta.url));

function cliSession(t, source) {
  const temp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'privacy-patch-targets-')));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const root = path.join(temp, 'app');
  const out = path.join(temp, 'session');
  fs.mkdirSync(root);
  fs.writeFileSync(path.join(root, file), source);
  const run = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
  const found = run('find', root, '--out', out, '--sdk', 'rrweb');
  assert.equal(found.status, 0, found.stdout + found.stderr);
  const read = (name) => JSON.parse(fs.readFileSync(path.join(out, name), 'utf8'));
  const scan = read('candidates.json');
  const decide = (annotations) => {
    const decisions = read('annotations.json');
    decisions.annotations = annotations;
    fs.writeFileSync(path.join(out, 'annotations.json'), JSON.stringify(decisions));
    return run('patch', '--out', out);
  };
  return { root, out, scan, decide, read };
}

test('a patch targets parsed JSX and refuses markup found only in strings', () => {
  const quoted = 'const description = "<p>Private-looking sample</p>";';
  const source = `${quoted} const screen = <p>{user.email}</p>;`;
  const result = applyAnnotations(file, source, [annotation('<p')], 'data-privacy');
  assert.deepEqual(result.failed, []);
  assert.equal(result.text, source.replace('<p>{', '<p data-privacy="mask">{'));
  const fake = applyAnnotations(file, quoted, [annotation('<p')], 'data-privacy');
  assert.equal(fake.text, quoted);
  assert.equal(fake.failed.length, 1);
});

test('original columns select both identical siblings after the first patch shifts the second', () => {
  const source = 'const screen = <><p>{user.name}</p><p>{user.email}</p></>;';
  const tags = [...source.matchAll(/<p/g)];
  const result = applyAnnotations(file, source, tags.map(({ index }) => annotation('<p', { column: index })), 'data-privacy');
  assert.deepEqual(result.failed, []);
  assert.equal(result.text, source.replaceAll('<p>', '<p data-privacy="mask">'));
  assert.deepEqual(result.effects.map((effect) => effect.element[4]), tags.map(({ index }) => index));
});

test('an exact custom edit identifies its same-line sibling', () => {
  const source = 'const screen = <><p className="public">Example</p><p className={layout}>{user.email}</p></>;';
  const edit = { from: 'className={layout}', to: 'className={`rr-mask ${layout}`}' };
  const result = applyAnnotations(file, source, [annotation('<p', { edit })], 'rrweb');
  assert.deepEqual(result.failed, []);
  assert.equal(result.text, source.replace(edit.from, edit.to));
  assert.equal(result.effects[0].element[4], source.lastIndexOf('<p'));
});

test('verified treatment reflects an existing block and a requested upgrade', () => {
  for (const [style, source] of [
    ['rrweb', '<p className="rr-block">{apiKey}</p>'],
    ['data-privacy', '<p data-privacy="block">{apiKey}</p>'],
  ]) {
    const result = applyAnnotations(file, source, [annotation('<p')], style);
    assert.deepEqual(result.failed, []);
    assert.equal(result.text, source);
    assert.equal(result.effects[0].value, 'block');
  }
  const source = '<p data-privacy="mask">{apiKey}</p>';
  const result = applyAnnotations(file, source, [annotation('<p', { value: 'block', category: 'secret' })], 'data-privacy');
  assert.deepEqual(result.failed, []);
  assert.equal(result.text, '<p data-privacy="block">{apiKey}</p>');
});

test('data-privacy recognizes case-sensitive block tokens delimited by ASCII whitespace', () => {
  for (const [value, effective] of [
    ['mask block confidential', 'block'],
    ['block mask confidential', 'block'],
    ['\tmask\nconfidential\fblock\r\n', 'block'],
    ['mask block block', 'block'],
    ['mask b&#108;ock confidential', 'block'],
    ['', 'mask'],
    ['confidential ignore unmask', 'mask'],
    ['Block BLOCK blocked preblock block-suffix', 'mask'],
    ['mask\u00a0block', 'mask'],
    ['mask\vblock', 'mask'],
  ]) {
    const source = `<p data-privacy="${value}">{user.email}</p>`;
    const result = applyAnnotations(file, source, [annotation('<p')], 'data-privacy');
    assert.deepEqual(result.failed, [], JSON.stringify(value));
    assert.equal(result.text, source);
    assert.equal(result.effects[0].value, effective, JSON.stringify(value));
  }
});

test('automatic upgrades retain classifications and opaque tokens in the original attribute', () => {
  for (const [targetFile, before, after] of [
    [file, 'data-privacy="confidential\tmask  team-internal"', 'data-privacy="confidential\tblock  team-internal"'],
    [file, 'data-privacy={"mask\\tconfidential"}', 'data-privacy={"block mask\\tconfidential"}'],
    [file, 'data-privacy={`mask confidential`}', 'data-privacy={`block confidential`}'],
    [file, 'data-privacy="confidential BLOCK"', 'data-privacy="block confidential BLOCK"'],
    [file, 'data-privacy="mask\u00a0block"', 'data-privacy="block mask\u00a0block"'],
    ['Page.html', "data-privacy='mask confidential'", "data-privacy='block confidential'"],
    ['Page.html', 'data-privacy=confidential', 'data-privacy="block confidential"'],
    ['Page.html', 'data-privacy=mask\u00a0block', 'data-privacy="block mask\u00a0block"'],
    ['Page.html', 'data-privacy', 'data-privacy="block"'],
  ]) {
    const source = `<p ${before}>Private</p>`;
    const result = applyAnnotations(targetFile, source, [annotation('<p', { value: 'block' })], 'data-privacy');
    assert.deepEqual(result.failed, [], before);
    assert.equal(result.text, `<p ${after}>Private</p>`);
    assert.equal(result.effects[0].value, 'block');
  }
});

test('explicit edits cannot weaken token-list blocks and implicit edits leave dynamic values alone', () => {
  for (const [targetFile, from] of [
    [file, 'data-privacy="block mask confidential"'],
    [file, 'data-privacy="mask block confidential"'],
    ['Page.html', 'data-privacy="mask&Tab;b&#108;ock confidential"'],
  ]) {
    const source = `<p ${from}>Private</p>`;
    const edit = { from, to: 'data-privacy="mask confidential"' };
    const result = applyAnnotations(targetFile, source, [annotation('<p', { edit })], 'data-privacy');
    assert.equal(result.text, source);
    assert.match(result.failed[0].reason, /weakens existing privacy protection/);
    assert.deepEqual(result.effects, []);
  }
  for (const [targetFile, attr] of [
    [file, 'data-privacy={treatment}'],
    [file, 'data-privacy={`mask ${classification}`}'],
    ['Page.svelte', 'data-privacy="mask {classification}"'],
    ['page.blade.php', 'data-privacy="@yield(\'treatment\')"'],
  ]) {
    const source = `<p ${attr}>Private</p>`;
    const result = applyAnnotations(targetFile, source, [annotation('<p', { value: 'block' })], 'data-privacy');
    assert.equal(result.text, source);
    assert.equal(result.failed.length, 1);
    assert.deepEqual(result.effects, []);
  }
});

test('quoted, conditional, duplicate and malformed class edits do not establish protection', () => {
  const source = '<p className={layout}>{user.email}</p>';
  for (const to of [
    'title="rr-mask" className={layout}',
    'className={layout ? "rr-mask" : "visible"}',
    'className={`rr-mask${layout}`}',
    'className={`rr-mask ${differentLayout}`}',
    'className={"rr-mask"} className={layout}',
    'className={"rr-mask"',
    'className="rr-mask" title={user.email}',
  ]) {
    const result = applyAnnotations(file, source, [annotation('<p', { edit: { from: 'className={layout}', to } })], 'rrweb');
    assert.equal(result.text, source, to);
    assert.equal(result.failed.length, 1, to);
    assert.deepEqual(result.effects, [], to);
  }
});

test('a custom edit cannot append code outside the target opening tag', () => {
  const source = 'const widget = <input />;';
  const edit = { from: '<input />', to: '<input className="rr-mask" />; doSomething()' };
  const result = applyAnnotations(file, source, [annotation('<input', { edit })], 'rrweb');
  assert.equal(result.text, source);
  assert.match(result.failed[0].reason, /inside the target opening tag/);
});

test('a cosmetic edit on an already-blocked element does not qualify as a privacy edit', () => {
  const source = '<p className="rr-block large">{user.email}</p>';
  const result = applyAnnotations(file, source, [annotation('<p', { edit: { from: 'large', to: 'small' } })], 'rrweb');
  assert.equal(result.text, source);
  assert.match(result.failed[0].reason, /does not establish new privacy protection/);
});

test('a template expression and script string do not create patch targets', () => {
  const cases = [
    ['Page.html', '<script>const example = "<p>Fake</p>";</script>\n<p>Real</p>'],
    ['Page.svelte', '{"<p>Fake</p>"}\n<p>Real</p>'],
    ['Page.vue', '<script>const example = "<template><p>Fake</p>";</script>\n<template>\n{{ "<p>Fake</p>" }}\n<p>Real</p>\n</template>'],
    ['page.blade.php', "{{ '<p>Fake</p>' }}\n<p>Real</p>"],
  ];
  for (const [targetFile, source] of cases) {
    for (const line of targetFile.endsWith('.vue') ? [1, 3] : [1]) {
      const result = applyAnnotations(targetFile, source, [annotation('<p', { file: targetFile, line })], 'data-privacy');
      assert.equal(result.text, source, targetFile);
      assert.equal(result.failed.length, 1, targetFile);
      assert.deepEqual(result.effects, [], targetFile);
    }
  }
});

test('Vue and Svelte locate credential fields and sensitive choices at their opening tags', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'privacy-template-controls-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'Account.vue'), `<script setup>const user = useCurrentUser();</script>
<template>
  <input type=password />
  <input type="radio" name="diagnosis" />
  <button :aria-pressed="user.hasAsthma">Answer</button>
</template>
`);
  fs.writeFileSync(path.join(root, 'Account.svelte'), `<script>export let user;</script>
<input autocomplete="one-time-code" />
<input type="checkbox" bind:checked={user.hasAsthma} />
`);
  const { candidates } = find(root);
  const sites = (name) => candidates.find((unit) => unit.file === name && unit.sites).sites;
  assert.deepEqual(sites('Account.vue').map(({ line, kind }) => [line, kind]), [[3, 'input secret'], [4, 'choice'], [5, 'choice']]);
  assert.deepEqual(sites('Account.svelte').map(({ line, kind }) => [line, kind]), [[2, 'input secret'], [3, 'choice']]);
});

test('credential input coverage still requires a block under rrweb input masking', () => {
  const source = '<input value={otp} />';
  const elements = spansFor(file, source);
  const scan = { sdk: 'rrweb', candidates: [{ id: 'C1', file, sites: [{ line: 1, element: 0, tag: 'input', kind: 'attr value', expr: 'otp', origin: 'prop otp' }] }] };
  const mask = applyAnnotations(file, source, [annotation('<input')], 'rrweb');
  assert.deepEqual(uncoveredSites(scan, { annotations: mask.effects }, () => elements).map((site) => site.lines), [[1]]);
  const block = applyAnnotations(file, source, [annotation('<input', { value: 'block', category: 'secret' })], 'rrweb');
  assert.deepEqual(uncoveredSites(scan, { annotations: block.effects }, () => elements), []);
});

test('rrweb class masking and suggested input configuration do not prove personal input coverage', () => {
  const source = '<input value={profile.email} />';
  const elements = spansFor(file, source);
  const site = { line: 1, element: 0, tag: 'input', kind: 'attr value', expr: 'profile.email', origin: 'useProfile()' };
  const scan = { sdk: 'rrweb', annotate: 'rrweb', candidates: [{ id: 'C1', file, sites: [site] }] };
  const mask = applyAnnotations(file, source, [annotation('<input')], 'rrweb');
  const decisions = { annotations: mask.effects, config: ['rrweb on all pages: maskAllInputs: true (input values)'] };
  assert.deepEqual(uncoveredSites(scan, decisions, () => elements).map((unit) => unit.lines), [[1]]);
  scan.annotate = 'data-privacy';
  const pas = applyAnnotations(file, source, [annotation('<input')], 'data-privacy');
  assert.deepEqual(uncoveredSites(scan, { annotations: pas.effects }, () => elements), []);
  site.category = 'secret';
  assert.deepEqual(uncoveredSites(scan, { annotations: pas.effects }, () => elements).map((unit) => unit.lines), [[1]]);
});

test('the CLI rejects protection on a public sibling and applies a patch on the exact private sibling', (t) => {
  const source = 'export function Screen() {\n  const user = useCurrentUser();\n  return <><p>Public</p><p>{user.email}</p></>;\n}\n';
  const session = cliSession(t, source);
  const candidate = session.scan.candidates.find((unit) => unit.component === 'Screen');
  assert.ok(candidate);
  const line = source.split('\n')[2];
  const base = { line: 3, candidates: [candidate.id] };
  const rejected = session.decide([annotation('<p', { ...base, column: line.indexOf('<p') })]);
  assert.equal(rejected.status, 1, rejected.stdout + rejected.stderr);
  assert.equal(fs.existsSync(path.join(session.out, 'privacy.patch')), false);
  assert.deepEqual(session.read('app-privacy.json').uncovered.map((site) => site.lines), [[3]]);
  const accepted = session.decide([annotation('<p', { ...base, column: line.lastIndexOf('<p') })]);
  assert.equal(accepted.status, 0, accepted.stdout + accepted.stderr);
  const applied = spawnSync('git', ['apply', path.join(session.out, 'privacy.patch')], { cwd: session.root, encoding: 'utf8' });
  assert.equal(applied.status, 0, applied.stdout + applied.stderr);
  assert.equal(fs.readFileSync(path.join(session.root, file), 'utf8'), source.replace('<p>{', '<p className="rr-mask">{'));
});
