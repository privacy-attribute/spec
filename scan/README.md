# Application privacy scan

The privacy review skill guides a coding agent through application meaning, audience, rendering paths and exact annotation placement. Structural tools provide an inventory, evidence checks and reproducible patches. They do not assign privacy categories. This local draft requires Node.js 18 or later. In the scanner checkout, run `npm ci` to install its dependencies.

Start with [the review prompt](PROMPT.md) and [the skill](skill/SKILL.md). The earlier heuristic scanner remains available for baseline comparisons.

The [pattern catalog](skill/references/catalog.md) organizes 39 mechanisms into 11 families. Follow [the composition procedure](skill/references/composition.md) to trace one fact through copies, state changes, rendering owners and capture channels. Read relevant families progressively. [Evaluation rules](patterns/README.md) distinguish documented patterns, source reasoning and observed recording protection. The [candidate redesign](REDESIGN.md) keeps repository migration conditional on meaningful transfer evidence.

Start with [content mapping](skill/references/content-map.md): identify surface purpose, value families and producer constraints separately from privacy meaning. After the first trace, select [focused review lenses](skill/references/review-lenses.md) from observed cues and reconcile their findings into the same decisions. For complex features, `review-map.md` is a compact agent-authored working note; no CLI command generates or validates it. Simple fields can retain that context in the decision rationale. The review JSON schema is unchanged.

## Skill-led review

Choose a bounded feature scope and a new session folder outside the application source. Keep the source read-only during inspection.

```bash
node scan/cli.mjs inventory /path/to/app --include src/account,src/contacts --out /tmp/privacy-review
node scan/cli.mjs review-context --out /tmp/privacy-review --file src/account/Page.tsx --start 1 --end 100
```

The agent reads producers, callers and component definitions, then fills `review.json` with evidence-backed decisions. It can follow source outside the inventory scope for context. Every decided site has a literal quote and current file hash. Missing destinations remain explicit additional findings.

```bash
node scan/cli.mjs review-patch --out /tmp/privacy-review
node scan/cli.mjs review-proposals --out /tmp/privacy-review
```

| Output | Meaning |
| --- | --- |
| `inventory.json`, `tasks.json` | Rendering sites, file hashes and parser limitations. No inferred privacy categories. |
| `review.json` | Reviewer decisions, source evidence, unresolved meanings and optional exact framework edits. |
| `review-report.json` | Decision validation, native placements, missing work and known public-content loss. |
| `proposal.patch` | Partial native edits while unresolved work remains. Exit code 2 signals an incomplete review. |
| `privacy.patch` | Native proposals when the inventoried review has no reported gaps. Runtime verification still required. |
| `source-proposals.patch`, `source-proposals.json` | Exact source-supported framework edits, checked in an isolated copy. They are separate from native coverage and may overlap native proposals. |

The tool does not launch an agent for this workflow. Load the skill in the coding agent you already use. It is a repository skill draft, with no automatic personal installation. An exact quote establishes provenance, not semantic correctness. Independent review tests the meaning. Framework compilation, runtime forwarding and emitted recorder payloads require separate tests with synthetic data. The recorder operator remains responsible for recording contents; the review does not establish legal compliance.

Source or tool changes invalidate a session. Create a new inventory and revalidate prior decisions against it. Token usage is unknown unless the model runner supplies measurements.

## Earlier heuristic commands

| Command | What it does |
|---------|--------------|
| `privacy-scan find <src> [--sdk rrweb] [--annotate rrweb\|data-privacy] [--include <path,...>] [--reuse <prior-session>] [--out <dir>]` | Reads supported source files and writes `scan-plan.md`, `candidates.json`, `annotations.json` and `PLAYBOOK.md` to the session folder. The default location is the system temp folder. Use `--include` to limit the scan to path prefixes under `<src>`, for example `--include modules/settings,pages/account`. |
| `privacy-scan place --out <dir>` | Uses the source answers in `annotations.json` to update the plan and proposed annotations. |
| `privacy-scan patch --out <dir>` | Writes `app-privacy.json` for review. After all source and review checks pass, writes `privacy.patch` with paths relative to the application repository root. The patch includes `.privacy-scan/decisions.json`. Failed checks return a nonzero exit code and remove earlier patch and cache outputs from the session. |
| `privacy-scan report --out <dir>` | Writes local rule counts and gap drafts in `feedback/` and prints the blank feedback form address. Saves recorder weaknesses in `feedback/private-recorder-gaps.md`. |
| `privacy-scan agent <src> [--sdk rrweb] [--agent claude\|codex\|<command>] [--headless] [--model <m>]` | Runs `find`, then starts Claude Code or Codex on the playbook inside an OS write sandbox. The agent can write in the session folder. The command requires a working `sandbox-exec` on macOS or `bwrap` on Linux. Use `--headless` to run without questions. |

