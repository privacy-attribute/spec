import fs from 'node:fs';
import path from 'node:path';
import { TextDecoder } from 'node:util';

const categories = new Set(['secret', 'personal', 'third-party', 'public']);
const protections = new Set(['mask', 'block', 'recorder-control']);
const treatments = new Set([...protections, 'public', 'unresolved']);
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

function requireObject(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function requireText(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} must be a nonempty string`);
  }
}

function indexById(rows, label) {
  if (!Array.isArray(rows)) throw new Error(`${label} must be an array`);
  const indexed = new Map();
  for (const row of rows) {
    requireObject(row, `${label} entry`);
    requireText(row.id, `${label} id`);
    if (indexed.has(row.id)) throw new Error(`${label} contains duplicate ID ${row.id}`);
    indexed.set(row.id, row);
  }
  return indexed;
}

function validateClassification(entry, label) {
  if (!categories.has(entry.category)) throw new Error(`${label} has an invalid category`);
  if (typeof entry.special_category !== 'boolean') {
    throw new Error(`${label} special_category must be a boolean`);
  }
  requireText(entry.reason, `${label} reason`);
  requireObject(entry.evidence, `${label} evidence`);
  requireText(entry.evidence.file, `${label} evidence file`);
  requireText(entry.evidence.quote, `${label} evidence quote`);
}

function readSource(root, file, cache) {
  if (cache.has(file)) return cache.get(file);
  const parts = file.split('/');
  if (/[\\:\0]/.test(file) || parts.some(part => !part || part === '.' || part === '..')) {
    throw new Error('Source file must be an in-root relative path');
  }
  const absolute = path.join(root, ...parts);
  let canonical;
  try {
    canonical = fs.realpathSync(absolute);
  } catch {
    throw new Error('Source file does not resolve');
  }
  if (canonical !== absolute || !fs.lstatSync(absolute).isFile()) {
    throw new Error('Source file must be a regular file without symlinks');
  }
  const source = decoder.decode(fs.readFileSync(absolute));
  cache.set(file, source);
  return source;
}

function evidenceError(root, { file, quote }, cache) {
  try {
    if (readSource(root, file, cache).includes(quote)) return null;
    return 'Evidence quote does not occur in the source file';
  } catch (error) {
    return error.message;
  }
}

/**
 * Compare submitted source judgments against an oracle over a fixed target list.
 * Evidence validation checks literal occurrence. The oracle supplies the expected judgments.
 */
export function evaluatePatternReview({ targets, oracle, review, sourceRoot }) {
  requireText(sourceRoot, 'sourceRoot');
  const root = fs.realpathSync(sourceRoot);
  if (!fs.statSync(root).isDirectory()) throw new Error('sourceRoot must be a directory');

  const targetIndex = indexById(targets, 'targets');
  if (!targetIndex.size) throw new Error('targets must contain at least one target');
  requireObject(oracle, 'oracle');
  const oracleIndex = indexById(oracle.targets, 'oracle targets');
  requireObject(review, 'review');
  requireObject(review.reviewer, 'reviewer');
  const { id, kind, usage } = review.reviewer;
  requireText(id, 'reviewer id');
  requireText(kind, 'reviewer kind');
  if (usage !== null) throw new Error('reviewer usage must be null');
  const reviewIndex = indexById(review.decisions, 'review decisions');

  for (const [targetId, entry] of oracleIndex) {
    const label = `Oracle target ${targetId}`;
    if (!targetIndex.has(targetId)) throw new Error(`${label} has an unknown ID`);
    validateClassification(entry, label);
    const accepted = entry.accepted_treatments;
    if (!Array.isArray(accepted) || !accepted.length || new Set(accepted).size !== accepted.length
      || [...accepted].some(treatment => !treatments.has(treatment))) {
      throw new Error(`${label} must have nonempty, unique, valid accepted_treatments`);
    }
  }
  for (const [targetId, entry] of reviewIndex) {
    const label = `Review decision ${targetId}`;
    if (!targetIndex.has(targetId)) throw new Error(`${label} has an unknown ID`);
    validateClassification(entry, label);
    if (!treatments.has(entry.treatment)) throw new Error(`${label} has an invalid treatment`);
  }

  const summary = {
    total_targets: targetIndex.size,
    private_targets: 0,
    public_targets: 0,
    reviewed: reviewIndex.size,
    missed: 0,
    invalid_evidence: 0,
    category_correct: 0,
    special_category_correct: 0,
    treatment_agreement: 0,
    private_marked_public: 0,
    public_unnecessarily_protected: 0,
    unresolved_placement: 0,
  };
  const cache = new Map();
  const results = [];
  for (const [targetId, target] of targetIndex) {
    const expected = oracleIndex.get(targetId);
    if (!expected) throw new Error(`Oracle is missing target ID ${targetId}`);
    const { case_id, file, surface, channel } = target;
    for (const [field, value] of Object.entries({ case_id, file, surface, channel })) {
      requireText(value, `Target ${targetId} ${field}`);
    }
    readSource(root, file, cache);
    const oracleError = evidenceError(root, expected.evidence, cache);
    if (oracleError) throw new Error(`Oracle evidence for ${targetId}: ${oracleError}`);

    const decision = reviewIndex.get(targetId);
    const error = decision ? evidenceError(root, decision.evidence, cache) : null;
    const evidenceValid = decision ? error === null : null;
    const privateTarget = expected.category !== 'public';
    const categoryCorrect = evidenceValid === true && decision.category === expected.category;
    const specialCategoryCorrect = evidenceValid === true && decision.special_category === expected.special_category;
    const treatmentAgrees = evidenceValid === true && expected.accepted_treatments.includes(decision.treatment);
    const privateMarkedPublic = privateTarget && (decision?.category === 'public' || decision?.treatment === 'public');
    const publicUnnecessarilyProtected = !privateTarget && protections.has(decision?.treatment)
      && !expected.accepted_treatments.includes(decision.treatment);
    const unresolvedPlacement = decision?.treatment === 'unresolved';

    summary.private_targets += Number(privateTarget);
    summary.public_targets += Number(!privateTarget);
    summary.missed += Number(!decision);
    summary.invalid_evidence += Number(evidenceValid === false);
    summary.category_correct += Number(categoryCorrect);
    summary.special_category_correct += Number(specialCategoryCorrect);
    summary.treatment_agreement += Number(treatmentAgrees);
    summary.private_marked_public += Number(privateMarkedPublic);
    summary.public_unnecessarily_protected += Number(publicUnnecessarilyProtected);
    summary.unresolved_placement += Number(unresolvedPlacement);

    results.push({
      id: targetId, case_id, file, surface, channel,
      expected: {
        category: expected.category,
        special_category: expected.special_category,
        accepted_treatments: [...expected.accepted_treatments],
      },
      decision: decision ? {
        category: decision.category,
        special_category: decision.special_category,
        treatment: decision.treatment,
      } : null,
      evidence_valid: evidenceValid,
      evidence_error: error,
      category_correct: categoryCorrect,
      special_category_correct: specialCategoryCorrect,
      treatment_agreement: treatmentAgrees,
      private_marked_public: privateMarkedPublic,
      public_unnecessarily_protected: publicUnnecessarilyProtected,
      unresolved_placement: unresolvedPlacement,
    });
  }

  return { reviewer: { id, kind, usage }, summary, targets: results };
}
