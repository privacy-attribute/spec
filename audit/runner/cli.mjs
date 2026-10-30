#!/usr/bin/env node
// privacy-audit: deterministic differential runner for the capture SDK privacy audit.
//
//   privacy-audit run    --adapter rrweb --sdk <path> [options]   run fixtures, write results.json and summary.md
//   privacy-audit report <fixture.mjs> --adapter rrweb --sdk <path> [options]   run one fixture, write a feedback issue
//   privacy-audit coverage                                        list patterns without a fixture journey
//
// Options: --out <dir>  --fixtures <dir|file,...>  --pages a,b  --patterns P-x,P-y  --tier L1|L2|L3|L4
//          --configs id,id  --concurrency <n>  --chrome <path>  --kind <feedback kind>  --actor human|agent
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import yaml from 'js-yaml';
import { startServer, launch } from './lib/browser.mjs';
import { runAll } from './lib/run.mjs';
import { summaryMarkdown, auditVersion, feedbackIssue } from './lib/report.mjs';

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
  const fixtures = [];
  for (const f of files) {
    try {
      fixtures.push({ ...(await import(pathToFileURL(f))).default, file: f });
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
    if (pages && !pages.includes(fixture.page)) continue;
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

if (cmd === 'run') {
  const sources = [path.join(HERE, 'fixtures'), ...(list(args.fixtures) || [])];
  const out = await execute(args, sources);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify(out, null, 1));
  fs.writeFileSync(path.join(outDir, 'summary.md'), summaryMarkdown(out));
  console.log(`Wrote ${path.join(outDir, 'summary.md')} and results.json (${out.differential.length} differential runs, ${out.seconds}s).`);
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
  });
  fs.mkdirSync(outDir, { recursive: true });
  const reportFile = path.join(outDir, `feedback-${path.basename(file, '.mjs')}.md`);
  fs.writeFileSync(reportFile, issue.body);
  fs.writeFileSync(path.join(outDir, `feedback-${path.basename(file, '.mjs')}.json`), JSON.stringify(out, null, 1));
  console.log(`Report: ${reportFile}`);
  console.log('Check that the fixture holds made-up values only, then open this link to file it:');
  console.log(issue.url);
} else if (cmd === 'coverage') {
  const patterns = loadPatterns();
  const fixtures = await loadFixtures([path.join(HERE, 'fixtures')]);
  const covered = new Set(fixtures.flatMap((f) => f.journeys.map((j) => j.pattern)));
  const missing = [...patterns.values()].filter((p) => !covered.has(p.id));
  console.log(`${patterns.size - missing.length}/${patterns.size} patterns have a fixture journey.`);
  missing.forEach((p) => console.log(`missing ${p.id} (${p.tier}, page ${p.page})`));
} else {
  console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 11).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
}
