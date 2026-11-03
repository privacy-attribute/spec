# Changelog

The prompts in `README.md` and `scan/PROMPT.md` run a tagged release. A change on `main` reaches users only after a new tag and an update of the tag in the prompts.

## Unreleased

- Component pass: `find` parses TypeScript and JSX with `@babel/parser` (the first dependency, pinned with `npm-shrinkwrap.json`) and follows data from hooks, context, fetches and record-typed props to the elements that render it, across components. The plan lists one unit per component. On the validation sample it finds 29 of 34 reviewer labels without a model (10 with line rules); on the benchmark recall is 92.5% with 55 units (97 before).
- Decisions cache: `patch` writes `.privacy-scan/decisions.json` into the patch. When it is committed, the next scan skips files that did not change.

From the first validation run on an open-source CRM front end:

- New rules: record and person components (chips, pickers, field displays), URLs that give access (webhook, invite and reset links), message subjects and bodies, OTP components, secret form field names, and names inside translated text.
- Quieter rules: `toast` only flags messages built from data, `auth-user` is gone (user hooks feed the data-flow pass), `metadata-render` no longer flags schema metadata, `generic-cell` only flags cells read by a column key, and `secret-copy` only flags copies of secrets.
- `scan/AGENTS.md`: organization data is personal, access URLs are secret, block private data in attributes and avatars of other people, open record and person components, and annotate inside layouts.
- `find` skips generated code. `--include` limits a scan to path prefixes. A headless agent may run node only for the scanner's own CLI.
- The benchmark has a CRM page with these cases and a new baseline.

## 0.2.0

- The application scan is the primary use. The README and `scan/PROMPT.md` give a prompt for any coding agent.
- `--annotate rrweb` writes `rr-block`, `rr-mask` and `rr-ignore`, which rrweb reads with no configuration. It is the default with `--sdk rrweb`. `--annotate data-privacy` writes the standard attribute.
- `patch` adds rrweb classes to static `className` and `class` values, upgrades a weaker rrweb class, and asks for an exact edit for expressions and Vue or Angular class bindings.
- `report` writes one report per scan: rule outcomes as counts, and gaps with a proposed rule tested against a made-up example. Recorder weaknesses go to a private file (see `SECURITY.md`). `--post <url>` sends the report to a feedback endpoint.
- Rules can decide on their own (`auto`). The password field rule is the first.
- A source-first pass follows fetched data and person-typed values to the lines that render them.
- `bench` scores the rules on a labelled benchmark and fails below `scan/benchmark/baseline.json`. CI runs it and the unit tests on Node 18 to 24 and on Windows.

## 0.1.0

- First internal version of the scan and the SDK audit.
