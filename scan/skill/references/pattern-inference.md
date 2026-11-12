# Indirect disclosure

<!-- Generated from scan/patterns/catalog.json by scan/patterns/render.mjs. -->

[Pattern catalog](catalog.md)

Structure, ordering, dimensions, or summaries can reveal the underlying value.

- [inference-01 · A summary exposes a narrow group](#inference-01)
- [inference-02 · Order and presence encode a private state](#inference-02)
- [inference-03 · Length and dimensions survive masking](#inference-03)

### inference-01

**A summary exposes a narrow group**

**Cues.** A count, subtotal, percentage, or empty-state indicator is computed from a filtered set of private records.

**Trace.** Determine whose records are in the denominator, what the viewer already sees, and what changing one person's state does to the output.

**Treatment.** Protect a summary when its recorded value discloses a private fact. Review its number, heading, empty state, and associated tooltip or link independently.

**Counterexample.** A published all-catalog item count can be public even when an adjacent per-customer total is private.

**Verify.** Vary membership in a small synthetic cohort and check what survives in text, attributes, and emitted structural changes.

**Composes with.** [inference-02 · Order and presence encode a private state](#inference-02), [navigation-03 · A link may identify a record or grant access](pattern-navigation.md#navigation-03), [representation-01 · Accessible names reference separate nodes](pattern-representation.md#representation-01).

**Evidence.** Teaching example. No observation is cited.

### inference-02

**Order and presence encode a private state**

**Cues.** Row order, badge styling, enabled actions, or the presence of a section changes when a record property changes.

**Trace.** Read the predicate, comparator, or style mapping. Ask whether a recording can associate the change with a person or record even after text is masked.

**Treatment.** Protect the smallest recorded structure or interaction that reveals the condition. Check retained position, classes, and surrounding public context.

**Counterexample.** Alphabetical order over a published directory and an invariant decorative badge may remain public.

**Verify.** Keep visible strings fixed while changing a private predicate. Compare emitted structure and events under the exact recorder configuration.

**Composes with.** [inference-01 · A summary exposes a narrow group](#inference-01), [inference-03 · Length and dimensions survive masking](#inference-03), [interaction-02 · A public caption identifies a private choice](pattern-interaction.md#interaction-02).

**Evidence.** Teaching example. No observation is cited.

### inference-03

**Length and dimensions survive masking**

**Cues.** A field uses length-preserving masking, grows to fit its content, or leaves a measured block placeholder.

**Trace.** Identify dimensions or masked lengths influenced by the value and check what the deployed recorder emits. Include nearby elements whose positions change with the private content.

**Treatment.** Use protection sufficient for the relevant disclosure. Where fixed geometry or recorder configuration is needed, document its scope and fidelity cost.

**Counterexample.** A verified fixed-size placeholder can preserve placement while revealing no content-dependent dimension within the tested states.

**Verify.** Compare different-length synthetic values and raw events. Use a browser for claims about real layout.

**Composes with.** [representation-04 · A hidden sibling measures private content](pattern-representation.md#representation-04), [controls-04 · Credentials require blocking across states](pattern-controls.md#controls-04), [evidence-02 · A recorder preset can hide patch impact](pattern-evidence.md#evidence-02).

**Evidence.**

- [dom-runtime](../../../research/twenty-runtime-results.md#observed-behavior) — In the Twenty DOM emulator, two API key lengths yielded different masked input lengths before blocking. Actual browser geometry was outside the test.
