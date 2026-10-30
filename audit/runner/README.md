# Audit runner

The runner does the mechanical half of the audit without a model: it serves the fixture pages, drives every journey twice with different hidden values under every config, diffs the recordings, and checks public content survives. An agent then reads one table and spends its effort on tracing differences to code. It needs Node 18 or later and Chrome or Chromium.

```bash
cd audit/runner && npm install
node cli.mjs run --adapter rrweb --sdk ~/code/rrweb --out out
```

`out/summary.md` has one row per pattern (in likelihood order) and one column per config. Value A runs twice as a noise baseline. Each cell lists the channels whose events differ between hidden value A and B clearly more than between the two A runs, using the channel ids from `../patterns.yaml`; `·` means the recordings are identical. Below the table it lists public content the recording lost (fidelity) and patterns that did not run. `out/results.json` holds sample lines for every cell.

## Commands

| Command | What it does |
|---------|--------------|
| `run` | Runs every fixture in `fixtures/` (plus `--fixtures <dir or file,...>`) and writes `summary.md` and `results.json`. |
| `report <fixture.mjs>` | Runs one fixture and writes a feedback issue body, then prints a link that opens a pre-filled audit feedback issue. |
| `coverage` | Lists patterns in `patterns.yaml` that no fixture covers. |

Options: `--pages login,checkout`, `--patterns P-pin-pad`, `--tier L1` (run L1 only; `L2` runs L1 and L2), `--configs targeted,default-core`, `--concurrency 4`, `--chrome <path>`, `--out <dir>`. Opt-in configs (such as `opt-in:recordCanvas`) run only when named in `--configs`.

For an extracted source tree without `node_modules`, point `NODE_PATH` at a `node_modules` folder that has the SDK's dependencies.

## Reporting a missed leak

Write a fixture that shows the leak, run `report`, and open the printed link:

```bash
node cli.mjs report my-leak.mjs --adapter rrweb --sdk ~/code/rrweb
```

The link opens the audit feedback issue form with the kind, versions, fixture source and recorded evidence filled in. Nothing is sent until you submit the form. Use made-up values only: the fixture and its evidence become public in the issue. Maintainers save accepted fixtures in `fixtures/` (or agents load them with `--fixtures`), so every later run tests them.

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
| `configs` | `[{ id, options, fidelity?, optIn?, note? }]`. The ids follow the config matrix in `AGENTS.md`. `options` must be JSON; the page glue turns markers into functions. |
| `prepare({ sdk, bundle })` | Builds or loads the recorder and returns `{ script, target }`. `script` runs in every page and must define `window.__audit` with `events`, `start(options)` and `finish()`. `target` is the step 0 version block. |
| `normalise(events)` | Returns `{ lines: [{ channel, text }], gaps }`: one line per observable fact, tagged with a channel id, plus the gaps between events in milliseconds. |
| `publicFromEvents(events)` | Returns `{ [data-audit-id]: { text, src, inlined } }` for public elements in the last full snapshot. |

To add an SDK, copy the rrweb adapter and replace the build, the configs and the event mapping.
