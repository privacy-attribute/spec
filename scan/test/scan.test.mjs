import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { applyAnnotation, unifiedDiff } from '../patch.mjs';
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
