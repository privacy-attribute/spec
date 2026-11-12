# Control selection and fidelity

<!-- Generated from scan/patterns/catalog.json by scan/patterns/render.mjs. -->

[Pattern catalog](catalog.md)

An annotation needs the right placement, recorder support, and public boundary.

- [controls-01 · Prop merges drop or override protection](#controls-01)
- [controls-02 · A control has recorder-specific scope](#controls-02)
- [controls-03 · A wrapper changes function or public fidelity](#controls-03)
- [controls-04 · Credentials require blocking across states](#controls-04)
- [controls-05 · Mask private text and supported input values](#controls-05)

### controls-01

**Prop merges drop or override protection**

**Cues.** A component accepts outer props, nested native props, defaults, or a computed class alongside an existing privacy marker.

**Trace.** Read spread and merge order and locate the native receiver. Check whether defaults, slot props, or state-specific classes replace a stronger control or place it on a different element.

**Treatment.** Forward protection through the supported API and preserve stronger existing controls. Resolve any duplicate or contradictory values at the actual native destination.

**Counterexample.** A styled native element can forward extra props as intended when the implementation and DOM confirm it.

**Verify.** Inspect final native attributes in every relevant branch.

**Composes with.** [boundary-01 · One component renders several native hosts](pattern-boundary.md#boundary-01), [boundary-04 · Public and private callers share a renderer](pattern-boundary.md#boundary-04), [controls-02 · A control has recorder-specific scope](#controls-02).

**Evidence.**

- [source-review](../../../research/skill-led-review-results.md#what-the-reviews-found) — Twenty source proposals followed nested props after finding that TextInput does not forward arbitrary top-level attributes to the input.

### controls-02

**A control has recorder-specific scope**

**Cues.** A recorder recognizes a marker, class, selector, option, or adapter setting that appears to provide privacy protection.

**Trace.** Identify the exact implementation and deployment configuration. Check precedence, inheritance, text and attribute support, and which events and embedded roots are handled.

**Treatment.** Choose controls whose demonstrated scope covers every private carrier. Keep independent channels open when support is unknown or configuration is unavailable.

**Counterexample.** Two integrations can use the same word mask while applying it to different attributes or event types.

**Verify.** Run an exercised positive and private case for each relevant channel under the same deployment settings.

**Composes with.** [boundary-02 · An embedded root has its own capture boundary](pattern-boundary.md#boundary-02), [interaction-02 · A public caption identifies a private choice](pattern-interaction.md#interaction-02), [evidence-02 · A recorder preset can hide patch impact](pattern-evidence.md#evidence-02).

**Evidence.** Teaching example. No observation is cited.

### controls-03

**A wrapper changes function or public fidelity**

**Cues.** A new wrapper or ancestor control would cover a private field along with public hints, buttons, rows, or associated labels.

**Trace.** Inspect native semantics, form association, layout, focus, and event wiring. Identify the smallest existing valid host and which public material would share its boundary.

**Treatment.** Use an adequate boundary that preserves behavior and useful public content. Document an unavoidable public loss with its scope.

**Counterexample.** An existing native wrapper containing only a private value may provide the required protection without adding markup.

**Verify.** Check public labels and actions, focus, keyboard behavior, and layout alongside recording protection.

**Composes with.** [representation-01 · Accessible names reference separate nodes](pattern-representation.md#representation-01), [controls-05 · Mask private text and supported input values](#controls-05), [evidence-03 · A fixture bypasses part of the real flow](pattern-evidence.md#evidence-03).

**Evidence.** Teaching example. No observation is cited.

### controls-04

**Credentials require blocking across states**

**Cues.** A field or widget handles passwords, API keys, recovery codes, signed access links, or other values that grant access.

**Trace.** Follow creation, hidden and revealed views, regeneration, and copy or download. Include input events, error echoes, and other outputs carrying the same credential.

**Treatment.** Block each rendered credential destination. Verify separate controls for captured interactions, resource metadata, or exported payloads that the block cannot cover.

**Counterexample.** A fixed documentation sample can remain public once its nonfunctional purpose is established.

**Verify.** Exercise distinct synthetic secrets across states. Check blocked structure, input events, and surviving fixed public controls.

**Composes with.** [inference-03 · Length and dimensions survive masking](pattern-inference.md#inference-03), [interaction-03 · An action exports a private payload](pattern-interaction.md#interaction-03), [navigation-03 · A link may identify a record or grant access](pattern-navigation.md#navigation-03).

**Evidence.**

- [dom-runtime](../../../research/twenty-runtime-results.md#observed-behavior) — Twenty's blocked API-key input and its scripted input events disappeared in the DOM emulator. The adjacent Copy control survived.

### controls-05

**Mask private text and supported input values**

**Cues.** A native text node or text-entry control shows or collects information about the viewer or another party.

**Trace.** Locate the element containing the text or value. Check how the recorder handles text, native values, input events, placeholders, and accessible descriptions.

**Treatment.** Mask private text and supported input values at the smallest adequate native boundary. Add supported protection where attributes or event channels remain readable.

**Counterexample.** A fixed prompt or public navigation label can remain clear beside an internal record or private search query.

**Verify.** Check initial content, updates, relevant editing events, and a nearby public control.

**Composes with.** [interaction-01 · Editing paths emit different events](pattern-interaction.md#interaction-01), [representation-04 · A hidden sibling measures private content](pattern-representation.md#representation-04), [controls-02 · A control has recorder-specific scope](#controls-02).

**Evidence.**

- [dom-runtime](../../../research/twenty-runtime-results.md#observed-behavior) — Twenty's malformed private email fallback was masked as text. The balanced preset independently masked input values and selected attributes.
