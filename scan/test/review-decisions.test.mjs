import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { proposeReviewPatch, validateReview } from '../review/decisions.mjs';
import { inventory as buildInventory } from '../review/inventory.mjs';
import { spansFor } from '../templates.mjs';

const file = 'View.tsx';
const sha = (text) => createHash('sha256').update(text).digest('hex');
const reviewOf = (...decisions) => ({ schema_version: 1, reviewer: { id: 'source-reader', kind: 'human' }, decisions });

function fixture(t, source, fileName = file) {
  const file = fileName;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'privacy-review-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (name, text) => fs.writeFileSync(path.join(root, name), text);
  write(file, source);
  const inventory = {
    schema_version: 1, root, files: [{ file, sha256: sha(source), language: 'tsx', status: 'parsed' }],
    sites: [], failures: [],
  };
  const spans = spansFor(file, source);
  const site = (id, expression, owner, options = {}) => {
    const [line, , , tag, column, start, end, open_end] = spans[owner];
    const index = source.indexOf(expression, start);
    assert.ok(index >= start && index + expression.length <= end, expression);
    const lines = source.slice(0, index).split('\n');
    const entry = {
      id, file, expression, tag, channel: 'text', native: true,
      start: index, end: index + expression.length, line: lines.length, column: lines.at(-1).length,
      target: { line, column, start, end, open_end }, ...options,
    };
    inventory.sites.push(entry);
    return entry;
  };
  const decision = (site, category, treatment, values = {}) => ({
    site_id: site.id, status: 'decided', category, treatment, special_category: false,
    meaning: 'Meaning established by the cited source', rationale: 'The runtime origin determines the category',
    evidence: [{ file, start_line: site.line, end_line: site.line, quote: site.expression, sha256: sha(source) }],
    ...values,
  });
  return { root, inventory, site, decision, write };
}

test('context can make an ordinary property a secret while a credential-like name is public', (t) => {
  const source = 'import { payload } from "./provider";\nconst screen = <><p>{payload.name}</p><p>{publicApiKey}</p><p>{payload.owner}</p></>;\n';
  const { root, inventory, site, decision, write } = fixture(t, source);
  const dependency = 'export const payload = { name: getResetToken(), owner: currentUser.name };\n';
  write('provider.ts', dependency);
  const secret = site('S1', 'payload.name', 0);
  const visible = site('S2', 'publicApiKey', 1);
  const personal = site('S3', 'payload.owner', 2);
  const first = decision(secret, 'secret', 'block', { meaning: 'Password reset token' });
  first.evidence.push({ file: 'provider.ts', start_line: 1, end_line: 1, quote: 'name: getResetToken()', sha256: sha(dependency) });
  const review = reviewOf(first,
    decision(visible, 'public', 'none', { meaning: 'Public documentation placeholder' }),
    decision(personal, 'personal', 'mask', { meaning: 'Signed-in person’s name' }));
  const result = proposeReviewPatch(root, inventory, review);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.unresolved, []);
  assert.deepEqual(result.missing, []);
  assert.deepEqual(result.annotations.map(({ site_ids, value }) => [site_ids, value]), [[['S1'], 'block'], [['S3'], 'mask']]);
  assert.equal(result.after[file], source.replace('<p>{payload.name}', '<p data-privacy="block">{payload.name}')
    .replace('<p>{payload.owner}', '<p data-privacy="mask">{payload.owner}'));
  assert.deepEqual(result.public_losses, []);
  const applied = spawnSync('git', ['apply', '--check', '-'], { cwd: root, input: result.patch, encoding: 'utf8' });
  assert.equal(applied.status, 0, applied.stderr);
  assert.equal(fs.readFileSync(path.join(root, file), 'utf8'), source);
});

