// Scores the static pass against a labelled sample of a real application.
//   node scan/benchmark/apps/measure.mjs <app> <source folder>
// <app>/labels.json names the app commit and the labelled elements of each sample file. A label is
// found when a shown value (a site) or a line rule hit is on the element that the label names.
// Recall is given for high-confidence sites alone and with the low-confidence residue. The residue
// size estimates the questions that a model must answer.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { find } from '../../find.mjs';
import { elementSpans } from '../../components.mjs';

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
const sites = scan.candidates.flatMap((c) => (c.sites || []).map((s) => ({ ...s, file: c.file, unit: c.id })));
const lineHits = scan.candidates.filter((c) => !c.sites).map((c) => ({ file: c.file, line: c.line }));
const spanCache = new Map();
const spans = (f) => {
  if (!spanCache.has(f)) spanCache.set(f, elementSpans(f, fs.readFileSync(path.join(source, f), 'utf8')));
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

const rows = [];
for (const [file, ls] of Object.entries(labels.files)) {
  for (const l of ls) {
    let here = sites.filter((s) => s.file === file && onLabel(file, s.line, l));
    const ancestor = !here.length;
    if (ancestor) here = sites.filter((s) => s.file === file && onAncestor(file, s.line, l));
    const high = here.some((s) => s.confidence === 'high');
    const any = here.length > 0 || lineHits.some((h) => h.file === file && Math.abs(h.line - l.line) <= 1);
    rows.push({ file, ...l, high, any, ancestor: ancestor && here.length > 0 });
  }
}
const pct = (n, d) => (d ? `${Math.round((100 * n) / d)}%` : '-');
const report = (name, list) => console.log(`${name.padEnd(12)} ${String(list.length).padStart(3)} labels: high ${pct(list.filter((r) => r.high).length, list.length)}, with residue ${pct(list.filter((r) => r.any).length, list.length)}`);
console.log(`${app}: ${scan.scanned_files} files scanned in ${(ms / 1000).toFixed(1)} s; schema files: ${(scan.schema_files || []).join(', ') || 'none'}`);
report('all', rows);
for (const c of ['secret', 'personal', 'third-party']) report(c, rows.filter((r) => r.category === c));

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
console.log(`found on a containing element only (placement must move to the labelled element): ${rows.filter((r) => r.ancestor).length}`);
console.log(`sample elements flagged: ${els.length}, on a label ${pct(els.filter((e) => e.hit).length, els.length)}; high ${els.filter((e) => e.high).length} (${pct(els.filter((e) => e.high && e.hit).length, els.filter((e) => e.high).length)} on a label)`);

// Residue across the app: low-confidence sites a model would decide.
const low = sites.filter((s) => s.confidence === 'low');
console.log(`app: ${sites.length} sites, ${low.length} low confidence in ${new Set(low.map((s) => s.unit)).size} units`);
for (const r of rows.filter((x) => !x.any)) console.log(`  missed ${r.file.split('/').pop()}:${r.line} [${r.category}] ${r.what.slice(0, 80)}`);
if (process.argv.includes('--low-only')) for (const r of rows.filter((x) => x.any && !x.high)) console.log(`  low only ${r.file.split('/').pop()}:${r.line} [${r.category}] ${r.what.slice(0, 80)}`);
