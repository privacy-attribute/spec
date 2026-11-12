# Bounded Twenty runtime evaluation

This local research harness runs pinned Twenty component bodies with a pinned rrweb recorder. It compares original source, the exact reviewed patch, and an optional follow-up patch in isolated copies. It retains complete emitted events, live DOM observations and callback results. See [the results and limits](../../research/twenty-runtime-results.md).

It is a component fixture with declared adapters. It does not build the full Twenty application. DOM-emulator execution and browser execution are recorded separately. The HTML artifact's existence establishes no browser result.

## Inputs and dependencies

- Twenty source snapshot at `0036a6f7f9d3d5112d03c9c3f142f66c09224ff7`, with `manifest.json` and blob-verified `files/`.
- Exact original proposal at `local-evidence/agent-review/twenty-review/proposed.patch`.
- Supplemental source and licenses at `local-evidence/runtime-twenty-build/upstream`, with its blob manifest. This includes more Twenty definitions, Base UI merge helpers and the Linaria runtime. The builder verifies the manifests before bundling.
- A local rrweb checkout containing commit `a4abb9478bd56bcf8ec9658bd7eb0a6c8c6b78f4` and its installed build dependencies. The recorder builder archives the committed source into a temporary directory.
- Root dependencies and `audit/runner` dependencies installed. The executed build used esbuild 0.28.2, React and React DOM 19.2.4, `@emotion/is-prop-valid` 1.2.2, Stylis 4.2.0 and clsx 2.1.1. DOM execution used jsdom 16.7.0.

Retained application snapshots and supplemental sources are local evidence, excluded from the package. This is not a standalone installed-package demo. Supply `--support` to select another copy of the verified supplemental directory.

`--ui-dependencies deps.json` overrides installed dependency resolution roots. Its JSON keys are `react`, `react-dom`, `@emotion/is-prop-valid`, `stylis` and `clsx`; values are absolute directories from which each package can be resolved. Defaults target the original local workspace. `--dependencies` separately identifies an installed project from which `jsdom` resolves. No dependency installation or application package script runs inside this harness.

## Execute the matrix

From the repository root, with the retained local inputs and installed dependencies:

```bash
node scan/runtime/run.mjs \
  --source local-evidence/agent-review/twenty-source \
  --review local-evidence/agent-review/twenty-review/proposed.patch \
  --out local-evidence/runtime-twenty/new-run \
  --sdk /absolute/path/to/rrweb \
  --ref a4abb9478bd56bcf8ec9658bd7eb0a6c8c6b78f4 \
  --dependencies /absolute/path/to/project-with-jsdom \
  --ui-dependencies /absolute/path/to/deps.json \
  --followup-patch local-evidence/runtime-twenty/autogrow-followup.patch \
  --expect-protected private-autogrow,private-autogrow-empty-attribute,private-autogrow-placeholder
```

The output directory must be new. Omit `--followup-patch` and `--expect-protected` to reproduce the initial proposal with its recorded autogrow findings. Add `--prepare-only` to prepare the browser artifact without DOM-emulator execution.

Each run has ten flows, two source variants and two recorder configurations: `{}` and `{"privacyPolicy":{"version":1,"preset":"balanced"}}`. The source variants are original and proposed source; the follow-up patch, when supplied, applies after the proposal. The same configuration and recorder bundle are used for each paired comparison. The default arm supplies positive controls; protection claims in this evaluation use balanced.

## Browser handoff

Open the generated `browser.html` manually and select **Run browser checks**. It embeds the fixture and recorder bundles, uses synthetic data and prohibits network connections. Each arm has a fresh iframe. It takes approximately a minute, depending on the browser. Download the resulting JSON after completion. A failure preserves partial evidence and identifies the stopped arm.

Score the downloaded recording using:

```bash
node scan/runtime/run.mjs \
  --recording /absolute/path/to/twenty-browser-recordings.json \
  --out local-evidence/runtime-twenty/browser-score.json
```

Scoring rejects incomplete, missing, duplicate or mislabeled arms. Nonzero failed checks produce exit status 2. Retain failures and investigate them; browser layout can reveal differences that the DOM emulator cannot exercise. Do not change the comparator merely to erase those differences.

The browser tool in the current session rejected local file URLs and prohibited alternate browser access as a workaround. No browser execution was performed. The prepared artifact is a manual handoff for completing that check.

## What the scorer establishes

The scorer requires actual native values, serialized component roots, exact public controls, exact Copy and editing callback values, baseline channel evidence and phase-specific mutations. Measurement-text checks track recorder node identities beneath the CSS-hidden span observed in live DOM. Private marker checks inspect every JSON key and value. Different key lengths are compared across the entire recording after removing timestamps only.

These checks cover the selected synthetic values and states. They do not establish complete discovery, arbitrary encoded-data protection, timing or layout independence, production clipboard behavior, trusted input, portals, full-app compilation, replay rendering or legal compliance. The recorder operator remains responsible for recording contents.
