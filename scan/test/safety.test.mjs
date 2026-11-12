import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { applyAnnotation } from '../patch.mjs';

const cli = fileURLToPath(new URL('../cli.mjs', import.meta.url));
const profile = 'export function Profile() {\n  const user = useCurrentUser();\n  return <p>{user.email}</p>;\n}\n';
const password = 'export const Login = () => <input type="password" />;\n';
const input = 'export const Search = () => <input type="text" />;\n';
const usage = 'export function Usage() {\n  const limits = useLimits();\n  return <p>{limits.remaining}</p>;\n}\n';

function session(t, files) {
  const temp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'privacy-safety-')));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const root = path.join(temp, 'app');
  const out = path.join(temp, 'session');
  const write = (file, contents) => {
    const target = path.join(root, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, contents);
  };
  for (const [file, contents] of Object.entries(files)) write(file, contents);
  const run = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
  const succeed = (...args) => {
    const result = run(...args);
    assert.equal(result.status, 0, result.stdout + result.stderr);
  };
  const read = (name, dir = out) => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
  const decide = (change) => {
    const decisions = read('annotations.json');
    change(decisions);
    fs.writeFileSync(path.join(out, 'annotations.json'), JSON.stringify(decisions));
  };
  const blocked = () => {
    const result = run('patch', '--out', out);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    for (const name of ['privacy.patch', 'decisions.json']) {
      assert.equal(fs.existsSync(path.join(out, name)), false, name);
    }
  };
  const find = (dir = out, ...flags) => succeed('find', root, '--out', dir, ...flags);
  return { root, temp, out, write, succeed, read, decide, blocked, find };
}

