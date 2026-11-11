// Scores the static pass against a labelled sample of a real application.
//   node scan/benchmark/apps/measure.mjs <app> <source folder> [--answers <answers.json>] [--session <dir>] [--over]
// <app>/labels.json names the app commit and the labelled elements of each sample file. A label is
// found when a shown value (a site) or a line rule hit is on the element that the label names.
// Recall is given for high-confidence sites alone and with the low-confidence residue. The residue
// size estimates the questions that a model must answer.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { find } from '../../find.mjs';
import { spansFor } from '../../templates.mjs';
import { placeAnnotations } from '../../place.mjs';
import { applyAnswers } from '../../residue.mjs';

const [app, source] = process.argv.slice(2);
const dir = path.join(path.dirname(new URL(import.meta.url).pathname), app);
const labels = JSON.parse(fs.readFileSync(path.join(dir, 'labels.json'), 'utf8'));
try {
  const head = execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  if (!head.startsWith(labels.commit)) console.warn(`Warning: source is at ${head.slice(0, 7)}, labels are for ${labels.commit}.`);
} catch { /* not a git checkout */ }

const t0 = Date.now();
const scan = find(source);
const ms = Date.now() - t0;
// --answers <file>: answers to the residue questions, applied as the place command applies them.
const answersAt = process.argv.indexOf('--answers');
if (answersAt > 0) applyAnswers(scan, JSON.parse(fs.readFileSync(process.argv[answersAt + 1], 'utf8')));
const sites = scan.candidates.flatMap((c) => (c.sites || []).map((s) => ({ ...s, file: c.file, unit: c.id })));
const lineHits = scan.candidates.filter((c) => !c.sites).map((c) => ({ file: c.file, line: c.line }));
const spanCache = new Map();
const spans = (f) => {
  if (!spanCache.has(f)) spanCache.set(f, spansFor(f, fs.readFileSync(path.join(source, f), 'utf8')));
  return spanCache.get(f);
};
// The start line of the innermost element that holds a line.
const owner = (f, line) => {
  const els = spans(f).filter(([s, , e]) => line >= s && line <= e).sort((a, b) => (a[2] - a[0]) - (b[2] - b[0]));
  return els[0] ? els[0][0] : line;
};
const onLabel = (f, line, l) => Math.abs(line - l.line) <= 1 || Math.abs(owner(f, line) - l.line) <= 1;
// A site on an element that contains the labelled element, for example <Select {...field}> around its trigger.
const onAncestor = (f, line, l) => spans(f).some(([s, , e]) => Math.abs(s - line) <= 1 && l.line > s && l.line <= e && l.line - s <= 8);

