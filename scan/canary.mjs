#!/usr/bin/env node
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { appProbes, capabilityProbes } from './fixtures/canary/scenarios.mjs';
import { buildPinnedRecorder, bundle, esbuildVersion } from '../audit/runner/adapters/rrweb.mjs';
import { browserPage, runBrowserCanary } from '../audit/runner/lib/canary-browser.mjs';
import { scorePayload } from '../audit/runner/lib/payload.mjs';

const scanner = fileURLToPath(new URL('./cli.mjs', import.meta.url));
const fixture = fileURLToPath(new URL('./fixtures/canary/app.jsx', import.meta.url));
const scenarios = fileURLToPath(new URL('./fixtures/canary/scenarios.mjs', import.meta.url));
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const readJSON = async (file) => JSON.parse(await fs.readFile(file, 'utf8'));
const writeJSON = (file, data) => fs.writeFile(file, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });

const privacyPolicy = { version: 1, preset: 'balanced' };
const blockSelector = '[data-privacy~="block"]';
const mask = `[data-privacy]:not(${blockSelector})`;
const legacy = {
  blockSelector,
  maskTextSelector: `${mask}, ${mask} *`,
  maskAllInputs: true,
};
const cases = [
  { id: 'app-baseline', fixture: 'appBaseline', options: {} },
  { id: 'app-native', fixture: 'appPatched', options: { privacyPolicy, maskAllInputs: true } },
  { id: 'app-selectors', fixture: 'appPatched', options: legacy },
  { id: 'core-baseline', fixture: 'capabilities', options: {} },
  { id: 'core-native', fixture: 'capabilities', options: { privacyPolicy } },
  { id: 'core-selectors', fixture: 'capabilities', options: legacy },
];

async function scanApp(work, out) {
  const app = path.join(work, 'app');
  const session = path.join(work, 'scan');
  const source = path.join(app, 'app.jsx');
  await fs.mkdir(app);
  await fs.copyFile(fixture, source);
  const baseline = await fs.readFile(source);
  const invoke = (...args) => {
    try {
      return execFileSync(process.execPath, [scanner, ...args, '--out', session], { encoding: 'utf8' });
    } catch (error) {
      throw new Error([error.message, error.stdout, error.stderr].filter(Boolean).join('\n'), { cause: error });
    }
  };
  const find = invoke('find', app, '--sdk', 'rrweb', '--annotate', 'data-privacy');
  const initial = await readJSON(path.join(session, 'candidates.json'));
  const decisionPath = path.join(session, 'annotations.json');
  const review = await readJSON(decisionPath);
  for (const question of initial.questions) {
    if (question.key !== 'app.jsx::useFixtureCard()') throw new Error(`Canary needs a reviewed answer for ${question.key}`);
    review.answers[question.key] = {
      category: 'third-party',
      evidence: 'useFixtureCard returns model.customer, the synthetic contact record.',
    };
  }
  review.config.push('rrweb native canary: privacyPolicy version 1, preset balanced.');
  await writeJSON(decisionPath, review);
  const place = invoke('place');
  const placed = await readJSON(path.join(session, 'candidates.json'));
  const decisions = await readJSON(decisionPath);
  const inputSites = placed.candidates.flatMap((unit) => (unit.sites || [])
    .filter((site) => site.tag === 'input' && site.kind === 'attr value' && site.expr === 'user.notes')
    .map((site) => ({ file: unit.file, line: site.line, unit: unit.id })));
  if (inputSites.length !== 1) throw new Error('Canary review could not identify the private notes input');
  const { file, line, unit } = inputSites[0];
  if (!decisions.annotations.some((annotation) => annotation.file === file && annotation.line === line && annotation.value === 'mask')) {
    decisions.annotations.push({
      file, line, match: '<input', value: 'mask', category: 'personal',
      data: 'Free-text account notes. The field has a separate public label and hint.',
      candidates: [unit],
    });
    await writeJSON(decisionPath, decisions);
  }
  const patch = invoke('patch');
  const patchPath = path.join(session, 'privacy.patch');
  const patchText = await fs.readFile(patchPath, 'utf8');
  execFileSync('git', ['apply', '--check', patchPath], { cwd: app });
  execFileSync('git', ['apply', patchPath], { cwd: app });
  const patched = await fs.readFile(source);
  if (baseline.equals(patched)) throw new Error('Canary patch did not change the application fixture');
  await fs.cp(session, path.join(out, 'scan'), { recursive: true });
  await fs.writeFile(path.join(out, 'scan', 'commands.txt'), find + place + patch);
  const report = await readJSON(path.join(session, 'app-privacy.json'));
  return {
    baseline: baseline.toString(), patched: patched.toString(),
    evidence: {
      scan_version: report.scan_version, scan_revision: report.scan_revision,
      candidates: report.candidates, reviewed_questions: Object.keys(review.answers).length,
      annotations: report.annotations.length, patch_sha256: sha256(patchText),
      source_sha256: sha256(baseline), patched_sha256: sha256(patched),
    },
  };
}

