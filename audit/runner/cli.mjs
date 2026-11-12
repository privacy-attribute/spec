#!/usr/bin/env node
// privacy-audit: deterministic differential runner for the capture SDK privacy audit.
//
//   privacy-audit run    --adapter rrweb --sdk <path> [options]   run fixtures, write results.json and summary.md
//   privacy-audit report <fixture.mjs> --adapter rrweb --sdk <path> [options]   run one fixture, draft a local report
//   privacy-audit conformance --adapter rrweb --sdk <path>       check the draft data-privacy core in Chrome
//   privacy-audit coverage                                        list patterns without a fixture journey
//   privacy-audit merge  --out <dir>                              merge the agent's traces.json into privacy-audit.json
//   privacy-audit agent  --sdk <path> [--agent claude|codex|<command>] [--headless] [--model <m>]
//                        run the fixtures, then start the user's own coding agent on the rest of the audit
//
// Options: --out <dir>  --fixtures <dir|file,...>  --pages a,b  --patterns P-x,P-y  --tier L1|L2|L3|L4
//          --configs id,id  --concurrency <n>  --chrome <path>  --kind <feedback kind>  --actor human|agent
//          --skip-run (agent: reuse results.json already in --out)  --what <text> (report: what happened)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import yaml from 'js-yaml';
import { startServer, launch } from './lib/browser.mjs';
import { runAll } from './lib/run.mjs';
import { checkPrivacyAttribute } from './lib/conformance.mjs';
import { summaryMarkdown, auditVersion, feedbackIssue } from './lib/report.mjs';
import { chooseAgent, writeSession, launch as launchAgent, launchPrompt } from './lib/agent.mjs';
import { playbook } from './lib/playbook.mjs';
import { resolveCodeMap } from './lib/code-map.mjs';
import { draftFindings, merge } from './lib/draft.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const AUDIT_DIR = path.resolve(HERE, '..');
const RUNNER_VERSION = JSON.parse(fs.readFileSync(path.join(HERE, 'package.json'), 'utf8')).version;
const TIERS = ['L1', 'L2', 'L3', 'L4'];

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) args[argv[i].slice(2)] = argv[i + 1]?.startsWith('--') || argv[i + 1] === undefined ? true : argv[++i];
    else args._.push(argv[i]);
  }
  return args;
}
const list = (v) => (typeof v === 'string' ? v.split(',').map((s) => s.trim()).filter(Boolean) : null);

function loadPatterns() {
  const doc = yaml.load(fs.readFileSync(path.join(AUDIT_DIR, 'patterns.yaml'), 'utf8'));
  return new Map(doc.patterns.map((p) => [p.id, p]));
}

// Fixture files in a directory are named <page>.mjs, so --pages loads only those files.
async function loadFixtures(sources, pages) {
  const files = [];
  for (const s of sources) {
    const p = path.resolve(s);
    if (fs.statSync(p).isDirectory()) {
      fs.readdirSync(p).filter((f) => f.endsWith('.mjs') && (!pages || pages.includes(f.slice(0, -4)))).sort().forEach((f) => files.push(path.join(p, f)));
    } else files.push(p);
  }
  // Files named one by one (--fixtures, report) always run, whatever --pages says.
  const explicit = new Set(sources.map((s) => path.resolve(s)).filter((p) => !fs.statSync(p).isDirectory()));
  const fixtures = [];
  for (const f of files) {
    try {
      fixtures.push({ ...(await import(pathToFileURL(f))).default, file: f, explicit: explicit.has(f) });
    } catch (e) {
      process.stderr.write(`Skipping fixture ${f}: ${e.message}\n`);
    }
  }
  return fixtures;
}

async function loadAdapter(name) {
  const file = fs.existsSync(path.resolve(name)) ? path.resolve(name) : path.join(HERE, 'adapters', `${name}.mjs`);
  return (await import(pathToFileURL(file))).default;
}

