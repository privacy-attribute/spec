# Audit runner

The runner compares recordings of the same browser journey with different synthetic values. It reports which capture channels change and checks whether public content survives. Use Node.js 18 or later and Chrome or Chromium.

```bash
cd audit/runner
npm ci
node cli.mjs run --adapter rrweb --sdk /path/to/rrweb --out out
```

The runner records value A twice to measure normal variation. It then records value B. `out/summary.md` shows which channels differ beyond the variation in the A runs. A `·` means the recordings match. The summary also lists lost public content and skipped patterns. Read the sample event lines in `out/results.json` when you trace a difference.

## Run the audit with a coding agent

```bash
node cli.mjs agent --sdk /path/to/rrweb
```

The command runs the fixtures, writes a session folder and gives its `PLAYBOOK.md` to the coding agent. The session includes `summary.md`, `results.json`, `context.json`, `draft-findings.json`, `trace-plan.md` and a `traces.json` template. Use the trace plan to find the code for each channel. Record the path, fix and verdict in `traces.json`. Run `node cli.mjs merge --out <dir>` to build `privacy-audit.json`. The merge requires a path and a fix for each finding.

- Use `--agent claude`, `--agent codex` or a command that accepts a prompt. If no agent is installed, the command prints the playbook path.
- Use `--headless` to run without questions. Save feedback as local drafts.
- Use `--skip-run` to reuse the results in `--out`.

## Commands

| Command | What it does |
|---------|--------------|
| `run` | Runs every fixture in `fixtures/` (plus `--fixtures <dir or file,...>`) and writes `summary.md` and `results.json`. |
| `report <fixture.mjs>` | Runs one fixture, saves a local feedback draft, and prints the address of the blank issue form. |
| `conformance` | Checks the core attribute against the adapter’s `privacy-attribute` configuration. |
| `coverage` | Lists patterns in `patterns.yaml` that no fixture covers. |
| `merge` | Combines `draft-findings.json` and the agent's `traces.json` into `privacy-audit.json`, and lists findings still missing a path or fix. |
| `agent` | Runs the fixtures, writes a session folder with a playbook, and starts the user's own coding agent on the rest of the audit. |

Use `--pages login,checkout`, `--patterns P-pin-pad`, `--configs targeted,default-core`, `--concurrency 4`, `--chrome <path>` or `--out <dir>` to change a run. `--tier L1` runs L1. `--tier L2` runs L1 and L2. Add opt-in configs such as `opt-in:recordCanvas` to `--configs` to run them.

For an extracted source tree without `node_modules`, point `NODE_PATH` at a `node_modules` folder that has the SDK's dependencies.

## Check the privacy attribute

Run the fixture in Chrome against the SDK checkout and revision you plan to ship. The fixture samples requirements from the [draft core](../../spec/core.md).

```bash
node cli.mjs conformance --sdk /path/to/rrweb
```

The command checks for public and private synthetic values in emitted snapshots and events. It prints the result of each check and exits with status 1 if a check fails. Use the wider audit to check other capture channels and inference risks.

To run the same fixture with another SDK, pass `--adapter <path>` and define a config named `privacy-attribute`. Its browser glue must expose decoded recording events through `window.__audit.events`. The fixture uses the same markup and checks across adapters.

## Draft feedback

Run `report` with a fixture that uses synthetic values.

```bash
node cli.mjs report my-leak.mjs --adapter rrweb --sdk ~/code/rrweb
```

The draft contains the fixture and recorded evidence. Review it before sharing. Send recorder weaknesses through the private route in [SECURITY.md](../../SECURITY.md). For feedback about the audit itself, copy a reviewed draft into the [blank audit feedback form](https://github.com/privacy-attribute/spec/issues/new?template=sdk-audit-feedback.yml). Maintainers can add accepted fixtures to `fixtures/` so later audits cover the same case.

## Fixtures

A fixture is one composite page from `patterns.yaml` with one journey per pattern:

```js
export default {
  page: 'login',
  html: (v, env) => `<input type="password" id="pw"
    data-audit-category="secret" data-audit-pattern="P-password">`,
  journeys: [
    {
      pattern: 'P-password',
      values: ['abc', 'correct horse battery'],
      async run(h, value) { await h.fill('#pw', value); },
    },
  ],
};
```

- `html(v, env)` returns the page. `v[patternId]` is each journey's value for this run: the journey under test gets A or B, every other journey its first value. `env` has `port`, `port2` (a second origin) and `run`. An optional `frames(v, env)` returns `{ name: html }`, served at `http://127.0.0.1:${env.port}/frame?f=<name>&run=${env.run}` (or `localhost:${env.port2}` for cross-origin).
- Label elements with `data-audit-category` (`secret`, `personal`, `third-party`, `public`) and `data-audit-pattern`. Add `data-audit-block` to widgets a careful integrator would block. The `targeted` and `strictest-block` configs are built from these labels.
- `run(h, value)` drives the page with realistic input. Helpers: `h.click(sel)`, `h.move(sel)`, `h.type(text)`, `h.fill(sel, text)`, `h.press(key, n)`, `h.tap(sel)`, `h.drag(points)`, `h.box(sel)`, `h.wait(ms)`, and `h.page` (puppeteer).
- Date and time inputs follow the host's regional format. Read the segment order from `Intl.DateTimeFormat().formatToParts()` before typing into them (see `fixtures/profile-form.mjs`).
- Every fixture is wrapped in a public shell (`lib/shell.mjs`), so the fidelity check has public content on every page.

## Adapters

An adapter connects the runner to one SDK. `adapters/rrweb.mjs` is the reference. It exports:

| Export | Purpose |
|--------|---------|
| `name` | Adapter name. |
| `configs` | `[{ id, options, fidelity?, optIn?, note? }]`. The ids follow the config matrix in `AGENTS.md`. `options` must be JSON. The page glue turns markers into functions. |
| `prepare({ sdk, bundle })` | Builds or loads the recorder and returns `{ script, target }`. `script` runs in every page and must define `window.__audit` with `events`, `start(options)` and `finish()`. `target` is the step 0 version block. |
| `normalise(events)` | Returns `{ lines: [{ channel, text }], gaps }`: one line per observable fact, tagged with a channel id, plus the gaps between events in milliseconds. |
| `codeMap` | `{ dirs, channels: { [channel]: { symbols, note } } }`: the functions that emit, mask or block each channel. Symbols are looked up in the audited source at run time and appear as `file:line` in `trace-plan.md`. |
| `publicFromEvents(events)` | Returns `{ [data-audit-id]: { text, src, inlined } }` for public elements in the last full snapshot. |

To add an SDK, copy the rrweb adapter and replace the build, the configs and the event mapping.
