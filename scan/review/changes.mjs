// Exact, source-supported proposals from a reviewer. These checks establish
// reproducible edits, not the semantics of a component or recorder protection.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { TextDecoder } from 'node:util';
import { parse } from '@babel/parser';
import { unifiedDiff } from '../patch.mjs';
import { validateReview } from './decisions.mjs';

const digest = text => createHash('sha256').update(text).digest('hex');
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const relative = file => nonempty(file) && !/[\\:\0]/.test(file)
  && file.split('/').every(part => part && part !== '.' && part !== '..');

export function proposeSourceChanges(root, inventory, review) {
  root = fs.realpathSync(root);
  const validated = validateReview(root, inventory, review);
  const errors = [...validated.errors];
  const sources = new Map();
  const edits = new Map();
  const decisions = new Set(validated.decisions.map(decision => decision.site_id));
  function read(file) {
    if (!relative(file)) throw new Error('Expected an in-root relative file');
    const abs = path.resolve(root, file);
    if (fs.realpathSync(abs) !== abs || !fs.statSync(abs).isFile()) throw new Error('Expected a regular source file without symlinks');
    if (!sources.has(file)) sources.set(file, new TextDecoder('utf-8', {fatal:true, ignoreBOM:true}).decode(fs.readFileSync(abs)));
    return sources.get(file);
  }
  let changes = review?.proposed_changes ?? [];
  if (!Array.isArray(changes)) {
    errors.push({reason:'proposed_changes must be an array'});
    changes = [];
  }
  changes.forEach((change, index) => {
    try {
      if (!change || !nonempty(change.from) || typeof change.to !== 'string' || !nonempty(change.rationale)
        || !Array.isArray(change.site_ids) || !change.site_ids.length
        || change.site_ids.some(id => !decisions.has(id))
        || !Array.isArray(change.evidence) || !change.evidence.length) throw new Error('Change requires exact text, reviewed site IDs, rationale and evidence');
      const source = read(change.file);
      const start = source.indexOf(change.from);
      if (start < 0 || source.indexOf(change.from, start + 1) >= 0) throw new Error('Replacement text must occur exactly once in the original source');
      let anchored = false;
      for (const item of change.evidence) {
        const cited = read(item.file), lines = cited.split('\n');
        if (item.sha256 !== digest(cited) || !Number.isInteger(item.start_line) || !Number.isInteger(item.end_line)
          || item.start_line < 1 || item.end_line < item.start_line || item.end_line > lines.length
          || !nonempty(item.quote)) throw new Error('Stale or invalid source evidence');
        const region = lines.slice(item.start_line - 1, item.end_line).join('\n');
        if (!region.includes(item.quote)) throw new Error('Evidence quote does not occur within its line range');
        if (item.file === change.file) {
          const offset = lines.slice(0, item.start_line - 1).reduce((n, line) => n + line.length + 1, 0);
          let at = region.indexOf(item.quote);
          while (at >= 0) {
            if (offset + at < start + change.from.length && offset + at + item.quote.length > start) anchored = true;
            at = region.indexOf(item.quote, at + 1);
          }
        }
      }
      if (!anchored) throw new Error('Evidence must anchor the replaced source');
      const list = edits.get(change.file) ?? [];
      if (list.some(edit => start < edit.end && start + change.from.length > edit.start)) throw new Error('Source replacements overlap');
      list.push({start, end: start + change.from.length, to: change.to, index});
      edits.set(change.file, list);
    } catch (error) { errors.push({change: index, file: change?.file, reason: error.message}); }
  });
  const after = {}, syntax = [];
  for (const [file, list] of edits) {
    let text = sources.get(file);
    for (const edit of list.sort((a, b) => b.start - a.start)) text = text.slice(0, edit.start) + edit.to + text.slice(edit.end);
    if (/\.[cm]?[jt]sx?$/.test(file)) {
      try {
        const plugins = ['decorators-legacy'];
        if (/\.[cm]?tsx?$/.test(file)) plugins.push('typescript');
        if (/\.[cm]?(?:jsx?|tsx)$/.test(file)) plugins.push('jsx');
        const options = {sourceType:'unambiguous', plugins};
        parse(sources.get(file), options); parse(text, options);
        syntax.push({file, status:'parsed'});
      } catch (error) { errors.push({file, reason:`Source syntax check failed: ${error.message}`}); }
    } else syntax.push({file, status:'framework-compilation-required'});
    after[file] = text;
  }
  // A partial group of exact edits can break prop forwarding. Return no patch
  // when any edit or evidence check fails.
  return {errors, changes: changes.length, syntax, after: errors.length ? {} : after,
    patch: errors.length ? '' : Object.entries(after).map(([file, text]) => unifiedDiff(file, sources.get(file), text)).join(''),
    status: errors.length ? 'rejected' : 'source-supported-proposal',
    semantic_correctness:'requires-independent-review', runtime:'not-run'};
}
