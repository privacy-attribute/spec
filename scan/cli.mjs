#!/usr/bin/env node
// privacy-scan: finds front-end code a session recorder must mask or block, and proposes annotations.
//
//   privacy-scan find   <app-source-dir> [--sdk rrweb] [--annotate rrweb|data-privacy] [--out <dir>]
//                                                                      static pass; prints the session folder and its PLAYBOOK.md
//   privacy-scan patch  --out <dir>                                    annotations.json -> privacy.patch and app-privacy.json
//   privacy-scan report --out <dir>                                    one feedback report for the scan, and private recorder gaps
//   privacy-scan bench  [<benchmark-dir>]                              score the static pass on labelled apps; fails below the baseline
//   privacy-scan agent  <app-source-dir> [--sdk rrweb] [--annotate rrweb|data-privacy] [--out <dir>] [--agent claude|codex|<command>] [--headless] [--model <m>]
//                                                                      static pass, then starts a coding agent on PLAYBOOK.md
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { find, planMarkdown } from './find.mjs';
import { chooseAgent, writeSession, launch } from '../audit/runner/lib/agent.mjs';
import { playbook } from './playbook.mjs';
import { buildScanReport, writeScanReport } from './report.mjs';
import { bench, formatBench } from './bench.mjs';

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

function runFind(src, out, sdk, headless, annotate) {
  const root = path.resolve(src);
  const result = { ...find(root), target: { root, ...gitInfo(root) }, sdk: sdk || null, annotate, scan_version: VERSION };
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'candidates.json'), JSON.stringify(result, null, 1));
  fs.writeFileSync(path.join(out, 'scan-plan.md'), planMarkdown(result));
  if (!fs.existsSync(path.join(out, 'annotations.json'))) {
    // Candidates decided by an `auto` rule start out annotated; the agent skips them.
    const annotations = result.candidates.filter((c) => c.auto).map((c) => ({
      file: c.file, line: c.auto.line, match: c.auto.match, value: c.auto.value, category: c.auto.category,
      special_category: false, data: `decided by rule ${c.auto.rule}`, candidates: [c.id], auto: true,
    }));
    fs.writeFileSync(path.join(out, 'annotations.json'), JSON.stringify({ annotations, dismissed: {}, config: [], gaps: [] }, null, 1));
  }
  const promptFile = path.join(out, 'PLAYBOOK.md');
  fs.writeFileSync(promptFile, playbook({ scanDir: HERE, sessionDir: out, src: root, sdk, annotate, cli: CLI, headless }));
  console.log(`Scanned ${result.scanned_files} files: ${result.candidates.length} candidates.`);
  console.log(`Session folder: ${out}`);
  console.log(`Next: read ${promptFile} and follow it.`);
  return { result, promptFile };
}

const RRWEB_CLASS = { mask: 'rr-mask', block: 'rr-block', ignore: 'rr-ignore' };