test('each evidence quote must be literal and an exact source citation must reach the site', (t) => {
  const source = 'const unrelated = "example";\nconst screen = <p>{user.name}</p>;\n';
  const { root, inventory, site, decision } = fixture(t, source);
  const value = site('S1', 'user.name', 0);
  const base = decision(value, 'personal', 'mask');
  const check = (change, pattern) => {
    const input = { ...base, evidence: [{ ...base.evidence[0], ...change }] };
    const result = proposeReviewPatch(root, inventory, reviewOf(input));
    assert.match(result.errors[0].reason, pattern);
    assert.equal(result.patch, '');
  };
  check({ quote: 'user.email' }, /quote does not occur/);
  check({ start_line: 1, end_line: 1 }, /quote does not occur/);
  check({ start_line: 1, end_line: 1, quote: 'example' }, /quote the reviewed source span/);
  check({ end_line: 9 }, /outside/);
  check({ file: '../View.tsx' }, /relative file/);
});

test('an evidence dependency edited after review prevents the patch', (t) => {
  const source = 'const screen = <p>{context.name}</p>;\n';
  const { root, inventory, site, decision, write } = fixture(t, source);
  const value = site('S1', 'context.name', 0);
  const original = 'export const context = { name: activeUser.displayName };\n';
  const base = decision(value, 'personal', 'mask');
  base.evidence.push({ file: 'context.ts', start_line: 1, end_line: 1, quote: 'activeUser.displayName', sha256: sha(original) });
  write('context.ts', original);
  assert.deepEqual(validateReview(root, inventory, reviewOf(base)).errors, []);
  write('context.ts', original + '// Changed without updating the quote.\n');
  let result = proposeReviewPatch(root, inventory, reviewOf(base));
  assert.equal(result.patch, '');
  assert.match(result.errors[0].reason, /evidence SHA-256 changed for context.ts/);
  write(file, source + '// The display file changed too.\n');
  result = proposeReviewPatch(root, inventory, reviewOf(base));
  assert.ok(result.errors.some(({ reason }) => reason === 'inventory SHA-256 changed'));
});

test('custom destinations, explicit unresolved decisions, and omissions stay open', (t) => {
  const source = 'const view = <><Widget value={person.name} /><p>{summary}</p><span>{other}</span></>;\n';
  const { root, inventory, site, decision } = fixture(t, source);
  const custom = site('S1', 'person.name', 0, { channel: 'prop:value', native: false });
  const waiting = site('S2', 'summary', 1);
  const missing = site('S3', 'other', 2);
  const pending = decision(waiting, null, null, { status: 'unresolved', reason: 'Provider has two unknown call sites', evidence: [] });
  const report = proposeReviewPatch(root, inventory, reviewOf(decision(custom, 'personal', 'mask'), pending));
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.missing, [missing.id]);
  assert.deepEqual(report.unresolved.map(({ site_id }) => site_id).sort(), [custom.id, waiting.id]);
  assert.equal(report.patch, '');
});

test('same-element public content requires explicit acceptance and is reported as a loss', (t) => {
  const source = 'const view = <p aria-label="Account owner">{profile.name}</p>;\n';
  const { root, inventory, site, decision } = fixture(t, source);
  const label = site('S1', 'Account owner', 0, { channel: 'attribute:aria-label' });
  const value = site('S2', 'profile.name', 0);
  const clear = decision(label, 'public', 'none');
  const hide = decision(value, 'personal', 'mask');
  let report = proposeReviewPatch(root, inventory, reviewOf(clear, hide));
  assert.equal(report.patch, '');
  assert.match(report.unresolved[0].reason, /affects public sites/);
  const accept_shared = 'The field cannot be split in this patch, and the heading still identifies the owner.';
  report = proposeReviewPatch(root, inventory, reviewOf(clear, { ...hide, accept_shared }));
  assert.deepEqual(report.unresolved, []);
  assert.match(report.after[file], /<p data-privacy="mask"/);
  assert.deepEqual(report.public_losses, [
    { site_id: label.id, file, line: label.line, column: label.column, annotation_site_ids: [value.id], treatment: 'mask', reason: accept_shared },
  ]);
});

