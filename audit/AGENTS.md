# Capture SDK privacy audit

You are auditing a session-capture SDK (a session recorder, product analytics snippet, or any library that serialises a web page and sends it somewhere).

Read these files before you start:

- [`patterns.md`](patterns.md) and [`patterns.yaml`](patterns.yaml): high-risk UI patterns you must test, such as PIN pads, one-time-code inputs and password reveal toggles, with the channels they leak through and the composite pages that hold them. Query the YAML; do not read it end to end.
- [`taxonomy.md`](taxonomy.md): the leak classes you must cover, with what to grep for in each.
- [`output-format.md`](output-format.md): the exact shape of your findings file.
- [`feedback.md`](feedback.md): how to pull in reports of leaks earlier audits missed, and how to report what these instructions missed.

If you were given a link to these files, read every file from the same tag or commit as this one, so the set is consistent. Record the link in `audit_source` in your output.

## Responsibility

These instructions and every audit produced with them are provided as is, without warranty. An audit can miss leaks and can misjudge fidelity. Its findings are not legal advice and not a certification of compliance with any privacy law. The implementer (whoever integrates, configures or ships the recorder) is responsible for the final output: what their recordings contain, how the recorder is configured, and whether that meets their legal and contractual obligations.

Any gap you find in these instructions MUST be reported back to [`privacy-attribute/spec`](https://github.com/privacy-attribute/spec/issues): a leak or fidelity loss they did not lead you to, a false positive they caused, or a step that was unclear or impractical. Step 9 and `feedback.md` say how. An audit without its gap reports is incomplete.

Start the prose summary of every audit with the disclaimer above, word for word, and copy it into the `disclaimer` field of the findings file.

## Objective

A recorder should produce the highest-fidelity recording it can while keeping the people on the page private. Both halves count. Your job is to find:

- every way a person who holds the recording can learn data the page should keep from them (privacy findings), and
- every place where the SDK, or the only configuration that stops a leak, removes content or behaviour that carried no private data (fidelity findings).

Back each finding with evidence. The best fix for a privacy finding is the one that removes the least fidelity, so every fix you propose states its fidelity cost.

## Threat model

Assume the attacker:

- holds the full recording, including every event, timestamp, node id and coordinate
- can load the same page unrecorded, so knows its layout, DOM order, labels and behaviour
- knows the SDK, its version and its config
- can combine recordings from many sessions and many users

A value is protected only when the recording looks the same whatever the value is. Masking that replaces characters is one channel out of many. Which element was clicked, where the pointer went, how many events fired, when they fired, what else on the page changed in response, and how big things became can each reveal the value. Treat every one of these as a leak until a test shows otherwise.

## Data categories

Everything on a page falls into one of four categories, and each gets different treatment. Label every element on your test pages with its category before you record. The labels are your ground truth for both privacy and fidelity.

| Category | What it is | Examples | What may reach the recording |
|----------|------------|----------|-------------------------------|
| `secret` | Credentials and authenticators: anything that grants access or moves money if someone else learns it | password, PIN, one-time code, card number, CVV, security answer, recovery phrase, API key, session token in a URL | Nothing that depends on the value: no content, length, magnitude, timing, key count, clicked key, pointer position inside the widget, or echo. The widget's existence, its outer box, and focus entering or leaving it as a whole may be recorded. |
| `personal` | Data about the person being recorded, whether they type it or the page shows it to them | their name, email, address, date of birth, account balance, order history, form answers, consent choices | No content. Structure, layout and interactions may be recorded as long as they do not reveal the value (see partial leaks under Severity). Special categories (health, sex life or orientation, religion, political views, ethnicity, biometrics, union membership, criminal records) get the same rules as `secret` for partial leaks. |
| `third-party` | Personal data about other people, shown to the person being recorded: the site's other users or customers | a support agent's CRM view of customers, an admin user table, chat messages from others, contact lists, comments with names, shared documents | Same rules as `personal`. These people never interacted with the recorder and cannot consent, so input masking never protects them: their data is page text, attributes and images. |
| `public` | Content that is the same for every visitor and identifies nobody | navigation, labels, headings, marketing copy, product names and prices, help text, icons, layout, styles, animations | Everything, exactly. Masking, blocking or dropping public content is a fidelity finding. |

Rules for applying the categories:

1. Category follows the data. The element type does not decide it: a text node can be `third-party`, a `select` of countries holds `personal` data once chosen, and the label next to a secret field is `public`.
2. When content mixes categories (a heading "Orders for Jane Doe"), the whole node takes the most private category in it. Report a fidelity finding only when the SDK cannot mask such a node at a finer grain than the page allows.
3. Free-text input the person types is `personal` at minimum, even in a field meant for public data, because people type personal data anywhere.
4. Interactions take the category of what they reveal. A click on a public "Next" button is `public`. A click on a PIN key is `secret`. A click on one answer of a health questionnaire is `personal`, special category.

## Ground rules

1. Work read-only in the target repository. Do not commit, switch branches, stash, or edit tracked files. If you need to build or run code, copy the source you need into a scratch directory and work there.
2. Audit the revision you were asked to audit. If the working tree has uncommitted changes or is on a feature branch, extract the requested ref (for example `git archive <ref> | tar -x -C <scratch>`) and audit that copy.
3. Every finding needs a source-to-sink path through real code with `file:line` references. A difference found by the differential test (step 6) counts once you trace the differing field back to the code that emits it. Drop any finding without a path.
4. Cover every leak class and fidelity class in `taxonomy.md` and every pattern in `patterns.yaml`. For a class or pattern with no finding, say so in the coverage section of your output and name the code or test that cleared it.
5. Record your uncertainty in the verdict field. Do not soften or hedge findings in prose.
6. Run code. A read-only code review misses most inference leaks. If your environment cannot run a headless browser, say so at the top of the report, because every finding will then be `PLAUSIBLE`.

## Method

The audit has two tracks and you run both. The code track starts from the places where data leaves the page and works backwards (steps 1 to 5). Do not read the codebase top to bottom: the masking logic is usually small and central, and the leaks live on the paths that bypass it. The differential track records real pages twice with different hidden values and diffs the output (step 6). It finds the inference leaks the code track does not show. The fidelity check (step 6b) compares the same recordings with the live page to find what was lost.

### Step 0. Pin the version

Every result in the report holds for one exact version of the SDK. Before reading code, record in the `target` block of the output:

- the repository, the ref you were asked for, and the full commit SHA it resolves to
- the nearest release tag (`git describe --tags <sha>`), and how many commits the audited commit is past it
- the name and `version` field of every package that records, wraps or configures recording (from each `package.json` or equivalent manifest)
- the version of these audit instructions (the `Audit version` line at the end of this file)

If the request names a published version (for example `rrweb@2.2.0` on npm), resolve it to its release tag and audit that tag. Published code is what users run, so prefer a release tag over a branch head when the request allows either.

Then pull in accepted feedback as described in `feedback.md`. Each accepted report becomes an extra pattern for step 6.

### Step 1. Find the configuration surface

Locate the options type (for rrweb, `recordOptions` in `packages/rrweb/src/types.ts` and its defaults in `packages/rrweb/src/record/index.ts`). List every option that masks, blocks, ignores or redacts anything, with its default value. Then find every wrapper package, framework integration, or hosted client that calls the core recorder and list the defaults it overrides. These lists drive the configuration matrix below.

### Step 2. Enumerate sinks

List everything that can carry data off the page. Grep for the emit path and follow it outward:

- the top-level emit or send callback and any batching, compression or transport layer behind it
- full-snapshot serialisation (initial DOM walk)
- incremental mutation records (child list, attributes, character data)
- input or form-state observers
- pointer, touch, scroll, viewport, selection and focus observers
- stylesheet and adopted-stylesheet observers, font observers
- canvas, WebGL, image, video and audio capture
- iframe and shadow-root recorders (they often re-enter the snapshot with their own options object)
- plugins: console, network, error, performance, custom events
- page metadata: URL, title, referrer, meta tags, viewport size

Write the sink list into your output before tracing anything. Each sink gets an id you reference from findings.

### Step 3. Trace each sink back to its sources

For each sink, find every value it emits and trace where that value is read from: a DOM property (`value`, `checked`, `selected`, `textContent`), an attribute, computed style, a stylesheet rule, a URL, a network body, a console argument, or an event coordinate. For each source, answer:

1. Which masking, blocking or ignore check runs on this path? Name the function and `file:line`.
2. Which options drive that check, and what are their defaults in each package?
3. Does the masked output still carry information (length, magnitude, timing, presence, which element changed)?
4. Does a second path emit the same data with a different check, or none? Compare snapshot versus mutation versus input observer versus plugin.

### Step 4. Walk the taxonomy

After the sink trace, go through `taxonomy.md` class by class and run its greps. The grep pass catches what the trace missed. Anything new it surfaces gets traced like a sink in step 3.

### Step 5. Build the configuration matrix

Evaluate each finding under at least these configurations:

| Config id | Meaning |
|-----------|---------|
| `targeted` | The configuration a careful integrator would write to get maximum fidelity with full privacy, using the SDK's most specific documented options: mask or block exactly the elements labelled `secret`, `personal` and `third-party`, and nothing labelled `public`. Use block for `secret` widgets when the SDK has no finer option. Documented hooks may be used to choose which elements are masked, but the masked output is the SDK's built-in mask: its length leaks are privacy findings, and what a constant mask would cost is shown by `strictest-custom`. Write down the exact options object. This is the most important config: privacy leaks under it are leaks the integrator cannot fix, and fidelity losses under it are losses the integrator cannot avoid. |
| `default-core` | Core recorder with no options passed. |
| `default-<wrapper>` | Each wrapper or hosted client with no options passed (one row per wrapper that changes defaults). |
| `strictest` | Every built-in masking, blocking and ignore option set to its most private value: mask all inputs, mask all text, block all media and canvas, strip URLs, disable console and network capture or set them to their most redacted mode. Use no custom mask functions: this is what an integrator gets from documented switches alone. Leave sampling and event-type switches (such as turning off mouse moves) at their defaults, and mention in the finding's `fix` when one of them would stop the leak. Write down the exact options object you used. |
| `strictest-custom` | `strictest` plus every custom mask hook the SDK offers (for rrweb, `maskInputFn` and `maskTextFn`) set to return a constant such as `*`. This shows what the hooks can fix. |
| `custom-nonconstant` | `strictest` without the ignore options (ignored inputs emit no input events, so the channel would never show), plus custom mask hooks that return a value derived from the input but coarser than it: a length bucket (`"*".repeat(Math.ceil(len / 8) * 8)`), a hash, or a type label. Used for timing and deduplication channels (taxonomy class 3), since hooks like these are what integrators and proposed SDK changes use. |
| `constant-mask` | `strictest` without the ignore options, plus custom mask hooks that return a constant. Shows what a length-hiding mask achieves on its own, and which length channels remain (typing duration, field scroll offset, unmasked value attributes). |
| `strictest-block` | `strictest` plus the container of the widget under test added to the block option. Used for patterns in `patterns.yaml`: blocking is what a careful integrator does for a PIN pad, so it must hold. |
| `opt-in:<option>` | Default config plus the one non-default option the leak depends on (for example enabling a plugin or `recordCanvas`). One config per option. Run it only on the pages that exercise that option. |

A finding that leaks under `targeted` and `strictest` cannot be stopped by any documented option. A finding that leaks under `targeted` but not `strictest` can only be stopped by giving up fidelity on public content. Report the fidelity cost of that trade in the finding.

### Step 6. Differential test

This step is mandatory. Run it with the runner in [`runner/`](runner/README.md) whenever an adapter exists for the SDK or you can write one. The runner does items 1 to 6 below without spending model tokens: it serves the fixture pages, drives each journey with both hidden values under every config, normalises and diffs the events, and writes `summary.md` (one row per pattern, one column per config, the differing channels in each cell) and `results.json` (sample lines per cell). Read `summary.md`, open `results.json` only for the cells you trace, and spend your effort on item 7 and on tracing differences to code. Write a new fixture only for a pattern the runner reports under "Not run", or for a code path specific to this SDK.

Without the runner, do every item by hand. Build the composite test pages listed under `pages:` in `patterns.yaml` as `patterns.md` describes, plus one page per leak class whose code track left open questions. For each page:

1. Pick two hidden values that differ in every property an attacker could care about: content, length, magnitude, and position on any keypad or list (for a PIN pad, `1397` and `8240`; for a name, `Al` and `Bartholomew`).
2. Script the same user journey for both values with realistic input: real pointer movement with intermediate steps (puppeteer `page.mouse.move(x, y, { steps: 10 })`), real clicks, real key presses with a fixed delay between them, focus moves, and touch where the pattern is touch-first. Scripted `element.click()` or setting `.value` skips the pointer and keyboard paths and will miss leaks. Launch the browser with a fixed locale and time zone (for example `--lang=en-US` and `TZ=UTC`) so date and number fields parse the same way in every run. Where the automation cannot drive a control with real input (native `select` popups, colour pickers), set it through the automation API and say so in `method_note`.
3. Record both runs under `targeted`, `strictest`, `strictest-block`, `strictest-custom` and each default config, plus `custom-nonconstant` for typed fields.
4. Normalise the two event streams: drop absolute timestamps, keep the gaps between events, keep node ids, coordinates, event types, mutation contents and event counts.
5. Diff them. Every remaining difference is a leak of the hidden value until you explain it. For each difference, name the event field and trace it to the code that emits it. That trace is the finding's `path`.
6. Write one driver script that takes a page, a journey per hidden value and a list of configs, runs every combination, and writes the normalised diff to a file. Read the diffs, and open raw event streams only to trace a difference. Group related patterns on one page where they do not interfere.
7. Then ask whether the attacker can recover the value from one recording alone, using knowledge of the page layout. Map node ids to DOM positions, coordinates to element boxes, and event counts to lengths. If you can recover the value, say so in the finding and show the recovery.

### Step 6b. Fidelity check

The runner does an end-state check: after the journeys it takes a full snapshot and compares the text and image source of every element labelled `public` with the live page, matched by `data-audit-id`, and lists mismatches under "Fidelity" in `summary.md`. Only labelled elements are compared, so label every element you want checked. The runner does not check replay over time, hover, animation or layout; check those by hand under `targeted` for the pages where the end-state check or the code track suggests a problem.

Use the `targeted` recordings from step 6 and one unrecorded load of each page.

1. Replay each recording, or rebuild the DOM from its full snapshot and mutations, and compare it with the live page element by element.
2. Every element labelled `public` must match: text, attributes, styles, images, size and position, and its interactions (hover, click, scroll, animation). Each mismatch is a fidelity finding: name what was lost and the option or code that removed it.
3. Every element labelled `secret`, `personal` or `third-party` must keep its box and position, so the replay keeps its layout. A placeholder that changes the layout of public content around it is a fidelity finding.
4. Repeat for `strictest` and note what extra fidelity it costs compared with `targeted`. That difference is the price of the SDK's coarse options, and it belongs in the `fix` of every privacy finding that only `strictest` stops.
5. Note any global switch (such as turning off all mouse moves, all canvas, all CSS inlining) that is the only way to stop a leak. These switches remove public fidelity across the whole page and are fidelity findings in their own right.

### Step 7. Reproduce

A finding is `CONFIRMED` only when you have run it. A reproduction has two parts:

1. a minimal HTML page (inline in the finding) with the element or interaction that triggers the leak, and
2. the recorded event or event sequence, copied from the actual emitted output, that shows the data, under the config you claim leaks.

A differential test from step 6 is a valid reproduction: include both pages or both values and the differing events.

Use the cheapest harness that runs the real code path. In order of preference:

1. the SDK's own test harness, run from a scratch copy (rrweb ships puppeteer integration tests with snapshot fixtures under `packages/rrweb/test/`)
2. a headless browser script that loads a bundle built from the audited ref and collects emitted events
3. a DOM emulator (jsdom, happy-dom) only for serialisation paths that do not depend on layout, events or timing

Batch reproductions: one page and one script can cover several findings. If you cannot run code in your environment, mark the finding `PLAUSIBLE` and give the page and the expected event so someone else can run it.

For timing side channels, the reproduction is a sequence of events with their timestamps showing that the emit pattern depends on the hidden value.

### Step 8. Write the report

Write the findings file in the format of `output-format.md`. Order privacy findings before fidelity findings. Within privacy, order by severity, then by category (`secret`, then special-category `personal`, then `third-party`, then `personal`), then recoverable before partial, then by the most private config they leak under (`strictest-block`, then `strictest`, then `targeted`, then defaults, then opt-ins). Put the sink list and the coverage table in the same file.

### Step 9. Report gaps

This step is mandatory. Follow "Send feedback after you finish" in `feedback.md`. Every finding with `pattern: null` whose leak class greps did not lead you to it is a `missed-leak` report, because these instructions should have found it. So is every leak a person tells you about that the report does not contain.

## Severity

Grade a privacy finding by the category of the data and by what the attacker learns, using the category the data has on real pages. A security question field is `secret` whatever test value you typed into it. "Recoverable" means the attacker can reconstruct the value from one recording. "Partial" means they learn something about it (length, range, first digit, which of a few options, that a box was ticked).

### Privacy findings

| Data category | Recoverable | Partial |
|---------------|-------------|---------|
| `secret` | `critical` under any config | `critical` under any config |
| `personal`, special category | `critical` under `targeted` or stricter; `high` under defaults | `high` under `targeted` or stricter; `medium` under defaults |
| `third-party` | `critical` under `targeted` or stricter; `high` under defaults | `medium` |
| `personal` | `high` under `targeted` or stricter or under defaults | `medium` under `targeted` or stricter; `low` under defaults |

Lower any grade to `low` when the leak needs an opt-in setting whose docs say it captures that data. Raise it one step when the docs claim the leaking config protects that data. When both apply, lower first, then raise.

### Fidelity findings

| Severity | Use when |
|----------|----------|
| `high` | Under `targeted`, public content is lost or altered with no option to keep it (an option that keeps it but exposes private data does not count), or the only way to stop a privacy leak is a global switch that removes public content across the page. |
| `medium` | Under `targeted`, public content is lost or altered unless the integrator adds a workaround the docs do not describe, or a placeholder shifts public layout. |
| `low` | Fidelity is lost only under `strictest` and `targeted` keeps it. |

## Checking a recorder against the `data-privacy` standard

Run this section when the task asks for `data-privacy` conformance. The attribute takes four values, set on any element and inherited by descendants unless a descendant overrides it:

- `mask`: the element's text, input values and privacy-relevant attributes are replaced before they leave the page. Structure may be recorded.
- `block`: the element is replaced by a placeholder of the same size. Nothing inside it is recorded.
- `ignore`: user input in the element is not recorded. The element itself may be.
- `unmask`: the element is recorded in the clear, overriding an inherited `mask`.

Any other value, including an empty string or a value with different case or whitespace, must be treated as `mask`.

For conformance, test each value against every sink from step 2 and each leak class in `taxonomy.md`. Include at least these cases in the reproduction page:

1. each of the four values on a text node container, an `input`, a `select`, a checkbox, a `canvas`, an `img`, an `iframe` and a shadow host
2. nested overrides: `unmask` inside `mask`, `mask` inside `unmask`, `block` inside `unmask`
3. unrecognised values: `data-privacy="Mask"`, `data-privacy=" mask"`, `data-privacy=""`, `data-privacy="hidden"`
4. the attribute added, removed and changed after the full snapshot (mutation path)
5. the attribute on an element inside a same-origin iframe and inside an open shadow root

Report each failure as a normal finding with leak class `data-privacy-conformance` and name the attribute value and sink in the summary.

## Versions across audits

### Affected releases

For each finding, find the oldest release that has the leak:

1. Run `git log -L` or `git blame` on the sink line and the masking check named in `masking_checked`, and find the commit that introduced the leaking behaviour.
2. Run `git tag --contains <commit>` and take the oldest release tag of the package that ships the sink file. In a monorepo, use that package's own tags (`<package>@<version>`); if the code predates the package's first tag, take the oldest tag of any package that shipped the file, including bare version tags from before the repository used package-prefixed tags, and set `affected_since_exact: false`.
3. If the leak is a bypass of a masking option, use the later of the leak commit and the commit that introduced that option. The option is the one named in `masking_checked`.
4. Put it in `affected_since`. If the code moved between files and you cannot trace it past the move, give the oldest tag you verified and set `affected_since_exact: false`.

When the task gives a version range to cover, check that the leak exists at both ends of the range by reading the sink at each tag (`git show <tag>:<path>`).

### Comparing with a previous audit

When you are given an earlier `privacy-audit.json`, match its findings to yours by `fingerprint` and set `status` on each of your findings:

- `new`: no earlier finding has this fingerprint
- `unchanged`: same fingerprint and same `leaks_under`
- `changed`: same fingerprint with different `leaks_under`, `severity` or `verdict`; say what changed in `status_note`

List every earlier fingerprint you did not find again under `resolved`, each with the commit or tag that removed the leak and the `file:line` of the code that now stops it. Re-check a resolved finding by running its earlier reproduction against the new version before you list it. If the reproduction still leaks, it stays a finding.

Line numbers drift between versions. Match on fingerprints, never on `file:line`.

## Versioning

Audit version: 1.0.0

Until the first `audit-v` tag exists, the audit is a pre-release: configs, fields and rules may change while the version stays 1.0.0. From the first tag on, the table below applies.

These files are released together and tagged `audit-v<version>` in `privacy-attribute/spec`. Link to a tag (`https://github.com/privacy-attribute/spec/blob/audit-v1.0.0/audit/AGENTS.md`) when you need reproducible audits, and to `main` when you want the latest checks.

| Change | Version bump |
|--------|--------------|
| Wording fixes that change no check | patch |
| A new pattern, leak class, grep, config or rule, including folded-in feedback | minor |
| A change to the output format, the fingerprint scheme, or a config id | major |

Within one major version, findings files are comparable: fingerprints and config ids keep their meaning, so "Comparing with a previous audit" works directly. Across major versions, fingerprints may change meaning, so re-run each earlier finding's reproduction against the new target and report the result per earlier finding id under `resolved` or as a finding with `status: "changed"`.
