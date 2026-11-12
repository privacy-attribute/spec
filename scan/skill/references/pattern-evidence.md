# Verification and attribution

<!-- Generated from scan/patterns/catalog.json by scan/patterns/render.mjs. -->

[Pattern catalog](catalog.md)

A clean replay, accepted patch, or passing fixture can leave a claim unverified.

- [evidence-01 · Final replay omits an earlier emitted value](#evidence-01)
- [evidence-02 · A recorder preset can hide patch impact](#evidence-02)
- [evidence-03 · A fixture bypasses part of the real flow](#evidence-03)

### evidence-01

**Final replay omits an earlier emitted value**

**Cues.** The final DOM or playback appears protected, while initial snapshots, mutations, or plugins may have emitted different content.

**Trace.** Connect each claim to the destination's recorded identity and the phase that exercised it. Inspect complete emitted payloads for independently captured channels.

**Treatment.** Report protection for the specific channels and phases with evidence. Track missing emissions or unrelated marker matches as unverified.

**Counterexample.** A scoped first snapshot and identified update event can establish protection for those two exercised observations.

**Verify.** Check snapshots, deltas, and relevant plugin events. Confirm the scorer rejects substituted data from unrelated nodes.

**Composes with.** [representation-04 · A hidden sibling measures private content](pattern-representation.md#representation-04), [lifecycle-03 · A transient update precedes protection](pattern-lifecycle.md#lifecycle-03), [evidence-02 · A recorder preset can hide patch impact](#evidence-02).

**Evidence.**

- [dom-runtime](../../../research/twenty-runtime-results.md#why-the-hidden-copy-finding-matters) — The Twenty scorer was challenged with unrelated text substitutions and now follows recorded measurement node identities.

### evidence-02

**A recorder preset can hide patch impact**

**Cues.** A marker is absent both before and after a source patch, or the patch and recorder settings changed together.

**Trace.** Compare baseline and patched source under the same recorder configuration. Establish that each relevant channel and phase was exercised and distinguish exact values from masked lengths, structure, or events.

**Treatment.** Attribute existing protection and fidelity losses to the controls that produced them. Record the patch contribution only where the comparison supports it.

**Counterexample.** A source block can remove a native node and its events even when a preset already masks its value.

**Verify.** Use matching runs, baseline positives, and public controls.

**Composes with.** [inference-03 · Length and dimensions survive masking](pattern-inference.md#inference-03), [controls-02 · A control has recorder-specific scope](pattern-controls.md#controls-02), [evidence-01 · Final replay omits an earlier emitted value](#evidence-01).

**Evidence.**

- [dom-runtime](../../../research/twenty-runtime-results.md#fidelity-and-function) — The balanced Twenty preset already masked input values. The source block's observed contribution was removal of the key input subtree and scripted input events.

### evidence-03

**A fixture bypasses part of the real flow**

**Cues.** A runtime fixture supplies props directly, replaces an integration, or uses a scripted event in place of a platform interaction.

**Trace.** Identify the component and recorder revisions, adapters, omitted producers, and actual events exercised. Tie every result to that execution scope.

**Treatment.** Keep source, fixture, browser, and complete application results explicit. Record which claims still need the real route, platform behavior, or deployment configuration.

**Counterexample.** A fixture that runs a real component and recorder can establish an emitted result for the component's supplied inputs.

**Verify.** Check output and callbacks, preserve public controls, and rerun unresolved claims through their real entry points.

**Composes with.** [boundary-03 · Overlays mount outside the annotated ancestor](pattern-boundary.md#boundary-03), [interaction-01 · Editing paths emit different events](pattern-interaction.md#interaction-01), [evidence-01 · Final replay omits an earlier emitted value](#evidence-01).

**Evidence.**

- [dom-runtime](../../../research/twenty-runtime-results.md#execution-and-provenance) — The Twenty fixture used pinned components and recorder with declared adapters. It did not exercise the production route or operating-system clipboard.