function buildPlan({ fixtures, patterns, adapter, args }) {
  const pages = list(args.pages);
  const only = list(args.patterns);
  const maxTier = args.tier ? TIERS.indexOf(args.tier) : TIERS.length - 1;
  const configIds = list(args.configs) || adapter.configs.filter((c) => !c.optIn).map((c) => c.id);
  const configs = adapter.configs.filter((c) => configIds.includes(c.id));
  const plan = { differential: [], fidelity: [], not_run: [] };
  const covered = new Set();
  for (const fixture of fixtures) {
    if (pages && !fixture.explicit && !pages.includes(fixture.page)) continue;
    let any = false;
    for (const journey of fixture.journeys) {
      covered.add(journey.pattern);
      const p = patterns.get(journey.pattern);
      if (only && !only.includes(journey.pattern)) continue;
      if (p && TIERS.indexOf(p.tier) > maxTier) {
        plan.not_run.push({ pattern: journey.pattern, reason: `tier ${p.tier} above --tier ${args.tier}` });
        continue;
      }
      any = true;
      const meta = {
        page: fixture.page,
        pattern: journey.pattern,
        rank: p?.rank ?? null,
        tier: p?.tier ?? null,
        category: journey.category || p?.category || null,
        channels_expected: p?.channels || [],
      };
      for (const config of configs) plan.differential.push({ fixture, journey, config, meta });
    }
    if (any) {
      for (const config of configs.filter((c) => c.fidelity)) plan.fidelity.push({ fixture, config });
    }
  }
  for (const id of patterns.keys()) {
    if (!covered.has(id) && (!only || only.includes(id))) plan.not_run.push({ pattern: id, reason: 'no fixture journey' });
  }
  return { plan, configs };
}

async function execute(args, fixtureSources) {
  const adapter = await loadAdapter(args.adapter || 'rrweb');
  const patterns = loadPatterns();
  const fixtures = await loadFixtures(fixtureSources, list(args.pages));
  const { plan, configs } = buildPlan({ fixtures, patterns, adapter, args });
  const prepared = await adapter.prepare({ sdk: args.sdk, bundle: args.bundle });
  const server = await startServer();
  const browser = await launch(args.chrome);
  const started = Date.now();
  try {
    const results = await runAll(
      { browser, server, adapter, script: prepared.script },
      plan,
      {
        concurrency: Number(args.concurrency || 4),
        onProgress: (d, t) => process.stderr.write(`\r${d}/${t} runs`),
      },
    );
    process.stderr.write('\n');
    return {
      runner_version: RUNNER_VERSION,
      audit_version: auditVersion(AUDIT_DIR),
      adapter: adapter.name,
      target: prepared.target,
      configs: configs.map(({ id, options, note }) => ({ id, options, note })),
      seconds: Math.round((Date.now() - started) / 1000),
      differential: results.differential,
      fidelity: results.fidelity,
      not_run: plan.not_run,
    };
  } finally {
    await browser.close();
    server.close();
  }
}

const args = parseArgs(process.argv.slice(2));
const cmd = args._[0];
const outDir = path.resolve(args.out || 'privacy-audit-out');

function writeRun(out, dir) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'results.json'), JSON.stringify(out, null, 1));
  fs.writeFileSync(path.join(dir, 'summary.md'), summaryMarkdown(out));
  console.log(`Wrote ${path.join(dir, 'summary.md')} and results.json (${out.differential.length} differential runs, ${out.seconds}s).`);
}

