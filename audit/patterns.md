# High-risk UI patterns

The patterns live in [`patterns.yaml`](patterns.yaml) as data: one record per pattern, plus the channels they leak through and the composite test pages that hold them. This file says how to use them.

Each pattern is a way pages collect or show data where masking characters is not enough, or (with category `public`) content that must survive masking. Run the differential test from step 6 of `AGENTS.md` on every pattern, under `targeted`, `strictest`, `strictest-block` (the pattern's container blocked) and each default config. Treat each pattern's channel list as a minimum: anything else that differs between the two runs is also a leak. Use the pattern id (for example `P-pin-pad`) in the finding's `pattern` field.

## Fields

| Field | Meaning |
|-------|---------|
| `id` | Pattern id. |
| `rank`, `tier` | Likelihood of appearing on a recorded page, 1 being most likely. Tiers below. |
| `category`, `special_category` | Data category from `AGENTS.md`. The category the pattern holds on real pages, which sets severity. |
| `page` | The composite test page that holds this pattern. |
| `channels` | Channel ids, defined under `channels:` in the same file. |
| `what`, `where`, `test` | What the pattern is, where it shows up, and how to build and drive its test. |

## Work by channel, then by page

The leaks live in a few channels in the SDK, and many patterns share each one. In a large codebase, work in this order:

1. **Map channels to code once.** In step 2 of `AGENTS.md`, find the code for each channel in `channels:` using its `find_in_sdk` hint, and record it in your sink list. Every pattern that uses a channel shares that code.
2. **Build composite pages.** Build one test page per entry in `pages:` and put every pattern with that `page` on it, plus the `shell` baseline. Ten pages cover all patterns. Split a page only when two patterns interfere.
3. **Drive in rank order.** Within each page, script the journeys for the highest-ranked patterns first.
4. **Trace by channel.** When a diff shows a difference, look up the channel it belongs to and go straight to the code you mapped in point 1.

Query the file with `grep` or a YAML parser. Examples:

```bash
grep -A9 'id: P-pin-pad' patterns.yaml              # one pattern
grep -B1 -A8 'tier: L1' patterns.yaml               # every L1 pattern
grep -B6 -A3 'page: login' patterns.yaml            # every pattern on the login page
grep -B6 'channels: \[.*pointer-path' patterns.yaml # every pattern using one channel
```

## Ranking

Ranks estimate how likely a pattern is to appear on a page where a session recorder runs, from common web practice. Report a ranking you think is wrong as feedback of kind `ranking` (see `feedback.md`), with evidence such as prevalence data or examples.

| Tier | Meaning |
|------|---------|
| L1 | On most recorded sites, or in most sessions |
| L2 | Common: on a large share of sites, or in most apps of a common kind |
| L3 | Occasional: specific industries, or pages visited rarely |
| L4 | Rare on the web |

Likelihood is separate from severity. A rare pattern that holds a secret (`P-pin-pad`) still has to be tested, and its leaks are still `critical`. Use the ranking to decide the order of work:

1. Run patterns in rank order, so the most common ones are covered first.
2. If you run out of time or budget, stop at a tier boundary, and list every pattern you did not run in `pattern_coverage` with `result: "not run"`. An audit with untested patterns is incomplete: say so in the summary.
3. Record each finding's pattern rank in `pattern_rank` (`null` when `pattern` is `null`).

## Test pages

Label every element of every test page with its data category (`data-audit-category`). Only labelled elements are checked, and an unlabelled wrapper is neither public nor private. Every page includes the `shell` baseline, so the fidelity check has public content next to each private widget.

## Adding a pattern

Add a record to `patterns.yaml` with every field, using an existing channel id where one fits. Add a channel only for a new kind of signal, with its `compare` and `find_in_sdk`. Keep records on consecutive lines in the same field order so `grep` queries keep working.
