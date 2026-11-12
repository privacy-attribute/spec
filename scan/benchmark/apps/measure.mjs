// Measure a labelled sample in a clean, pinned upstream Git checkout.
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { spansFor } from '../../templates.mjs';
import { assertLabelRevision, labelledElement, measureTreatments } from '../../measurement.mjs';
import { summarizeReviews, validVerdict } from './reviews.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = fileURLToPath(new URL('../../cli.mjs', import.meta.url));
const SCANNER = path.dirname(CLI);
const json = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const portable = (file) => file.split(path.sep).join('/');
const git = (source, args, env = process.env) => execFileSync('git', ['--no-optional-locks', '-c', 'core.fsmonitor=false', '-C', source, ...args], {
  encoding: 'utf8', env, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 16 * 1024 * 1024,
});
const SPLITS = ['development', 'held-out'];
const CATEGORIES = ['secret', 'personal', 'third-party', 'public'];

export async function loadScanner(dir = SCANNER) {
  const modules = await Promise.all(['find', 'place', 'residue', 'patch'].map((name) => (
    import(pathToFileURL(path.resolve(dir, name + '.mjs')))
  )));
  const names = fs.readdirSync(dir).filter(name => /\.(mjs|md)$/.test(name)).sort();
  const digest = createHash('sha256');
  for (const name of names) digest.update(name).update('\0').update(fs.readFileSync(path.join(dir, name)));
  let version = 'unknown';
  try { version = json(path.join(dir, '..', 'package.json')).version || 'unknown'; } catch { /* An extracted historical scanner can omit its manifest. */ }
  return Object.assign({}, ...modules, { metadata: { version, implementation_sha256: digest.digest('hex') } });
}

function validateLabels(labels, sources) {
  const heldOut = labels.held_out || [];
  if (new Set(heldOut).size !== heldOut.length || heldOut.some((file) => !sources.has(file))) {
    throw new Error('Invalid held-out benchmark file list.');
  }
  for (const [file, text] of sources) {
    const lines = text.split('\n').length;
    const spans = spansFor(file, text);
    const seen = new Set();
    for (const row of labels.files[file]) {
      const key = `${row.line}:${row.column ?? ''}`;
      if (!validVerdict(row) || !Number.isInteger(row.line) || row.line < 1 || row.line > lines
        || (row.target_line != null && (!Number.isInteger(row.target_line) || row.target_line < 1 || row.target_line > lines))
        || (row.column != null && (!Number.isInteger(row.column) || row.column < 1))
        || typeof row.what !== 'string' || !row.what.trim() || seen.has(key)
        || (row.tag && !labelledElement(spans, row))) {
        throw new Error(`Invalid or stale benchmark label at ${file}:${key}.`);
      }
      seen.add(key);
    }
  }
}

function pointsByFile(candidates) {
  const points = new Map();
  for (const candidate of candidates) {
    const file = portable(candidate.file);
    if (!points.has(file)) points.set(file, []);
    const list = points.get(file);
    for (const site of candidate.sites || []) list.push({ ...site, signal: site.confidence === 'high' ? 'site' : 'site-low' });
    for (const hit of candidate.sites ? candidate.merged || [] : [candidate]) {
      list.push({ line: hit.line, signal: 'rule' });
    }
  }
  return points;
}

function detection(label, target, points, spans) {
  const exact = points.filter((p) => {
    if (!target) return p.line === label.line;
    if (p.element != null) return p.element === target[5];
    if (p.offset != null) {
      const owner = spans.filter((el) => p.offset >= el[5] && p.offset < el[6]).sort((a, b) => b[5] - a[5])[0];
      return owner === target;
    }
    const onLine = spans.filter(([start, open]) => p.line >= start && p.line <= open);
    return onLine.length === 1 && onLine[0] === target;
  });
  const best = (hits) => ['site', 'site-low', 'rule'].find((signal) => hits.some((p) => p.signal === signal)) || null;
  const nearby = points.filter((p) => Math.abs(p.line - label.line) <= 1
    || (target && p.line >= target[0] && p.line <= target[2]));
  return { exact: best(exact), contextual: best(nearby) };
}

