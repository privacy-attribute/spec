# Audit runner

The runner does the mechanical half of the audit without a model: it serves the fixture pages, drives every journey twice with different hidden values under every config, diffs the recordings, and checks public content survives. An agent then reads one table and spends its effort on tracing differences to code. It needs Node 18 or later and Chrome or Chromium.

```bash
cd audit/runner && npm install
node cli.mjs run --adapter rrweb --sdk ~/code/rrweb --out out
```

`out/summary.md` has one row per pattern (in likelihood order) and one column per config. Value A runs twice as a noise baseline. Each cell lists the channels whose events differ between hidden value A and B clearly more than between the two A runs, using the channel ids from `../patterns.yaml`; `·` means the recordings are identical. Below the table it lists public content the recording lost (fidelity) and patterns that did not run. `out/results.json` holds sample lines for every cell.

## Running the whole audit with your own agent

```bash
node cli.mjs agent --sdk ~/code/rrweb
```

This runs every fixture, writes a session folder (in the system temp folder unless you pass `--out`) with `summary.md`, `results.json`, `context.json`, `PLAYBOOK.md`, `draft-findings.json` (every finding drafted from the runs: evidence, configs, category, severity, rank), `trace-plan.md` (one section per channel with code starting points from the adapter's channel-to-code map) and a `traces.json` template, and then starts Claude Code or Codex in the SDK folder with a one-line prompt that points at the playbook. The agent does only what needs judgement: it traces each channel to code once, writes the path, fix and verdict per channel into `traces.json`, and runs `node cli.mjs merge --out <dir>`, which builds `privacy-audit.json` and refuses findings without a path or fix. It also turns leaks it notices while tracing into fixtures and pre-filled issue links. On rrweb this took a headless Claude Code run 5 minutes and about $1.70. You supply the agent and its account, so model usage is billed to you, and the runner has already done the work that costs no tokens.

- `--agent claude`, `--agent codex`, or any other agent command that takes a prompt as its argument. Without it, the runner uses the one installed agent, or asks when there are several.
- `--headless` starts the agent without a person at the terminal (`claude -p`, `codex exec`). The playbook then tells the agent not to ask questions or file issues, and to leave every report in the session folder.
- With no agent installed, the command prints the playbook path and a prompt to paste into any agent.
- `--skip-run` reuses `results.json` from an earlier run in `--out`.

The launcher follows T3 Code's `triage` command ([pingdotgg/t3code](https://github.com/pingdotgg/t3code/blob/main/apps/server/src/cli/triage.ts)).

## Commands

| Command | What it does |
|---------|--------------|
| `run` | Runs every fixture in `fixtures/` (plus `--fixtures <dir or file,...>`) and writes `summary.md` and `results.json`. |
| `report <fixture.mjs>` | Runs one fixture and writes a feedback issue body, then prints a link that opens a pre-filled audit feedback issue. |
| `coverage` | Lists patterns in `patterns.yaml` that no fixture covers. |
| `merge` | Combines `draft-findings.json` and the agent's `traces.json` into `privacy-audit.json`, and lists findings still missing a path or fix. |
| `agent` | Runs the fixtures, writes a session folder with a playbook, and starts the user's own coding agent on the rest of the audit. |

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
| `codeMap` | `{ dirs, channels: { [channel]: { symbols, note } } }`: the functions that emit, mask or block each channel. Symbols are looked up in the audited source at run time and appear as `file:line` in `trace-plan.md`. |
| `publicFromEvents(events)` | Returns `{ [data-audit-id]: { text, src, inlined } }` for public elements in the last full snapshot. |

To add an SDK, copy the rrweb adapter and replace the build, the configs and the event mapping.