async function bundleApp(app, work) {
  const original = path.join(work, 'baseline.jsx');
  const patched = path.join(work, 'patched.jsx');
  await fs.writeFile(original, app.baseline);
  await fs.writeFile(patched, app.patched);
  const output = await bundle({
    stdin: {
      contents: `
        import { AccountPage as original } from ${JSON.stringify(original)};
        import { AccountPage as patched } from ${JSON.stringify(patched)};
        import { appFixture, capabilityFixture } from ${JSON.stringify(scenarios)};
        window.CanaryFixtures = {
          appBaseline: () => appFixture(original),
          appPatched: () => appFixture(patched),
          capabilities: capabilityFixture,
        };
      `,
      resolveDir: work,
    },
    bundle: true, format: 'iife', write: false,
  });
  return output.outputFiles[0].text;
}

export async function prepareCanary({ sdk, ref, out }) {
  if (!sdk || !ref || !out) throw new Error('Canary preparation needs --sdk <rrweb checkout> --ref <tag or commit> --out <new directory>');
  await fs.mkdir(out, { mode: 0o700 });
  const work = await fs.mkdtemp(path.join(os.tmpdir(), 'privacy-canary-'));
  try {
    const app = await scanApp(work, out);
    const fixtureBundle = await bundleApp(app, work);
    const { script: recorder, target } = await buildPinnedRecorder(sdk, ref);
    const runId = randomUUID();
    const html = browserPage({ recorder, fixtureBundle, cases, runId });
    const file = path.resolve(out, 'browser.html');
    await fs.writeFile(file, html, { mode: 0o600 });
    await writeJSON(path.join(out, 'manifest.json'), {
      runId, recorder: target, scan: app.evidence,
      build: { esbuild: esbuildVersion, node: process.version, fixture_bundle_sha256: sha256(fixtureBundle), browser_page_sha256: sha256(html) },
      cases,
    });
    return file;
  } finally {
    await fs.rm(work, { recursive: true, force: true });
  }
}

export async function scoreCanary(out, payload) {
  const manifest = await readJSON(path.join(out, 'manifest.json'));
  if (payload.runId !== manifest.runId || !payload.browser || !payload.input) throw new Error('Recording does not match the prepared canary');
  const recordings = payload.recordings;
  if (!recordings || Object.keys(recordings).length !== manifest.cases.length) throw new Error('Incomplete or unexpected recordings');
  const results = manifest.cases.map(({ id, options }) => {
    const app = id.startsWith('app-');
    const reference = recordings[app ? 'app-baseline' : 'core-baseline'];
    const events = recordings[id];
    if (!Array.isArray(events) || !events.some((event) => event.type === 2) || !events.some((event) => event.type === 3)) {
      throw new Error(`Missing full snapshot or incremental events for ${id}`);
    }
    return { id, options, ...scorePayload({ events, reference, probes: app ? appProbes : capabilityProbes }) };
  });
  const summary = {
    ...manifest,
    browser: { user_agent: payload.browser, version: payload.browser_version ?? null, input: payload.input },
    measurement: 'Raw marker presence across all JSON keys and values of every emit event. Public retention requires the expected capture channel.',
    scope: [
      'Synthetic JSX app and separate capability fixture. No transport, packing or enabled plugins.',
      'Tests raw synthetic marker disclosure and selected public values. Timing, pointer paths, encoded or derived signals and untested channels require separate verification.',
      'Capability checks include dynamic attribute changes, reparenting and open shadow roots. Iframes, closed shadow roots and replay rendering were not tested.',
    ],
    results: results.map(({ probes, ...counts }) => counts),
  };
  await writeJSON(path.join(out, 'private-payload.json'), payload);
  await writeJSON(path.join(out, 'private-checks.json'), results);
  await writeJSON(path.join(out, 'summary.json'), summary);
  return summary;
}

async function main() {
  const { values } = parseArgs({ options: {
    sdk: { type: 'string' }, ref: { type: 'string' }, out: { type: 'string' }, chrome: { type: 'string' },
    'prepare-only': { type: 'boolean' }, payload: { type: 'string' },
  } });
  if (!values.out) throw new Error('Pass --out <directory>');
  if (values.payload && values['prepare-only']) throw new Error('Choose --prepare-only or --payload');
  const out = path.resolve(values.out);
  let payload;
  if (values.payload) {
    payload = await readJSON(values.payload);
  } else {
    const html = await prepareCanary({ ...values, out });
    if (values['prepare-only']) {
      console.log(`Open ${html} in Chrome and download the recording. Score it with --out ${out} --payload <download>.`);
      return;
    }
    payload = await runBrowserCanary(html, values.chrome);
  }
  const summary = await scoreCanary(out, payload);
  for (const row of summary.results) {
    console.log(`${row.id} | ${row.events} events | private ${row.private.protected} protected, ${row.private.exposed} exposed, ${row.private.unverified} unverified | public ${row.public.retained} retained, ${row.public.lost} lost, ${row.public.unverified} unverified`);
  }
  console.log(`Summary: ${path.join(out, 'summary.json')}`);
  const native = summary.results.find((row) => row.id === 'app-native');
  if (native.private.exposed || native.private.unverified || native.public.lost || native.public.unverified) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
