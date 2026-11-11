#!/usr/bin/env node
// privacy-scan: finds front-end code a session recorder must mask or block, and proposes annotations.
//
//   privacy-scan find   <app-source-dir> [--sdk rrweb] [--annotate rrweb|data-privacy] [--include <path,...>] [--out <dir>]
//                                                                      static pass; prints the session folder and its PLAYBOOK.md
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
import { find, planMarkdown } from './find.mjs';
import { chooseAgent, writeSession, launch } from '../audit/runner/lib/agent.mjs';
import { playbook } from './playbook.mjs';
import { buildScanReport, writeScanReport } from './report.mjs';
import { bench, formatBench } from './bench.mjs';
import { applyAnnotation, unifiedDiff, overMaskWarnings, uncoveredSites } from './patch.mjs';
import { spansFor } from './templates.mjs';
import { placeAnnotations } from './place.mjs';
import { CACHE_PATH, loadCache, applyCache, buildCache, cacheDiff } from './cache.mjs';

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
  try { return execFileSync('git', ['-C', dir, 'rev-parse', '--show-toplevel'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return null; }
}

function gitInfo(dir) {
  const git = (...a) => {
    try { return execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return null; }
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

function runFind(src, out, sdk, headless, annotate, include) {
  const root = path.resolve(src);
  const top = gitTop(root) || root;
  const result = { ...find(root, { include }), target: { root, top, ...gitInfo(root) }, sdk: sdk || null, annotate, scan_version: VERSION };
  result.cache = applyCache(result, loadCache(top), root, top);
  // rrweb masks input values with maskAllInputs, so plain input units need no review.
  if (sdk === 'rrweb') {
    for (const c of result.candidates) {
      if (!c.cached && !c.auto && !c.sites && c.rules.every((r) => r === 'input')) c.settled = 'input value: masked by maskAllInputs';
    }
  }
  // Stage 5: annotations placed from high-confidence sites. A unit with no lines left for review is settled.
  const placement = placeAnnotations(result, root, { sdk, annotate });
  for (const c of result.candidates) {
    if (!c.sites || c.cached || c.settled || c.earlier?.decision === 'dismiss') continue;
    const review = placement.review.get(c.id);
    if (review) c.review_lines = review;
    else c.settled = placement.placed.get(c.id) ? `placed from the scan: ${placement.placed.get(c.id)} annotation${placement.placed.get(c.id) === 1 ? '' : 's'}` : 'decided by the scan: its values are annotated in child components or masked as input values';
  }
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'candidates.json'), JSON.stringify(result, null, 1));
  fs.writeFileSync(path.join(out, 'scan-plan.md'), planMarkdown(result));
  if (!fs.existsSync(path.join(out, 'annotations.json'))) {
    // Candidates decided by an `auto` rule start out annotated; the agent skips them.
    const annotations = [...placement.annotations, ...result.candidates.filter((c) => c.auto).map((c) => ({
      file: c.file, line: c.auto.line, match: c.auto.match, value: c.auto.value, category: c.auto.category,
      special_category: false, data: `decided by rule ${c.auto.rule}`, candidates: [c.id], auto: true,
    }))];
    // Units in files unchanged since the last scan keep their earlier decision.
    const cached = Object.fromEntries(result.candidates.filter((c) => c.cached).map((c) => [c.id, `unchanged since the last scan: ${c.cached.decision}${c.cached.value ? ` ${c.cached.value}` : ''}`]));
    const settled = Object.fromEntries(result.candidates.filter((c) => c.settled).map((c) => [c.id, c.settled]));
    const config = sdk === 'rrweb' && Object.keys(settled).length ? ['rrweb on all pages: maskAllInputs: true (input values)'] : [];
    fs.writeFileSync(path.join(out, 'annotations.json'), JSON.stringify({ annotations, dismissed: {}, cached, settled, config, gaps: [] }, null, 1));
  }
  const promptFile = path.join(out, 'PLAYBOOK.md');
  fs.writeFileSync(promptFile, playbook({ scanDir: HERE, sessionDir: out, src: root, sdk, annotate, cli: CLI, headless }));
  const open = result.candidates.filter((c) => !c.cached).length;
  console.log(`Scanned ${result.scanned_files} files: ${result.candidates.length} candidates${result.cache.units_skipped ? `, of which ${result.cache.units_skipped} in ${result.cache.files_skipped} unchanged files keep their earlier decision (${open} to review)` : ''}.`);
  console.log(`Session folder: ${out}`);
  console.log(`Next: read ${promptFile} and follow it.`);
  return { result, promptFile };
}

// Inserts each annotation after its `match` text and writes a unified diff the implementer can apply.
function runPatch(out) {
  const scan = JSON.parse(fs.readFileSync(path.join(out, 'candidates.json'), 'utf8'));
  const decisions = JSON.parse(fs.readFileSync(path.join(out, 'annotations.json'), 'utf8'));
  const root = scan.target.root;
  const files = new Map();
  const failed = [];
  const style = scan.annotate || 'data-privacy';
  for (const a of decisions.annotations) {
    const abs = path.join(root, a.file);
    if (!files.has(abs)) files.set(abs, fs.readFileSync(abs, 'utf8').split('\n'));
    const reason = applyAnnotation(files.get(abs), a, style);
    if (reason) failed.push({ ...a, reason });
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
    changedFiles++;
    after.set(abs, text);
    patch += unifiedDiff(path.relative(top, abs), before, text);
  }
  // The decisions cache goes into the same patch, so it is committed with the annotations.
  const oldCache = loadCache(top);
  const newCache = `${JSON.stringify(buildCache({ cache: oldCache, scan, decisions, after, root, top, version: VERSION }), null, 1)}\n`;
  fs.writeFileSync(path.join(out, 'decisions.json'), newCache);
  const oldText = oldCache ? fs.readFileSync(path.join(top, CACHE_PATH), 'utf8') : null;
  if (oldText !== newCache) patch += oldText === null ? cacheDiff(null, newCache) : unifiedDiff(CACHE_PATH, oldText, newCache);
  fs.writeFileSync(path.join(out, 'privacy.patch'), patch);
  const settled = new Set([...decisions.annotations.flatMap((a) => a.candidates || []), ...Object.keys(decisions.dismissed || {}), ...Object.keys(decisions.cached || {}), ...Object.keys(decisions.settled || {})]);
  const unreviewed = scan.candidates.filter((c) => !settled.has(c.id)).map((c) => c.id);
  const byValue = {};
  for (const a of decisions.annotations) byValue[`${a.value}/${a.category}`] = (byValue[`${a.value}/${a.category}`] || 0) + 1;
  // rrweb masks input values only through maskAllInputs or maskInputOptions, never through rr-mask.
  const config = [...(decisions.config || [])];
  if (style === 'rrweb' && decisions.annotations.some((a) => a.value === 'mask' && /^<(input|Input|textarea|Textarea|select|Select|TextField)\b/.test(a.match))) {
    config.unshift('rrweb: input values are masked only by maskAllInputs or maskInputOptions, never by rr-mask. @rrweb/browser-client (rrweb Cloud) sets maskAllInputs: true by default; with core rrweb, set it yourself.');
  }
  const report = {
    disclaimer: responsibility(),
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
    over_masking: overMaskWarnings(scan, decisions.annotations),
    uncovered: uncoveredSites(scan, decisions, (file) => spansFor(file, fs.readFileSync(path.join(root, file), 'utf8'))),
  };
  fs.writeFileSync(path.join(out, 'app-privacy.json'), JSON.stringify(report, null, 1));
  const applied = decisions.annotations.length - failed.length;
  console.log(`Wrote privacy.patch (${applied} annotation${applied === 1 ? '' : 's'} in ${changedFiles} file${changedFiles === 1 ? '' : 's'}) and app-privacy.json. By value/category: ${JSON.stringify(byValue)}. Dismissed: ${Object.keys(report.dismissed).length}.`);
  if (failed.length) console.log(`Not applied: ${failed.map((f) => `${f.file}:${f.line} (${f.reason})`).join('; ')}`);
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
}

const args = parseArgs(process.argv.slice(2));
const cmd = args._[0];

const sdkArg = typeof args.sdk === 'string' ? args.sdk : null;
const annotateArg = annotateStyle(typeof args.annotate === 'string' ? args.annotate : null, sdkArg);
const includeArg = typeof args.include === 'string' ? args.include.split(',').map((s) => s.trim()).filter(Boolean) : null;

if (cmd === 'find') {
  runFind(args._[1] || '.', path.resolve(typeof args.out === 'string' ? args.out : defaultOut('privacy-scan')), sdkArg, false, annotateArg, includeArg);
} else if (cmd === 'patch') {
  if (typeof args.out !== 'string') throw new Error('patch needs --out <session folder>');
  runPatch(path.resolve(args.out));
} else if (cmd === 'report') {
  if (typeof args.out !== 'string') throw new Error('report needs --out <session folder>');
  const out = path.resolve(args.out);
  const scan = JSON.parse(fs.readFileSync(path.join(out, 'candidates.json'), 'utf8'));
  scan.scan_version ||= VERSION;
  const decisions = JSON.parse(fs.readFileSync(path.join(out, 'annotations.json'), 'utf8'));
  const report = buildScanReport({ scan, decisions });
  const files = writeScanReport(out, report);
  console.log(`${report.title}\n  report: ${files.md}\n  payload: ${files.json}\n  file it: ${report.url}`);
  console.log('\nExamine the report before you send it. It must contain made-up values only.');
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
      else console.log(`\nThe endpoint refused the report: HTTP ${res.status}${body.error ? ` (${body.error})` : ''}. Use the issue link instead.`);
    } catch (e) {
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
