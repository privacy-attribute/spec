# Focused review lenses

After the initial source review, use focused passes to challenge its conclusions. Select lenses from observed mechanisms in the content map and source. Instantiate each prompt with actual features, producers, components, states and recorder channels. Do not run six generic reviews or spawn an agent for every pattern card.

Before selection, check the feature for each cue below. A missing implementation is an unresolved cue, not evidence that a lens is irrelevant. Group related checks that share source. Prioritize access-granting values, unrestricted content, alternate destinations and unsupported recorder channels. A small feature may need one combined pass; a complex feature can need several.

## L1 — Meaning and constraints

**Use when:** a value is called public, fixed, enum, generated, aggregate or harmless by type; subjects or publication contexts differ; payload branches have different shapes.

**Prompt:** “Challenge the claimed meaning of `<families>`. Trace their producers and actual constraints. Find substitutions, custom options, external/imported values, unknown discriminator branches, or selected states that change the conclusion. Separate viewer, record subject and intended audience. Cite what proves a public or bounded claim and what remains unknown. Identify which decisions would change.”

**Finish with:** supported classifications or concrete unresolved business context, plus counterexamples that would reverse the decision. Do not change a category because a variable name looks private or because all sampled values look public.

Relevant cards: `audience-01..03`, `producer-01..04`, `inference-01..02`, `interaction-02`.

## L2 — Copies and capture channels

**Use when:** a reviewed fact is formatted, interpolated, mirrored, linked, exported, placed in attributes or passed into a recorder integration.

**Prompt:** “Follow `<facts>` beyond their primary visible fields. Inspect their consumers for text, attributes, accessibility references, tooltips, hidden layout copies, styles, URLs, previews, document metadata and separately captured payloads. Add every source-supported destination that the first review omitted. For each, identify the actual capture channel and whether the proposed control reaches it.”

**Finish with:** a destination ledger linked to existing decisions, or an explicit missing consumer. Do not treat a potential clipboard or network transfer as a proven recording leak; establish whether that channel is captured. A DOM mask supplies no evidence about a separately emitted payload.

For each private resource URL, check the DOM destination and any independent request/resource capture separately. If integration source is absent, retain that specific URL/channel dependency; a general note to check integrations is not a completed trace.

Relevant cards: `representation-01..04`, `navigation-01..04`, `integration-01..03`, `interaction-03`.

## L3 — Placement and shared use

**Use when:** controls cross component APIs, prop spreads or merges; one renderer has several callers; content mounts through portals, slots, frames or other roots.

**Prompt:** “Trace the proposed controls for `<components/callers>` to the native destinations. Check prop forwarding, defaults, overrides, multiple roots and detached mounts. Inspect public and private callers before changing a shared renderer. Show which private destinations remain outside the boundary and which public destinations it would hide.”

**Finish with:** exact supported placement or a named unresolved boundary. Component names and successful source edits are not proof of DOM forwarding. Propose the smallest adequate boundary; when public loss is unavoidable, state it explicitly.

Relevant cards: `boundary-01..04`, `controls-01..03`.

## L4 — States and transitions

**Use when:** a feature loads, edits, reveals, validates, switches identities, changes annotation values, moves nodes or has alternate/fallback renderings.

**Prompt:** “For `<feature>`, derive reachable states and transitions from source. Check first render, unresolved/resolved data, empty/fallback, invalid/error, edited/revealed and record-switch behavior where implemented. Find a path where a private value arrives before protection, survives a switch, or uses a different destination. Define the baseline positive and emitted events needed to verify each suspected gap.”

**Finish with:** concrete state-specific findings and runnable test obligations. Do not invent states absent from the feature, assume the final snapshot represents all previous events, or claim an unexecuted test passed.

Relevant cards: `lifecycle-01..03`, `producer-02`, `interaction-01`, `evidence-01`.

## L5 — Choices, inference and event payloads

**Use when:** finite options, selected state, presence, order, dimensions, summaries or telemetry properties can communicate information without unrestricted visible text.

**Prompt:** “Inspect `<choices/events/summaries>` property by property. Separate fixed option labels or event kinds from selected values, actor/record references and free-form properties. Determine what selection, position, URL, size or event metadata can reveal after text masking. Identify the recorder channel carrying that disclosure and the supported control or unresolved capability.”

**Finish with:** the exact private fact and channel, with a public counterexample. Do not classify all bounded choices as public or all interactions as private. Blocking a DOM subtree does not automatically disable an independent analytics or custom-event stream.

Separate a demonstrated signal from a policy requirement to hide it. Name-length buckets, counts, branch presence and geometry are not automatically prohibited merely because they depend on private inputs. Check the applicable handling rule and recorder contract, including any allowance for length-preserving masks. Record conditional stricter controls and their public cost when policy is unresolved; do not turn every inferred bit into an unconditional block requirement.

Relevant cards: `interaction-02`, `inference-01..03`, `integration-01`, `controls-02`.

## L6 — Public fidelity and claim challenge

**Use when:** reviewing any completed proposal. Keep this pass proportionate to its scope.

**Prompt:** “Challenge `<proposal>` against the scoped source and recorder contract. Which useful public labels, controls, callers or examples are unnecessarily protected? Can the boundary be narrowed while retaining every supported private destination? Which claimed protections rely only on a source match, successful patch, unexecuted flow or masking preset rather than the proposed change? Check the still-unclassified families and destinations the inventory missed.”

**Finish with:** justified public losses, narrower safe placements, corrected evidence claims and remaining scope gaps. Do not remove protection merely to improve visual fidelity. Require baseline positives for each channel/phase credited to a runtime change.

Relevant cards: `controls-03..05`, `evidence-01..03`.

## Reconcile once

Use the existing source/hash evidence format. In `review-map.md` or the decision rationale, record each selected lens's concrete scope and outcome: a new/corrected finding, no new source-supported finding, or an unresolved dependency. Record a short reason for a skipped lens when its apparent cue could otherwise look overlooked. Do not create empty findings to show activity.

Merge duplicate observations about the same fact, destination, channel and state. Preserve disagreements until source or a test resolves them. If independent reviewers are used, let them inspect source before reading the first review's conclusions; then reconcile. Independent agents are optional, not required for every feature.

Turn each accepted finding into a decision, placement change or explicit verification obligation. Use `additional_findings` for destinations absent from the inventory. Keep this compatible with the existing review JSON; lens IDs and content-map context belong in rationale and working notes, not invented required schema fields.

Stop when selected questions have source-backed outcomes and remaining dependencies are named. Reopen only the affected checks when new evidence appears. A completed lens pass is not proof of complete discovery or recording protection; compare additional verified misses and public losses against the previous method before claiming improvement.
