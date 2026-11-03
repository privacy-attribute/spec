import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { applyAnnotation, unifiedDiff, overMaskWarnings } from '../patch.mjs';
import { find } from '../find.mjs';
import { buildScanReport, ruleOutcomes } from '../report.mjs';

const apply = (src, a, style = 'rrweb') => {
  const lines = src.split('\n');
  const reason = applyAnnotation(lines, { line: 1, file: 'x.tsx', ...a }, style);
  return { reason, out: lines.join('\n') };
};

test('data-privacy style adds the attribute after the tag name', () => {
  const r = apply('<Input id="pw" />', { match: '<Input', value: 'block' }, 'data-privacy');
  assert.equal(r.reason, null);
  assert.equal(r.out, '<Input data-privacy="block" id="pw" />');
});

test('rrweb style adds the class to a static className', () => {
  assert.equal(apply("<ul className='list'>", { match: '<ul', value: 'mask' }).out, "<ul className='rr-mask list'>");
  assert.equal(apply('<ul className={"list"}>', { match: '<ul', value: 'mask' }).out, '<ul className={"rr-mask list"}>');
});

test('rrweb style adds className in JSX and class in HTML when the tag has none', () => {
  assert.equal(apply('<td>{row.email}</td>', { match: '<td', value: 'mask' }).out, '<td className="rr-mask">{row.email}</td>');
  assert.equal(apply('<td>x</td>', { match: '<td', value: 'mask', file: 'x.html' }).out, '<td class="rr-mask">x</td>');
});

test('rrweb style finds the class on a later line of a multi-line tag', () => {
  const src = ['<Input', "  id='key'", "  className='font-mono'", '/>'].join('\n');
  assert.equal(apply(src, { match: '<Input', value: 'block' }).out.split('\n')[2], "  className='rr-block font-mono'");
});

test('rrweb style asks for an edit for expressions and framework bindings', () => {
  for (const src of ["<div className={cn('a', b)}>", '<div :class="{ active }">', '<div v-bind:class="x">', '<div [class]="x">', '<div [ngClass]="x">']) {
    const r = apply(src, { match: '<div', value: 'mask', file: 'x.vue' });
    assert.match(r.reason, /binding or expression/, src);
    assert.equal(r.out, src);
  }
});

test('rrweb style keeps a static class next to a Vue binding', () => {
  assert.equal(apply('<div class="row" :class="{ a }">', { match: '<div', value: 'mask', file: 'x.vue' }).out, '<div class="rr-mask row" :class="{ a }">');
});

test('an existing rrweb class is kept when equal and upgraded when different', () => {
  assert.equal(apply("<Input className='x rr-mask' />", { match: '<Input', value: 'mask' }).out, "<Input className='x rr-mask' />");
  assert.equal(apply("<Input className='x rr-mask' />", { match: '<Input', value: 'block' }).out, "<Input className='x rr-block' />");
});

test('unmask has no rrweb class', () => {
  assert.match(apply('<p>x</p>', { match: '<p', value: 'unmask' }).reason, /no unmask/);
});

test('an edit replaces exact text near the line, and reports a miss', () => {
  const src = "<div className={cn('row', a)}>";
  const ok = apply(src, { match: '<div', value: 'mask', edit: { from: "cn('row'", to: "cn('row rr-mask'" } });
  assert.equal(ok.out, "<div className={cn('row rr-mask', a)}>");
  assert.match(apply(src, { match: '<div', value: 'mask', edit: { from: 'nope', to: 'x' } }).reason, /not found/);
});

test('a match that is not near the line is reported', () => {
  assert.match(apply('<p>x</p>', { match: '<Input', value: 'mask' }).reason, /not found near line 1/);
});

test('unifiedDiff uses forward-slash paths relative to the repository root', () => {
  const d = unifiedDiff(path.join('apps', 'web', 'a.tsx'), 'one\n', 'two\n');
  assert.match(d, /^diff --git a\/apps\/web\/a\.tsx b\/apps\/web\/a\.tsx/);
  assert.match(d, /\n-one\n\+two\n/);
});

function tempApp(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scan-test-'));
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), text);
  }
  return dir;
}

test('find flags secrets, decides password fields, follows fetched data and skips tests', () => {
  const dir = tempApp({
    'Login.tsx': 'export function Login() {\n  return <input type="password" name="pw" />;\n}\n',
    'Team.tsx': 'export function Team() {\n  const { data: people } = useQuery(q);\n  return people.map((p) => (\n    <li>{p.handleText}</li>\n  ));\n}\n',
    'Login.test.tsx': 'const x = <input type="password" />;\n',
  });
  const r = find(dir);
  const pw = r.candidates.find((c) => c.file === 'Login.tsx');
  assert.equal(pw.category_hint, 'secret');
  assert.deepEqual({ value: pw.auto.value, match: pw.auto.match, line: pw.auto.line }, { value: 'block', match: '<input', line: 2 });
  const team = r.candidates.find((c) => c.file === 'Team.tsx' && c.rules.includes('component'));
  assert.ok(team, 'component unit for Team');
  assert.deepEqual(team.site_lines, [4]);
  assert.ok(!r.candidates.some((c) => c.file.includes('.test.')), 'test files skipped');
});

test('find skips person fields on public content objects', () => {
  const r = find(tempApp({ 'Hero.tsx': 'export function Hero() {\n  return <h1>{hero.title}</h1>;\n}\n' }));
  assert.equal(r.candidates.length, 0);
});

