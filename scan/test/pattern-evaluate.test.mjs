import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { evaluatePatternReview } from '../patterns/evaluate.mjs';

const file = 'View.tsx';
const source = `<main>
  <h1>Account</h1>
  <p>{viewer.displayName}</p>
  <Widget answer={client.healthAnswer} />
  <p>{resetToken}</p>
  <p>{inviteToken}</p>
  <p>{viewer.location}</p>
  <a>Help</a>
</main>`;

function fixture(t, labels) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'privacy-pattern-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const sourceRoot = path.join(directory, 'source');
  fs.mkdirSync(sourceRoot);
  fs.writeFileSync(path.join(sourceRoot, file), source);
  const targets = labels.map(([id, surface]) => ({ id, case_id: 'page', file, surface, channel: 'text' }));
  const oracle = {
    targets: labels.map(([id, quote, category, accepted_treatments, special_category = false]) => ({
      id, category, accepted_treatments, special_category,
      reason: 'Ground truth for the synthetic page', evidence: { file, quote },
    })),
  };
  const review = { reviewer: { id: 'reviewer', kind: 'human', usage: null }, decisions: [] };
  const submit = (id, changes = {}) => {
    const { category, special_category, accepted_treatments, evidence } = oracle.targets.find(row => row.id === id);
    review.decisions.push({
      id, category, special_category, treatment: accepted_treatments[0],
      reason: 'Source judgment for the synthetic page', evidence: { ...evidence }, ...changes,
    });
  };
  return { directory, input: { targets, oracle, review, sourceRoot }, submit };
}

test('counts each outcome against the fixed target list and scores classifications and treatment independently', (t) => {
  const { input, submit } = fixture(t, [
    ['title', 'Account', 'public', ['public']],
    ['member', 'viewer.displayName', 'personal', ['mask', 'block']],
    ['panel', 'client.healthAnswer', 'third-party', ['unresolved'], true],
    ['missing', 'resetToken', 'secret', ['block']],
    ['invite', 'inviteToken', 'secret', ['block']],
    ['location', 'viewer.location', 'personal', ['mask']],
    ['link', 'Help', 'public', ['public']],
  ]);
  submit('link');
  submit('location', { category: 'public' });
  submit('invite', { treatment: 'public' });
  submit('panel');
  submit('member', { category: 'third-party', special_category: true, treatment: 'block' });
  submit('title', { treatment: 'mask' });

  const { reviewer, summary, targets } = evaluatePatternReview(input);
  assert.deepEqual(reviewer, input.review.reviewer);
  assert.deepEqual(summary, {
    total_targets: 7, private_targets: 5, public_targets: 2, reviewed: 6, missed: 1,
    invalid_evidence: 0, category_correct: 4, special_category_correct: 5, treatment_agreement: 4,
    private_marked_public: 2, public_unnecessarily_protected: 1, unresolved_placement: 1,
  });
  assert.deepEqual(targets.map(({ id }) => id), input.targets.map(({ id }) => id));
  const [title, member, panel, missing, invite, location] = targets;
  assert.equal(title.public_unnecessarily_protected, true);
  assert.equal(member.category_correct, false);
  assert.equal(member.special_category_correct, false);
  assert.equal(member.treatment_agreement, true);
  assert.equal(panel.unresolved_placement, true);
  assert.equal(panel.treatment_agreement, true);
  assert.equal(missing.decision, null);
  assert.equal(missing.evidence_valid, null);
  assert.equal(missing.treatment_agreement, false);
  assert.equal(missing.unresolved_placement, false);
  assert.equal(invite.private_marked_public, true);
  assert.equal(location.private_marked_public, true);
});

test('a fabricated quote cannot earn agreement and invalid oracle evidence fails the evaluation', (t) => {
  const { input, submit } = fixture(t, [['member', 'viewer.displayName', 'personal', ['mask']]]);
  submit('member', { evidence: { file, quote: 'viewer. displayName' } });
  const result = evaluatePatternReview(input);
  assert.equal(result.summary.invalid_evidence, 1);
  assert.equal(result.summary.missed, 0);
  assert.equal(result.summary.category_correct, 0);
  assert.equal(result.summary.special_category_correct, 0);
  assert.equal(result.summary.treatment_agreement, 0);
  assert.equal(result.targets[0].evidence_valid, false);
  assert.match(result.targets[0].evidence_error, /quote does not occur/);

  input.oracle.targets[0].evidence.quote = 'display_name';
  assert.throws(() => evaluatePatternReview(input), /Oracle evidence for member: Evidence quote does not occur/);
});

test('evidence can cite an exact multiline quote in another regular source file', (t) => {
  const { input, submit } = fixture(t, [['member', 'viewer.displayName', 'personal', ['mask']]]);
  const evidence = { file: 'state/viewer.ts', quote: 'return {\n  displayName: member.name,\n}' };
  fs.mkdirSync(path.join(input.sourceRoot, 'state'));
  fs.writeFileSync(path.join(input.sourceRoot, evidence.file), `function viewer() {\n${evidence.quote};\n}\n`);
  submit('member', { evidence });
  assert.equal(evaluatePatternReview(input).summary.treatment_agreement, 1);
});