function projection(scanner, sources, annotations, style) {
  const edits = new Map();
  const rejected = [];
  const accepted = [];
  const byFile = new Map();
  for (const annotation of annotations) {
    const file = portable(annotation.file);
    if (!sources.has(file)) continue;
    if (!byFile.has(file)) byFile.set(file, []);
    byFile.get(file).push({ ...annotation, file });
  }
  for (const [file, proposals] of byFile) {
    if (scanner.applyAnnotations) {
      const result = scanner.applyAnnotations(file, sources.get(file), proposals, style);
      edits.set(file, result.text);
      accepted.push(...result.effects);
      rejected.push(...result.failed.map(({ line, reason }) => ({ file, line, reason })));
    } else {
      // Scanner versions before batch patching used the single-edit helper.
      const lines = sources.get(file).split('\n');
      for (const annotation of proposals) {
        const reason = scanner.applyAnnotation(lines, annotation, style);
        if (reason) rejected.push({ file, line: annotation.line, reason });
        else accepted.push(annotation);
      }
      edits.set(file, lines.join('\n'));
    }
  }
  return { after: edits, accepted, rejected };
}

function automaticAnnotations(scanner, scan, source, style) {
  const { annotations } = scanner.placeAnnotations(scan, source, { sdk: 'rrweb', annotate: style });
  // The normal find command also includes candidates decided by automatic line rules.
  return [...annotations, ...scan.candidates.filter((c) => c.auto).map(({ file, auto }) => ({
    file, line: auto.line, match: auto.match, value: auto.value, category: auto.category,
  }))];
}

// Read back the result of applying the diff to a temporary index. The source
// checkout and its real index stay untouched.
function applyPatch(source, temp, patch, files) {
  const env = { ...process.env, GIT_INDEX_FILE: path.join(temp, 'benchmark.index') };
  git(source, ['read-tree', 'HEAD'], env);
  git(source, ['apply', '--cached', patch], env);
  return new Map([...files].map((file) => [file, git(source, ['show', `:${file}`], env)]));
}

function preparePatch({ source, sources, scanner, scan, session, temp }) {
  let style = 'rrweb';
  let annotations;
  let failed = [];
  const patch = path.join(temp, 'privacy.patch');
  try {
    if (session) {
      for (const file of ['annotations.json', 'candidates.json']) fs.copyFileSync(path.join(session, file), path.join(temp, file));
      const saved = json(path.join(temp, 'candidates.json'));
      if (fs.realpathSync(saved.target.root) !== source) throw new Error('Benchmark session belongs to a different source tree.');
      style = saved.annotate || 'data-privacy';
      annotations = json(path.join(temp, 'annotations.json')).annotations;
      execFileSync(process.execPath, [CLI, 'patch', '--out', temp], { stdio: 'pipe' });
    } else {
      const projected = projection(scanner, sources, automaticAnnotations(scanner, scan, source, style), style);
      annotations = projected.accepted;
      failed = projected.rejected;
      const diff = [...projected.after].map(([file, after]) => {
        const before = sources.get(file);
        return before === after ? '' : scanner.unifiedDiff(file, before, after);
      }).join('');
      fs.writeFileSync(patch, diff);
    }
    if (!fs.statSync(patch).size) return { application: 'empty', style, annotations, failed, after: sources };
    return { application: 'applied', style, annotations, failed, after: applyPatch(source, temp, patch, sources.keys()) };
  } catch (error) {
    const message = error.stderr?.toString().trim() || error.message;
    return { application: 'failed', style, annotations: [], failed: [...failed, { reason: message }] };
  }
}

const total = (rows, predicate) => rows.filter(predicate).length;
const covered = (value) => ['matched', 'over-treated'].includes(value);

function stats(rows) {
  const priv = rows.filter((row) => row.category !== 'public');
  const pub = rows.filter((row) => row.category === 'public');
  return {
    private_labels: priv.length,
    public_labels: pub.length,
    detected_exact: total(priv, (row) => row.detection.exact),
    detected_contextual: total(priv, (row) => row.detection.exact || row.detection.contextual),
    placed_exact: total(priv, (row) => row.placement === 'exact'),
    placed_ancestor: total(priv, (row) => row.placement === 'ancestor'),
    treated_exact: total(priv, (row) => row.exact_treatment === 'matched'),
    treated_correctly: total(priv, (row) => row.treatment === 'matched'),
    stronger_treatment: total(priv, (row) => row.treatment === 'over-treated'),
    insufficient_treatment: total(priv, (row) => row.treatment === 'insufficient'),
    static_covered: total(priv, (row) => covered(row.static)),
    private_unverified: total(priv, (row) => !row.target_verified),
    public_detected_exact: total(pub, (row) => row.detection.exact),
    public_treated: total(pub, (row) => row.static === 'over-treated'),
    public_unverified: total(pub, (row) => !row.target_verified),
  };
}

