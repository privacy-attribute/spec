import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { assertLabelRevision, measureTreatments } from '../measurement.mjs';

const source = [
  'export function Parent({ account }) {',
  '  return (',
  '    <section>',
  '      <Child name={account.name} />',
  '      <span>{account.email}</span>',
  '      <input value={account.phone} />',
  '    </section>',
  '  );',
  '}',
].join('\n');
const file = 'Parent.jsx';
const annotation = (line, match, value, extra = {}) => ({ file, line, match, value, ...extra });
const score = (line, value, annotations, extra = {}) => measureTreatments({
  file, source, labels: [{ line, value }], annotations, style: 'rrweb', ...extra,
}).rows[0].treatment;

test('treatment requires a successful change on the labelled element or an ancestor', () => {
  assert.equal(score(5, 'mask', [annotation(5, '<span', 'mask')]), 'matched');
  assert.equal(score(5, 'mask', [annotation(3, '<section', 'mask')]), 'matched');
  assert.equal(score(3, 'mask', [annotation(5, '<span', 'mask')]), null);
  assert.equal(score(4, 'mask', [annotation(5, '<span', 'mask', { file: 'Child.jsx' })]), null);
  assert.equal(score(4, 'mask', [annotation(4, '<Child', 'mask')]), null);
});

test('mask, block, and typed input masking score differently', () => {
  assert.equal(score(5, 'block', [annotation(5, '<span', 'mask')]), 'insufficient');
  assert.equal(score(5, 'mask', [annotation(5, '<span', 'block')]), 'over-treated');
  assert.equal(score(5, 'block', [annotation(5, '<span', 'block')]), 'matched');
  assert.equal(score(6, 'mask', []), null);
  assert.equal(score(6, 'mask', [annotation(6, '<input', 'mask')]), 'insufficient');
});

test('failed placement, failed session patch, and arbitrary edits give no credit', () => {
  assert.equal(score(5, 'mask', [annotation(5, '<p', 'mask')]), null);
  assert.equal(score(5, 'mask', [annotation(5, '<span', 'mask')], { patchReady: false }), null);
  assert.equal(score(5, 'mask', [annotation(5, '<span', 'mask', {
    edit: { from: '{account.email}', to: '{"className=rr-mask"}' },
  })]), null);
  assert.equal(score(5, 'mask', [annotation(5, '<span', 'mask', {
    edit: { from: '<span>', to: '<span className="rr-mask"' },
  })]), null);
});

test('template treatment checks the actual opening tag and excludes ambiguous lines', () => {
  const file = 'Parent.vue';
  const source = [
    '<template>',
    '  <section>',
    '    <span>{{ account.email }}</span>',
    '    <span>{{ account.phone }}</span><span>Public text</span>',
    '  </section>',
    '</template>',
  ].join('\n');
  const labels = [{ line: 2, value: 'mask' }, { line: 3, value: 'mask' }, { line: 4, value: 'mask' }];
  const annotations = [{ file, line: 3, match: '<span', value: 'mask' }];
  const result = measureTreatments({ file, source, labels, annotations, style: 'data-privacy' });
  assert.deepEqual(result.rows.map((row) => row.treatment), [null, 'matched', null]);
});

test('PAS measurement scores effective token-list treatments in JSX and templates', () => {
  for (const file of ['Parent.jsx', 'Parent.html']) {
    const source = '<p data-privacy="confidential">Private</p>';
    const annotations = [{ file, line: 1, match: '<p', value: 'block' }];
    const labels = [{ line: 1, value: 'block' }];
    const options = { file, source, annotations, labels, style: 'data-privacy' };
    const [upgrade] = measureTreatments(options).rows;
    assert.equal(upgrade.treatment, 'matched');
    assert.equal(upgrade.exact_treatment, 'matched');
    for (const [value, expected] of [['mask block confidential', 'matched'], ['block mask confidential', 'matched'], ['mask\u00a0block', 'insufficient'], ['confidential', 'insufficient']]) {
      const [row] = measureTreatments({ ...options, source: `<p data-privacy="${value}">Private</p>`, annotations: [] }).rows;
      assert.equal(row.static, expected, `${file}: ${value}`);
    }
  }
});

test('label revision rejects a mismatched, modified, or unversioned checkout', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scan-measure-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  assert.throws(() => assertLabelRevision(dir, 'abcdef0'), /Git checkout/);
  git('init');
  fs.writeFileSync(path.join(dir, 'index.jsx'), source);
  git('add', 'index.jsx');
  git('-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'Sample');
  const commit = git('rev-parse', 'HEAD').slice(0, 7);
  const wrong = commit.replace(/^./, (ch) => ch === 'a' ? 'b' : 'a');
  assert.throws(() => assertLabelRevision(dir, wrong), /labels require/);
  assert.doesNotThrow(() => assertLabelRevision(dir, commit));
  fs.appendFileSync(path.join(dir, 'index.jsx'), '\n// Modified');
  assert.throws(() => assertLabelRevision(dir, commit), /clean working tree/);
});

test('benchmark verifies the current session patch and rejects stale success', (t) => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'scan-measure-app-')));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const app = path.join(dir, 'app');
  const labels = path.join(dir, 'labels');
  const session = path.join(dir, 'session');
  fs.mkdirSync(app);
  fs.mkdirSync(labels);
  const git = (...args) => execFileSync('git', ['-C', app, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const run = (script, ...args) => execFileSync(process.execPath, [fileURLToPath(new URL(script, import.meta.url)), ...args], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  });
  git('init');
  fs.writeFileSync(path.join(app, file), 'export function Parent() {\n  return <span>Sample text</span>;\n}\n');
  git('add', file);
  git('-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'Sample');
  fs.writeFileSync(path.join(labels, 'labels.json'), JSON.stringify({
    commit: git('rev-parse', 'HEAD'),
    files: { [file]: [{ line: 2, category: 'personal', value: 'mask', what: 'Sample text' }] },
  }));
  run('../cli.mjs', 'find', app, '--out', session, '--sdk', 'rrweb');
  const decisionsFile = path.join(session, 'annotations.json');
  const decisions = JSON.parse(fs.readFileSync(decisionsFile, 'utf8'));
  decisions.annotations = [annotation(2, '<span', 'mask', { category: 'personal', data: 'Sample text' })];
  fs.writeFileSync(decisionsFile, JSON.stringify(decisions));
  run('../cli.mjs', 'patch', '--out', session);
  const measure = () => run('../benchmark/apps/measure.mjs',
    path.relative(fileURLToPath(new URL('../benchmark/apps/', import.meta.url)), labels), app, '--session', session);
  assert.equal(git('status', '--porcelain'), '', git('diff'));
  const good = measure();
  assert.match(good, /session patch passed Git application check/);
  assert.match(good, /exact treatment\s+100%/);
  assert.equal(git('status', '--porcelain'), '');

  decisions.annotations[0].match = '<p';
  fs.writeFileSync(decisionsFile, JSON.stringify(decisions));
  assert.throws(measure, (error) => {
    assert.equal(error.status, 1);
    assert.match(error.stdout, /session patch failed validation/);
    assert.match(error.stdout, /exact treatment\s+0%/);
    return true;
  });
  assert.ok(fs.existsSync(path.join(session, 'privacy.patch')));
});