// Adds a class to the tag that starts at lines[i]: into a static class or className string when
// the tag has one, or as a new attribute. Returns a reason when it cannot place the class.
function addClass(lines, i, match, cls, jsx) {
  if (!cls) return 'rrweb has no class for this value (rrweb has no unmask): restructure, or use an edit';
  for (let k = i; k < Math.min(lines.length, i + 12); k++) {
    const from = k === i ? lines[k].indexOf(match) + match.length : 0;
    const line = lines[k];
    const rest = line.slice(from);
    // An existing rrweb class: keep it when it is the same, replace it when the scan asks for another.
    const existing = rest.match(/\b(rr-block|rr-mask|rr-ignore)\b/);
    if (existing) {
      if (existing[1] === cls) return null;
      lines[k] = line.slice(0, from) + rest.replace(existing[1], cls);
      return null;
    }
    const stat = rest.match(/\b(className|class)=(\{\s*)?(["'`])/);
    if (stat) {
      const q = from + stat.index + stat[0].length;
      lines[k] = `${line.slice(0, q)}${cls} ${line.slice(q)}`;
      return null;
    }
    if (/\b(className|class)=\{/.test(rest)) return 'className is an expression: give an edit that adds the class';
    // The tag ends on this line: add a new attribute after the tag name.
    if (/(^|[^=])>/.test(rest) || k > i && /^\s*\/?>/.test(line)) break;
  }
  const at = lines[i].indexOf(match) + match.length;
  lines[i] = `${lines[i].slice(0, at)} ${jsx ? 'className' : 'class'}="${cls}"${lines[i].slice(at)}`;
  return null;
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
    const lines = files.get(abs);
    const near = (text) => [0, 1, -1, 2, -2, 3, -3].map((d) => a.line - 1 + d).filter((i) => i >= 0 && i < lines.length).find((k) => lines[k].includes(text));
    // An exact edit from the agent, for tags the automatic insert cannot handle.
    if (a.edit) {
      const i = near(a.edit.from);
      if (i === undefined) { failed.push({ ...a, reason: `edit text "${a.edit.from}" not found near line ${a.line}` }); continue; }
      lines[i] = lines[i].replace(a.edit.from, a.edit.to);
      continue;
    }
    const i = near(a.match);
    if (i === undefined) { failed.push({ ...a, reason: `"${a.match}" not found near line ${a.line}` }); continue; }
    if (style === 'data-privacy') {
      if (/data-privacy=/.test(lines[i])) { failed.push({ ...a, reason: 'line already has data-privacy' }); continue; }
      const at = lines[i].indexOf(a.match) + a.match.length;
      lines[i] = `${lines[i].slice(0, at)} data-privacy="${a.value}"${lines[i].slice(at)}`;
      continue;
    }
    const result = addClass(lines, i, a.match, RRWEB_CLASS[a.value], /\.(tsx|jsx|ts|js|mjs)$/.test(a.file));
    if (result) failed.push({ ...a, reason: result });
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'privacy-scan-'));
  const original = new Map([...files.keys()].map((abs) => [abs, fs.readFileSync(abs, 'utf8')]));
  // Paths in the patch are relative to the repository root, so `git apply` works from there.
  let top = null;
  try { top = execFileSync('git', ['-C', root, 'rev-parse', '--show-toplevel'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { /* not a git checkout */ }
  let patch = '';
  let changedFiles = 0;
  for (const [abs, lines] of files) {
    if (lines.join('\n') === original.get(abs)) continue;
    changedFiles++;
    const rel = path.relative(top || root, abs);
    const modified = path.join(tmp, rel);
    fs.mkdirSync(path.dirname(modified), { recursive: true });
    fs.writeFileSync(modified, lines.join('\n'));
    const d = spawnSync('git', ['diff', '--no-index', '--no-color', `--src-prefix=a/`, `--dst-prefix=b/`, abs, modified], { encoding: 'utf8' }).stdout;
    patch += d.split(abs).join(`/${rel}`).split(modified).join(`/${rel}`).replace(/a\/+\//g, 'a/').replace(/b\/+\//g, 'b/');
  }
  fs.writeFileSync(path.join(out, 'privacy.patch'), patch);
  const settled = new Set([...decisions.annotations.flatMap((a) => a.candidates || []), ...Object.keys(decisions.dismissed || {})]);
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
  };
  fs.writeFileSync(path.join(out, 'app-privacy.json'), JSON.stringify(report, null, 1));
  const applied = decisions.annotations.length - failed.length;
  console.log(`Wrote privacy.patch (${applied} annotation${applied === 1 ? '' : 's'} in ${changedFiles} file${changedFiles === 1 ? '' : 's'}) and app-privacy.json. By value/category: ${JSON.stringify(byValue)}. Dismissed: ${Object.keys(report.dismissed).length}.`);
  if (failed.length) console.log(`Not applied: ${failed.map((f) => `${f.file}:${f.line} (${f.reason})`).join('; ')}`);
  if (unreviewed.length) {
    console.log(`Unreviewed candidates: ${unreviewed.join(', ')}`);
    process.exitCode = 1;
  }
}

const args = parseArgs(process.argv.slice(2));
const cmd = args._[0];

const sdkArg = typeof args.sdk === 'string' ? args.sdk : null;
const annotateArg = annotateStyle(typeof args.annotate === 'string' ? args.annotate : null, sdkArg);

if (cmd === 'find') {
  runFind(args._[1] || '.', path.resolve(typeof args.out === 'string' ? args.out : defaultOut('privacy-scan')), sdkArg, false, annotateArg);
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
  const { promptFile } = runFind(src, out, sdkArg, Boolean(args.headless), annotateArg);
  writeSession({ dir: out, playbook: fs.readFileSync(promptFile, 'utf8'), context: { target: { root: src, ...gitInfo(src) }, sdk: sdkArg } });
  const agent = await chooseAgent(typeof args.agent === 'string' ? args.agent : undefined);
  const prompt = `Read ${promptFile} and follow it. It sets up a privacy scan of the front-end code in the current folder.`;
  if (!agent) {
    console.log(`\nNo supported agent CLI (claude, codex) was found. Start any coding agent in ${src} with: ${prompt}`);
  } else {
    console.log(`\nStarting ${agent.label} in ${src}. Session folder: ${out}\n`);
    const code = await launch({ agent, promptFile, cwd: src, headless: Boolean(args.headless), model: typeof args.model === 'string' ? args.model : undefined, dirs: [out, HERE], prompt });
    if (code !== 0) process.exitCode = code;
  }
} else {
  const lines = fs.readFileSync(CLI, 'utf8').split('\n').slice(1);
  console.log(lines.slice(0, lines.findIndex((l) => !l.startsWith('//'))).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
}