export function measureRows({ labels, sources, scan, patch, split }) {
  validateLabels(labels, sources);
  const points = pointsByFile(scan.candidates);
  const heldOut = new Set(labels.held_out || []);
  const sample = new Set([...sources.keys()].filter((file) => !split || (split === 'held-out') === heldOut.has(file)));
  if (!sample.size) throw new Error(`No benchmark files for split ${split}.`);
  const rows = [];
  for (const file of sample) {
    const source = sources.get(file);
    const spans = spansFor(file, source);
    const measured = measureTreatments({
      file, source, labels: labels.files[file], annotations: patch.annotations, style: patch.style,
      patchReady: patch.application !== 'failed', editedSource: patch.after?.get(file),
    });
    for (const row of measured.rows) {
      const { covering, ...outcome } = row;
      rows.push({
        file, split: heldOut.has(file) ? 'held-out' : 'development', ...outcome,
        detection: detection(row, labelledElement(spans, row), points.get(file) || [], spans),
      });
    }
  }
  const groups = {};
  for (const partition of SPLITS) {
    const inSplit = rows.filter((row) => row.split === partition);
    if (inSplit.length) groups[partition] = Object.fromEntries([
      ['all', stats(inSplit)],
      ...CATEGORIES.map((category) => [category, stats(inSplit.filter((row) => row.category === category))]),
    ]);
  }
  return { rows, groups, review: summarizeReviews(labels, sample) };
}

function readSources(source, labels) {
  return new Map(Object.keys(labels.files).map((file) => {
    const actual = path.resolve(source, file);
    if (portable(path.relative(source, actual)) !== file || fs.realpathSync(actual) !== actual) {
      throw new Error(`Benchmark file must be inside the pinned checkout: ${file}`);
    }
    const tracked = git(source, ['ls-files', '-v', '--', file]).trim();
    if (!tracked.startsWith('H ')) throw new Error(`Benchmark file must be tracked and present: ${file}`);
    return [file, fs.readFileSync(actual, 'utf8')];
  }));
}

