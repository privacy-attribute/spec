import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const cli = fileURLToPath(new URL('../cli.mjs', import.meta.url));

function session(t, files) {
  const temp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'privacy-gate-')));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const root = path.join(temp, 'app');
  const out = path.join(temp, 'out');
  fs.mkdirSync(root);
  for (const [file, source] of Object.entries(files)) fs.writeFileSync(path.join(root, file), source);
  const run = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
  const read = (file) => JSON.parse(fs.readFileSync(path.join(out, file), 'utf8'));
  const find = (...flags) => {
    const result = run('find', root, '--out', out, ...flags);
    assert.equal(result.status, 0, result.stdout + result.stderr);
  };
  const decide = (update) => {
    const decisions = read('annotations.json');
    update(decisions);
    fs.writeFileSync(path.join(out, 'annotations.json'), JSON.stringify(decisions));
  };
  const blocked = () => {
    const result = run('patch', '--out', out);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    for (const file of ['privacy.patch', 'decisions.json']) {
      assert.equal(fs.existsSync(path.join(out, file)), false, file);
    }
  };
  return { temp, root, out, run, read, find, decide, blocked };
}

test('rrweb input masking does not settle a custom contenteditable input', (t) => {
  const app = session(t, {
    'Search.tsx': [
      'export function SearchInput() { return <div contentEditable />; }',
      'export const Search = () => <SearchInput />;',
      '',
    ].join('\n'),
  });
  app.find('--sdk', 'rrweb');
  const candidate = app.read('candidates.json').candidates.find((c) => c.rules.includes('input'));
  assert.ok(candidate);
  app.blocked();
  assert.ok(app.read('app-privacy.json').unreviewed.includes(candidate.id));
});

test('masking an element that ends on the private sibling line leaves the sibling uncovered', (t) => {
  const app = session(t, {
    'Screen.tsx': [
      'export function Screen() {',
      '  const user = useCurrentUser();',
      '  return <div>',
      '    <aside>',
      '      Public',
      '    </aside><p>{user.email}</p>',
      '  </div>;',
      '}',
      '',
    ].join('\n'),
  });
  app.find();
  const candidate = app.read('candidates.json').candidates.find((c) => c.component === 'Screen');
  assert.ok(candidate);
  app.decide((d) => {
    d.annotations = [{
      file: 'Screen.tsx', line: 4, match: '<aside', value: 'mask', category: 'personal',
      candidates: [candidate.id],
    }];
  });
  app.blocked();
  assert.ok(app.read('app-privacy.json').uncovered.some((c) => c.id === candidate.id && c.lines.includes(6)));
});

test('blocking an unrelated clean element cannot close a password line candidate', (t) => {
  const app = session(t, {
    'Login.tsx': 'export const Login = () => <input type="password" />;\n',
    'Other.tsx': 'export const Other = () => <div>Public</div>;\n',
  });
  app.find();
  app.decide((d) => {
    const automatic = d.annotations.find((a) => a.file === 'Login.tsx' && a.auto);
    assert.ok(automatic);
    d.annotations = [{ ...automatic, file: 'Other.tsx', line: 1, match: '<div' }];
  });
  app.blocked();
});

test('find refuses an output directory reached through a symlink into the source tree', (t) => {
  const app = session(t, { 'Page.tsx': 'export const Page = () => <p>Public</p>;\n' });
  const alias = path.join(app.temp, 'alias');
  fs.symlinkSync(app.root, alias);
  const result = app.run('find', app.root, '--out', path.join(alias, 'session'));
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.equal(fs.existsSync(path.join(app.root, 'session')), false);
});
