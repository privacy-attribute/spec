// Runs fixture journeys twice per config (hidden value A and B), diffs them, and checks public fidelity.
import crypto from 'node:crypto';
import { helpers, wrap, livePublic } from './browser.mjs';
import { diffLines, summarise, timingDiffers } from './diff.mjs';

// Values for one run: the journey under test gets `value`, every other journey its first value.
function valuesFor(fixture, journey, value) {
  const v = {};
  for (const j of fixture.journeys) v[j.pattern] = j === journey ? value : j.values[0];
  return v;
}

async function record({ browser, server, adapter, script, fixture, journeys, values, config }) {
  const id = crypto.randomUUID();
  const env = { port: server.port, port2: server.port2, run: id };
  server.put(id, {
    html: wrap(fixture.html(values, env)),
    frames: fixture.frames ? fixture.frames(values, env) : undefined,
  });
  const ctx = await browser.createBrowserContext();
  try {
    const page = await ctx.newPage();
    await page.setViewport({ width: 1000, height: 1400 });
    // Pin the time zone. The locale is left to the host on purpose: on macOS, date and time inputs
    // follow the OS region format whatever Chrome is told, so fixtures read the field order from
    // Intl (which then agrees with the widget). A and B run on the same host, so diffs are unaffected.
    await page.emulateTimezone('UTC');
    await page.evaluateOnNewDocument(script);
    await page.goto(`http://127.0.0.1:${server.port}/p?run=${id}`, { waitUntil: 'load' });
    await page.evaluate((o) => window.__audit.start(o), config.options);
    await new Promise((r) => setTimeout(r, 200));
    const h = helpers(page, server);
    for (const j of journeys) await j.run(h, values[j.pattern]);
    await new Promise((r) => setTimeout(r, 400));
    await page.evaluate(() => window.__audit.finish());
    const events = await page.evaluate(() => window.__audit.events);
    const live = await livePublic(page);
    return { events, live, id };
  } finally {
    await ctx.close();
    server.drop(id);
  }
}

async function pool(tasks, concurrency) {
  const results = [];
  let next = 0;
  async function worker() {
    while (next < tasks.length) {
      const i = next++;
      results[i] = await tasks[i]();
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker));
  return results;
}

// One differential test: journey with value A versus value B, under one config.
// Value A runs twice: what differs between the two A runs is noise (rrweb samples pointer moves
// by wall-clock time), so a channel counts only when A versus B differs clearly more than A versus A.
export async function differential(ctx, fixture, journey, config) {
  const [A, B] = journey.values;
  const runs = await Promise.all([A, B, A].map((value) =>
    record({ ...ctx, fixture, journeys: [journey], values: valuesFor(fixture, journey, value), config })));
  // The run id in the page URL differs per run by construction; replace it before diffing.
  const [na, nb, na2] = runs.map((r) => {
    const n = ctx.adapter.normalise(r.events);
    return { ...n, lines: n.lines.map((l) => ({ ...l, text: l.text.split(r.id).join('RUN') })) };
  });
  const ab = summarise(diffLines(na.lines, nb.lines));
  const aa = summarise(diffLines(na.lines, na2.lines));
  const channels = {};
  const noise = {};
  for (const [c, d] of Object.entries(ab)) {
    const nAB = d.onlyA + d.onlyB;
    const nAA = aa[c] ? aa[c].onlyA + aa[c].onlyB : 0;
    if (nAA === 0 || nAB > 3 * nAA) channels[c] = nAA ? { ...d, noise: nAA } : d;
    else noise[c] = { ab: nAB, aa: nAA };
  }
  const tAA = timingDiffers(na.gaps, na2.gaps);
  const tAB = timingDiffers(na.gaps, nb.gaps);
  const timing = tAA.differs ? { differs: false, noisy: true } : tAB;
  return {
    differs: Object.keys(channels).length > 0 || timing.differs,
    channels,
    noise,
    timing,
    events: { a: runs[0].events.length, b: runs[1].events.length },
  };
}

// Fidelity: every journey with its first value, then compare public elements with the recording.
export async function fidelity(ctx, fixture, config) {
  const values = valuesFor(fixture, null, null);
  const { events, live } = await record({ ...ctx, fixture, journeys: fixture.journeys, values, config });
  const recorded = ctx.adapter.publicFromEvents(events);
  const mismatches = [];
  for (const [id, l] of Object.entries(live)) {
    const r = recorded[id];
    if (!r) mismatches.push({ id, tag: l.tag, live: l.text.slice(0, 120), recorded: null, problem: 'missing' });
    else if (r.text !== l.text) mismatches.push({ id, tag: l.tag, live: l.text.slice(0, 120), recorded: r.text.slice(0, 120), problem: 'text' });
    else if (l.src && r.src !== l.src && !r.inlined) mismatches.push({ id, tag: l.tag, live: l.src, recorded: r.src, problem: 'src' });
  }
  return { mismatches };
}

export async function runAll(ctx, plan, { concurrency = 4, onProgress = () => {} } = {}) {
  let done = 0;
  const total = plan.differential.length + plan.fidelity.length;
  const tick = (x) => { onProgress(++done, total); return x; };
  const diffTasks = plan.differential.map(({ fixture, journey, config, meta }) => async () => {
    try {
      return tick({ ...meta, config: config.id, ...(await differential(ctx, fixture, journey, config)) });
    } catch (e) {
      return tick({ ...meta, config: config.id, error: String(e.message || e) });
    }
  });
  const fidTasks = plan.fidelity.map(({ fixture, config }) => async () => {
    try {
      return tick({ page: fixture.page, config: config.id, ...(await fidelity(ctx, fixture, config)) });
    } catch (e) {
      return tick({ page: fixture.page, config: config.id, error: String(e.message || e) });
    }
  });
  const results = await pool([...diffTasks, ...fidTasks], concurrency);
  return { differential: results.slice(0, diffTasks.length), fidelity: results.slice(diffTasks.length) };
}
