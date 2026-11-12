# Capture SDK privacy audit

Audit one SDK that records a web page or its interactions. Examples include session recorders and product analytics libraries.

Read these files before you start:

- [`patterns.md`](patterns.md) and [`patterns.yaml`](patterns.yaml): the high-risk UI patterns that you must test, such as PIN pads, one-time-code inputs and password reveal toggles. The files also give the channels that the patterns leak through and the composite pages that hold the patterns. Query the YAML file. Do not read it from start to end.
- [`taxonomy.md`](taxonomy.md): the leak classes that you must cover, and the text to grep for in each class.
- [`output-format.md`](output-format.md): the exact shape of your findings file.
- [`feedback.md`](feedback.md): how to get reports of leaks that earlier audits did not find, and how to report what these instructions did not find.

If you got a link to these files, read each file from the same tag or commit as this file. Then the set is consistent. Record the link in `audit_source` in your output.

## Responsibility

These instructions and audit results are provided as is, without warranty. An audit can miss leaks and can misjudge recording fidelity. The implementer is responsible for recorder configuration, recording content, and legal and contractual compliance.

Save a local draft for each gap in these instructions. A gap is one of these items:

- a leak or fidelity loss that the instructions did not lead you to
- a false positive that the instructions caused
- a step that was unclear or impractical

Follow step 9 and [feedback](feedback.md) to draft each report.

Start the prose summary of each audit with the disclaimer above, word for word. Copy the disclaimer into the `disclaimer` field of the findings file.

## Objective

Assess privacy and fidelity together. Report these findings:

- each way that a person with the recording can learn data that the page should keep from them (privacy findings)
- each place where the SDK, or the only configuration that stops a leak, removes content or behaviour that carried no private data (fidelity findings)

Give evidence for each finding. Propose the fix that keeps the most public content. State what public content or behavior the fix changes.

## Threat model

Assume that the attacker:

- has the full recording, with each event, timestamp, node id and coordinate
- can load the same page without the recorder, and thus knows its layout, DOM order, labels and behaviour
- knows the SDK, its version and its config
- can combine recordings from many sessions and many users

A value is protected only when the recording is the same for each possible value. A mask that replaces characters closes only one channel of many. Each of these items can also show the value:

- the element that the person clicked
- the path of the pointer
- the number of events, and the time of each event
- the other changes on the page that the input caused
- the size of elements

Treat each of these items as a leak until a test shows that the recorder protects the value.

## Data categories

Each item on a page is in one of four categories. Each category gets a different treatment. Before you record, label each element on your test pages with its category. The labels are your ground truth for privacy and for fidelity.

| Category | What it is | Examples | What may reach the recording |
|----------|------------|----------|-------------------------------|
| `secret` | Credentials and authenticators: data that gives access or moves money if another person learns it | password, PIN, one-time code, card number, CVV, security answer, recovery phrase, API key, session token in a URL | Nothing that depends on the value: no content, length, magnitude, timing, key count, clicked key, pointer position inside the widget, or echo. The recording may contain the existence of the widget, its outer box, and focus when it enters or leaves the widget as a whole. |
| `personal` | Data about the recorded person, which they type or the page shows to them | their name, email, address, date of birth, account balance, order history, form answers, consent choices | No content. The recording may contain structure, layout and interactions if they do not show the value (see partial leaks under Severity). Special categories (health, sex life or orientation, religion, political views, ethnicity, biometrics, union membership, criminal records) get the same rules as `secret` for partial leaks. |
| `third-party` | Personal data about other people that the page shows to the recorded person: the other users or customers of the site | a support agent's CRM view of customers, an admin user table, chat messages from others, contact lists, comments with names, shared documents | Same rules as `personal`. These people never interacted with the recorder and cannot consent. Thus, input masks never protect them: their data is page text, attributes and images. |
| `public` | Content that is the same for each visitor and identifies nobody | navigation, labels, headings, marketing copy, product names and prices, help text, icons, layout, styles, animations | Everything, exactly. If the SDK masks, blocks or drops public content, that is a fidelity finding. |

