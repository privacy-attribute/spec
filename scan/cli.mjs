#!/usr/bin/env node
// privacy-scan: finds front-end code a session recorder must mask or block, and proposes annotations.
//
//   privacy-scan find  <app-source-dir> [--out <dir>]          static pass: candidates.json and scan-plan.md
//   privacy-scan patch --out <dir>                             annotations.json -> privacy.patch and app-privacy.json
//   privacy-scan agent <app-source-dir> [--out <dir>] [--sdk rrweb] [--agent claude|codex|<command>] [--headless] [--model <m>]
//                                                              static pass, then the user's own agent reviews it
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { find, planMarkdown } from './find.mjs';
import { chooseAgent, writeSession, launch } from '../audit/runner/lib/agent.mjs';
import { playbook } from './playbook.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

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

function runFind(src, out, sdk) {
  const root = path.resolve(src);
  const result = { ...find(root), target: { root, ...gitInfo(root) }, sdk: sdk || null };
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'candidates.json'), JSON.stringify(result, null, 1));
  fs.writeFileSync(path.join(out, 'scan-plan.md'), planMarkdown(result));
  if (!fs.existsSync(path.join(out, 'annotations.json'))) {
    fs.writeFileSync(path.join(out, 'annotations.json'), JSON.stringify({ annotations: [], dismissed: {}, config: [], gaps: [] }, null, 1));
  }
  console.log(`Scanned ${result.scanned_files} files: ${result.candidates.length} candidates. Wrote scan-plan.md, candidates.json and annotations.json in ${out}`);
  return result;
}

// Inserts each annotation after its `match` text and writes a unified diff the implementer can apply.
function runPatch(out) {
  const scan = JSON.parse(fs.readFileSync(path.join(out, 'candidates.json'), 'utf8'));
  const decisions = JSON.parse(fs.readFileSync(path.join(out, 'annotations.json'), 'utf8'));
  const root = scan.target.root;
  const files = new Map();
  const failed = [];
  for (const a of decisions.annotations) {
    const abs = path.join(root, a.file);
    if (!files.has(abs)) files.set(abs, fs.readFileSync(abs, 'utf8').split('\n'));
    const lines = files.get(abs);
    const attr = `data-privacy="${a.value}"`;
    const order = [0, 1, -1, 2, -2, 3, -3].map((d) => a.line - 1 + d).filter((i) => i >= 0 && i < lines.length);
    const i = order.find((k) => lines[k].includes(a.match));
    if (i === undefined) { failed.push({ ...a, reason: `"${a.match}" not found near line ${a.line}` }); continue; }
    if (/data-privacy=/.test(lines[i])) { failed.push({ ...a, reason: 'line already has data-privacy' }); continue; }
    const at = lines[i].indexOf(a.match) + a.match.length;
    lines[i] = `${lines[i].slice(0, at)} ${attr}${lines[i].slice(at)}`;
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'privacy-scan-'));
  // Paths in the patch are relative to the repository root, so `git apply` works from there.
  let top = null;
  try { top = execFileSync('git', ['-C', root, 'rev-parse', '--show-toplevel'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { /* not a git checkout */ }
  let patch = '';
  for (const [abs, lines] of files) {
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
  const report = {
    disclaimer: responsibility(),
    target: scan.target,
    sdk: scan.sdk,
    scanned_files: scan.scanned_files,
    candidates: scan.candidates.length,
    annotations: decisions.annotations.map((a) => ({
      ...a,
      snippets: (a.candidates || []).map((id) => scan.candidates.find((c) => c.id === id)).filter(Boolean).map((c) => `${c.file}:${c.line} ${c.snippet}`),
    })),
    dismissed: decisions.dismissed || {},
    config: decisions.config || [],
    gaps: decisions.gaps || [],
    failed,
    unreviewed,
  };
  fs.writeFileSync(path.join(out, 'app-privacy.json'), JSON.stringify(report, null, 1));
  console.log(`Wrote privacy.patch (${decisions.annotations.length - failed.length} annotations in ${files.size} files) and app-privacy.json. By value/category: ${JSON.stringify(byValue)}. Dismissed: ${Object.keys(report.dismissed).length}.`);
  if (failed.length) console.log(`Not applied: ${failed.map((f) => `${f.file}:${f.line} (${f.reason})`).join('; ')}`);
  if (unreviewed.length) {
    console.log(`Unreviewed candidates: ${unreviewed.join(', ')}`);
    process.exitCode = 1;
  }
}

const args = parseArgs(process.argv.slice(2));
const cmd = args._[0];

if (cmd === 'find') {
  runFind(args._[1] || '.', path.resolve(args.out || 'privacy-scan-out'), args.sdk);
} else if (cmd === 'patch') {
  runPatch(path.resolve(args.out || 'privacy-scan-out'));
} else if (cmd === 'agent') {
  const src = path.resolve(args._[1] || '.');
  const out = path.resolve(args.out || path.join(os.tmpdir(), `privacy-scan-${new Date().toISOString().replace(/[:.]/g, '-')}`));
  const sdk = typeof args.sdk === 'string' ? args.sdk : null;
  runFind(src, out, sdk);
  const { promptFile } = writeSession({
    dir: out,
    playbook: playbook({ scanDir: HERE, sessionDir: out, src, sdk, cli: fileURLToPath(import.meta.url), headless: Boolean(args.headless) }),
    context: { target: { root: src, ...gitInfo(src) }, sdk },
  });
  const agent = await chooseAgent(typeof args.agent === 'string' ? args.agent : undefined);
  const prompt = `Read ${promptFile} and follow it. It sets up a privacy scan of the front-end code in the current folder.`;
  if (!agent) {
    console.log(`\nNo supported agent CLI (claude, codex) was found. Start any coding agent in ${src} with: ${prompt}`);
  } else {
    console.log(`\nStarting ${agent.label} in ${src}. Session folder: ${out}\n`);
    const code = await launch({ agent, promptFile, cwd: src, headless: Boolean(args.headless), model: typeof args.model === 'string' ? args.model : undefined, dirs: [out, HERE, path.resolve(HERE, '../audit')], prompt });
    if (code !== 0) process.exitCode = code;
  }
} else {
  console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 8).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
}
