#!/usr/bin/env node
// privacy-scan: finds front-end code a session recorder must mask or block, and proposes annotations.
//
//   privacy-scan inventory <source> --out <session>                    inventory rendering sites for the privacy review skill
//   privacy-scan review-context --out <session> --file <path>           read bounded source evidence
//   privacy-scan review-proposals --out <session>                      validate exact source-supported framework edits
//   privacy-scan review-patch --out <session>                           validate semantic decisions and write a reviewed proposal
//   privacy-scan find   <app-source-dir> [--sdk rrweb] [--annotate rrweb|data-privacy] [--include <path,...>] [--out <dir>]
//                                                                      static pass; prints the session folder and its PLAYBOOK.md
//   privacy-scan place  --out <dir>                                    applies the answers in annotations.json and places annotations again
//   privacy-scan patch  --out <dir>                                    annotations.json -> privacy.patch and app-privacy.json
//   privacy-scan report --out <dir> [--post <url>]                     one feedback report for the scan, and private recorder gaps;
//                                                                      --post sends the public report to a feedback endpoint
//   privacy-scan bench  [<benchmark-dir>]                              score the static pass on labelled apps; fails below the baseline
//   privacy-scan agent  <app-source-dir> [--sdk rrweb] [--annotate rrweb|data-privacy] [--out <dir>] [--agent claude|codex|<command>] [--headless] [--model <m>]
//                                                                      static pass, then starts a coding agent on PLAYBOOK.md
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parse } from '@babel/parser';
import { performance } from 'node:perf_hooks';
import { isDeepStrictEqual } from 'node:util';
import { validateSession, writeSessionFile } from './session.mjs';
import { find, planMarkdown } from './find.mjs';
import { chooseAgent, writeSession, launch } from '../audit/runner/lib/agent.mjs';
import { playbook } from './playbook.mjs';
import { buildScanReport, writeScanReport } from './report.mjs';
import { bench, formatBench } from './bench.mjs';
import { applyAnnotations, unifiedDiff, overMaskWarnings, uncoveredSites } from './patch.mjs';
import { spansFor } from './templates.mjs';
import { placeAnnotations } from './place.mjs';
import { buildQuestions, applyAnswers } from './residue.mjs';
import { CACHE_PATH, loadCache, applyCache, buildCache, cacheDiff, sourceSnapshot, scannerRevision } from './cache.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = fileURLToPath(import.meta.url);
const VERSION = JSON.parse(fs.readFileSync(path.join(HERE, '..', 'package.json'), 'utf8')).version;
const defaultOut = (name) => path.join(os.tmpdir(), `${name}-${new Date().toISOString().replace(/[:.]/g, '-')}`);

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) args[argv[i].slice(2)] = argv[i + 1]?.startsWith('--') || argv[i + 1] === undefined ? true : argv[++i];
    else args._.push(argv[i]);
  }
  return args;
}