Rules for the categories:

1. The data sets the category. The element type does not set it. For example, a text node can be `third-party`. A `select` of countries holds `personal` data after the person chooses a value. The label next to a secret field is `public`.
2. When content has more than one category (for example, the heading "Orders for Jane Doe"), the full node gets the most private category in it. Report a fidelity finding only when the SDK cannot mask such a node at a finer grain than the page allows.
3. Free-text input that the person types is `personal` at minimum, also in a field for public data. People type personal data into all types of fields.
4. An interaction gets the category of the data that it shows. A click on a public "Next" button is `public`. A click on a PIN key is `secret`. A click on one answer of a health questionnaire is `personal`, special category.

## Ground rules

1. Use the target repository as read-only. Do not commit, switch branches, stash, or edit tracked files. To build or run code, copy the source that you need into a scratch directory. Do the work in that directory.
2. Audit the revision that the request names. If the working tree has uncommitted changes or is on a feature branch, extract the requested ref (for example `git archive <ref> | tar -x -C <scratch>`). Then audit that copy.
3. Each finding must have a source-to-sink path through real code, with `file:line` references. A difference that the differential test (step 6) finds counts after you trace the field that differs back to the code that emits it. Remove each finding that has no path.
4. Cover each leak class and fidelity class in `taxonomy.md`. Cover each pattern in `patterns.yaml`. If a class or pattern has no finding, write this in the coverage section of your output. Name the code or test that cleared it.
5. Record your uncertainty in the verdict field. Do not make the findings in the prose softer or less certain.
6. Run code. A code review that runs no code does not find most inference leaks. If your environment cannot run a headless browser, write this at the top of the report. In that case, each finding is `PLAUSIBLE`.

## Method

The audit has two tracks. Do the two tracks. The code track (steps 1 to 5) starts at the places where data leaves the page, and goes backward from them. Do not read the codebase from start to end. The mask logic is usually small and central, and the leaks are on the paths that go around it.

The differential track (step 6) records real pages two times with different hidden values, and diffs the output. It finds the inference leaks that the code track does not show. The fidelity check (step 6b) compares the same recordings with the live page, to find the content that the recording lost.

### Step 0. Pin the version

Each result in the report is true for one exact version of the SDK. Before you read code, record these items in the `target` block of the output:

- the repository, the ref that the request names, and the full commit SHA that it resolves to
- the nearest release tag (`git describe --tags <sha>`), and the number of commits from that tag to the audited commit
- the name and `version` field of each package that records, wraps or configures recording (from each `package.json` or equivalent manifest)
- the version of these audit instructions (the `Audit version` line at the end of this file)

If the request names a published version (for example `rrweb@2.2.0` on npm), find its release tag. Audit that tag. Users run the published code. Thus, when the request allows a release tag or a branch head, use the release tag.

To check accepted feedback, follow `feedback.md`. Each accepted report you load becomes an extra pattern for step 6.

### Step 1. Find the configuration surface

Find the options type. For rrweb, this is `recordOptions` in `packages/rrweb/src/types.ts`, with its defaults in `packages/rrweb/src/record/index.ts`. List each option that masks, blocks, ignores or redacts anything, with its default value. Then find each wrapper package, framework integration and hosted client that calls the core recorder. List the defaults that each one overrides. These lists are the input for the configuration matrix in step 5.

### Step 2. Enumerate sinks

List each sink, that is, each part that can send data out of the page. To find the sinks, grep for the emit path and follow it outward. The sinks include:

- the top-level emit or send callback and each batching, compression or transport layer behind it
- full-snapshot serialisation (initial DOM walk)
- incremental mutation records (child list, attributes, character data)
- input or form-state observers
- pointer, touch, scroll, viewport, selection and focus observers
- stylesheet and adopted-stylesheet observers, font observers
- canvas, WebGL, image, video and audio capture
- iframe and shadow-root recorders (these often enter the snapshot again with their own options object)
- plugins: console, network, error, performance, custom events
- page metadata: URL, title, referrer, meta tags, viewport size

