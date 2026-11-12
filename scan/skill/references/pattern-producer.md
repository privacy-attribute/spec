# Value producers and derivations

<!-- Generated from scan/patterns/catalog.json by scan/patterns/render.mjs. -->

[Pattern catalog](catalog.md)

The rendered expression does not identify every source or transformation.

- [producer-01 · A schema supplies labels and values](#producer-01)
- [producer-02 · Fallbacks switch the value's meaning](#producer-02)
- [producer-03 · A transformation retains identifying information](#producer-03)
- [producer-04 · A child fetches its own records](#producer-04)

### producer-01

**A schema supplies labels and values**

**Cues.** A registry maps field descriptors to renderers, and the immediate template only refers to a generic field or value.

**Trace.** Find the active descriptors, value producer, and renderer implementation for each mode. Determine whether labels and option captions are fixed configuration or user-authored records.

**Treatment.** Classify and place protection from the resolved bindings. If the schema or renderer is unavailable, name that dependency and record unresolved decisions at the affected destinations.

**Counterexample.** A public product filter can use the same field factory as a private integration settings editor.

**Verify.** Exercise representative descriptor types and confirm which values, attributes, and interactions the native renderer produces.

**Composes with.** [producer-04 · A child fetches its own records](#producer-04), [boundary-01 · One component renders several native hosts](pattern-boundary.md#boundary-01), [interaction-02 · A public caption identifies a private choice](pattern-interaction.md#interaction-02).

**Evidence.**

- [source-review](../../../research/skill-led-review-results.md#what-the-reviews-found) — The Chatwoot review left dynamic integration forms unresolved pending catalog and FormKit implementation evidence.

### producer-02

**Fallbacks switch the value's meaning**

**Cues.** An empty, invalid, or unavailable value selects another expression for a placeholder, suggestion, preview, or error.

**Trace.** Follow the selection predicate and each fallback producer. Determine whether any branch carries stored data, input, or a fixed instruction, and where each branch renders.

**Treatment.** Protect private branches at every destination. Record the fidelity cost if a verified shared boundary also hides a fixed fallback.

**Counterexample.** A fixed instruction can stay public while a record-derived default shown in the same place is private.

**Verify.** Start populated, clear the field, supply an invalid value, and restore it. Inspect the emitted destination for every supported branch.

**Composes with.** [representation-04 · A hidden sibling measures private content](pattern-representation.md#representation-04), [lifecycle-03 · A transient update precedes protection](pattern-lifecycle.md#lifecycle-03), [controls-05 · Mask private text and supported input values](pattern-controls.md#controls-05).

**Evidence.**

- [dom-runtime](../../../research/twenty-runtime-results.md#observed-behavior) — The Twenty emulator recorded a private placeholder in the hidden autogrow measurement copy before the follow-up. The malformed email fallback was exercised separately.

### producer-03

**A transformation retains identifying information**

**Cues.** The UI truncates, formats, hashes, aliases, or abbreviates a value before placing it in text or an attribute.

**Trace.** Identify retained fragments, whether the output repeats across records or sessions, and what other visible fields let an observer associate it with a subject.

**Treatment.** Protect a derived value that still reveals a private fact or stable private reference. Check full-value copies and interpolation sites separately.

**Counterexample.** A fixed synthetic example or a label independently intended for public display can use the same formatting helper.

**Verify.** Compare multiple inputs and repeated visits. Check whether the serialized representation changes with or consistently identifies the underlying private record.

**Composes with.** [inference-03 · Length and dimensions survive masking](pattern-inference.md#inference-03), [representation-01 · Accessible names reference separate nodes](pattern-representation.md#representation-01), [navigation-03 · A link may identify a record or grant access](pattern-navigation.md#navigation-03).

**Evidence.** Teaching example. No observation is cited.

### producer-04

**A child fetches its own records**

**Cues.** A dialog, row, or page title receives only an ID, visibility flag, or callback at the parent call site.

**Trace.** Follow the child through its context, store, route state, or query hooks. Identify the loaded record and descend to each element that emits its fields.

**Treatment.** Classify child destinations from their producer evidence. Keep fixed parent controls clear where possible and track destinations absent from the structural inventory.

**Counterexample.** A help dialog can receive the same open flag and callback while rendering fixed copy.

**Verify.** Open the child with distinct synthetic records. Inspect loading, resolved, and portal content and identify any dynamically created output.

**Composes with.** [audience-01 · Delegated access changes the subject](pattern-audience.md#audience-01), [boundary-03 · Overlays mount outside the annotated ancestor](pattern-boundary.md#boundary-03), [lifecycle-02 · Previous data survives a record switch](pattern-lifecycle.md#lifecycle-02).

**Evidence.**

- [source-review](../../../research/skill-led-review-results.md#what-the-reviews-found) — The Documenso follow-up added missed title, hover, recipient, autocomplete, and inferred-recipient destinations loaded inside children.