Run `node <scanner checkout>/scan/cli.mjs <command>` from the application repository. See the [implementation prompt](PROMPT.md) for the earlier `v0.2.0` command and its feedback behavior.

## Files

| File | Purpose |
|------|---------|
| `AGENTS.md` | Instructions for the agent: data categories, what to annotate, the procedure, and how to report gaps |
| `components.mjs` | The component pass: parses TypeScript and JSX with `@babel/parser` and follows data from its sources to the elements that render it, across components |
| `place.mjs` | Places annotations for supported high-confidence sites and leaves uncertain destinations for review |
| `residue.mjs` | Groups questions by unknown source and applies review answers |
| `schemas.mjs` | The schema reader: the field categories that the app's Prisma schema or Rails `db/schema.rb` declares |
| `templates.mjs` | The template pass: the same analysis for Vue and Svelte single-file components (script blocks parsed with `@babel/parser`, props followed to child components and slot scopes) and for Laravel Blade views |
| `rules.mjs` | The line rules for secrets, inputs, URLs, titles and other templates (HTML and server views). Each maps a source line to a pattern and a likely data category. |
| `cache.mjs` | Reuses completed reviews while the source snapshot, schemas, scanner and settings match |
| `recorders/<sdk>.md` | How that recorder reads annotations, and the configuration to add |
| `PROMPT.md` | The prompt to share with implementers |

Use a new session folder outside the application repository for each `find` run. Use `--reuse <prior-session>` to load the static analysis from an earlier session with the same application root, include paths, scanner and source snapshot. The scanner reads and hashes the source to check that it matches. If source changes, start a new session without `--reuse`. After changing source answers, run `place` before `patch`.

The scan writes proposed edits to the session folder. The implementer reviews and applies the patch. After applying the patch and recorder configuration, inspect emitted events in a recording with synthetic data.

## Maintaining the rules

Each local report counts the lines each rule flags, the annotations reviewers choose, and the lines they dismiss. The report also tests proposed rules against labelled synthetic examples. Review the examples and false positives before changing `rules.mjs`.

Run `node scan/cli.mjs bench` from the scanner checkout. The command compares fixture recall with `benchmark/baseline.json`. CI runs the same check.

## Measure a pinned application

Use the repository and commit in `scan/benchmark/apps/<app>/labels.json`. Run the measurement on a clean checkout of that commit.

```bash
node scan/benchmark/apps/measure.mjs <app> <upstream-checkout> --json
```

Use `--split development` or `--split held-out` to select a file group. Use `--session <dir>` to measure the reviewed patch from a scan session. Use `--compare <report>` to compare with an earlier JSON result. The report separates detection at the labelled element, exact placement, treatment, static coverage and Git patch application. The static report marks replay protection as unmeasured. See [scanner design](DESIGN.md#measurement).

## Check emitted events with rrweb

The browser canary scans a synthetic JSX page, applies the generated patch in a temporary directory and compares emitted events from before and after the patch. It tests native attribute support and the legacy selector setup. A separate fixture checks attribute behavior during live updates, moves and capture of open shadow roots. The results apply to the specified build, browser, configuration and tested events.

Install the dependencies in `audit/runner` with `npm ci`. From the scanner checkout, run:

```bash
node scan/canary.mjs --sdk /path/to/rrweb --ref <commit-or-tag> --out <new-directory>
```

The command writes `summary.json` and saves the synthetic recordings and detailed checks locally. For a browser outside the shell environment, add `--prepare-only`, open the resulting `browser.html` in Chrome and download the recording. Then score it:

```bash
node scan/canary.mjs --out <same-directory> --payload <downloaded-recording>
```
