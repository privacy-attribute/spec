// Scores the static pass against a labelled fixture app.
// A label is a trailing comment on the line of an element that must be annotated:
//   JSX: {/* @expect secret block */}   JS: // @expect personal mask   HTML, Vue: <!-- @expect third-party mask -->
// The scan runs on a temporary copy with every label removed, so a label never matches a rule by itself.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { find } from './find.mjs';

const EXT = /\.(tsx|jsx|ts|js|mjs|vue|svelte|astro|html|hbs|erb|cshtml|php)$/;
const CATEGORIES = ['secret', 'personal', 'third-party', 'public'];
const PRIVATE = new Set(['secret', 'personal', 'third-party']);
const LABEL = /@expect\s+(secret|personal|third-party|public)\s+([\w-]+)/;
// Whole label comments in each syntax. Removing them keeps the line count unchanged.
const STRIP = [/\s*\{\/\*\s*@expect\b[^*]*\*\/\}/g, /\s*\/\*\s*@expect\b[^*]*\*\//g, /\s*<!--\s*@expect\b[^>]*-->/g, /\s*\/\/\s*@expect\b.*$/g];
const WINDOW = 2;

function sourceFiles(root) {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (EXT.test(e.name)) out.push(p);
    }
  };
  walk(root);
  return out.sort();
}

function stripLabels(line) {
  return STRIP.reduce((s, re) => s.replace(re, ''), line);
}

export function parseLabels(root) {
  const labels = [];
  for (const file of sourceFiles(root)) {
    fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      const m = line.match(LABEL);
      if (m) labels.push({ file: path.relative(root, file), line: i + 1, category: m[1], value: m[2], snippet: stripLabels(line).trim().slice(0, 160) });
    });
  }
  return labels;
}

// Copies the tree to a temporary folder with all labels removed and runs the scan there.
function scanWithoutLabels(root) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'privacy-bench-'));
  try {
    for (const file of sourceFiles(root)) {
      const rel = path.relative(root, file);
      const dest = path.join(tmp, rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, fs.readFileSync(file, 'utf8').split('\n').map(stripLabels).join('\n'));
    }
    return find(tmp);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

const near = (a, b) => a.file === b.file && Math.abs(a.line - b.line) <= WINDOW;
const ratio = (n, d) => (d ? n / d : 0);

export async function bench(dir) {
  const root = path.resolve(dir);
  const labels = parseLabels(root);
  const { candidates, scanned_files, scanned_lines } = scanWithoutLabels(root);
  const priv = labels.filter((l) => PRIVATE.has(l.category));
  const pub = labels.filter((l) => l.category === 'public');

  const found = priv.filter((l) => candidates.some((c) => near(c, l)));
  const exact = priv.filter((l) => candidates.some((c) => c.file === l.file && c.line === l.line));
  const matched = candidates.filter((c) => priv.some((l) => near(c, l)));
  const flagged = pub.filter((l) => candidates.some((c) => near(c, l)));
  // A found label whose nearest candidate guesses the same category.
  const agree = found.filter((l) => {
    const best = candidates.filter((c) => near(c, l)).sort((a, b) => Math.abs(a.line - l.line) - Math.abs(b.line - l.line))[0];
    return best.category_hint.replace('?', '') === l.category;
  });

  const by_category = {};
  for (const k of ['secret', 'personal', 'third-party']) {
    by_category[k] = { labels: priv.filter((l) => l.category === k).length, found: found.filter((l) => l.category === k).length };
  }

  return {
    dir: root,
    scanned_files,
    scanned_lines,
    labels: labels.length,
    candidates: candidates.length,
    private_labels: priv.length,
    public_labels: pub.length,
    found_private: found.length,
    category_agree: agree.length,
    recall: ratio(found.length, priv.length),
    // Same line only: shows how much of the recall comes from a neighbouring candidate.
    recall_exact: ratio(exact.length, priv.length),
    missed_exact: priv.filter((l) => !exact.includes(l)).map(({ file, line, category, snippet }) => ({ file, line, category, snippet })),
    precision: ratio(matched.length, candidates.length),
    public_flagged: flagged.map(({ file, line, snippet }) => ({ file, line, snippet })),
    missed: priv.filter((l) => !found.includes(l)).map(({ file, line, category, snippet }) => ({ file, line, category, snippet })),
    by_category,
  };
}

export function formatBench(r) {
  const pct = (x) => `${(x * 100).toFixed(1)}%`;
  const lines = [
    `Benchmark: ${r.scanned_files} files, ${r.scanned_lines} lines, ${r.labels} labels (${r.private_labels} private, ${r.public_labels} public), ${r.candidates} candidates`,
    `Recall:    ${pct(r.recall)} (${r.found_private} of ${r.private_labels} private labels have a candidate within ${WINDOW} lines)`,
    `Recall on the same line: ${pct(r.recall_exact)} (${r.private_labels - r.missed_exact.length} of ${r.private_labels})`,
    `Precision: ${pct(r.precision)} (candidates within ${WINDOW} lines of a private label)`,
    `Category hint agrees on ${r.category_agree} of ${r.found_private} found labels`,
    `Public labels flagged: ${r.public_flagged.length} of ${r.public_labels}`,
    ...Object.entries(r.by_category).map(([k, v]) => `  ${k.padEnd(12)} ${v.found}/${v.labels}`),
  ];
  if (r.missed.length) {
    lines.push('', `Missed (${r.missed.length}${r.missed.length > 20 ? ', first 20' : ''}):`);
    for (const m of r.missed.slice(0, 20)) lines.push(`  ${m.file}:${m.line} [${m.category}] ${m.snippet}`);
  }
  if (r.public_flagged.length) {
    lines.push('', 'Public lines flagged:');
    for (const p of r.public_flagged) lines.push(`  ${p.file}:${p.line} ${p.snippet}`);
  }
  return lines.join('\n');
}