// How each label is found, from strict to loose:
//   site    a shown value on the labelled element, the element around it, or inside it
//   config  a text field that rrweb's maskAllInputs masks (the scan sets it in the recorder config)
//   child   the labelled element is a child component that is a unit of its own
//   line    only a line rule hit near the label
// Stage 5 places annotations from sites, so "site or config" is the main measure.
const text = new Map();
const lineOf = (f, n) => { if (!text.has(f)) text.set(f, fs.readFileSync(path.join(source, f), 'utf8').split('\n')); return text.get(f)[n - 1] || ''; };
const rows = [];
for (const [file, ls] of Object.entries(labels.files)) {
  for (const l of ls) {
    let here = sites.filter((s) => s.file === file && onLabel(file, s.line, l));
    if (!here.length) here = sites.filter((s) => s.file === file && onAncestor(file, s.line, l));
    if (!here.length) {
      const el = spans(file).find(([st]) => st === l.line);
      if (el) here = sites.filter((s) => s.file === file && s.line > el[1] && s.line <= el[2] && !/^prop /.test(s.kind));
    }
    const src = lineOf(file, l.line);
    const field = /<(input|textarea|select)\b(?![^>]*type=["'](checkbox|radio|submit|button|hidden))/i.test(src) || /<([\w-]*(input|text-?area)|[\w.]*(Input|TextArea|Textarea))(?=[\s>/]|$)/.test(src);
    const tag = src.match(/<([A-Z][\w.]*)/)?.[1]?.split('.').pop();
    let how = null;
    if (here.some((x) => x.confidence === 'high')) how = 'site';
    else if (here.length) how = 'site-low';
    else if (field) how = 'config';
    else if (tag && scan.candidates.some((c) => c.component === tag && c.sites)) how = 'child';
    else if (lineHits.some((h) => h.file === file && Math.abs(h.line - l.line) <= 1)) how = 'line';
    rows.push({ file, ...l, how });
  }
}
const pct = (n, d) => (d ? `${Math.round((100 * n) / d)}%` : '-');
const share = (list, hows) => pct(list.filter((r) => hows.includes(r.how)).length, list.length);
const report = (name, list) => console.log(`${name.padEnd(12)} ${String(list.length).padStart(3)} labels: site or config ${share(list, ['site', 'config']).padStart(4)} | with low-confidence sites ${share(list, ['site', 'site-low', 'config']).padStart(4)} | with child units and line rules ${share(list, ['site', 'site-low', 'config', 'child', 'line']).padStart(4)}`);
console.log(`${app}: ${scan.scanned_files} files scanned in ${(ms / 1000).toFixed(1)} s; schema files: ${(scan.schema_files || []).join(', ') || 'none'}`);
report('all', rows);
for (const c of ['secret', 'personal', 'third-party']) report(c, rows.filter((r) => r.category === c));
report('agreed', rows.filter((r) => r.labellers === 2));

// Precision in the sample: shown values that are not on any labelled element.
const sample = new Set(Object.keys(labels.files));
const sampleSites = sites.filter((s) => sample.has(s.file) && !/^prop /.test(s.kind));
const elements = new Map();
for (const s of sampleSites) {
  const k = `${s.file}:${owner(s.file, s.line)}`;
  const hit = labels.files[s.file].some((l) => onLabel(s.file, s.line, l));
  const prev = elements.get(k);
  elements.set(k, { hit: hit || prev?.hit, high: s.confidence === 'high' || prev?.high, s });
}
const els = [...elements.values()];
console.log(`sample elements flagged: ${els.length}, on a label ${pct(els.filter((e) => e.hit).length, els.length)}; high ${els.filter((e) => e.high).length} (${pct(els.filter((e) => e.high && e.hit).length, els.filter((e) => e.high).length)} on a label)`);

// Residue across the app: low-confidence sites a model would decide.
const low = sites.filter((s) => s.confidence === 'low');
console.log(`app: ${sites.length} sites, ${low.length} low confidence in ${new Set(low.map((s) => s.unit)).size} units`);
for (const r of rows.filter((x) => !x.how)) console.log(`  missed ${r.file.split('/').pop()}:${r.line} [${r.category}] ${r.what.slice(0, 80)}`);
for (const r of rows.filter((x) => /child|line|site-low/.test(x.how || ''))) console.log(`  ${r.how.padEnd(8)} ${r.file.split('/').pop()}:${r.line} [${r.category}] ${r.what.slice(0, 80)}`);

// Stage 5: annotations placed from high-confidence sites, without a model. A label is annotated when a
// placed annotation's element holds it or sits inside it, when it is a text field that maskAllInputs
// masks, or when it is a child component that has placed annotations of its own.
// --session <dir>: score the final annotations of a scan session (placed and the agent's) instead.
const sessionAt = process.argv.indexOf('--session');
const placed = sessionAt > 0
  ? { annotations: JSON.parse(fs.readFileSync(path.join(process.argv[sessionAt + 1], 'annotations.json'), 'utf8')).annotations, placed: new Map(), review: new Map() }
  : placeAnnotations(scan, source, { sdk: 'rrweb', annotate: 'rrweb' });
const annEls = placed.annotations.map((a) => {
  const el = spans(a.file).filter(([st, open, , tag]) => a.line >= st && a.line <= open && `<${tag}` === a.match).sort((x, y) => (x[2] - x[0]) - (y[2] - y[0]))[0];
  return { ...a, start: el ? el[0] : a.line, end: el ? el[2] : a.line };
});
const annotatedFiles = new Set(annEls.map((a) => a.file));
const compFile = new Map(scan.candidates.filter((c) => c.sites).map((c) => [c.component, c.file]));
const reviewLines = new Map();
for (const [id, ls] of placed.review) { const c = scan.candidates.find((x) => x.id === id); reviewLines.set(c.file, [...(reviewLines.get(c.file) || []), ...ls]); }
const outcome = rows.map((r) => {
  const el = spans(r.file).filter(([st]) => st === r.line).sort((x, y) => (y[2] - y[0]) - (x[2] - x[0]))[0];
  const end = el ? el[2] : r.line;
  const on = annEls.some((a) => a.file === r.file && ((r.line >= a.start && r.line <= a.end) || (a.start >= r.line && a.start <= end)));
  const tag = lineOf(r.file, r.line).match(/<([A-Z][\w.]*)/)?.[1]?.split('.').pop();
  const child = tag && compFile.has(tag) && annotatedFiles.has(compFile.get(tag));
  const later = (reviewLines.get(r.file) || []).some((x) => x >= r.line - 1 && x <= end);
  const field = /<(input|textarea|select)\b(?![^>]*type=["'](checkbox|radio|submit|button|hidden))/i.test(lineOf(r.file, r.line)) || /<([\w-]*(input|text-?area)|[\w.]*(Input|TextArea|Textarea))(?=[\s>/]|$)/.test(lineOf(r.file, r.line));
  return { ...r, placedHow: on ? 'annotated' : r.how === 'config' || field ? 'config' : child ? 'child' : later ? 'review' : null };
});
const sh = (list, hows) => pct(list.filter((r) => hows.includes(r.placedHow)).length, list.length);
const preport = (name, list) => console.log(`${name.padEnd(12)} ${String(list.length).padStart(3)} labels: annotated or config ${sh(list, ['annotated', 'config']).padStart(4)} | with child annotations ${sh(list, ['annotated', 'config', 'child']).padStart(4)} | left for review ${sh(list, ['review']).padStart(4)}`);
console.log(`\n${sessionAt > 0 ? 'session annotations' : `placed${answersAt > 0 ? ' with the answers' : ' without a model'}`}: ${placed.annotations.length} annotations in ${annotatedFiles.size} files; units fully placed ${[...placed.placed.keys()].filter((id) => !placed.review.has(id)).length}, with lines for review ${placed.review.size}`);
preport('all', outcome);
for (const c of ['secret', 'personal', 'third-party']) preport(c, outcome.filter((r) => r.category === c));
const sampleAnns = annEls.filter((a) => sample.has(a.file));
const onLabel2 = (a) => labels.files[a.file].some((l) => { const el = spans(a.file).filter(([st]) => st === l.line)[0]; const end = el ? el[2] : l.line; return (l.line >= a.start && l.line <= a.end) || (a.start >= l.line && a.start <= end); });
console.log(`sample annotations: ${sampleAnns.length}, on or inside a labelled element ${pct(sampleAnns.filter(onLabel2).length, sampleAnns.length)}`);
for (const r of outcome.filter((x) => !x.placedHow)) console.log(`  not annotated ${r.file.split('/').pop()}:${r.line} [${r.category}] ${r.what.slice(0, 70)}`);
if (process.argv.includes('--over')) for (const a of sampleAnns.filter((x) => !onLabel2(x))) console.log(`  unlabelled ${a.file.split('/').pop()}:${a.line} ${a.match} ${a.value} ${a.data.slice(0, 70)}`);