function applyGeneratedPatch(app) {
  app.succeed('patch', '--out', app.out);
  const result = spawnSync('git', ['apply', path.join(app.out, 'privacy.patch')], { cwd: app.root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
}

test('a requested rrweb mask preserves an existing block', () => {
  const lines = ['<div className="rr-block account">{secret}</div>'];
  applyAnnotation(lines, { file: 'Account.tsx', line: 1, match: '<div', value: 'mask' }, 'rrweb');
  assert.match(lines[0], /className="[^"]*\brr-block\b/);
});

test('an ambiguous same-line match never annotates the first sibling by default', () => {
  const lines = ['<div><p>Public</p><p>{user.email}</p></div>'];
  const before = [...lines];
  assert.ok(applyAnnotation(lines, { file: 'Account.tsx', line: 1, match: '<p', value: 'mask' }, 'rrweb'));
  assert.deepEqual(lines, before);
});

test('patch refuses stale source and invalidates a previously generated patch', (t) => {
  const app = session(t, { 'Profile.tsx': profile });
  app.find();
  app.succeed('patch', '--out', app.out);
  assert.ok(fs.existsSync(path.join(app.out, 'privacy.patch')));
  app.write('Profile.tsx', profile.replace('<p>', '<p>Updated: '));
  app.blocked();
  const reportPath = path.join(app.out, 'app-privacy.json');
  if (fs.existsSync(reportPath)) {
    assert.match(fs.readFileSync(reportPath, 'utf8'), /stale|changed since find/i);
  }
});

test('a valid annotation mixed with an impossible edit publishes no artifacts', (t) => {
  const app = session(t, { 'Profile.tsx': profile, 'Login.tsx': password });
  app.find();
  app.decide((d) => {
    const annotation = d.annotations.find((a) => a.file === 'Profile.tsx');
    assert.ok(annotation);
    annotation.edit = { from: 'not in the source', to: 'data-privacy="mask"' };
  });
  app.blocked();
  assert.ok(app.read('app-privacy.json').failed.length);
});

test('forged cached and settled claims cannot close a line unit', (t) => {
  const app = session(t, { 'Search.tsx': input });
  app.find();
  const [candidate] = app.read('candidates.json').candidates;
  assert.ok(candidate && !candidate.sites && !candidate.settled);
  app.decide((d) => {
    d.cached[candidate.id] = 'unchanged since the last scan: dismiss';
    d.settled[candidate.id] = 'public product navigation';
  });
  app.blocked();
  assert.ok(app.read('app-privacy.json').unreviewed.includes(candidate.id));
});

test('removing a scanner-placed password annotation leaves its unit open', (t) => {
  const app = session(t, { 'Login.tsx': password });
  app.find();
  app.decide((d) => {
    assert.ok(d.annotations.some((a) => a.auto));
    d.annotations = [];
  });
  app.blocked();
});

test('a harmless custom edit cannot count as masking private text', (t) => {
  const app = session(t, { 'Profile.tsx': profile });
  app.find();
  app.decide((d) => {
    const annotation = d.annotations.find((a) => a.file === 'Profile.tsx');
    assert.ok(annotation);
    annotation.edit = { from: '<p>', to: '<p title="Profile">' };
  });
  app.blocked();
});

test('annotation paths cannot leave the scanned tree or target a symlink', async (t) => {
  for (const file of ['../Outside.tsx', 'Alias.tsx']) {
    await t.test(file, (child) => {
      const app = session(child, { 'Profile.tsx': profile });
      const outside = path.join(app.temp, 'Outside.tsx');
      fs.writeFileSync(outside, profile);
      fs.symlinkSync(outside, path.join(app.root, 'Alias.tsx'));
      app.find();
      app.decide((d) => {
        d.annotations.push({ file, line: 3, match: '<p', value: 'mask', category: 'personal', candidates: [] });
      });
      app.blocked();
      assert.equal(fs.readFileSync(outside, 'utf8'), profile);
    });
  }
});

test('place can revise an unknown source from public to private and back', (t) => {
  const app = session(t, { 'Usage.tsx': usage });
  app.find();
  const answer = (value) => {
    app.decide((d) => { d.answers['useLimits()'] = value; });
    app.succeed('place', '--out', app.out);
  };
  answer('public');
  assert.equal(app.read('annotations.json').annotations.length, 0);
  answer('data');
  assert.ok(app.read('annotations.json').annotations.some((a) => a.file === 'Usage.tsx' && a.value === 'mask'));
  answer('public');
  assert.equal(app.read('annotations.json').annotations.length, 0);
});

test('an unreviewed cache entry does not hide its candidate', (t) => {
  const app = session(t, { 'Search.tsx': input });
  app.find();
  const [candidate] = app.read('candidates.json').candidates;
  app.decide((d) => { d.dismissed[candidate.id] = 'The search field accepts a public product code'; });
  applyGeneratedPatch(app);

  const cachePath = '.privacy-scan/decisions.json';
  const cache = app.read(cachePath, app.root);
  cache.files['Search.tsx'].units[0].reason = 'not reviewed';
  app.write(cachePath, JSON.stringify(cache));

  const repeat = path.join(app.temp, 'repeat');
  app.find(repeat);
  const scan = app.read('candidates.json', repeat);
  assert.equal(scan.cache.units_skipped, 0);
  assert.ok(scan.candidates.some((c) => c.id === candidate.id && !c.cached));
});

test('a successful cache is invalidated by source, schema, or annotation policy changes', async (t) => {
  const dependency = 'export function useCurrentUser() { return { email: "sample@example.invalid" }; }\n';
  const schema = 'model User {\n  id String @id\n  email String\n}\n';
  const cases = [
    ['source', (app) => app.write('dependencies.ts', dependency.replace('sample', 'updated')), []],
    ['schema', (app) => app.write('prisma/schema.prisma', schema.replace('email String', 'email String?')), []],
    ['annotation style', () => {}, ['--annotate', 'data-privacy']],
    ['recorder', () => {}, ['--annotate', 'rrweb']],
  ];
  for (const [name, change, requestedFlags] of cases) {
    await t.test(name, (child) => {
      const app = session(child, { 'Profile.tsx': profile, 'dependencies.ts': dependency, 'prisma/schema.prisma': schema });
      app.find(app.out, '--sdk', 'rrweb');
      applyGeneratedPatch(app);

      const unchanged = path.join(app.temp, 'unchanged');
      app.find(unchanged, '--sdk', 'rrweb');
      assert.ok(app.read('candidates.json', unchanged).cache.units_skipped > 0);

      change(app);
      const changed = path.join(app.temp, 'changed');
      const flags = name === 'recorder' ? requestedFlags : ['--sdk', 'rrweb', ...requestedFlags];
      app.find(changed, ...flags);
      assert.equal(app.read('candidates.json', changed).cache.units_skipped, 0);
    });
  }
});

test('a custom edit that masks the public same-line sibling leaves private text uncovered', (t) => {
  const source = profile.replace('<p>{user.email}</p>', '<div><p>Public</p><p>{user.email}</p></div>');
  const app = session(t, { 'Profile.tsx': source });
  app.find();
  const candidate = app.read('candidates.json').candidates.find((c) => c.component === 'Profile');
  assert.ok(candidate);
  app.decide((d) => {
    d.annotations = [{
      file: 'Profile.tsx', line: 3, match: '<p', value: 'mask', category: 'personal', candidates: [candidate.id],
      edit: { from: '<p>Public', to: '<p data-privacy="mask">Public' },
    }];
  });
  app.blocked();
});

test('a literal containing a privacy class does not protect the opening tag', () => {
  const lines = ['<div title={\' className="rr-block" \'}>{user.email}</div>'];
  const reason = applyAnnotation(lines, { file: 'Account.tsx', line: 1, match: '<div', value: 'mask' }, 'rrweb');
  if (!reason) assert.match(lines[0], /^<div className="rr-mask" title=/);
});

test('custom edits cannot transfer an existing rrweb block into ordinary text', (t) => {
  const protectedTag = '<input className="rr-block" type="password" />';
  const source = password.replace('<input type="password" />', protectedTag);
  const app = session(t, { 'Login.tsx': source, 'Profile.tsx': profile });
  app.find(app.out, '--sdk', 'rrweb');
  const candidates = app.read('candidates.json').candidates;
  const ids = candidates.filter((c) => c.file === 'Login.tsx').map((c) => c.id);
  app.decide((d) => {
    d.annotations = d.annotations.filter((a) => a.file !== 'Login.tsx');
    d.annotations.push({
      file: 'Login.tsx', line: 1, match: '<input', value: 'block', category: 'secret', candidates: ids,
      edit: { from: protectedTag, to: '<input title="rr-block" type="password" />' },
    });
  });
  app.blocked();
});

test('an annotation in a different file cannot close a password field candidate', (t) => {
  const app = session(t, { 'Login.tsx': password, 'Profile.tsx': profile });
  app.find();
  app.decide((d) => {
    const intended = d.annotations.find((a) => a.file === 'Login.tsx');
    assert.ok(intended?.candidates.length);
    intended.file = 'Profile.tsx';
    intended.line = 3;
    intended.match = '<p';
  });
  app.blocked();
});

test('an edit cannot add a mask while stripping a block from a different element', (t) => {
  const oldContent = '<aside className="rr-block">{widget}</aside><p>{user.email}</p>';
  const newContent = '<aside title="rr-block">{widget}</aside><p className="rr-mask">{user.email}</p>';
  const app = session(t, { 'Profile.tsx': profile.replace('<p>{user.email}</p>', `<div>${oldContent}</div>`) });
  app.find(app.out, '--sdk', 'rrweb');
  const candidate = app.read('candidates.json').candidates.find((c) => c.component === 'Profile');
  assert.ok(candidate);
  app.decide((d) => {
    d.annotations = [{
      file: 'Profile.tsx', line: 3, match: '<p', value: 'mask', category: 'personal', candidates: [candidate.id],
      edit: { from: oldContent, to: newContent },
    }];
  });
  app.blocked();
});

test('masking a different element on the same line leaves private text uncovered', (t) => {
  const source = profile.replace('<p>{user.email}</p>', '<div><aside>Public</aside><p>{user.email}</p></div>');
  const app = session(t, { 'Profile.tsx': source });
  app.find();
  const candidate = app.read('candidates.json').candidates.find((c) => c.component === 'Profile');
  assert.ok(candidate);
  app.decide((d) => {
    d.annotations = [{
      file: 'Profile.tsx', line: 3, match: '<aside', value: 'mask', category: 'personal', candidates: [candidate.id],
    }];
  });
  app.blocked();
});

test('patch refuses answers changed after placement when private data is still exposed', (t) => {
  const app = session(t, { 'Usage.tsx': usage });
  app.find();
  app.decide((d) => { d.answers['useLimits()'] = 'public'; });
  app.succeed('place', '--out', app.out);
  app.decide((d) => { d.answers['useLimits()'] = 'data'; });
  app.blocked();
});

test('a quoted fake data-privacy attribute is not accepted as an existing block', () => {
  const lines = ['<p title={\' data-privacy="block" \'}>{user.email}</p>'];
  const reason = applyAnnotation(lines, { file: 'Profile.tsx', line: 1, match: '<p', value: 'mask' }, 'data-privacy');
  if (!reason) assert.match(lines[0], /^<p data-privacy="mask" title=/);
});

test('a custom class edit that really masks the intended element still produces a patch', (t) => {
  const source = profile.replace('<p>', '<p className={cn("profile", active)}>');
  const app = session(t, { 'Profile.tsx': source });
  app.find(app.out, '--sdk', 'rrweb');
  const candidate = app.read('candidates.json').candidates.find((c) => c.component === 'Profile');
  assert.ok(candidate);
  app.decide((d) => {
    d.annotations = [{
      file: 'Profile.tsx', line: 3, match: '<p', value: 'mask', category: 'personal', candidates: [candidate.id],
      edit: { from: 'className={cn("profile", active)}', to: 'className={cn("rr-mask profile", active)}' },
    }];
  });
  applyGeneratedPatch(app);
  assert.match(fs.readFileSync(path.join(app.root, 'Profile.tsx'), 'utf8'), /className=\{cn\("rr-mask profile", active\)\}/);
});

test('an assumed Toaster annotation does not settle a toast candidate', (t) => {
  const source = [
    'export function Screen() {',
    '  toast(`Welcome, ${profile.displayName}`);',
    '  return <Toaster />;',
    '}',
    '',
  ].join('\n');
  const app = session(t, { 'Screen.tsx': source });
  app.find(app.out, '--sdk', 'rrweb');
  const candidate = app.read('candidates.json').candidates.find((c) => c.rules.includes('toast'));
  assert.ok(candidate);
  app.decide((d) => { d.annotations = d.annotations.filter((a) => a.match !== '<Toaster'); });
  app.blocked();
  assert.ok(app.read('app-privacy.json').unreviewed.includes(candidate.id));
});

test('running find again cannot apply an old dismissal to changed source in the same session', (t) => {
  const app = session(t, { 'Field.tsx': input });
  app.find();
  const [candidate] = app.read('candidates.json').candidates;
  app.decide((d) => { d.dismissed[candidate.id] = 'The field accepts a public product code'; });
  app.write('Field.tsx', password);
  const rescanned = spawnSync(process.execPath, [cli, 'find', app.root, '--out', app.out], { encoding: 'utf8' });
  if (rescanned.status !== 0) {
    assert.equal(rescanned.status, 1, rescanned.stdout + rescanned.stderr);
    app.blocked();
    return;
  }
  const [changed] = app.read('candidates.json').candidates;
  assert.ok(changed.auto);
  assert.equal(app.read('annotations.json').dismissed[changed.id], undefined);
});

test('JSX props spread cannot overwrite a privacy annotation', async (t) => {
  const cases = [
    ['rrweb', '<p {...{className: "public"}}>{user.email}</p>', /\}\}\s+className="rr-mask">/],
    ['rrweb', '<p className="rr-block" {...{className: "public"}}>{user.email}</p>', /\}\}\s+className="rr-block">/],
    ['data-privacy', '<p {...{"data-privacy": "unmask"}}>{user.email}</p>', /\}\}\s+data-privacy="mask">/],
  ];
  for (const [style, source, protectedTag] of cases) {
    await t.test(source, () => {
      const lines = [source];
      const reason = applyAnnotation(lines, { file: 'Profile.tsx', line: 1, match: '<p', value: 'mask' }, style);
      if (reason) assert.deepEqual(lines, [source]);
      else assert.match(lines[0], protectedTag);
    });
  }
});
