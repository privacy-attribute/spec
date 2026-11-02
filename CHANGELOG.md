# Changelog

The prompts in `README.md` and `scan/PROMPT.md` run a tagged release. A change on `main` reaches users only after a new tag and an update of the tag in the prompts.

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