export async function measureApp({ source, labels, scannerRoot, answers, session, split }) {
  source = fs.realpathSync(source);
  const revision = assertLabelRevision(source, labels.commit);
  if (fs.realpathSync(git(source, ['rev-parse', '--show-toplevel']).trim()) !== source) {
    throw new Error('Benchmark source must be the root of the pinned Git checkout.');
  }
  const sources = readSources(source, labels);
  validateLabels(labels, sources);
  const scanner = await loadScanner(scannerRoot);
  const started = Date.now();
  const scan = scanner.find(source);
  if (answers) scanner.applyAnswers(scan, json(answers));
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'privacy-measure-'));
  try {
    const patch = preparePatch({ source, sources, scanner, scan, session, temp });
    const measured = measureRows({ labels, sources, scan, patch, split });
    return {
      app: labels.app,
      scanner: scanner.metadata,
      recorder_version: 'unknown',
      revision,
      scanned_files: scan.scanned_files,
      scanned_lines: scan.scanned_lines,
      elapsed_ms: Date.now() - started,
      patch_application: patch.application,
      patch_scope: session ? 'full-session' : 'sample-files',
      placement_failures: patch.failed,
      replay: 'unmeasured',
      ...measured,
    };
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

const KEEP = ['detected_exact', 'placed_exact', 'treated_exact', 'treated_correctly', 'static_covered'];
const REDUCE = ['public_detected_exact', 'public_treated'];

export function regressions(current, baseline) {
  const identity = (report) => JSON.stringify(report.rows.map(({ file, line, column, target_line, tag, category, value, split }) => (
    [file, line, column, target_line, tag, category, value, split]
  )));
  if (baseline.patch_application === 'failed') throw new Error('Cannot compare against a failed benchmark.');
  if (current.app !== baseline.app || current.revision !== baseline.revision
    || current.patch_scope !== baseline.patch_scope || identity(current) !== identity(baseline)) {
    throw new Error('Cannot compare different benchmark revisions, labels, or scopes.');
  }
  const drops = [];
  for (const [split, groups] of Object.entries(current.groups)) {
    for (const category of CATEGORIES) {
      const now = groups[category];
      const prior = baseline.groups[split][category];
      for (const field of KEEP) if (now[field] < prior[field]) drops.push(`${split}/${category} ${field} ${prior[field]} -> ${now[field]}`);
      for (const field of REDUCE) if (now[field] > prior[field]) drops.push(`${split}/${category} ${field} ${prior[field]} -> ${now[field]}`);
    }
  }
  return drops;
}

const pct = (n, d) => (d ? `${Math.round((100 * n) / d)}%` : '-');

function format(report, over) {
  const lines = [
    `Scanner ${report.scanner?.version || 'unknown'}, implementation ${report.scanner?.implementation_sha256 || 'unknown'}; recorder version unknown.`,
    `${report.app || 'sample'} ${report.revision}: ${report.scanned_files} files scanned in ${(report.elapsed_ms / 1000).toFixed(1)} s`,
    `Review: ${report.review.status}; ${report.review.human_submissions} human and ${report.review.model_submissions} model submissions; ${report.review.agreed} agreements (${report.review.human_agreed} between humans); ${report.review.disagreements.length} disagreements, ${report.review.unresolved} unresolved`,
  ];
  for (const [split, groups] of Object.entries(report.groups)) {
    const s = groups.all;
    lines.push(
      `\n${split}: ${s.private_labels} private and ${s.public_labels} public labels`,
      `  Detection: exact ${s.detected_exact}/${s.private_labels}, contextual ${s.detected_contextual}/${s.private_labels}, public flags ${s.public_detected_exact}/${s.public_labels}`,
      `  Placement: ${s.placed_exact} exact destinations, ${s.placed_ancestor} ancestor placements`,
      `  Treatment: exact treatment ${pct(s.treated_exact, s.private_labels)} (${s.treated_exact}/${s.private_labels}); correct at target or ancestor ${s.treated_correctly}; stronger ${s.stronger_treatment}; insufficient ${s.insufficient_treatment}`,
      `  Static source coverage: ${s.static_covered}/${s.private_labels} private covered, ${s.public_treated}/${s.public_labels} public treated; unresolved destinations ${s.private_unverified} private, ${s.public_unverified} public`,
    );
    if (over) for (const row of report.rows.filter((r) => r.split === split
      && (r.category === 'public' ? r.static === 'over-treated' : r.exact_treatment !== 'matched'))) {
      lines.push(`  ${row.file}:${row.line} [${row.category}/${row.value}] ${row.static || 'unverified'} ${row.what}`);
    }
  }
  if (report.patch_scope === 'full-session') {
    lines.push(report.patch_application === 'failed'
      ? 'Patch application: session patch failed validation'
      : report.patch_application === 'applied'
        ? 'Patch application: session patch passed Git application check in an isolated index'
        : 'Patch application: session generated an empty patch');
  } else {
    lines.push(`Patch application: ${report.patch_application} for labelled sample files`);
  }
  lines.push(`Rejected placement attempts: ${report.placement_failures.length}`, 'Replay coverage: unmeasured');
  for (const regression of report.regressions || []) lines.push(`Regression: ${regression}`);
  return lines.join('\n');
}

async function main([app, source, ...args]) {
  if (!app || !source) throw new Error('Usage: measure.mjs <app> <source> [--split development|held-out] [--json] [--compare <report>] [--session <directory>]');
  const options = {};
  for (let i = 0; i < args.length; i++) {
    const option = args[i];
    if (['--json', '--over'].includes(option)) options[option] = true;
    else if (['--answers', '--session', '--split', '--compare', '--scanner-root'].includes(option) && args[i + 1] && !args[i + 1].startsWith('--')) options[option] = args[++i];
    else throw new Error(`Invalid option: ${option}`);
  }
  if (options['--split'] && !SPLITS.includes(options['--split'])) throw new Error('Unknown benchmark split.');
  if (options['--session'] && (options['--scanner-root'] || options['--answers'])) {
    throw new Error('A saved benchmark session supplies its own scanner and answers.');
  }
  const labels = json(path.join(HERE, app, 'labels.json'));
  const result = await measureApp({
    labels, source, scannerRoot: options['--scanner-root'], session: options['--session'],
    answers: options['--answers'], split: options['--split'],
  });
  if (options['--compare']) result.regressions = regressions(result, json(options['--compare']));
  console.log(options['--json'] ? JSON.stringify(result, null, 2) : format(result, options['--over']));
  if (result.patch_application === 'failed' || result.regressions?.length) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await main(process.argv.slice(2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