test('a parent control cannot hide descendant public text and an incomplete owner cannot be patched', (t) => {
  const source = 'const view = <p className="banner">{profile.name}<span>Greeting</span></p>;\n';
  const { root, inventory, site, decision } = fixture(t, source);
  const className = site('S1', 'banner', 0, { channel: 'attribute:className' });
  const value = site('S2', 'profile.name', 0);
  const heading = site('S3', 'Greeting', 1);
  const hide = decision(value, 'personal', 'mask');
  let report = proposeReviewPatch(root, inventory, reviewOf(hide, decision(heading, 'public', 'none')));
  assert.deepEqual(report.missing, [className.id]);
  assert.match(report.unresolved[0].reason, /awaiting review: S1/);
  report = proposeReviewPatch(root, inventory, reviewOf(hide, decision(className, 'public', 'none'), decision(heading, 'public', 'none')));
  assert.equal(report.patch, '');
  assert.match(report.unresolved[0].reason, /affects public sites: S3/);
});

test('deduplicated native owners keep the strongest reviewed or existing treatment', (t) => {
  const source = 'const view = <><p title={owner.name}>{owner.session}</p><p data-privacy="block">{user.name}</p></>;\n';
  const { root, inventory, site, decision } = fixture(t, source);
  const title = site('S1', 'owner.name', 0, { channel: 'attribute:title' });
  const token = site('S2', 'owner.session', 0);
  const existing = site('S3', 'user.name', 1);
  const result = proposeReviewPatch(root, inventory, reviewOf(
    decision(title, 'personal', 'mask'), decision(token, 'secret', 'block'), decision(existing, 'personal', 'mask')));
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.unresolved, []);
  assert.deepEqual(result.annotations.map(({ site_ids, value }) => [site_ids, value]), [[['S1', 'S2'], 'block'], [['S3'], 'block']]);
  assert.equal(result.after[file], source.replace('<p title=', '<p data-privacy="block" title='));
});

test('the treatment gate rejects unsafe masks and public removals', (t) => {
  const source = 'const view = <><a href={account.url}>Account</a><input checked={record.answer} value={record.code} /></>;\n';
  const { root, inventory, site, decision } = fixture(t, source);
  const url = site('S1', 'account.url', 0, { channel: 'attribute:href' });
  const publicLabel = site('S2', 'Account', 0);
  site('S3', 'record.answer', 1, { channel: 'input:checked' });
  const code = site('S4', 'record.code', 1, { channel: 'input:value' });
  const result = proposeReviewPatch(root, inventory, reviewOf(
    decision(url, 'personal', 'mask'), decision(publicLabel, 'public', 'mask'),
    decision(code, 'personal', 'mask', { special_category: true })));
  assert.deepEqual(result.errors.map(({ reason }) => reason), [
    'the site channel requires block', 'public decisions require treatment none', 'special-category choices require block',
  ]);
  assert.equal(result.patch, '');
});

test('invalid review containers and tampered target spans cannot produce a patch', (t) => {
  const source = 'const view = <p>{name}</p>;\n';
  const { root, inventory, site, decision } = fixture(t, source);
  const value = site('S1', 'name', 0);
  const invalid = validateReview(root, inventory, { ...reviewOf(), decisions: null });
  assert.equal(invalid.errors.length, 1);
  assert.deepEqual(invalid.missing, ['S1']);
  const base = decision(value, 'secret', 'block');
  const duplicate = validateReview(root, inventory, reviewOf(base, base));
  assert.match(duplicate.errors[0].reason, /duplicate/);
  value.target.open_end++;
  const report = proposeReviewPatch(root, inventory, reviewOf(base));
  assert.equal(report.patch, '');
  assert.match(report.unresolved[0].reason, /no verified native destination/);
});

