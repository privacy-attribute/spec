# High-risk UI patterns

The patterns are in [`patterns.yaml`](patterns.yaml) as data. That file has one record for each pattern, the channels that the patterns leak through, and the composite test pages that hold them. This file tells you how to use them.

Each pattern is a way that pages collect or show data, where a mask that replaces characters is not sufficient. A pattern with category `public` is content that must stay in the recording when the SDK masks other content. Run the differential test from step 6 of `AGENTS.md` on each pattern. Use these configs: `targeted`, `strictest`, `strictest-block` (with the container of the pattern blocked), and each default config.

Treat the channel list of each pattern as a minimum. Any other item that is different between the two runs is also a leak. Use the pattern id (for example `P-pin-pad`) in the `pattern` field of the finding.

## Fields

| Field | Meaning |
|-------|---------|
| `id` | Pattern id. |
| `rank`, `tier` | How likely the pattern is on a recorded page. 1 is the most likely. The tiers are below. |
| `category`, `special_category` | Data category from `AGENTS.md`: the category that the pattern holds on real pages. This category sets the severity. |
| `page` | The composite test page that holds this pattern. |
| `channels` | Channel ids. `channels:` in the same file defines them. |
| `what`, `where`, `test` | What the pattern is, where it occurs, and how to build and drive its test. |

## Work by channel, then by page

The leaks are in a small number of channels in the SDK. Many patterns share each channel. In a large codebase, work in this order:

1. **Map channels to code once.** In step 2 of `AGENTS.md`, use the `find_in_sdk` hint of each channel in `channels:` to find its code. Record the code in your sink list. All patterns that use a channel share that code.
2. **Build composite pages.** Build one test page for each entry in `pages:`. Put each pattern with that `page` on it, and the `shell` baseline. Ten pages cover all patterns. Split a page only when two patterns interfere.
3. **Drive in rank order.** On each page, script the journeys for the patterns with the highest rank first.
4. **Trace by channel.** When a diff shows a difference, find the channel of that difference. Go directly to the code that you mapped in point 1.

Query the file with `grep` or a YAML parser. Examples:

```bash
grep -A9 'id: P-pin-pad' patterns.yaml              # one pattern
grep -B1 -A8 'tier: L1' patterns.yaml               # every L1 pattern
grep -B6 -A3 'page: login' patterns.yaml            # every pattern on the login page
grep -B6 'channels: \[.*pointer-path' patterns.yaml # every pattern using one channel
```

## Ranking

The rank is an estimate of how likely a pattern is on a page where a session recorder runs. The estimate comes from common web practice. If you think that a rank is wrong, report it as feedback of kind `ranking` (see `feedback.md`). Give evidence, such as prevalence data or examples.

| Tier | Meaning |
|------|---------|
| L1 | On most recorded sites, or in most sessions |
| L2 | Common: on a large share of sites, or in most apps of a common kind |
| L3 | Occasional: specific industries, or pages visited rarely |
| L4 | Rare on the web |

Likelihood and severity are different. You must also test a rare pattern that holds a secret (`P-pin-pad`), and its leaks are still `critical`. Use the rank to set the order of work:

1. Run the patterns in rank order, so that you cover the most common patterns first.
2. If you have no more time or budget, stop at a tier boundary. List each pattern that you did not run in `pattern_coverage` with `result: "not run"`. An audit with patterns that you did not test is incomplete. Write this in the summary.
3. Record the pattern rank of each finding in `pattern_rank` (`null` when `pattern` is `null`).

## Test pages

Label each element of each test page with its data category (`data-audit-category`). The checks use only labelled elements. A wrapper without a label is neither public nor private. Each page includes the `shell` baseline, so that the fidelity check has public content next to each private widget.

## Adding a pattern

Add a record to `patterns.yaml` with all the fields. Use an existing channel id if one is applicable. Add a channel only for a new kind of signal, with its `compare` and `find_in_sdk`. Keep each record on consecutive lines in the same field order, so that `grep` queries continue to work.