test('the report counts rule outcomes and keeps recorder gaps private', () => {
  const scan = {
    scan_version: '0.0.0', sdk: 'rrweb', annotate: 'rrweb', scanned_files: 2,
    candidates: [{ id: 'C1', rules: ['a', 'b'] }, { id: 'C2', rules: ['a'] }, { id: 'C3', rules: ['a'] }],
  };
  const decisions = {
    annotations: [{ value: 'mask', category: 'personal', candidates: ['C1'] }],
    dismissed: { C2: 'not shown' },
    gaps: [
      { kind: 'missed-data', title: 't', example: '<KeyField value={k} />', proposed_rule: { re: '<KeyField\\b' } },
      { kind: 'false-positive', title: 'u', example: 'x', proposed_rule: { re: '(' } },
      { kind: 'recorder-gap', title: 'secret weakness', example: 'y' },
    ],
  };
  assert.deepEqual(ruleOutcomes(scan.candidates, decisions).a, { flagged: 3, annotated: { mask: 1 }, dismissed: 1, open: 1, auto: 0 });
  const r = buildScanReport({ scan, decisions });
  assert.equal(r.payload.gaps.length, 2);
  assert.equal(r.payload.gaps[0].proposed_rule.tested, true);
  assert.equal(r.payload.gaps[1].proposed_rule.tested, false);
  assert.ok(!JSON.stringify(r.payload).includes('secret weakness'));
  assert.ok(!r.url.includes('secret+weakness') && !r.url.includes('secret%20weakness'));
  assert.match(r.privateText, /secret weakness/);
});

test('the decisions cache skips unchanged files after the patch is committed', async () => {
  const { execFileSync } = await import('node:child_process');
  const cli = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'cli.mjs');
  const repo = tempApp({
    'src/Profile.tsx': 'export function Profile() {\n  const user = useCurrentUser();\n  return <p>{user.email}</p>;\n}\n',
    'src/Team.tsx': 'export function Team() {\n  const { data: people } = useQuery(q);\n  return people.map((p) => <li key={p.id}>{p.handleText}</li>);\n}\n',
  });
  const git = (...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8' });
  git('init', '-q'); git('-c', 'user.email=t@example.com', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'init');
  git('add', '-A'); git('-c', 'user.email=t@example.com', '-c', 'user.name=t', 'commit', '-q', '-m', 'app');
  const run = (...a) => execFileSync(process.execPath, [cli, ...a], { encoding: 'utf8' });
  const out1 = path.join(repo, '..', `${path.basename(repo)}-s1`);
  run('find', path.join(repo, 'src'), '--sdk', 'rrweb', '--out', out1);
  const scan1 = JSON.parse(fs.readFileSync(path.join(out1, 'candidates.json'), 'utf8'));
  const profile = scan1.candidates.find((c) => c.file === 'Profile.tsx');
  const team = scan1.candidates.find((c) => c.file === 'Team.tsx');
  fs.writeFileSync(path.join(out1, 'annotations.json'), JSON.stringify({
    annotations: [{ file: 'Profile.tsx', line: 3, match: '<p', value: 'mask', category: 'personal', data: 'email', candidates: [profile.id] }],
    dismissed: { [team.id]: 'test' }, cached: {}, config: [], gaps: [],
  }));
  run('patch', '--out', out1);
  git('apply', path.join(out1, 'privacy.patch'));
  assert.ok(fs.existsSync(path.join(repo, '.privacy-scan', 'decisions.json')), 'cache created by the patch');
  assert.match(fs.readFileSync(path.join(repo, 'src', 'Profile.tsx'), 'utf8'), /className="rr-mask"/);
  git('add', '-A'); git('-c', 'user.email=t@example.com', '-c', 'user.name=t', 'commit', '-q', '-m', 'annotate');

  const out2 = `${out1}-2`;
  assert.match(run('find', path.join(repo, 'src'), '--sdk', 'rrweb', '--out', out2), /\(0 to review\)/);

  fs.appendFileSync(path.join(repo, 'src', 'Team.tsx'), '\n');
  const out3 = `${out1}-3`;
  assert.match(run('find', path.join(repo, 'src'), '--sdk', 'rrweb', '--out', out3), /\(1 to review\)/);
  assert.match(fs.readFileSync(path.join(out3, 'scan-plan.md'), 'utf8'), /earlier: dismiss/);
});

test('over-masking: an annotation in a shared component with public uses is reported', () => {
  const scan = {
    component_index: { 'Layout.tsx': [['Layout', 1, 20, false]], 'Chip.tsx': [['Chip', 1, 10, true]], 'Row.tsx': [['Row', 1, 10, false]] },
    component_usage: { Layout: [10, 3], Chip: [10, 1], Row: [10, 9] },
  };
  const w = overMaskWarnings(scan, [
    { file: 'Layout.tsx', line: 5, value: 'mask' },
    { file: 'Layout.tsx', line: 6, value: 'mask', accept_shared: 'header only' },
    { file: 'Chip.tsx', line: 3, value: 'block' },
    { file: 'Row.tsx', line: 3, value: 'mask' },
  ]);
  assert.deepEqual(w.map((x) => `${x.file}:${x.line}`), ['Layout.tsx:5']);
  assert.equal(w[0].private_uses, 3);
});