test('additional findings require exact evidence and remain unresolved until a mapped site is verified', (t) => {
  const source = 'const view = <p>{profile.name}</p>;\ndocument.title = profile.name;\n';
  const { root, inventory, site, decision } = fixture(t, source);
  const value = site('S1', 'profile.name', 0);
  const visible = { file, line: 1, quote: 'profile.name', channel: 'text', meaning: 'Profile name', reason: 'Site may have been omitted', site_id: value.id };
  const title = { ...visible, line: 2, channel: 'title', reason: 'Review separate browser capture of the title' };
  const review = { ...reviewOf(decision(value, 'personal', 'mask')), additional_findings: [visible, title] };
  const result = proposeReviewPatch(root, inventory, review);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.additional_findings.map(({ status }) => status), ['resolved', 'unresolved']);
  assert.deepEqual(result.unresolved.map(({ finding_index }) => finding_index), [1]);
  assert.match(result.after[file], /<p data-privacy="mask"/);
  review.additional_findings[1] = { ...title, quote: 'invented secret' };
  const bad = proposeReviewPatch(root, inventory, review);
  assert.match(bad.errors[0].reason, /quote does not occur/);
  assert.equal(bad.patch, '');
});

test('an explicit semantic group expands only its listed site IDs and refuses overlap', (t) => {
  const source = 'const view = <><p>{owner.name}</p><span>{owner.name}</span><i>{label}</i></>;\n';
  const { root, inventory, site, decision } = fixture(t, source);
  const first = site('S1', 'owner.name', 0);
  const second = site('S2', 'owner.name', 1);
  site('S3', 'label', 2);
  const { site_id, ...shared } = decision(first, 'personal', 'mask');
  const group = { id: 'owner-name', site_ids: [first.id, second.id], ...shared };
  const input = { ...reviewOf(), groups: [group] };
  const report = proposeReviewPatch(root, inventory, input);
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.missing, ['S3']);
  assert.deepEqual(report.decisions.map(({ site_id, group_id }) => [site_id, group_id]), [[first.id, group.id], [second.id, group.id]]);
  assert.equal(report.annotations.length, 2);
  const overlap = proposeReviewPatch(root, inventory, { ...input, decisions: [{ ...shared, site_id }] });
  assert.match(overlap.errors[0].reason, /duplicate/);
  assert.equal(overlap.patch, '');
});

test('a verified proposal-only placement does not close a private custom prop', (t) => {
  const source = 'const view = <Widget value={profile.name} />;\n';
  const { root, inventory, site, decision } = fixture(t, source);
  const value = site('S1', 'profile.name', 0, { channel: 'prop:value', native: false });
  const base = decision(value, 'personal', 'mask');
  const suggested_placement = { file, line: 1, column: value.target.column, tag: 'span', kind: 'wrapper', rationale: 'A native span may be needed around the visible value', evidence: base.evidence };
  const report = proposeReviewPatch(root, inventory, reviewOf({ ...base, suggested_placement }));
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.decisions[0].suggested_placement, suggested_placement);
  assert.equal(report.unresolved[0].site_id, value.id);
  assert.equal(report.patch, '');
});

test('a partial inventory still proposes independently verified native sites', (t) => {
  const source = 'const view = <p>{profile.name}</p>;\ndocument.title = profile.name;\n';
  const { root, decision } = fixture(t, source);
  const inventory = buildInventory(root);
  assert.notEqual(inventory.files[0].status, 'parsed');
  assert.ok(inventory.failures.length > 0);
  const display = inventory.sites.find(({ expression }) => expression === 'profile.name');
  const result = proposeReviewPatch(root, inventory, reviewOf(decision(display, 'personal', 'mask')));
  assert.deepEqual(result.errors, []);
  assert.match(result.after[file], /<p data-privacy="mask"/);
});

