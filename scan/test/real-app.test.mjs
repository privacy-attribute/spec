import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { measureApp, measureRows, regressions } from '../benchmark/apps/measure.mjs';
import { summarizeReviews } from '../benchmark/apps/reviews.mjs';

const file = 'Account.jsx';
const publicFile = 'Public.jsx';
const source = [
  'export function Account() {',
  '  const { account } = useLoaderData();',
  '  return (',
  '    <section>',
  '      <span>{account.email}</span>',
  '      <span>Account settings</span>',
  '    </section>',
  '  );',
  '}',
].join('\n');
const text = 'export const Public = () => (\n  <h2>Help</h2>\n);\n';
const row = (line, category, value, tag = 'span') => ({ line, category, value, tag, what: 'Test label' });
const labels = {
  app: 'fixture',
  held_out: [file],
  files: {
    [file]: [row(5, 'personal', 'mask'), row(6, 'public', 'none')],
    [publicFile]: [row(2, 'public', 'none', 'h2')],
  },
};

function checkout(t) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'privacy-real-app-test-')));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '-q');
  git('config', 'core.autocrlf', 'false');
  fs.writeFileSync(path.join(dir, file), source);
  fs.writeFileSync(path.join(dir, publicFile), text);
  fs.writeFileSync(path.join(dir, '.gitignore'), 'generated.jsx\n');
  git('add', '.');
  git('-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'Pinned source');
  return { dir, git, labels: { ...labels, commit: git('rev-parse', 'HEAD') } };
}

test('benchmark verifies a pinned checkout and measures actual Git application separately', async (t) => {
  const { dir, git, labels } = checkout(t);
  const result = await measureApp({ source: dir, labels, split: 'held-out' });
  assert.equal(result.revision, labels.commit);
  assert.equal(result.patch_scope, 'sample-files');
  assert.equal(result.patch_application, 'applied');
  assert.equal(result.replay, 'unmeasured');
  assert.deepEqual(Object.keys(result.groups), ['held-out']);
  const heldOut = result.groups['held-out'].all;
  assert.equal(heldOut.detected_exact, 1);
  assert.equal(heldOut.placed_exact, 1);
  assert.equal(heldOut.treated_exact, 1);
  assert.equal(heldOut.static_covered, 1);
  assert.equal(heldOut.public_treated, 0);
  assert.equal(git('status', '--porcelain'), '');
  assert.equal(fs.readFileSync(path.join(dir, file), 'utf8'), source);
  assert.deepEqual(regressions(result, result), []);

  const wrong = labels.commit.replace(/^./, (digit) => digit === 'a' ? 'b' : 'a');
  await assert.rejects(measureApp({ source: dir, labels: { ...labels, commit: wrong } }), /labels require/);
  fs.writeFileSync(path.join(dir, 'generated.jsx'), text);
  await assert.rejects(measureApp({ source: dir, labels }), /clean working tree/);
});

test('nearby detection and ancestor treatment do not score as exact placement', () => {
  const sources = new Map([[file, source], [publicFile, text]]);
  const measure = (annotations) => measureRows({
    labels, sources, split: 'held-out',
    scan: { candidates: [{ file, line: 6, category_hint: 'personal?' }] },
    patch: { application: 'projection', style: 'rrweb', annotations },
  });
  const exact = measure([{ file, line: 5, match: '<span', value: 'mask' }]);
  const ancestor = measure([{ file, line: 4, match: '<section', value: 'mask' }]);
  const grouped = ancestor.groups['held-out'].all;
  assert.equal(grouped.detected_exact, 0);
  assert.equal(grouped.detected_contextual, 1);
  assert.equal(grouped.placed_exact, 0);
  assert.equal(grouped.placed_ancestor, 1);
  assert.equal(grouped.treated_exact, 0);
  assert.equal(grouped.treated_correctly, 1);
  assert.equal(grouped.static_covered, 1);
  assert.equal(grouped.public_treated, 1);

  const report = (result) => ({ ...result, app: 'fixture', revision: 'fixture-sha', patch_scope: 'sample-files' });
  assert.deepEqual(regressions(report(ancestor), report(exact)), [
    'held-out/personal placed_exact 1 -> 0',
    'held-out/personal treated_exact 1 -> 0',
    'held-out/public public_treated 0 -> 1',
  ]);
  assert.throws(() => regressions(report(ancestor), { ...report(exact), revision: 'different' }), /Cannot compare/);
});