Write the sink list into your output before you trace anything. Give each sink an id. Use that id in the findings.

### Step 3. Trace each sink back to its sources

For each sink, find each value that it emits. Trace where the sink reads each value from. The source can be a DOM property (`value`, `checked`, `selected`, `textContent`), an attribute, computed style, a stylesheet rule, a URL, a network body, a console argument, or an event coordinate. For each source, answer these questions:

1. Which mask, block or ignore check runs on this path? Name the function and `file:line`.
2. Which options control that check, and what are their defaults in each package?
3. Does the masked output still carry information (length, magnitude, timing, presence, which element changed)?
4. Does a second path emit the same data with a different check, or with no check? Compare the snapshot, the mutation path, the input observer and the plugins.

### Step 4. Walk the taxonomy

After the sink trace, go through `taxonomy.md` one class at a time, and run the greps of each class. The greps find items that the trace did not find. Trace each new item as a sink, as in step 3.

### Step 5. Build the configuration matrix

Test each finding under at least these configurations:

| Config id | Meaning |
|-----------|---------|
| `targeted` | The configuration that a careful integrator writes to get maximum fidelity with full privacy. It uses the most specific documented options of the SDK. Mask or block exactly the elements labelled `secret`, `personal` and `third-party`, and no element labelled `public`. Use block for `secret` widgets when the SDK has no finer option. You may use documented hooks to choose which elements to mask. The masked output is the built-in mask of the SDK: its length leaks are privacy findings. `strictest-custom` shows what a constant mask costs. Write down the exact options object. This is the most important config. Privacy leaks under it are leaks that the integrator cannot fix. Fidelity losses under it are losses that the integrator cannot prevent. |
| `default-core` | The core recorder with no options. |
| `default-<wrapper>` | Each wrapper or hosted client with no options (one row for each wrapper that changes defaults). |
| `strictest` | Each built-in mask, block and ignore option at its most private value. For example: mask all inputs, mask all text, block all media and canvas, strip URLs, and disable console and network capture or set them to their most redacted mode. Use no custom mask functions. This is what an integrator gets from documented switches alone. Keep sampling and event-type switches (such as the switch that turns off mouse moves) at their defaults. If one of them stops the leak, write this in the `fix` of the finding. Write down the exact options object that you used. |
| `strictest-custom` | `strictest`, plus each custom mask hook of the SDK (for rrweb, `maskInputFn` and `maskTextFn`) set to return a constant such as `*`. This config shows what the hooks can fix. |
| `custom-nonconstant` | `strictest` without the ignore options (ignored inputs emit no input events, so the channel never shows). Add custom mask hooks that return a value derived from the input, but coarser than the input. Examples: a length bucket (`"*".repeat(Math.ceil(len / 8) * 8)`), a hash, or a type label. Use this config for timing and deduplication channels (taxonomy class 3), because integrators and proposed SDK changes use hooks like these. |
| `constant-mask` | `strictest` without the ignore options, plus custom mask hooks that return a constant. This config shows what a mask that hides length does alone. It also shows which length channels stay (typing duration, field scroll offset, unmasked value attributes). |
| `strictest-block` | `strictest`, plus the container of the widget under test added to the block option. Use this config for the patterns in `patterns.yaml`. A careful integrator blocks a PIN pad, so the block must hold. |
| `opt-in:<option>` | The default config, plus the one non-default option that the leak depends on (for example a plugin or `recordCanvas`). Use one config for each option. Run it only on the pages that use that option. |

If a finding leaks under `targeted` and under `strictest`, no documented option can stop it. If a finding leaks under `targeted` and does not leak under `strictest`, the only way to stop it removes fidelity from public content. Report the fidelity cost of that exchange in the finding.

### Step 6. Differential test