test('a cited shared component prop with a public caller requires explicit acceptance', (t) => {
  const source = 'import Widget from "./Widget";\nconst view = <><Widget value={profile.name}/><Widget value="Public example"/></>;\n';
  const { root, decision, write } = fixture(t, source);
  const definitionFile = 'Widget.tsx';
  const definition = 'export default function Widget({value}) { return <p>{value}</p>; }\n';
  write(definitionFile, definition);
  const inventory = buildInventory(root);
  const [privateProp, publicProp] = inventory.sites.filter((site) => site.channel === 'prop:value');
  const leaf = inventory.sites.find((site) => site.file === definitionFile && site.channel === 'text');
  const privateCaller = decision(privateProp, 'personal', 'mask');
  const publicCaller = decision(publicProp, 'public', 'none');
  const placement = decision(leaf, 'personal', 'mask', {
    evidence: [
      { file: definitionFile, start_line: 1, end_line: 1, quote: 'value', sha256: sha(definition) },
      ...privateCaller.evidence,
    ],
  });
  let report = proposeReviewPatch(root, inventory, reviewOf(privateCaller, publicCaller, placement));
  assert.deepEqual(report.errors, []);
  assert.equal(report.patch, '');
  assert.ok(report.unresolved.some(({ site_id, reason }) => site_id === leaf.id && reason.includes(publicProp.id)));
  const accept_shared = 'The public example is duplicated in a separate help section.';
  report = proposeReviewPatch(root, inventory, reviewOf(privateCaller, publicCaller, { ...placement, accept_shared }));
  assert.match(report.after[definitionFile], /<p data-privacy="mask"/);
  assert.deepEqual(report.public_losses.map(({ file, site_id, reason }) => [file, site_id, reason]), [[file, publicProp.id, accept_shared]]);
  assert.ok(report.unresolved.some(({ site_id }) => site_id === privateProp.id));
});

test('Vue mask preserves public predicates and events but counts real field hints', (t) => {
  const view = 'View.vue';
  const source = '<template><p v-if="enabled" v-for="entry in entries" @click="select">{{ entry.name }}</p><input placeholder="Search people" :value="account.name" /></template>\n';
  const { root, decision } = fixture(t, source, view);
  const inventory = buildInventory(root);
  const visible = inventory.sites.find(({ expression }) => expression === 'entry.name');
  const field = inventory.sites.find(({ expression }) => expression === 'account.name');
  const decisions = inventory.sites.map((site) => site === visible || site === field
    ? decision(site, 'personal', 'mask') : decision(site, 'public', 'none'));
  assert.equal(inventory.sites.filter(({ channel }) => channel === 'conditional').length, 2);
  assert.equal(inventory.sites.some(({ expression }) => expression === 'select'), false);
  const result = proposeReviewPatch(root, inventory, reviewOf(...decisions));
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.annotations.map(({ site_ids }) => site_ids), [[visible.id]]);
  assert.match(result.after[view], /<p data-privacy="mask" v-if="enabled" v-for="entry in entries" @click="select">/);
  assert.match(result.after[view], /<input placeholder="Search people"/);
  assert.match(result.unresolved[0].reason, /affects public sites/);
  assert.deepEqual(result.public_losses, []);
});

test('a block charges for public DOM controls and attributes without charging for framework bookkeeping', (t) => {
  const view = 'View.vue';
  const source = '<template><section data-privacy="mask" v-if="ready">{{ token }}<button /><div /><img src="/public.svg" /></section></template>\n';
  const { root, decision } = fixture(t, source, view);
  const inventory = buildInventory(root);
  const accept_shared = 'The same controls are available in the heading toolbar.';
  const decisions = inventory.sites.map((site) => site.expression === 'token'
    ? decision(site, 'secret', 'block', { accept_shared }) : decision(site, 'public', 'none'));
  const result = proposeReviewPatch(root, inventory, reviewOf(...decisions));
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.unresolved, []);
  assert.match(result.after[view], /<section data-privacy="block" v-if="ready"/);
  const byId = new Map(inventory.sites.map((site) => [site.id, site]));
  assert.deepEqual(result.public_losses.map(({ site_id }) => byId.get(site_id).channel), ['element', 'attribute:src']);
  assert.deepEqual(result.public_losses.map(({ site_id }) => byId.get(site_id).tag), ['button', 'img']);
});