test('a coordinate distinguishes same-line siblings', () => {
  const input = 'export const Profile = ({ user }) => <><span>{user.email}</span><span>Welcome</span></>;';
  const first = input.indexOf('<span');
  const second = input.indexOf('<span', first + 1);
  const result = measureRows({
    labels: { files: { [file]: [
      { ...row(1, 'personal', 'mask'), column: first + 1 },
      { ...row(1, 'public', 'none'), column: second + 1 },
    ] } },
    sources: new Map([[file, input]]),
    scan: { candidates: [] },
    patch: { application: 'projection', style: 'rrweb', annotations: [{ file, line: 1, column: first, match: '<span', value: 'mask' }] },
  });
  assert.equal(result.rows[0].exact_treatment, 'matched');
  assert.equal(result.rows[1].static, null);
  assert.equal(result.rows[1].target_verified, true);
});

test('review summaries keep model submissions, omissions and adjudication distinct', () => {
  const privateLabel = { ...row(5, 'personal', 'mask'), file };
  const publicLabel = { ...row(6, 'public', 'none'), file };
  const submissions = [
    { id: 'one', kind: 'model', method: 'Independent source pass', files: [file], rows: [privateLabel, publicLabel] },
    { id: 'two', kind: 'model', method: 'Independent source pass', files: [file], rows: [privateLabel] },
  ];
  const sample = new Set([file]);
  const data = { ...labels, review: { status: 'model-reviewed', submissions } };
  const unreviewed = summarizeReviews(data, sample);
  assert.equal(unreviewed.human_submissions, 0);
  assert.equal(unreviewed.human_agreed, 0);
  assert.equal(unreviewed.model_submissions, 2);
  assert.equal(unreviewed.agreed, 1);
  assert.equal(unreviewed.unresolved, 1);
  assert.deepEqual(unreviewed.disagreements[0].votes.map(({ verdict }) => verdict), ['public/none', null]);
  data.review.adjudications = [{
    file, line: 6, reviewer: { id: 'adjudicator', kind: 'model' },
    chosen: { category: 'public', value: 'none' }, reason: 'Static heading.',
  }];
  const reviewed = summarizeReviews(data, sample);
  assert.equal(reviewed.unresolved, 0);
  assert.equal(reviewed.disagreements[0].adjudication.reviewer.kind, 'model');
  data.review.adjudications[0].chosen = { category: 'personal', value: 'mask' };
  assert.throws(() => summarizeReviews(data, sample), /Adjudication disagrees/);
});

test('real-app manifests use full revisions and preserve review provenance', () => {
  for (const app of ['documenso', 'chatwoot', 'immich', 'akaunting']) {
    const manifest = JSON.parse(fs.readFileSync(new URL(`../benchmark/apps/${app}/labels.json`, import.meta.url)));
    assert.match(manifest.commit, /^[0-9a-f]{40}$/);
    const review = summarizeReviews(manifest, new Set(Object.keys(manifest.files)));
    const legacy = ['documenso', 'chatwoot'].includes(app);
    assert.equal(review.status, legacy ? 'unverified-legacy' : 'model-reviewed');
    assert.equal(review.human_submissions, 0);
    assert.equal(review.model_submissions, legacy ? 0 : 2);
    assert.equal(review.unresolved, 0);
    assert.ok(Object.values(manifest.files).some((rows) => rows.some((label) => label.category === 'public')));
    assert.equal(manifest.held_out.length, legacy ? 0 : 1);
  }
});
