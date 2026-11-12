# Runtime DOM ownership

<!-- Generated from scan/patterns/catalog.json by scan/patterns/render.mjs. -->

[Pattern catalog](catalog.md)

Source component boundaries and actual recorder boundaries can differ.

- [boundary-01 · One component renders several native hosts](#boundary-01)
- [boundary-02 · An embedded root has its own capture boundary](#boundary-02)
- [boundary-03 · Overlays mount outside the annotated ancestor](#boundary-03)
- [boundary-04 · Public and private callers share a renderer](#boundary-04)

### boundary-01

**One component renders several native hosts**

**Cues.** A field accepts a slot, render function, or element type and chooses different hosts for edit, view, or error modes.

**Trace.** Follow privacy and styling props through each slot, alias, or branch to the final host. Inspect native descendants and where the value actually lives.

**Treatment.** Place protection on supported hosts for all private modes. Keep placement unresolved when a renderer or forwarding definition is unavailable.

**Counterexample.** A shared styled native element can forward the same privacy attribute in every mode when its implementation establishes that behavior.

**Verify.** Toggle each mode and inspect the emitted attribute, protected value, and any public branch using the same renderer.

**Composes with.** [producer-01 · A schema supplies labels and values](pattern-producer.md#producer-01), [boundary-04 · Public and private callers share a renderer](#boundary-04), [controls-01 · Prop merges drop or override protection](pattern-controls.md#controls-01).

**Evidence.** Teaching example. No observation is cited.

### boundary-02

**An embedded root has its own capture boundary**

**Cues.** An iframe, web component, or separately mounted application contains a private record or interactive tool.

**Trace.** Identify the actual document or shadow root, how content enters it, and whether an outer recorder or separate integration can capture that content.

**Treatment.** Verify the control honored at each capture boundary. Check frame URLs or host metadata even when internal content capture is disabled.

**Counterexample.** An embedded fixed public illustration can use the same hosting mechanism while carrying no private content.

**Verify.** Inspect emitted roots and mutations for the host and embedded content. Include the enabled and disabled modes that the deployment actually supports.

**Composes with.** [navigation-04 · Media and rich content carry private resources](pattern-navigation.md#navigation-04), [integration-03 · Pixel capture bypasses text masking](pattern-integration.md#integration-03), [controls-02 · A control has recorder-specific scope](pattern-controls.md#controls-02).

**Evidence.** Teaching example. No observation is cited.

### boundary-03

**Overlays mount outside the annotated ancestor**

**Cues.** A tooltip, dropdown, modal, toast, or menu moves its content to a portal or independently managed root.

**Trace.** Read how the UI obtains the value and mounts each instance. Verify actual ancestry for closed, open, and remounted states.

**Treatment.** Protect the private overlay destination separately if the call-site boundary cannot reach it. Keep the trigger and fixed controls clear when they carry no private value.

**Counterexample.** A native child inside the same DOM subtree can inherit a verified ancestor control.

**Verify.** Open, close, and reopen the overlay. Inspect additions and updates using the overlay's recorded identity.

**Composes with.** [producer-04 · A child fetches its own records](pattern-producer.md#producer-04), [representation-01 · Accessible names reference separate nodes](pattern-representation.md#representation-01), [lifecycle-03 · A transient update precedes protection](pattern-lifecycle.md#lifecycle-03).

**Evidence.**

- [source-review](../../../research/skill-led-review-results.md#what-the-reviews-found) — Twenty proposals traced private email links through the overflow portal. The runtime fixture did not exercise that parent route.

### boundary-04

**Public and private callers share a renderer**

**Cues.** A shared badge, link, avatar, or field shows different kinds of data depending on which feature calls it.

**Trace.** Inspect representative callers, prop shapes, and the shared implementation. Resolve the native destination for private uses and establish what the public uses intentionally disclose.

**Treatment.** Choose a private call-site boundary or explicit privacy prop. Annotate the shared implementation globally only when the affected destinations all require it or the documented fidelity tradeoff is accepted.

**Counterexample.** A public support address and a private customer email can both render with the same link component.

**Verify.** Compare both callers across initial values, updates, and fallbacks.

**Composes with.** [audience-02 · Private preview shares a public renderer](pattern-audience.md#audience-02), [controls-01 · Prop merges drop or override protection](pattern-controls.md#controls-01), [evidence-03 · A fixture bypasses part of the real flow](pattern-evidence.md#evidence-03).

**Evidence.**

- [dom-runtime](../../../research/twenty-runtime-results.md#observed-behavior) — Twenty's shared email fixture preserved public text and URLs while protecting exercised private variants. The fixture supplied the privacy prop directly.
