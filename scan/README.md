# Application privacy scan

Finds front-end code that collects or shows data a session recorder must mask or block, and proposes the smallest `data-privacy` annotation for each. Needs Node.js 18 or later. No dependencies.

To run it from a coding agent, use the prompt in [PROMPT.md](PROMPT.md). The agent follows [AGENTS.md](AGENTS.md).

## Commands

| Command | What it does |
|---------|--------------|
| `privacy-scan find <src> [--sdk rrweb] [--annotate rrweb\|data-privacy] [--include <path,...>] [--out <dir>]` | Static pass with no model. Applies the rules in `rules.mjs` to every source file and writes a session folder: `scan-plan.md` (flagged lines grouped by file, most private first), `candidates.json`, an empty `annotations.json` and `PLAYBOOK.md`. The folder goes in the system temp folder unless you pass `--out`. `--include` limits a large app to path prefixes under `<src>`, for example `--include modules/settings,pages/account`. Generated code is skipped. |
| `privacy-scan patch --out <dir>` | Turns `annotations.json` into `privacy.patch` (paths relative to the repository root) and `app-privacy.json`. The patch also creates or updates `.privacy-scan/decisions.json`. Lists every candidate that is not yet annotated or dismissed. |
| `privacy-scan report --out <dir>` | Writes one report for the scan to `feedback/`: rule outcomes (counts only), gaps with proposed rules tested against their example, and a link that fills in the scan feedback form. Recorder gaps go to `feedback/private-recorder-gaps.md` for private reporting (see `SECURITY.md`). |
| `privacy-scan agent <src> [--sdk rrweb] [--agent claude\|codex\|<command>] [--headless] [--model <m>]` | Runs `find`, then starts Claude Code or Codex on the playbook. `--headless` runs without questions and leaves the reports in the session folder. |

From a clone, run `node scan/cli.mjs <command>`. The prompts pin a release tag; update the tag in them when you release. Without a clone, run `npx -y -p github:privacy-attribute/spec#v0.2.0 privacy-scan <command>`.

## Files

| File | Purpose |
|------|---------|
| `AGENTS.md` | Instructions for the agent: data categories, what to annotate, the procedure, and how to report gaps |
| `components.mjs` | The component pass: parses TypeScript and JSX with `@babel/parser` and follows data from its sources to the elements that render it, across components |
| `templates.mjs` | The template pass: the same analysis for Vue and Svelte single-file components (script blocks parsed with `@babel/parser`, props followed to child components and slot scopes) and for Laravel Blade views |
| `rules.mjs` | The line rules for secrets, inputs, URLs, titles and other templates (HTML and server views). Each maps a source line to a pattern and a likely data category. |
| `cache.mjs` | The decisions cache: `find` skips files whose hash matches `.privacy-scan/decisions.json`, and `patch` writes the cache into the patch |
| `recorders/<sdk>.md` | How that recorder reads annotations, and the configuration to add |
| `PROMPT.md` | The prompt to share with implementers |

The scan never writes to the application. The implementer reviews and applies the patch.

## Maintaining the rules

The scan gets cheaper as the rules get better. Each scan report carries rule outcomes: for every rule, how many lines it flagged and how many the agent annotated (with which value) or dismissed. Maintainers collect these and adjust `rules.mjs`:

| Signal across reports | Change |
|-----------------------|--------|
| A rule's lines are annotated with the same value in at least 95% of cases, over at least 20 reports | Add `auto: { value, category }`. `find` then writes the annotation and the agent skips those lines. |
| A rule's lines are dismissed in at least 90% of cases | Narrow the pattern, or remove the rule. |
| A `missed-data` gap with a tested `proposed_rule` | Add the rule, then run the benchmark. |

Every rule change must keep the benchmark's recall at or above `benchmark/baseline.json`. Run `node scan/cli.mjs bench` locally; CI runs it on every pull request.