// The draft findings, a per-channel trace plan, and the traces.json template the agent fills in.
async function writeDraft(out, dir, sdk) {
  const adapter = await loadAdapter(out.adapter);
  const codeMap = resolveCodeMap(sdk, adapter.codeMap);
  const draft = draftFindings({ out, patterns: loadPatterns(), codeMap, auditDir: AUDIT_DIR });
  fs.writeFileSync(path.join(dir, 'draft-findings.json'), JSON.stringify(draft, null, 1));
  const privacy = draft.findings.filter((f) => f.kind === 'privacy');
  const channels = [...new Set(privacy.map((f) => f.channel))];
  const plan = [
    `# Trace plan`,
    ``,
    `${privacy.length} privacy and ${draft.findings.length - privacy.length} fidelity draft findings, in ${channels.length} channels. Trace each channel once; its path and fix apply to every finding listed under it.`,
    ``,
    ...channels.flatMap((ch) => {
      const fs_ = privacy.filter((f) => f.channel === ch);
      const ev = fs_[0].reproduction.evidence[0];
      return [
        `## ${ch}`,
        ``,
        `Findings: ${fs_.map((f) => `${f.id} (${f.data_category}${f.special_category ? ', special' : ''}, ${f.severity}, leaks under ${f.leaks_under.join(' ')})`).join('; ')}`,
        `Code: ${(fs_[0].code || []).map((c) => (c.file ? `${c.symbol} ${c.file}:${c.line}` : `${c.symbol} (not found)`)).join('; ') || 'no map entry'}${fs_[0].code_note ? `. ${fs_[0].code_note}` : ''}`,
        ev?.a ? `Evidence (${ev.pattern}, ${ev.config}): A ${JSON.stringify(ev.a[0] ?? '')} B ${JSON.stringify(ev.b[0] ?? '')}` : `Evidence: ${JSON.stringify(fs_[0].reproduction.evidence)}`,
        ``,
      ];
    }),
    `## Fidelity`,
    ``,
    ...draft.findings.filter((f) => f.kind === 'fidelity').map((f) => `- ${f.id} ${f.title}`),
    ``,
  ].join('\n');
  fs.writeFileSync(path.join(dir, 'trace-plan.md'), plan);
  const template = {
    channels: Object.fromEntries(channels.map((ch) => [ch, { path: [], masking_checked: '', fix: '', fidelity_cost: '', verdict: 'CONFIRMED' }])),
    findings: {},
    extra_findings: [],
    coverage: [],
    feedback_sent: [],
    method_note: '',
  };
  const tracesFile = path.join(dir, 'traces.json');
  if (!fs.existsSync(tracesFile)) fs.writeFileSync(tracesFile, JSON.stringify(template, null, 1));
  console.log(`Wrote draft-findings.json (${draft.findings.length} drafts in ${channels.length} channels), trace-plan.md and traces.json.`);
}

