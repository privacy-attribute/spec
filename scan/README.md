# Scan

A review that a coding agent runs on your application's source. It finds the information a session recorder must mask or block and proposes the annotations as a patch for you to review.

## How it works

1. **Inventory.** The agent maps routes, feature entry points and recorder integrations across the available codebase. A structural tool lists supported rendering sites to help track the work; it can miss destinations and assigns no privacy meaning.
2. **Review.** The agent follows the [review skill](skill/SKILL.md). It traces each value from where it is produced to the element that shows it, decides what it means and whom it concerns, and cites the source lines for every decision.
3. **Questions.** After research, the agent asks up to three initial questions only where your knowledge or decision is needed. Follow-ups are reserved for consequential ambiguity it cannot resolve itself.
4. **Patch.** Supporting tools validate evidence and propose annotations. The agent reconciles these with the deployed recorder: native `review-patch` output uses `data-privacy` only, while rrweb classes or configuration changes require exact source proposals. An ignored attribute is not protection.
5. **Verify.** The agent tests the reconciled patch in an isolated copy, with synthetic private values and public controls. It reports source validation separately from observed recording protection, and applies changes only within your authorization.

## Quick start

Use Node.js 18 or later. In a checkout of this repository, run `npm ci`. Then give this prompt to a coding agent in your application's repository, with the paths replaced:

```text
Find the data in this application that a session recorder must mask or block.

1. Read <scanner checkout>/scan/skill/SKILL.md.
2. Map routes, feature entry points and all recorder integrations across the
   available codebase. Create a structural inventory:
   node <scanner checkout>/scan/cli.mjs inventory <application root> --out <new session folder>
3. Follow the skill. Read producers and component definitions, then write
   source-evidenced decisions in the session's review.json.
4. Run review-patch and review-proposals with --out <session folder>.
5. Test the reconciled patch in an isolated copy. Report unresolved work,
   public-content losses and checks actually executed. Keep the original
   application unchanged and leave the patch for review.
```

The [implementation prompt](PROMPT.md) is a longer version. The [rrweb guide](recorders/rrweb.md) explains the recorder settings the annotations need.

For a dashboard handoff that supplies this directory URL, open `skill/SKILL.md` and its linked references first. Use a local checkout for the CLI; the directory URL is not an install command. If tools cannot be installed or run, continue the source review and exact patch preparation, reporting tool validation as unavailable. For large applications, inventory in feature batches with `--include`, while keeping a whole-application coverage ledger and following dependencies outside each batch.

## What to know before you rely on it

- A coding agent sends the source it reads to its model provider.
- A scan can miss private data and can propose a wrong annotation. Review the patch.
- A validated patch is a static result. Only a recording of the patched application shows what a recorder captures.
- `data-privacy` annotations need a recorder that honours them, natively or through selectors. For rrweb without that support, use verified `rr-mask`/`rr-block` class proposals. `maskAllInputs: true` alone does not enable the attributes.

## Reference

- [Review skill](skill/SKILL.md) and its [pattern catalog](skill/references/catalog.md) of 39 mechanisms in 11 families.
- [Decision record format](skill/references/decisions.md).
- [Evaluation rules](patterns/README.md) for changing the skill.
- [Results and experiments](../research/README.md).

## Skill-led review

Use a new session folder outside the application source. For an application-wide request, keep a ledger of all entry points and review in bounded feature batches as necessary. Keep the source read-only during inspection, and follow producers, shared components and capture integrations outside batch boundaries.

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

Use `--split development` or `--split held-out` to select a file group. Use `--session <dir>` to measure the reviewed patch from a scan session. Use `--compare <report>` to compare with an earlier JSON result. The report separates detection at the labelled element, exact placement, treatment, static coverage and Git patch application. The static report marks replay protection as unmeasured. See [scanner design](../research/scan-design.md#measurement).

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