This step is mandatory. Use the runner in [`runner/`](runner/README.md) when an adapter exists for the SDK, or when you can write one. The runner does items 1 to 6 below and uses no model tokens. The runner:

- serves the fixture pages
- drives each journey with the two hidden values under each config
- normalises and diffs the events
- writes `summary.md` (one row for each pattern, one column for each config, and the channels that differ in each cell)
- writes `results.json` (sample lines for each cell)

Read `summary.md`. Open `results.json` only for the cells that you trace. Put your effort into item 7, and into the trace of each difference to the code. Write a new fixture only for a pattern that the runner reports under "Not run", or for a code path specific to this SDK.

If you cannot use the runner, do each item manually. Build the composite test pages that `pages:` in `patterns.yaml` lists, as `patterns.md` describes. Also build one page for each leak class that has open questions after the code track. For each page, do these steps:

1. Select two hidden values that are different in each property that is important to an attacker. These properties are content, length, magnitude, and position on a keypad or list. For example, use `1397` and `8240` for a PIN pad, and `Al` and `Bartholomew` for a name.
2. CAUTION: A scripted `element.click()` or a `.value` setter skips the pointer and keyboard paths, and the test will not find their leaks.

   Script the same user journey for the two values. Use realistic input:
   - real pointer movement with intermediate steps (puppeteer `page.mouse.move(x, y, { steps: 10 })`)
   - real clicks
   - real key presses with a fixed delay between them
   - focus moves
   - touch, where the pattern is touch-first

   Start the browser with a fixed locale and time zone (for example `--lang=en-US` and `TZ=UTC`). Then date and number fields parse values the same way in each run. If the automation cannot operate a control with real input (native `select` popups, colour pickers), set the control through the automation API. Record this in `method_note`.
3. Record the two runs under `targeted`, `strictest`, `strictest-block`, `strictest-custom` and each default config. For typed fields, also record them under `custom-nonconstant`.
4. Normalise the two event streams. Remove absolute timestamps. Keep the gaps between events, and keep node ids, coordinates, event types, mutation contents and event counts.
5. Diff the two streams. Each difference that remains is a leak of the hidden value until you explain it. For each difference, name the event field and trace it to the code that emits it. That trace is the `path` of the finding.
6. Write one driver script. The script takes a page, a journey for each hidden value, and a list of configs. It runs each combination and writes the normalised diff to a file. Read the diffs. Open raw event streams only to trace a difference. Put related patterns on one page when they do not interfere.
7. Then find out if the attacker can recover the value from one recording alone, with knowledge of the page layout. Map node ids to DOM positions, coordinates to element boxes, and event counts to lengths. If you can recover the value, write this in the finding and show the recovery.

### Step 6b. Fidelity check

The runner does an end-state check. After the journeys, it takes a full snapshot. It compares the text and image source of each element labelled `public` with the live page, matched by `data-audit-id`. It lists the differences under "Fidelity" in `summary.md`.

The runner compares only labelled elements. Thus, label each element that you want it to check. The runner does not check replay over time, hover, animation or layout. Check these items manually under `targeted`, on the pages where the end-state check or the code track shows a possible problem.

Use the `targeted` recordings from step 6 and one load of each page without the recorder.

1. Replay each recording, or rebuild the DOM from its full snapshot and mutations. Compare the result with the live page, one element at a time.
2. Each element labelled `public` must match: text, attributes, styles, images, size and position, and its interactions (hover, click, scroll, animation). Each difference is a fidelity finding. Name the lost content and the option or code that removed it.
3. Each element labelled `secret`, `personal` or `third-party` must keep its box and position, so that the replay keeps its layout. A placeholder that changes the layout of public content around it is a fidelity finding.
4. Do these steps again for `strictest`. Record how much more fidelity `strictest` removes than `targeted`. That difference is the cost of the coarse options of the SDK. Put it in the `fix` of each privacy finding that only `strictest` stops.
5. Record each global switch that is the only way to stop a leak. Examples are a switch that turns off all mouse moves, all canvas, or all CSS inlining. These switches remove public fidelity across the full page. Each one is also a fidelity finding on its own.

