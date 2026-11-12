import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repo = fileURLToPath(new URL('../../', import.meta.url));
const cli = path.join(repo, 'scan', 'cli.mjs');
const require = createRequire(import.meta.url);
const readJSON = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const writeJSON = (file, value) => fs.writeFileSync(file, JSON.stringify(value));
const run = (entry, ...args) => spawnSync(process.execPath, [entry, ...args], { encoding: 'utf8' });
const assertSuccess = (result) => assert.equal(result.status, 0, result.stderr || result.stdout);

function fixture(t) {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'privacy-integration-')));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const app = path.join(tmp, 'app');
  const out = path.join(tmp, 'scan');
  fs.mkdirSync(app);
  fs.writeFileSync(path.join(app, 'Page.tsx'), 'export const Page = () => <input type="password" />;\n');
  assertSuccess(run(cli, 'find', app, '--out', out));
  return { app, out, tmp };
}

test('static reuse rejects a scanner package version change', (t) => {
  const { app, out, tmp } = fixture(t);
  const copy = path.join(tmp, 'scanner');
  for (const file of ['package.json', 'npm-shrinkwrap.json', 'scan', 'spec', 'audit/runner/lib']) {
    const target = path.join(copy, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.cpSync(path.join(repo, file), target, { recursive: true });
  }
  const parser = path.dirname(require.resolve('@babel/parser/package.json'));
  fs.cpSync(parser, path.join(copy, 'node_modules', '@babel', 'parser'), { recursive: true });
  const copyCli = path.join(copy, 'scan', 'cli.mjs');
  assertSuccess(run(copyCli, 'find', app, '--out', path.join(tmp, 'warm'), '--reuse', out));
  const metadata = path.join(copy, 'package.json');
  writeJSON(metadata, { ...readJSON(metadata), version: '99.0.0-dev.0' });
  const rejected = run(copyCli, 'find', app, '--out', path.join(tmp, 'changed'), '--reuse', out);
  assert.equal(rejected.status, 1);
  assert.match(rejected.stderr, /stale|version/i);
});

test('report refuses a copied session inside the application through a directory link', (t) => {
  const { app, out, tmp } = fixture(t);
  const inside = path.join(app, 'copied-scan');
  fs.cpSync(out, inside, { recursive: true });
  const alias = path.join(tmp, 'copied-scan');
  fs.symlinkSync(inside, alias, process.platform === 'win32' ? 'junction' : 'dir');
  const rejected = run(cli, 'report', '--out', alias);
  assert.equal(rejected.status, 1);
  assert.match(rejected.stderr, /outside the application/i);
  assert.equal(fs.existsSync(path.join(inside, 'feedback')), false);
});

test('report keeps recorder gaps private and removes an outdated private draft', (t) => {
  const { out } = fixture(t);
  const decisionsPath = path.join(out, 'annotations.json');
  const decisions = readJSON(decisionsPath);
  const privateMarker = 'SyntheticRecorderGapMarker';
  decisions.gaps = [{ kind: 'recorder-gap', title: privateMarker }];
  writeJSON(decisionsPath, decisions);
  const first = run(cli, 'report', '--out', out);
  assertSuccess(first);
  assert.doesNotMatch(first.stdout, new RegExp(privateMarker));
  const feedback = path.join(out, 'feedback');
  const privateFile = path.join(feedback, 'private-recorder-gaps.md');
  assert.match(fs.readFileSync(privateFile, 'utf8'), new RegExp(privateMarker));
  assert.doesNotMatch(fs.readFileSync(path.join(feedback, 'scan-report.json'), 'utf8'), new RegExp(privateMarker));
  decisions.gaps = [];
  writeJSON(decisionsPath, decisions);
  assertSuccess(run(cli, 'report', '--out', out));
  assert.equal(fs.existsSync(privateFile), false);
});