// The repository root: where the decisions cache lives and where patch paths start.
function gitTop(dir) {
  try { return execFileSync('git', ['--no-optional-locks', '-c', 'core.fsmonitor=false', '-C', dir, 'rev-parse', '--show-toplevel'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return null; }
}

function gitInfo(dir) {
  const git = (...a) => {
    try { return execFileSync('git', ['--no-optional-locks', '-c', 'core.fsmonitor=false', '-C', dir, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return null; }
  };
  return { commit: git('rev-parse', 'HEAD'), branch: git('rev-parse', '--abbrev-ref', 'HEAD'), dirty: Boolean(git('status', '--porcelain')) };
}

function responsibility() {
  const m = fs.readFileSync(path.join(HERE, 'AGENTS.md'), 'utf8').match(/## Responsibility\n\n([^\n]+)/);
  return m ? m[1] : null;
}

// The session folder sits outside the application, which the scan must leave unchanged.
// The annotation style: the standard attribute, or a recorder's own classes (rrweb reads
// rr-block, rr-mask and rr-ignore with no configuration). --sdk rrweb defaults to rrweb classes.
function annotateStyle(requested, sdk) {
  const style = requested || (sdk === 'rrweb' ? 'rrweb' : 'data-privacy');
  if (!['rrweb', 'data-privacy'].includes(style)) throw new Error(`--annotate must be rrweb or data-privacy, got ${style}`);
  return style;
}

// Resolve the existing ancestor too, so an output symlink cannot write into
// the application while appearing to be outside it.
function destinationPath(directory) {
  if (fs.existsSync(directory)) return fs.realpathSync(directory);
  return path.join(destinationPath(path.dirname(directory)), path.basename(directory));
}

function runFind(src, out, sdk, headless, annotate, include, reuse) {
  out = destinationPath(out);
  validateSession(out);
  const started = performance.now();
  const root = fs.realpathSync(src);
  const top = gitTop(root) || root;
  if (fs.existsSync(path.join(out, 'annotations.json'))) throw new Error('Session already contains decisions. Use a new --out folder to scan again.');
  validateSession(out, top);
  const relativeOut = path.relative(top, out);
  if (!relativeOut.startsWith('..') && !path.isAbsolute(relativeOut)) throw new Error('Session folder must be outside the application repository.');
  const sourceHashes = sourceSnapshot(root, top);
  let analysis;
  if (reuse) {
    validateSession(reuse);
    const previous = JSON.parse(fs.readFileSync(path.join(reuse, 'static-analysis.json'), 'utf8'));
    if (previous.root !== root || previous.revision !== scannerRevision() || JSON.stringify(previous.include) !== JSON.stringify(include) || JSON.stringify(previous.source_hashes) !== JSON.stringify(sourceHashes)) throw new Error('Static analysis cache is stale. Run find without --reuse.');
    analysis = previous.analysis;
  } else analysis = find(root, { include });
  fs.mkdirSync(out, { recursive: true });
  writeSessionFile(out, 'static-analysis.json', JSON.stringify({ root, include, revision: scannerRevision(), source_hashes: sourceHashes, analysis }, null, 1));
  const result = { ...analysis, target: { root, top, ...gitInfo(root) }, sdk: sdk || null, annotate, scan_version: VERSION, scan_revision: scannerRevision(), source_hashes: sourceHashes };
  const cache = loadCache(top);
  result.cache = applyCache(result, cache, root, top);
  // Answers from earlier scans decide their sources again; then stage 5 places the annotations.
  const answers = { ...(result.cache.valid ? cache?.answers : {}) };
  fs.mkdirSync(out, { recursive: true });
  writeSessionFile(out, 'source-candidates.json', JSON.stringify(result, null, 1));
  const placement = decide(result, root, sdk, annotate, answers);
  writeSessionFile(out, 'candidates.json', JSON.stringify(result, null, 1));
  writeSessionFile(out, 'scan-plan.md', planMarkdown(result));
  if (!fs.existsSync(path.join(out, 'annotations.json'))) {
    // Candidates decided by an `auto` rule start out annotated; the agent skips them.
    const annotations = [...placement.annotations, ...result.candidates.filter((c) => c.auto).map((c) => ({
      file: c.file, line: c.auto.line, column: c.auto.column, match: c.auto.match, value: c.auto.value, category: c.auto.category,
      special_category: false, data: `decided by rule ${c.auto.rule}`, candidates: [c.id], auto: true,
    }))];
    // Units in files unchanged since the last scan keep their earlier decision.
    const cached = Object.fromEntries(result.candidates.filter((c) => c.cached).map((c) => [c.id, `unchanged since the last scan: ${c.cached.decision}${c.cached.value ? ` ${c.cached.value}` : ''}`]));
    const settled = Object.fromEntries(result.candidates.filter((c) => c.settled).map((c) => [c.id, c.settled]));
    const config = sdk === 'rrweb' ? ['rrweb on all pages: maskAllInputs: true (input values)'] : [];
    writeSessionFile(out, 'annotations.json', JSON.stringify({ annotations, dismissed: {}, answers, cached, settled, config, gaps: [] }, null, 1));
  }
  result.performance = { static_ms: performance.now() - started, model_tokens: 0, model_calls: 0, static_cache_hit: Boolean(reuse) };
  writeSessionFile(out, 'candidates.json', JSON.stringify(result, null, 1));
  const promptFile = path.join(out, 'PLAYBOOK.md');
  writeSessionFile(out, 'PLAYBOOK.md', playbook({ scanDir: HERE, sessionDir: out, src: root, sdk, annotate, cli: CLI, headless }));
  const open = result.candidates.filter((c) => !c.cached).length;
  console.log(`Scanner ${VERSION}. Recorder ${sdk || 'unknown'}, version unknown. ${responsibility()}`);
  console.log(`Scanned ${result.scanned_files} files: ${result.candidates.length} candidates${result.cache.units_skipped ? `, of which ${result.cache.units_skipped} in ${result.cache.files_skipped} unchanged files keep their earlier decision (${open} to review)` : ''}.`);
  console.log(`Session folder: ${out}`);
  console.log(`Next: read ${promptFile} and follow it.`);
  return { result, promptFile };
}

const DECIDED = /^(placed from the scan|decided by the scan|answered:)/;

// Applies answers about unknown sources, places annotations from the high-confidence sites (stage 5),
// settles the units with nothing left to decide, and lists the questions that are still open.
function decide(result, root, sdk, annotate, answers) {
  result.applied_answers = { ...answers };
  applyAnswers(result, answers);
  for (const c of result.candidates) {
    if (c.settled && DECIDED.test(c.settled)) delete c.settled;
    delete c.review_lines;
  }
  const placement = placeAnnotations(result, root, { sdk, annotate });
  for (const c of result.candidates) {
    if (!c.sites || c.cached || c.settled) continue;
    if (!c.sites.length) { c.settled = 'answered: its sources hold no private data'; continue; }
    const review = placement.review.get(c.id);
    const n = placement.placed.get(c.id);
    if (review) c.review_lines = review;
    else if (n) c.settled = `placed from the scan: ${n} annotation${n === 1 ? '' : 's'}`;
    else c.review_lines = c.sites.map((site) => site.line);
  }
  // Type declarations do not render. Toasts and custom inputs remain open:
  // component names alone do not establish where their private values render.
  for (const c of result.candidates) {
    if (c.sites || c.cached || c.settled || c.auto) continue;
    const code = c.snippet.trim();
    if (/^(export\s+)?(type|interface)\s|^\w+\??:\s*(Pick|Omit|Partial|Record)<|^\w+\??:\s*[A-Z]\w*(\[\])?;$/.test(code)) c.settled = 'decided by the scan: a type declaration, not shown';
  }
  result.questions = buildQuestions(result, root);
  return placement;
}

// After the agent answers questions: applies the answers, places again, and rewrites the session files.
function assertFresh(scan) {
  if (scan.scan_revision !== scannerRevision() || !scan.source_hashes || JSON.stringify(sourceSnapshot(scan.target.root, scan.target.top)) !== JSON.stringify(scan.source_hashes)) {
    throw new Error('Source or dependencies changed since find. Run find in a new session before placing or patching.');
  }
}

function runPlace(out) {
  validateSession(out);
  const result = JSON.parse(fs.readFileSync(path.join(out, 'source-candidates.json'), 'utf8'));
  validateSession(out, result.target.top);
  assertFresh(result);
  const decisions = JSON.parse(fs.readFileSync(path.join(out, 'annotations.json'), 'utf8'));
  const placement = decide(result, result.target.root, result.sdk, result.annotate, decisions.answers || {});
  // Placed annotations are made again; the agent's own annotations and rule decisions stay.
  decisions.annotations = [...placement.annotations, ...decisions.annotations.filter((a) => !(a.auto && /^placed from the scan/.test(a.data || '')))];
  decisions.settled = { ...Object.fromEntries(Object.entries(decisions.settled || {}).filter(([, v]) => !DECIDED.test(v))), ...Object.fromEntries(result.candidates.filter((c) => c.settled && DECIDED.test(c.settled)).map((c) => [c.id, c.settled])) };
  writeSessionFile(out, 'candidates.json', JSON.stringify(result, null, 1));
  writeSessionFile(out, 'annotations.json', JSON.stringify(decisions, null, 1));
  writeSessionFile(out, 'scan-plan.md', planMarkdown(result));
  const open = result.candidates.filter((c) => !c.cached && !c.settled);
  console.log(`Placed ${placement.annotations.length} annotations. Open: ${open.length} candidates, ${result.questions.length} questions. Next: examine the open candidates in scan-plan.md, then run the patch command.`);
}

// Only scanner-owned statuses may close a candidate without an explicit review.
function runPatch(out) {
  validateSession(out);
  const scan = JSON.parse(fs.readFileSync(path.join(out, 'candidates.json'), 'utf8'));
  for (const name of ['privacy.patch', 'decisions.json', 'app-privacy.json']) fs.rmSync(path.join(out, name), { force: true });
  validateSession(out, scan.target.top);
  assertFresh(scan);
  const decisions = JSON.parse(fs.readFileSync(path.join(out, 'annotations.json'), 'utf8'));
  const canonicalAnswers = (value) => JSON.stringify(Object.entries(value || {}).sort(([a], [b]) => a.localeCompare(b)));
  if (canonicalAnswers(decisions.answers) !== canonicalAnswers(scan.applied_answers)) throw new Error('Answers changed since placement. Run place before patch.');
  // Recreate source facts before trusting completion. Reviewers may edit answers,
  // but deleting or settling a candidate in a session file is not source evidence.
  const verified = { ...scan, ...find(scan.target.root, { include: scan.include }) };
  verified.cache = applyCache(verified, loadCache(scan.target.top), scan.target.root, scan.target.top);
  decide(verified, scan.target.root, scan.sdk, scan.annotate, decisions.answers || {});
  const plain = (value) => JSON.parse(JSON.stringify(value));
  if (!isDeepStrictEqual(plain(verified.candidates), plain(scan.candidates)) || !isDeepStrictEqual(plain(verified.analysis_failures || []), plain(scan.analysis_failures || []))) {
    throw new Error('Scanner evidence changed or is inconsistent with source. Run find in a new session; edit only annotations.json.');
  }

  const root = scan.target.root;
  const files = new Map();
  const failed = [];
  const style = scan.annotate || 'data-privacy';
  const grouped = new Map();
  const effects = [];
  for (const a of decisions.annotations) {
    if (!['secret', 'personal', 'third-party', 'public'].includes(a.category) || !Number.isInteger(a.line) || a.line < 1 || typeof a.file !== 'string') {
      failed.push({ ...a, reason: 'annotation requires a supported category, file and positive line number' });
      continue;
    }
    const abs = path.resolve(root, a.file);
    const rel = path.relative(root, abs);
    const scannedPath = path.relative(scan.target.top, abs).split(path.sep).join('/');
    if (!(scannedPath in scan.source_hashes) || rel.startsWith('..') || path.isAbsolute(rel) || !fs.existsSync(abs) || fs.realpathSync(abs) !== abs) {
      failed.push({ ...a, reason: 'annotation path is outside the source tree, missing, or a symlink' });
      continue;
    }
    if (!grouped.has(abs)) grouped.set(abs, []);
    grouped.get(abs).push(a);
  }
  for (const [abs, annotations] of grouped) {
    const before = fs.readFileSync(abs, 'utf8');
    const result = applyAnnotations(path.relative(root, abs), before, annotations, style);
    failed.push(...result.failed);
    effects.push(...result.effects);
    files.set(abs, result.text.split('\n'));
  }
  // Paths in the patch are relative to the repository root, so `git apply` works from there.
  const top = scan.target.top || gitTop(root) || root;
  let patch = '';
  let changedFiles = 0;
  const after = new Map();
  for (const [abs, lines] of files) {
    const before = fs.readFileSync(abs, 'utf8');
    const text = lines.join('\n');
    if (text === before) continue;
    if (/\.(tsx|jsx|ts|js|mjs)$/.test(abs)) {
      try { parse(text, { sourceType: 'module', plugins: /\.tsx?$/.test(abs) ? ['jsx', 'typescript', 'decorators-legacy'] : ['jsx', 'decorators-legacy'] }); }
      catch (error) { failed.push({ file: path.relative(root, abs), line: error.loc?.line, reason: `patched source does not parse: ${error.message}` }); continue; }
    }
    changedFiles++;
    after.set(abs, text);
    patch += unifiedDiff(path.relative(top, abs), before, text);
  }
  const annotationCloses = (candidate, annotation) => {
    if (failed.some((f) => f.file === annotation.file)) return false;
    if (candidate.sites) return true; // Per-value checks below verify component coverage.
    if (!['mask', 'block'].includes(annotation.value)) return false;
    if (annotation.file !== candidate.file) return false;
    if (candidate.category_hint?.replace('?', '') === 'secret' && annotation.value !== 'block') return false;
    const spans = spansFor(candidate.file, fs.readFileSync(path.join(root, candidate.file), 'utf8'));
    const targets = annotation.element ? [annotation.element] : [];
    if (targets.length !== 1 || !/^[a-z][a-z0-9]*$/.test(targets[0][3])) return false;
    const points = spans.filter(([start, open, , tag, column]) => candidate.auto
      ? start === candidate.auto.line && `<${tag}` === candidate.auto.match && (candidate.auto.column === undefined || candidate.auto.column === column)
      : candidate.line >= start && candidate.line <= open);
    if (points.length !== 1) return false;
    if (style === 'rrweb' && candidate.rules.includes('input') && /^(input|textarea|select)$/.test(points[0][3]) && annotation.value !== 'block') return false;
    return targets[0][5] <= points[0][5] && points[0][6] <= targets[0][6];
  };
  const settled = new Set([
    ...Object.keys(decisions.dismissed || {}),
    ...scan.candidates.filter((c) => c.cached || c.settled || effects.some((a) => a.candidates?.includes(c.id) && annotationCloses(c, a))).map((c) => c.id),
  ]);
  const unreviewed = scan.candidates.filter((c) => !settled.has(c.id)).map((c) => c.id);
  const byValue = {};
  for (const a of decisions.annotations) byValue[`${a.value}/${a.category}`] = (byValue[`${a.value}/${a.category}`] || 0) + 1;
  // rrweb masks input values only through maskAllInputs or maskInputOptions, never through rr-mask.
  const config = [...(decisions.config || [])];
  if (scan.sdk === 'rrweb' && !config.includes('rrweb on all pages: maskAllInputs: true (input values)')) config.unshift('rrweb on all pages: maskAllInputs: true (input values)');
  if (style === 'rrweb' && decisions.annotations.some((a) => a.value === 'mask' && /^<(input|Input|textarea|Textarea|select|Select|TextField)\b/.test(a.match))) {
    config.unshift('rrweb: input values are masked only by maskAllInputs or maskInputOptions, never by rr-mask. @rrweb/browser-client (rrweb Cloud) sets maskAllInputs: true by default; with core rrweb, set it yourself.');
  }
  const report = {
    disclaimer: responsibility(),
    scan_version: scan.scan_version,
    scan_revision: scan.scan_revision,
    recorder_version: 'unknown',
    performance: scan.performance || { model_tokens: null },
    stages: { discovered: scan.candidates.length, proposed: decisions.annotations.length, verified_proposals: effects.filter((a) => !failed.some((f) => f.file === a.file)).length, applied_to_source: false, static_verified: false, static_scope: 'discovered candidates and supported source analysis in the proposed patch', replay_observed: false },
    analysis_failures: scan.analysis_failures || [],
    annotate: style,
    target: scan.target,
    sdk: scan.sdk,
    scanned_files: scan.scanned_files,
    candidates: scan.candidates.length,
    annotations: decisions.annotations.map((a) => ({
      ...a,
      snippets: (a.candidates || []).map((id) => scan.candidates.find((c) => c.id === id)).filter(Boolean).map((c) => `${c.file}:${c.line} ${c.snippet}`),
    })),
    dismissed: decisions.dismissed || {},
    config,
    gaps: decisions.gaps || [],
    failed,
    unreviewed,
    over_masking: overMaskWarnings(verified, decisions.annotations),
    uncovered: uncoveredSites(scan, { ...decisions, annotations: effects.filter((a) => !failed.some((f) => f.file === a.file)) }, (file) => spansFor(file, fs.readFileSync(path.join(root, file), 'utf8'))),
  };
  report.stages.static_verified = !failed.length && !report.uncovered.length && !unreviewed.length && !report.over_masking.length && !report.analysis_failures.length;
  writeSessionFile(out, 'app-privacy.json', JSON.stringify(report, null, 1));
  const applied = effects.filter((a) => !failed.some((f) => f.file === a.file)).length;
  console.log(`Wrote app-privacy.json (${applied} annotation${applied === 1 ? '' : 's'} in ${changedFiles} file${changedFiles === 1 ? '' : 's'}). By value/category: ${JSON.stringify(byValue)}. Dismissed: ${Object.keys(report.dismissed).length}.`);
  if (failed.length) { console.log(`Not applied: ${failed.map((f) => `${f.file}:${f.line} (${f.reason})`).join('; ')}`); process.exitCode = 1; }
  if (report.over_masking.length) {
    console.log(`Over-masking: ${report.over_masking.map((w) => `${w.file}:${w.line} ${w.message}`).join('; ')}`);
    process.exitCode = 1;
  }
  if (report.uncovered.length) {
    console.log(`Uncovered: ${report.uncovered.map((u) => `${u.id} <${u.component}> ${u.file} L${u.lines.join(', L')}${u.dismissed ? ' (dismissed unit)' : ''}`).join('; ')}. Annotate these lines, or accept a line with a "${report.uncovered[0].id}:L${report.uncovered[0].lines[0]}" key and a reason in dismissed.`);
    process.exitCode = 1;
  }
  if (unreviewed.length) {
    console.log(`Unreviewed candidates: ${unreviewed.join(', ')}`);
    process.exitCode = 1;
  }
  if (report.analysis_failures.length) {
    console.log(`Analysis incomplete: ${report.analysis_failures.join(', ')}`);
    process.exitCode = 1;
  }
  if (!process.exitCode) {
    // The decisions cache goes into the same patch, so it is committed with the annotations.
    const oldCache = loadCache(top);
    const newCache = `${JSON.stringify(buildCache({ cache: oldCache, scan, decisions, after, root, top, version: VERSION }), null, 1)}\n`;
    writeSessionFile(out, 'decisions.json', newCache);
    const oldText = oldCache ? fs.readFileSync(path.join(top, CACHE_PATH), 'utf8') : null;
    if (oldText !== newCache) patch += oldText === null ? cacheDiff(null, newCache) : unifiedDiff(CACHE_PATH, oldText, newCache);
    writeSessionFile(out, 'privacy.patch', patch);
    console.log('Wrote privacy.patch and decisions.json. Recorder protection still requires runtime verification.');
  } else {
    console.log('No applicable patch or reusable decisions were written. Resolve the report and run patch again.');
  }

}

const args = parseArgs(process.argv.slice(2));
const cmd = args._[0];

const sdkArg = typeof args.sdk === 'string' ? args.sdk : null;
const annotateArg = annotateStyle(typeof args.annotate === 'string' ? args.annotate : null, sdkArg);
const includeArg = typeof args.include === 'string' ? args.include.split(',').map((s) => s.trim()).filter(Boolean) : null;

if (['inventory', 'review-context', 'review-patch', 'review-proposals'].includes(cmd)) {
  const workflow = await import('./review/workflow.mjs');
  if (typeof args.out !== 'string') throw new Error(`${cmd} needs --out <session folder>`);
  const out = path.resolve(args.out);
  if (cmd === 'inventory') {
    console.log(JSON.stringify(workflow.createReviewSession(args._[1] || '.', out, { include: includeArg || undefined }), null, 2));
  } else if (cmd === 'review-context') {
    if (typeof args.file !== 'string') throw new Error('review-context needs --file <source path>');
    console.log(JSON.stringify(workflow.sourceContext(out, args.file, { start: args.start ? Number(args.start) : 1, end: args.end ? Number(args.end) : undefined }), null, 2));
  } else if (cmd === 'review-proposals') {
    workflow.discardReviewArtifacts(out, ['source-proposals.patch', 'source-proposals.json']);
    const state = workflow.freshReviewSession(out);
    const { proposeSourceChanges } = await import('./review/changes.mjs');
    const review = workflow.readReviewDecisions(out);
    const { after, patch, ...result } = proposeSourceChanges(state.session.root, state.inventory, review);
    if (!result.errors.length) {
      const applied = workflow.applyProposalInCopy(state.session.root, patch);
      result.patch_application = applied.application;
      fs.rmSync(applied.root, { recursive: true, force: true });
      if (patch) writeSessionFile(out, 'source-proposals.patch', patch);
    }
    writeSessionFile(out, 'source-proposals.json', JSON.stringify({ ...result, scanner: state.session.scanner, responsibility: workflow.responsibility }, null, 2));
    console.log(JSON.stringify({ status: result.status, changes: result.changes, errors: result.errors, patch_application: result.patch_application, runtime: result.runtime }, null, 2));
    if (result.errors.length) process.exitCode = 2;
  } else {
    const { report } = workflow.reviewSessionPatch(out);
    console.log(JSON.stringify({ responsibility: report.responsibility, stages: report.stages, errors: report.errors.length, unresolved: report.unresolved.length, missing: report.missing.length, report: path.join(out, 'review-report.json') }, null, 2));
    if (!report.stages.review_complete) process.exitCode = 2;
  }
} else if (cmd === 'find') {
  runFind(args._[1] || '.', path.resolve(typeof args.out === 'string' ? args.out : defaultOut('privacy-scan')), sdkArg, false, annotateArg, includeArg, typeof args.reuse === 'string' ? path.resolve(args.reuse) : null);
} else if (cmd === 'place') {
  if (typeof args.out !== 'string') throw new Error('place needs --out <session folder>');
  runPlace(path.resolve(args.out));
} else if (cmd === 'patch') {
  if (typeof args.out !== 'string') throw new Error('patch needs --out <session folder>');
  runPatch(path.resolve(args.out));
} else if (cmd === 'report') {
  if (typeof args.out !== 'string') throw new Error('report needs --out <session folder>');
  const out = validateSession(path.resolve(args.out));
  const scan = JSON.parse(fs.readFileSync(path.join(out, 'candidates.json'), 'utf8'));
  validateSession(out, scan.target.top);
  scan.scan_version ||= VERSION;
  const decisions = JSON.parse(fs.readFileSync(path.join(out, 'annotations.json'), 'utf8'));
  const report = buildScanReport({ scan, decisions });
  const files = writeScanReport(out, report);
  console.log(`${report.title}\n  report: ${files.md}\n  payload: ${files.json}\n  feedback form: ${report.url}`);
  console.log('\nTo share feedback, review the local draft for real data before copying it into the form.');
  if (files.private) console.log(`\nRecorder gaps were written to ${files.private}. Do not post them publicly: send them as described in SECURITY.md.`);
  // Sends the public payload only; recorder gaps never leave the private file.
  if (typeof args.post === 'string') {
    try {
      const res = await fetch(args.post, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'user-agent': `privacy-scan/${VERSION}` },
        body: JSON.stringify(report.payload),
        signal: AbortSignal.timeout(10000),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) console.log(`\nSent the report to ${args.post}${body.id ? ` (id ${body.id})` : ''}.`);
      else { process.exitCode = 1; console.log(`\nThe endpoint refused the report: HTTP ${res.status}${body.error ? ` (${body.error})` : ''}. Use the issue link instead.`); }
    } catch (e) {
      process.exitCode = 1;
      console.log(`\nCould not send the report to ${args.post}: ${e.message}. Use the issue link instead.`);
    }
  }
} else if (cmd === 'bench') {
  // Scores the rules against labelled apps. Recall and precision may not drop below the baseline.
  const dir = path.resolve(args._[1] || path.join(HERE, 'benchmark', 'react-app'));
  const r = await bench(dir);
  console.log(formatBench(r));
  const baseline = JSON.parse(fs.readFileSync(path.join(HERE, 'benchmark', 'baseline.json'), 'utf8'));
  const drops = [['recall', r.recall], ['recall_exact', r.recall_exact], ['precision', r.precision]]
    .filter(([k, v]) => +v.toFixed(3) < baseline[k]).map(([k, v]) => `${k} ${v.toFixed(3)} < ${baseline[k]}`);
  if (r.by_category.secret.found < r.by_category.secret.labels) drops.push(`secret detection ${r.by_category.secret.found}/${r.by_category.secret.labels}`);
  if (r.public_flagged.length > baseline.public_flagged) drops.push(`public_flagged ${r.public_flagged.length} > ${baseline.public_flagged}`);
  if (drops.length) { console.log(`\nBelow the baseline: ${drops.join('; ')}`); process.exitCode = 1; } else console.log('\nAt or above the baseline.');
} else if (cmd === 'agent') {
  const src = path.resolve(args._[1] || '.');
  const out = path.resolve(typeof args.out === 'string' ? args.out : defaultOut('privacy-scan'));
  const { promptFile } = runFind(src, out, sdkArg, Boolean(args.headless), annotateArg, includeArg);
  writeSession({ dir: out, playbook: fs.readFileSync(promptFile, 'utf8'), context: { target: { root: src, ...gitInfo(src) }, sdk: sdkArg } });
  const agent = await chooseAgent(typeof args.agent === 'string' ? args.agent : undefined);
  const prompt = `Read ${promptFile} and follow it. It sets up a privacy scan of the front-end code in the current folder.`;
  if (!agent) {
    console.log(`\nNo supported agent CLI (claude, codex) was found. Start any coding agent in ${src} with: ${prompt}`);
  } else {
    console.log(`\nStarting ${agent.label} in ${src}. Session folder: ${out}\n`);
    const code = await launch({ agent, promptFile, cwd: src, headless: Boolean(args.headless), model: typeof args.model === 'string' ? args.model : undefined, dirs: [out, HERE], scripts: [CLI], prompt });
    if (code !== 0) process.exitCode = code;
  }
} else {
  const lines = fs.readFileSync(CLI, 'utf8').split('\n').slice(1);
  console.log(lines.slice(0, lines.findIndex((l) => !l.startsWith('//'))).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
}
