// Compare a frozen semantic review with separately prepared source labels.
// This projection is deliberately conservative when element-level labels mix
// channels. It cannot infer a correct answer from a nearby matching decision.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { TextDecoder } from 'node:util';
import { spansFor } from '../templates.mjs';
import { labelledElement } from '../measurement.mjs';
import { validateReview } from './decisions.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const bookkeeping = /^(?:conditional|spread|directive:|event:|attribute:(?:class|className|style|key|ref|type)|prop:(?:class|className|style|key|ref))$/;

export function evaluateReview(root, inventory, review, labels) {
  root = fs.realpathSync(root);
  const validated = validateReview(root, inventory, review);
  if (validated.errors.length) throw new Error(`Cannot evaluate invalid review: ${JSON.stringify(validated.errors)}`);
  const decisions = new Map(validated.decisions.map(decision => [decision.site_id, decision]));
  const sources = [];
  const rows = [];
  for (const [file, expected] of Object.entries(labels.files)) {
    if (typeof file !== 'string' || /[\\:\0]/.test(file)
      || file.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('Label file must be an in-root relative path');
    const absolute = path.resolve(root, file);
    if (fs.realpathSync(absolute) !== absolute || !fs.lstatSync(absolute).isFile()) throw new Error('Label file must be a regular source file without symlinks');
    const bytes = fs.readFileSync(absolute);
    const source = new TextDecoder('utf-8', {fatal:true, ignoreBOM:true}).decode(bytes);
    sources.push({file, sha256:hash(bytes)});
    const spans = spansFor(file, source);
    for (const label of expected) {
      const target = labelledElement(spans, label);
      let sites = inventory.sites.filter(site => site.file === file && target && site.target.start === target[5]);
      let mapping = 'element';
      if (label.channel) {
        sites = sites.filter(site => site.channel === label.channel && site.line === label.line);
        mapping = 'channel-line';
      } else {
        const onLine = sites.filter(site => site.line === label.line && !bookkeeping.test(site.channel));
        if (onLine.length) { sites = onLine; mapping = 'source-line'; }
        else sites = label.line === target?.[0] ? sites.filter(site => !bookkeeping.test(site.channel)) : [];
      }
      const predictions = sites.map(site => ({site_id:site.id, channel:site.channel,
        status:decisions.get(site.id)?.status ?? 'missing',
        category:decisions.get(site.id)?.category ?? null,
        treatment:decisions.get(site.id)?.treatment ?? null,
        meaning:decisions.get(site.id)?.meaning ?? null}));
      const outcomes = new Set(predictions.filter(p => p.status === 'decided').map(p => `${p.category}/${p.treatment}`));
      let status;
      if (!target || !sites.length) status = 'unmapped';
      else if (predictions.some(p => p.status !== 'decided')) status = 'unresolved';
      else if (outcomes.size > 1) status = 'ambiguous';
      else status = outcomes.has(`${label.category}/${label.value}`) ? 'agreement' : 'disagreement';
      rows.push({file, ...label, split:labels.held_out?.includes(file) ? 'held-out' : 'development', mapping, status, predictions});
    }
  }
  const summarize = subset => Object.fromEntries(['agreement','disagreement','ambiguous','unresolved','unmapped'].map(status => [status, subset.filter(row => row.status === status).length]));
  return {schema_version:1, app:labels.app, revision:labels.commit,
    review_sha256:hash(JSON.stringify(review)), labels_sha256:hash(JSON.stringify(labels)), sources,
    provenance:'Predictions must be frozen before opening labels. File hashes do not independently prove an upstream revision; verify the source manifest.',
    limitations:'Element labels may mix public captions and private values, and may express a shared renderer in one caller context. Ambiguous, unresolved and unmapped rows receive no agreement credit. These are source-label comparisons, not recorder results.',
    counts:summarize(rows), splits:Object.fromEntries(['development','held-out'].map(split => [split,summarize(rows.filter(row => row.split === split))])), rows};
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [directory, labelFile] = process.argv.slice(2);
  if (!directory || !labelFile) throw new Error('Usage: evaluate.mjs <review-directory> <labels.json>');
  const read = file => JSON.parse(fs.readFileSync(file,'utf8'));
  const inventory = read(path.join(directory,'inventory.json'));
  console.log(JSON.stringify(evaluateReview(inventory.root, inventory, read(path.join(directory,'review.json')), read(labelFile)),null,2));
}
