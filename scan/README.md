# Application privacy scan

Finds front-end code that collects or shows data a session recorder must mask or block, and proposes the smallest `data-privacy` annotations that protect it. Instructions for the agent are in [AGENTS.md](AGENTS.md). Needs Node 18 or later and no dependencies.

```bash
node scan/cli.mjs agent path/to/app/src --sdk rrweb
```

1. **find** (no model): applies the rules in `rules.mjs` to every source file and writes `candidates.json` and `scan-plan.md`, grouped by file with the most private candidates first. Each candidate has a pattern id from `../audit/patterns.yaml`, a guessed data category and whether a masking annotation is already nearby.
2. **agent**: starts Claude Code or Codex in the app folder with a playbook. The agent reviews the plan file by file and writes `annotations.json`: which element gets which `data-privacy` value and why, which candidates hold no private data, the recorder config to add (from `caveats/<sdk>.md`), and gaps in the rules.
3. **patch**: turns `annotations.json` into `privacy.patch` (relative to the repository root, for `git apply`) and `app-privacy.json`, and lists any candidate not yet annotated or dismissed.

Options for `agent`: `--out <dir>` (default: a new folder in the system temp folder), `--sdk <name>` (adds that recorder's caveats), `--agent claude|codex|<command>`, `--headless`, `--model <m>`. Run `find` and `patch` on their own to review by hand.

The scan never changes the application. The implementer reviews and applies the patch.

`caveats/rrweb.md` lists what annotations cannot fix in rrweb and the config that closes each gap, taken from the rrweb audit in `../audit/`.
