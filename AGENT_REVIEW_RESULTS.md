# Skill-led privacy review: implementation and results

Local draft `0.3.0-dev.0`, evaluated 2026-11-11. The skill-led workflow is implemented and has been exercised on pinned source samples from Documenso, Chatwoot, Immich, Akaunting and Twenty CRM. It produces useful, concrete proposals. This evaluation does not establish full-application accuracy or recording protection.

This report preserves the source-review pass. The subsequent [bounded Twenty runtime evaluation](RUNTIME_REVIEW_RESULTS.md) records actual emitted events in a DOM emulator, identifies and fixes a hidden measurement-copy leak, and distinguishes those results from the still-unexecuted browser check.

The recorder operator remains responsible for recording contents. These checks do not establish legal compliance. No commit, push, release or external report was made. The upstream application sources were kept unchanged.

## What changed

The primary workflow is now a source review guided by examples, counterexamples and verification questions. The agent establishes meaning and audience, follows producers and component implementations, distinguishes recorder channels, and proposes the smallest adequate treatment. Patterns cover credentials, viewer and third-party records, shared presentation, components loading their own records, conditional UI, media, URLs, inputs and notifications.

Supporting tools provide:

- A deterministic rendering inventory with explicit unsupported paths, without privacy classification.
- Bounded source context and exact file hashes.
- Evidence validation, explicit unresolved and missing decisions, and native proposals.
- Exact framework edits with non-overlapping replacements, source evidence, syntax checks and isolated Git application.
- Separate comparison of frozen semantic predictions against source labels.