### Step 7. Reproduce

A finding is `CONFIRMED` only when you have run it. A reproduction has two parts:

1. a minimal HTML page (inline in the finding) with the element or interaction that causes the leak, and
2. the recorded event or event sequence that shows the data under the config that you say leaks, copied from the actual emitted output.

A differential test from step 6 is a valid reproduction. Include the two pages or the two values, and the events that differ.

Use the least expensive harness that runs the real code path. Use this order of preference:

1. the test harness of the SDK, run from a scratch copy (rrweb ships puppeteer integration tests with snapshot fixtures under `packages/rrweb/test/`)
2. a headless browser script that loads a bundle built from the audited ref and collects the emitted events
3. a DOM emulator (jsdom, happy-dom), only for serialisation paths that do not depend on layout, events or timing

Combine reproductions: one page and one script can cover more than one finding. If you cannot run code in your environment, mark the finding `PLAUSIBLE`. Give the page and the expected event, so that another person can run it.

For timing side channels, the reproduction is a sequence of events with their timestamps. The sequence shows that the emit pattern depends on the hidden value.

### Step 8. Write the report

Write the findings file in the format of `output-format.md`. Put privacy findings before fidelity findings. Sort the privacy findings in this order:

1. by severity
2. by category: `secret`, then special-category `personal`, then `third-party`, then `personal`
3. recoverable findings before partial findings
4. by the most private config that they leak under: `strictest-block`, then `strictest`, then `targeted`, then defaults, then opt-ins

Put the sink list and the coverage table in the same file.

### Step 9. Report gaps

Follow "Draft feedback after you finish" in `feedback.md`. A finding with `pattern: null` is a `missed-leak` report if the greps of its leak class did not lead you to it. The reason is that these instructions should have found it. A leak that a person tells you about, and that the report does not contain, is also a `missed-leak` report.

## Severity

Grade a privacy finding by the category of the data and by what the attacker learns. Use the category that the data has on real pages. A security question field is `secret`, whatever test value you typed into it. "Recoverable" means that the attacker can reconstruct the value from one recording. "Partial" means that the attacker learns some data about the value (length, range, first digit, which of a small number of options, that a box was ticked).

### Privacy findings

| Data category | Recoverable | Partial |
|---------------|-------------|---------|
| `secret` | `critical` under any config | `critical` under any config |
| `personal`, special category | `critical` under `targeted` or stricter, `high` under defaults | `high` under `targeted` or stricter, `medium` under defaults |
| `third-party` | `critical` under `targeted` or stricter, `high` under defaults | `medium` |
| `personal` | `high` under `targeted` or stricter or under defaults | `medium` under `targeted` or stricter, `low` under defaults |

Accepted residual: the time that a person spends in a field (from focus, or from the first input event, to the next event). The recorder cannot hide this time unless it destroys the recording. Report it one time for each audit as `low`, under leak class `keystroke-dynamics`. Grade timing or counts for each keystroke with the usual rules.

Lower a grade to `low` when the leak needs an opt-in setting, and the docs of that setting say that it captures that data. Raise a grade one step when the docs say that the leaking config protects that data. When the two rules apply, lower first, then raise.

### Fidelity findings

| Severity | Use when |
|----------|----------|
| `high` | Under `targeted`, the recording loses or changes public content, and no option keeps it. An option that keeps it but exposes private data does not count. Or, the only way to stop a privacy leak is a global switch that removes public content across the page. |
| `medium` | Under `targeted`, the recording loses or changes public content unless the integrator adds a workaround that the docs do not describe. Or, a placeholder moves the public layout. |
| `low` | The recording loses fidelity only under `strictest`, and `targeted` keeps it. |

## Checking a recorder against the `data-privacy` standard

