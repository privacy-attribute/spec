# Application privacy scan

Finds front-end code that collects or shows data a session recorder must mask or block, and proposes the smallest `data-privacy` annotation for each. Needs Node.js 18 or later. No dependencies.

To run it from a coding agent, use the prompt in [PROMPT.md](PROMPT.md). The agent follows [AGENTS.md](AGENTS.md).

## Commands

| Command | What it does |
|---------|--------------|
| `privacy-scan find <src> [--sdk rrweb] [--out <dir>]` | Static pass with no model. Applies the rules in `rules.mjs` to every source file and writes a session folder: `scan-plan.md` (flagged lines grouped by file, most private first), `candidates.json`, an empty `annotations.json` and `PLAYBOOK.md`. The folder goes in the system temp folder unless you pass `--out`. |
| `privacy-scan patch --out <dir>` | Turns `annotations.json` into `privacy.patch` (paths relative to the repository root) and `app-privacy.json`. Lists every candidate that is not yet annotated or dismissed. |
| `privacy-scan report --out <dir>` | Turns the gaps in `annotations.json` into issue texts in `feedback/`, each with a link that fills in the scan feedback form. |
| `privacy-scan agent <src> [--sdk rrweb] [--agent claude\|codex\|<command>] [--headless] [--model <m>]` | Runs `find`, then starts Claude Code or Codex on the playbook. `--headless` runs without questions and leaves the reports in the session folder. |

From a clone, run `node scan/cli.mjs <command>`. Without a clone, run `npx -y -p github:privacy-attribute/spec privacy-scan <command>`.

## Files

| File | Purpose |
|------|---------|
| `AGENTS.md` | Instructions for the agent: data categories, what to annotate, the procedure, and how to report gaps |
| `rules.mjs` | The static rules. Each maps a source line to a pattern and a likely data category. |
| `caveats/<sdk>.md` | What an annotation cannot fix in that recorder, and the configuration that closes each gap |
| `PROMPT.md` | The prompt to share with implementers |

The scan never writes to the application. The implementer reviews and applies the patch.