The entry point is [the implementation prompt](scan/PROMPT.md). See [workflow commands and output contracts](scan/README.md#skill-led-review). The existing heuristic scanner remains available as a baseline. The new workflow uses the coding agent already running; it does not require a new autonomous agent launcher or install a personal skill.

## Application exercise

Reviews used separate model reviewers. Initial predictions were produced without access to expected labels. Original predictions and subsequent corrections are retained separately. A second reviewer independently examined a smaller Twenty sample. No human adjudication is claimed.

The table reports the latest full inventory in each reviewer directory. Private sites are reviewed source channels, not unique people, fields or proven recorder protections. Unresolved semantics and unresolved placement are separate: a decided private value may still have no verified native patch.

| App | Scoped rendering files | Sites with decisions | Decided private sites | Unresolved semantic decisions | Latest additional exact source proposal |
| --- | ---: | ---: | ---: | ---: | --- |
| Documenso | 40 | 1,099 | 139 | 105 | 33 replacements in 16 files after focused follow-up |
| Chatwoot | 59 | 1,155 | 100 | 314 | 41 replacements in 23 files |
| Immich | 5 | 139 | 12 | 26 | Reviewed alternative in one file |
| Akaunting | 8 | 144 | 22 | 27 | Reviewed alternative in two files |
| Twenty CRM | 25 | 374 | 44 | 107 | 43 replacements in 18 files |

All five current reviews passed evidence/schema validation with zero missing IDs. The Documenso follow-up separately reviewed 10 additional destinations in four supplemental rendering files. It did not claim a complete inventory review of those supplemental files. Additional findings and parser limitations remain open in every app's report. Chatwoot and Twenty each have two structural diagnostics; Akaunting has five. These are retained rather than counted as reviewed protection.

Every listed patch passed Git application in an isolated copy. JavaScript/TypeScript source proposals passed Babel syntax parsing. Vue, Svelte and Blade received structural checks, not framework compilation. The Chatwoot reviewer also reconciled its native and exact proposals and checked the combined patch across 37 changed files. Other native and source proposal files can overlap or be alternatives; do not apply both without reconciliation.

### What the reviews found

- **Twenty:** `TextInput` does not forward arbitrary top-level attributes to its native input. The proposals follow nested props and explicit forwarding, preserve private scope through shared link components, and account for email links rendered in overflow portals. The credential wrapper leaves the adjacent fixed Copy button outside its source boundary. Four field proposals acknowledge fixed placeholder or accessibility text that would also be masked. These are source findings, not observed browser behavior.
- **Documenso:** the first review missed private values loaded inside children through context and query hooks. The follow-up added file-title text and hover attributes, recipient inputs and autocomplete suggestions, and inferred recipient information. It also corrected the signing title's audience using the sender/recipient query. The 33-edit proposal was revalidated and applied to an isolated copy.
- **Chatwoot:** the review distinguished public keypad captions from a potentially private interaction sequence, followed rich-editor content to its mount, and protected webhook credentials, imported document fields, automation values and integration metadata. Dynamic integration forms still require unavailable catalog and FormKit implementation evidence. Recorder handling of interaction, clipboard and download paths remains open.
- **Immich:** public login configuration and branding were distinguished from private partner records. A reviewed partner-anchor block avoids redundant descendant masks. External login input implementations still leave placement work unresolved.
- **Akaunting:** source tracing followed company rows and their forwarded attributes. Organization ownership remains disputed for several labels, and an invoice aggregate includes text, routes and tooltip channels requiring different treatments.

The pattern guidance now explicitly covers components that fetch their own records, nested attribute forwarding, hidden measurement text, portal copies, operator-entered search versus stored record values, and public controls whose interactions may reveal private data. These revisions were informed by this sample; they have not received a fresh independent generalization test.

## Frozen prediction comparisons

These counts compare exact source targets and channels where labels provide them. They are diagnostic agreement counts, not accuracy percentages. The older Documenso and Chatwoot labels have unverified legacy provenance and often label an entire component without specifying a channel. A public prop at a component boundary can coexist with private text loaded inside that component. Such a label does not supply a complete answer for every rendering channel.

| App | Agreement | Disagreement | Mixed channels | Unresolved | Unmapped |
| --- | ---: | ---: | ---: | ---: | ---: |
| Documenso | 13 | 23 | 20 | 16 | 9 |
| Chatwoot | 22 | 5 | 9 | 44 | 4 |
| Immich | 11 | 0 | 1 | 2 | 0 |
| Akaunting | 7 | 6 | 0 | 1 | 0 |
| Twenty CRM | 17 | 1 | 0 | 3 | 1 |

No mixed, unresolved or unmapped row receives agreement credit. Explicit channel labels require the exact source line. The evaluator will not borrow a matching decision elsewhere in the element. Original expected labels were not rewritten to improve these scores.

Adjudication identified genuine review misses as well as label-alignment problems. Documenso had three omitted child-loaded flows and an audience error. Twenty's disagreement concerns the operator's search query: both reviews required masking, but the first prediction called it third-party. Six Akaunting disagreements concern organization category while retaining the same treatment. Detailed interpretations are in the retained app evidence. These disagreements prevent a defensible claim that the current skill is already more accurate than the heuristic baseline.

The independent smaller Twenty review reported 15 agreements, one category disagreement, four unresolved destinations and two expected rows outside its direct inventory. Those two rows were separately identified as additional findings. Its independence supports specific findings; it does not establish a general success rate.

## Native placement versus source-supported proposals

The native patcher intentionally has a narrower verification boundary than the agent. It does not count custom-component prop edits as native protection. Source-supported proposals make those edits reviewable without upgrading them to runtime evidence.

| App | Native annotations | Legacy private labels statically covered | Public sites affected by native proposals |
| --- | ---: | ---: | ---: |
| Documenso, original scope | 6 | 5 / 79 | 0 |
| Chatwoot | 51 | 29 / 83 | 30 |
| Immich | 7 | 3 / 6 | 0 |
| Akaunting | 3 | 1 / 7 | 1 |
| Twenty CRM | 0 | 0 / 17 | 0 |

These static counts exclude the broader framework proposals. Zero native coverage for Twenty reflects unresolved shared/styled destinations in the mechanical patcher, while the 43-edit source proposal still passed evidence, syntax and application checks. Neither count measures recording protection. The Documenso focused follow-up separately produced nine native proposals.

Public-site impacts include fixed placeholders, captions or controls sharing a chosen protection boundary. Reviewers supplied an explicit reason when accepting such a loss. Source-supported framework edits have additional qualitative fidelity notes; the native-site count is not a full measure of public UI loss. Native ancestor blocks now eliminate redundant descendant edits only when direct DOM ancestry is verified. Custom components and portals preserve separate checks.

## Verification and boundaries

The final suite passed 169 tests on Node.js 20, 22 and 24. Tests cover exact edits, stale evidence and inventory, output containment, unsupported rendering, public loss, shared callers, native ancestry, malformed source proposals, extension-specific parsing and evaluator misalignment. Test counts establish tool behavior, not semantic accuracy.

Package dry-run includes the skill and review modules and excludes local application evidence. `git diff --check` passed. Source samples were checked against pinned Git blob hashes; supporting manifests preserve fetched definitions. These are scoped source samples, not full application checkouts.

The complete Twenty review also passed through the actual CLI. `review-patch` returned the expected incomplete status with zero invalid or missing decisions and 168 unresolved semantic/placement/finding entries. `review-proposals` checked and applied all 43 exact changes in an isolated copy while retaining `runtime: not-run`. See [CLI verification](local-evidence/agent-review/twenty-cli-session/cli-verification.json).

No upstream app was built or type-checked, and no live app or recorder was exercised in this evaluation. Earlier browser and sandbox launch attempts were blocked by this environment. The retained canary preparation uses rrweb package version `2.1.1` at commit `a4abb9478bd56bcf8ec9658bd7eb0a6c8c6b78f4`, 25 commits after its nearest tag; preparation is not a recording result. The deployed recorder versions of the five apps are unknown. Model token usage and end-to-end cost were not measured.

Remaining work is concrete: resolve listed feature and component gaps, independently adjudicate channel-specific labels, compile the proposed patches against full pinned checkouts, and exercise synthetic private values plus public controls through initial render, editing, reveal, errors, portals and mutation events. Inspect emitted payloads before making protection claims. Only after that should the revised guidance be scored on untouched features or optimized for model cost.

## Reproduction and evidence

Run from this checkout with the retained local sources:

```bash
node --test
node local-evidence/agent-review/measure.mjs
```

The measurement script validates original sample blob hashes, preserves first predictions for label comparison, rechecks current decisions, applies native and source proposals in isolated copies, and writes per-app results. The focused Documenso follow-up has its separate evidence and validation record.

| Evidence | Location |
| --- | --- |
| Consolidated measurements, implementation hash and responsibility statement | [summary.json](local-evidence/agent-review/summary.json) |
| Documenso corrections and exact proposal validation | [second-pass.md](local-evidence/agent-review/documenso/second-pass.md) |
| Chatwoot scope, combined verification and open work | [REVIEW.md](local-evidence/agent-review/chatwoot/REVIEW.md) |
| Immich and Akaunting independent comparisons | [Immich comparison](local-evidence/agent-review/immich/comparison.json), [Akaunting comparison](local-evidence/agent-review/akaunting/comparison.json) |
| Twenty exact proposal and verification | [proposed.patch](local-evidence/agent-review/twenty-review/proposed.patch), [activity.json](local-evidence/agent-review/twenty-review/activity.json) |
| Independent Twenty subset comparison | [comparison.json](local-evidence/agent-review/twenty-small-app-review/comparison.json) |
| Final test logs | [Node 20](local-evidence/agent-review/node20-tests.log), [Node 22](local-evidence/agent-review/node22-tests.log), [Node 24](local-evidence/agent-review/node24-tests.log) |

Pinned app revisions: Documenso `f32ab10dc7189d3c375fc112469cbb156c9adb6f`; Chatwoot `5dedc3a8b1d2ca223605841e5f1cda5efed13e66`; Immich `bc0c9bb1c076a9ecdfd745a437e7d97ec4d5dbeb`; Akaunting `0d35012996a73fa3513e3f9996a159b028add1b6`; Twenty `0036a6f7f9d3d5112d03c9c3f142f66c09224ff7`.