Use the [draft core](../spec/core.md) as the requirements for this part of the audit. The core defines case-sensitive `mask` and `block` tokens separated by ASCII whitespace. Any `block` token supersedes `mask`, including when classification labels appear in the same attribute. A recorder **MUST** apply the strongest treatment from the node, its ancestors and the recorder policy. It applies `mask` to an empty or unknown-only value, including bare `ignore` and `unmask`. Test any recorder-specific input suppression or reveal control separately.

Run the [browser check](runner/README.md#check-the-privacy-attribute) against the pinned SDK and settings from step 0. Record which checks pass, fail or could not run. Add cases where the fixture leaves gaps in the core requirements:

1. Capture text, input values and the protected attributes in the initial snapshot and in live updates. Verify that `block` omits the whole subtree. Verify that public content remains in the recording.
2. Set `mask` inside `block` and `block` inside `mask`. Use an empty value and values such as `Mask`, ` mask`, and `hidden`.
3. Add, remove and change the attribute during capture. Add new descendants and move an element between parents with different treatments. Inspect emitted events and changes to the replay state.
4. Capture descendants of a shadow host. Check the frame boundary when the recorder includes a frame document in the parent recording.

Report a failed core requirement with leak class `data-privacy-conformance`. Name the attribute value, the capture path and the emitted evidence. Use the taxonomy classes for other capture channels and recorder-specific controls.

## Versions across audits

### Affected releases

For each finding, find the oldest release that has the leak:

1. Run `git log -L` or `git blame` on the sink line and on the mask check that `masking_checked` names. Find the commit that added the leaking behaviour.
2. Run `git tag --contains <commit>`. Take the oldest release tag of the package that ships the sink file. In a monorepo, use the tags of that package (`<package>@<version>`). If the code is older than the first tag of the package, take the oldest tag of any package that shipped the file. This includes bare version tags from before the repository used package-prefixed tags. In that case, set `affected_since_exact: false`.
3. If the leak goes around a mask option, use the later of two commits: the leak commit, and the commit that added that option. The option is the one that `masking_checked` names.
4. Put the tag in `affected_since`. If the code moved between files and you cannot trace it past the move, give the oldest tag that you verified. Then set `affected_since_exact: false`.

When the task gives a version range to cover, make sure that the leak exists at the two ends of the range. To do this, read the sink at each tag (`git show <tag>:<path>`).

### Comparing with a previous audit

When you get an earlier `privacy-audit.json`, match its findings to your findings by `fingerprint`. Set `status` on each of your findings:

- `new`: no earlier finding has this fingerprint
- `unchanged`: same fingerprint and same `leaks_under`
- `changed`: same fingerprint with a different `leaks_under`, `severity` or `verdict`. Write what changed in `status_note`.

Under `resolved`, list each earlier fingerprint that you did not find again. Give each one the commit or tag that removed the leak, and the `file:line` of the code that now stops it. Before you list a resolved finding, run its earlier reproduction against the new version. If the reproduction still leaks, the finding stays a finding.

Line numbers change between versions. Match on fingerprints. Never match on `file:line`.

## Versioning

Audit version: 1.0.0

Until the first `audit-v` tag exists, the audit is a pre-release. Configs, fields and rules may change, and the version stays 1.0.0. From the first tag, the table below applies.

The maintainers release these files together and tag them `audit-v<version>` in `privacy-attribute/spec`. For reproducible audits, link to a tag (`https://github.com/privacy-attribute/spec/blob/audit-v1.0.0/audit/AGENTS.md`). For the latest checks, link to `main`.

| Change | Version bump |
|--------|--------------|
| Wording fixes that change no check | patch |
| A new pattern, leak class, grep, config or rule, including folded-in feedback | minor |
| A change to the output format, the fingerprint scheme, or a config id | major |

Within one major version, you can compare findings files. Fingerprints and config ids keep their meaning, so "Comparing with a previous audit" works directly. Across major versions, fingerprints can change meaning. Thus, run the reproduction of each earlier finding again against the new target. Report the result for each earlier finding id under `resolved`, or as a finding with `status: "changed"`.
