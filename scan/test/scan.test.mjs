import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { applyAnnotation, unifiedDiff, overMaskWarnings, uncoveredSites } from '../patch.mjs';
import { find } from '../find.mjs';
import { buildScanReport, ruleOutcomes } from '../report.mjs';
import { readSchemas } from '../schemas.mjs';

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
    dismissed: { [team.id]: 'test', [`${team.id}:L3`]: 'test' }, cached: {}, config: [], gaps: [],
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

test('template pass: Vue props and store getters reach the template and child components', () => {
  const r = find(tempApp({
    'ContactPanel.vue': [
      '<template>',
      '  <div class="panel">',
      '    <h3>{{ contact.name }}</h3>',
      '    <InfoRow :value="contact.email" />',
      '    <span :title="agentName">Assigned</span>',
      '    <p>{{ $t(\'HELP.TEXT\') }}</p>',
      '  </div>',
      '</template>',
      '<script>',
      "import { mapGetters } from 'vuex';",
      'export default {',
      '  props: { contact: { type: Object, default: () => ({}) }, columns: Array },',
      "  computed: { ...mapGetters({ currentUser: 'getCurrentUser', uiFlags: 'contacts/getUIFlags' }), agentName() { return this.currentUser.name; } },",
      '};',
      '</script>',
    ].join('\n'),
    'InfoRow.vue': '<template>\n  <span class="row">{{ value }}</span>\n</template>\n<script setup>\ndefineProps({ value: String });\n</script>\n',
  }));
  const panel = r.candidates.find((c) => c.file === 'ContactPanel.vue');
  assert.deepEqual(panel.site_lines, [3, 4, 5]);
  const row = r.candidates.find((c) => c.file === 'InfoRow.vue');
  assert.deepEqual(row.site_lines, [2]);
  assert.match(row.sites[0].origin, /via <ContactPanel value>/);
});

test('template pass: Svelte props, each blocks and page data', () => {
  const r = find(tempApp({
    'routes/+page.svelte': '<script lang="ts">\n  let { data } = $props();\n</script>\n\n{#each data.albums as album (album.id)}\n  <a href="/albums/{album.id}" title={album.albumName}>{album.albumName}</a>\n{/each}\n<p>{size}</p>\n',
    'Avatar.svelte': '<script lang="ts">\n  interface Props { user: UserResponseDto; size?: string }\n  let { user, size = \'md\' }: Props = $props();\n  let title = $derived(`${user.name} (${user.email})`);\n</script>\n\n<figure class="avatar {size}" title={title}>\n  <img src={user.profileImagePath} alt="" />\n</figure>\n',
  }));
  const page = r.candidates.find((c) => c.file.endsWith('+page.svelte'));
  assert.deepEqual(page.site_lines, [6]);
  const avatar = r.candidates.find((c) => c.file === 'Avatar.svelte');
  assert.deepEqual(avatar.site_lines, [7, 8]);
});

test('uncovered sites: lines of annotated and dismissed units outside every annotated element are reported', () => {
  const scan = {
    sdk: 'rrweb',
    candidates: [
      { id: 'C1', file: 'Card.tsx', component: 'Card', sites: [{ line: 3, tag: 'h3', kind: 'text', expr: 'user.name', origin: 'useUser()' }, { line: 6, tag: 'span', kind: 'text', expr: 'user.email', origin: 'useUser()' }, { line: 7, tag: 'Avatar', kind: 'prop user', expr: 'user', origin: 'useUser()' }, { line: 8, tag: 'input', kind: 'attr value', expr: 'user.phone', origin: 'useUser()' }] },
      { id: 'C2', file: 'Row.tsx', component: 'Row', sites: [{ line: 4, tag: 'a', kind: 'attr href', expr: '`/sign/${token}`', origin: 'secret name' }, { line: 5, tag: 'p', kind: 'text', expr: 'row.title', origin: 'prop row' }, { line: 6, tag: 'td', kind: 'text', expr: 'row.id', origin: 'prop row' }, { line: 7, tag: 'tr', kind: 'attr data-state', expr: 'row.status', origin: 'prop row' }, { line: 8, tag: 'DialogTrigger', kind: 'text', expr: 'trigger', origin: 'prop trigger' }] },
    ],
  };
  const spans = (file) => (file === 'Card.tsx' ? [[2, 2, 4]] : []);
  const decisions = { annotations: [{ file: 'Card.tsx', line: 2, value: 'mask', candidates: ['C1'] }], dismissed: { C2: 'row actions' } };
  assert.deepEqual(uncoveredSites(scan, decisions, spans).map((u) => [u.id, u.lines, u.dismissed]), [['C1', [6], false], ['C2', [4, 5], true]]);
  decisions.dismissed['C1:L6'] = 'shown only to the user';
  decisions.dismissed['C2:L5'] = 'shows the template title, the same for all users';
  assert.deepEqual(uncoveredSites(scan, decisions, spans).map((u) => [u.id, u.lines]), [['C2', [4]]]);
});

test('component pass: conditions and mapped elements are not text sites', () => {
  const r = find(tempApp({ 'List.tsx': "export function List() {\n  const { data: rows } = useQuery(q);\n  return (\n    <div>\n      {rows.length > 0 && (\n        <ul>{rows.map((r) => <li key={r.id}>{r.fullName}</li>)}</ul>\n      )}\n      <p>{_(msg`Empty`)}</p>\n    </div>\n  );\n}\n" }));
  const unit = r.candidates.find((c) => c.component === 'List');
  assert.deepEqual(unit.site_lines, [6]);
  assert.deepEqual(unit.sites.map((s) => s.tag), ['li']);
});

test('schema reader: Prisma and Rails fields get a category', () => {
  const dir = tempApp({
    'prisma/schema.prisma': 'enum Status {\n  DRAFT\n}\nmodel User {\n  id Int @id\n  email String\n  password String?\n  status Status\n  disabled Boolean\n  documentCount Int\n  order Int\n  team Team @relation(fields: [teamId], references: [id])\n}\n',
    'db/schema.rb': 'create_table "contacts", force: :cascade do |t|\n    t.string "phone_number"\n    t.datetime "last_seen_at"\n    t.jsonb "custom_attributes"\n  end\n',
  });
  const f = readSchemas(dir).fields;
  const cat = (n) => f.get(n)?.category;
  assert.deepEqual(['email', 'password', 'status', 'disabled', 'documentCount', 'order', 'id', 'phone_number', 'last_seen_at', 'custom_attributes', 'team'].map(cat),
    ['private', 'secret', 'public', 'public', 'private', 'public', 'public', 'private', 'public', 'private', undefined]);
});

test('component pass: schema fields and unknown hooks fail closed, schema public fields are skipped', () => {
  const r = find(tempApp({
    'prisma/schema.prisma': 'model Envelope {\n  id String @id\n  title String\n  status String\n  completed Boolean\n}\n',
    'Row.tsx': "export function Row({ item }) {\n  const extra = useExtras();\n  return (\n    <tr>\n      <td>{item.title}</td>\n      <td>{item.completed}</td>\n      <td>{extra.note}</td>\n    </tr>\n  );\n}\n",
  }));
  const unit = r.candidates.find((c) => c.component === 'Row');
  assert.deepEqual(unit.sites.map((s) => [s.line, s.confidence]), [[5, 'high'], [7, 'low']]);
  assert.match(unit.sites[0].origin, /schema private field title/);
  assert.equal(unit.confidence, 'high');
});