test('rejects traversal, absolute paths, symlinks in either position, and directories', (t) => {
  const { directory, input, submit } = fixture(t, [['member', 'viewer.displayName', 'personal', ['mask']]]);
  const outside = path.join(directory, 'outside');
  fs.mkdirSync(outside);
  fs.writeFileSync(path.join(outside, file), source);
  fs.symlinkSync(outside, path.join(input.sourceRoot, 'linked-dir'), 'dir');
  fs.symlinkSync(path.join(outside, file), path.join(input.sourceRoot, 'linked-file.tsx'), 'file');
  fs.symlinkSync(file, path.join(input.sourceRoot, 'linked-within-root.tsx'), 'file');
  fs.mkdirSync(path.join(input.sourceRoot, 'regular-dir'));
  submit('member');
  const reviewEvidence = input.review.decisions[0].evidence;
  for (const [unsafePath, error] of [
    [`../outside/${file}`, /in-root relative path/],
    [path.join(outside, file), /in-root relative path/],
    [`linked-dir/${file}`, /regular file without symlinks/],
    ['linked-file.tsx', /regular file without symlinks/],
    ['linked-within-root.tsx', /regular file without symlinks/],
    ['regular-dir', /regular file without symlinks/],
  ]) {
    reviewEvidence.file = unsafePath;
    const result = evaluatePatternReview(input);
    assert.equal(result.summary.invalid_evidence, 1, unsafePath);
    assert.equal(result.summary.treatment_agreement, 0, unsafePath);
    assert.match(result.targets[0].evidence_error, error);
    const invalidOracle = structuredClone(input);
    invalidOracle.oracle.targets[0].evidence.file = unsafePath;
    assert.throws(() => evaluatePatternReview(invalidOracle), error);
  }
});

test('rejects empty, extra, and duplicate IDs and requires the oracle to cover the whole target list', (t) => {
  const { input, submit } = fixture(t, [['member', 'viewer.displayName', 'personal', ['mask']]]);
  submit('member');
  for (const [array, name] of [
    [input.oracle.targets, 'oracle targets'],
    [input.review.decisions, 'review decisions'],
    [input.targets, 'targets'],
  ]) {
    const original = array[0];
    array[0] = { ...original, id: ' ' };
    assert.throws(() => evaluatePatternReview(input), new RegExp(`${name} id must be a nonempty string`));
    array[0] = original;
    array.push({ ...original });
    assert.throws(() => evaluatePatternReview(input), new RegExp(`${name} contains duplicate ID`));
    array.pop();
  }
  for (const array of [input.oracle.targets, input.review.decisions]) {
    array.push({ ...array[0], id: 'unexpected' });
    assert.throws(() => evaluatePatternReview(input), /unexpected has an unknown ID/);
    array.pop();
  }
  input.oracle.targets = [];
  assert.throws(() => evaluatePatternReview(input), /Oracle is missing target ID member/);
  input.targets = [];
  assert.throws(() => evaluatePatternReview(input), /at least one target/);
});

test('requires the source-review schema before counting decisions', (t) => {
  const { input, submit } = fixture(t, [['member', 'viewer.displayName', 'personal', ['mask']]]);
  submit('member');
  const badInputs = [
    [copy => { copy.targets[0].channel = ''; }, /channel must be a nonempty string/],
    [copy => { copy.oracle.targets[0].accepted_treatments = ['mask', 'mask']; }, /valid accepted_treatments/],
    [copy => { copy.oracle.targets[0].accepted_treatments = new Array(1); }, /valid accepted_treatments/],
    [copy => { copy.review.reviewer.usage = {}; }, /usage must be null/],
    [copy => { copy.review.decisions[0].category = 'sensitive'; }, /invalid category/],
    [copy => { copy.review.decisions[0].special_category = 'false'; }, /special_category must be a boolean/],
    [copy => { copy.review.decisions[0].treatment = 'none'; }, /invalid treatment/],
    [copy => { copy.review.decisions[0].reason = ''; }, /reason must be a nonempty string/],
    [copy => { copy.review.decisions[0].evidence.quote = ''; }, /evidence quote must be a nonempty string/],
  ];
  for (const [change, error] of badInputs) {
    const copy = structuredClone(input);
    change(copy);
    assert.throws(() => evaluatePatternReview(copy), error);
  }
});

test('an empty review keeps every expected target in the denominator', (t) => {
  const { input } = fixture(t, [['panel', 'client.healthAnswer', 'third-party', ['unresolved'], true]]);
  const { summary, targets } = evaluatePatternReview(input);
  assert.equal(summary.total_targets, 1);
  assert.equal(summary.reviewed, 0);
  assert.equal(summary.missed, 1);
  assert.equal(summary.invalid_evidence, 0);
  assert.equal(summary.unresolved_placement, 0);
  assert.equal(summary.treatment_agreement, 0);
  assert.equal(targets[0].treatment_agreement, false);
});