if (cmd === 'run') {
  const out = await execute(args, [path.join(HERE, 'fixtures'), ...(list(args.fixtures) || [])]);
  writeRun(out, outDir);
  await writeDraft(out, outDir, args.sdk);
} else if (cmd === 'merge') {
  const draft = JSON.parse(fs.readFileSync(path.join(outDir, 'draft-findings.json'), 'utf8'));
  const traces = JSON.parse(fs.readFileSync(path.join(outDir, 'traces.json'), 'utf8'));
  const { report, incomplete } = merge(draft, traces);
  fs.writeFileSync(path.join(outDir, 'privacy-audit.json'), JSON.stringify(report, null, 1));
  const count = (k, v) => report.findings.filter((f) => f[k] === v).length;
  console.log(`Wrote ${path.join(outDir, 'privacy-audit.json')}: ${report.findings.length} findings (${count('kind', 'privacy')} privacy, ${count('kind', 'fidelity')} fidelity; ${['critical', 'high', 'medium', 'low'].map((s) => `${count('severity', s)} ${s}`).join(', ')}), ${report.dropped.length} dropped.`);
  if (incomplete.length) {
    console.log(`Incomplete (no path of two or more steps, or no fix): ${incomplete.join(', ')}`);
    process.exitCode = 1;
  }
} else if (cmd === 'agent') {
  // The session folder sits outside the SDK checkout, which the agent must leave untouched.
  const sdk = path.resolve(args.sdk || '.');
  const dir = path.resolve(args.out || path.join(os.tmpdir(), `privacy-audit-${new Date().toISOString().replace(/[:.]/g, '-')}`));
  let out;
  if (args['skip-run']) {
    out = JSON.parse(fs.readFileSync(path.join(dir, 'results.json'), 'utf8'));
    fs.writeFileSync(path.join(dir, 'summary.md'), summaryMarkdown(out));
  } else {
    out = await execute({ ...args, sdk }, [path.join(HERE, 'fixtures'), ...(list(args.fixtures) || [])]);
    writeRun(out, dir);
  }
  await writeDraft(out, dir, sdk);
  const target = { ...out.target, adapter: out.adapter };
  const { promptFile, contextFile } = writeSession({
    dir,
    playbook: playbook({ auditDir: AUDIT_DIR, sessionDir: dir, sdk, target, cli: fileURLToPath(import.meta.url), headless: Boolean(args.headless) }),
    context: { target, runner_version: out.runner_version, audit_version: out.audit_version, configs: out.configs, not_run: out.not_run, seconds: out.seconds },
  });
  const agent = await chooseAgent(typeof args.agent === 'string' ? args.agent : undefined);
  if (!agent) {
    console.log(['', 'No supported agent CLI (claude, codex) was found on this machine.', 'The playbook and context were written to:', `  ${promptFile}`, `  ${contextFile}`, '', `Start any coding agent in ${sdk} with: ${launchPrompt(promptFile)}`].join('\n'));
  } else {
    console.log(`\nStarting ${agent.label} in ${sdk}. Session folder: ${dir}\n`);
    const code = await launchAgent({ agent, promptFile, cwd: sdk, headless: Boolean(args.headless), model: typeof args.model === 'string' ? args.model : undefined, dirs: [dir, AUDIT_DIR], scripts: [fileURLToPath(import.meta.url)] });
    if (code !== 0) process.exitCode = code;
  }
} else if (cmd === 'report') {
  const file = args._[1];
  if (!file) throw new Error('report needs a fixture file');
  const out = await execute({ ...args, tier: undefined }, [file]);
  const issue = feedbackIssue({
    kind: args.kind || 'missed-leak',
    actor: args.actor || 'human',
    out,
    fixtureFile: file,
    fixtureSource: fs.readFileSync(file, 'utf8'),
    what: typeof args.what === 'string' ? args.what : undefined,
  });
  fs.mkdirSync(outDir, { recursive: true });
  const reportFile = path.join(outDir, `feedback-${path.basename(file, '.mjs')}.md`);
  fs.writeFileSync(reportFile, issue.body);
  fs.writeFileSync(path.join(outDir, `feedback-${path.basename(file, '.mjs')}.json`), JSON.stringify(out, null, 1));
  console.log(`Report: ${reportFile}`);
  console.log('Review the local draft before sharing it. For an SDK weakness, use the private route in SECURITY.md. Feedback form:');
  console.log(issue.url);
} else if (cmd === 'conformance') {
  const adapter = await loadAdapter(args.adapter || 'rrweb');
  const { target, checks } = await checkPrivacyAttribute({ adapter, sdk: args.sdk, bundle: args.bundle, chrome: args.chrome });
  console.log(`Privacy Attribute Standard core on ${target.repo || adapter.name}@${target.commit || 'unknown'}`);
  for (const { name, passed } of checks) console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`);
  if (checks.some(({ passed }) => !passed)) process.exitCode = 1;
} else if (cmd === 'coverage') {
  const patterns = loadPatterns();
  const fixtures = await loadFixtures([path.join(HERE, 'fixtures')]);
  const covered = new Set(fixtures.flatMap((f) => f.journeys.map((j) => j.pattern)));
  const missing = [...patterns.values()].filter((p) => !covered.has(p.id));
  console.log(`${patterns.size - missing.length}/${patterns.size} patterns have a fixture journey.`);
  missing.forEach((p) => console.log(`missing ${p.id} (${p.tier}, page ${p.page})`));
} else {
  console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split("\n").slice(1, 14).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
}