test('a verified proposed native block absorbs direct descendant placements and keeps siblings', (t) => {
  const source = 'const view = <><div data-token={secretValue}><><span>{person.name}</span></></div><span>{another.name}</span></>;\n';
  const { root, inventory, site, decision } = fixture(t, source);
  const outer = site('S1', 'secretValue', 0, { channel: 'attribute:data-token' });
  const inner = site('S2', 'person.name', 1);
  const sibling = site('S3', 'another.name', 2);
  const result = proposeReviewPatch(root, inventory, reviewOf(
    decision(outer, 'secret', 'block'), decision(inner, 'personal', 'mask'), decision(sibling, 'personal', 'mask')));
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.unresolved, []);
  assert.deepEqual(result.annotations.map(({ site_ids, value }) => [site_ids, value]), [[['S1', 'S2'], 'block'], [['S3'], 'mask']]);
  assert.equal(result.after[file], source.replace('<div data-token', '<div data-privacy="block" data-token')
    .replace('<span>{another.name}', '<span data-privacy="mask">{another.name}'));
});

test('existing native blocks cover direct children but do not absorb custom or portal descendants', (t) => {
  const source = 'const view = <main data-privacy="block"><span>{person.name}</span><Portal><span>{portal.name}</span></Portal>{createPortal(<span>{floating.name}</span>, document.body)}</main>;\n';
  const { root, inventory, site, decision } = fixture(t, source);
  const direct = site('S1', 'person.name', 1);
  const custom = site('S2', 'portal.name', 3);
  const floating = site('S3', 'floating.name', 4);
  const result = proposeReviewPatch(root, inventory, reviewOf(...[direct, custom, floating].map((site) => decision(site, 'personal', 'mask'))));
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.unresolved, []);
  assert.deepEqual(result.annotations.map(({ site_ids, value, match }) => [site_ids, value, match]), [
    [['S2'], 'mask', '<span'], [['S3'], 'mask', '<span'], [['S1'], 'block', '<main'],
  ]);
  assert.equal(result.after[file], source.replace('<span>{portal.name}', '<span data-privacy="mask">{portal.name}')
    .replace('<span>{floating.name}', '<span data-privacy="mask">{floating.name}'));
});

test('Vue ancestry preserves separate protection through an opaque lowercase component', (t) => {
  const view = 'View.vue';
  const source = '<template><section data-privacy="block"><foreign><span>{{ external.name }}</span></foreign><div><span>{{ direct.name }}</span></div></section></template>\n';
  const { root, decision } = fixture(t, source, view);
  const inventory = buildInventory(root);
  const reviewed = inventory.sites.map((site) => site.channel === 'text'
    ? decision(site, 'personal', 'mask') : decision(site, 'public', 'none'));
  const result = proposeReviewPatch(root, inventory, reviewOf(...reviewed));
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.unresolved, []);
  assert.equal(result.after[view], source.replace('<span>{{ external.name }}', '<span data-privacy="mask">{{ external.name }}'));
});

test('a failed ancestor block leaves the verified descendant annotation in the proposal', (t) => {
  const source = 'const view = <div {...attrs} data-token={secret}><span>{person.name}</span></div>;\n';
  const { root, inventory, site, decision } = fixture(t, source);
  const spread = site('S1', 'attrs', 0, { channel: 'spread' });
  const outer = site('S2', 'secret', 0, { channel: 'attribute:data-token' });
  const inner = site('S3', 'person.name', 1);
  const result = proposeReviewPatch(root, inventory, reviewOf(
    decision(spread, 'public', 'none'), decision(outer, 'secret', 'block'), decision(inner, 'personal', 'mask')));
  assert.deepEqual(result.errors, []);
  assert.match(result.unresolved[0].reason, /attribute spread/);
  assert.deepEqual(result.annotations.map(({ site_ids }) => site_ids), [[inner.id]]);
  assert.match(result.after[file], /<span data-privacy="mask">/);
});
