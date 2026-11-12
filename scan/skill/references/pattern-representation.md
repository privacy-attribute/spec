# Parallel representations

<!-- Generated from scan/patterns/catalog.json by scan/patterns/render.mjs. -->

[Pattern catalog](catalog.md)

A value can have several copies, including outside visible text.

- [representation-01 · Accessible names reference separate nodes](#representation-01)
- [representation-02 · Styles carry private values](#representation-02)
- [representation-03 · An editor mirrors source into several views](#representation-03)
- [representation-04 · A hidden sibling measures private content](#representation-04)

### representation-01

**Accessible names reference separate nodes**

**Cues.** A field sets a title, accessible name, description, or live announcement. Its visible text may already be masked.

**Trace.** Trace literal attributes and ID references such as `aria-labelledby` to their source and referenced node. Check where tooltip and announcement content is mounted.

**Treatment.** Protect private text and attributes at the destinations the recorder serializes. Preserve fixed instructions and relationships where possible.

**Counterexample.** A static accessibility label such as Search can stay clear beside a record-derived field value.

**Verify.** Inspect attributes, referenced text nodes, tooltip mounts, and announcements before and after a value or focus change.

**Composes with.** [boundary-03 · Overlays mount outside the annotated ancestor](pattern-boundary.md#boundary-03), [controls-02 · A control has recorder-specific scope](pattern-controls.md#controls-02), [controls-03 · A wrapper changes function or public fidelity](pattern-controls.md#controls-03).

**Evidence.** Teaching example. No observation is cited.

### representation-02

**Styles carry private values**

**Cues.** A renderer populates style properties, generated text, class names, or background images from record data.

**Trace.** Identify which style attribute, stylesheet rule, CSS variable, or referenced attribute contains the value. Check the recorder's support for these channels and for style mutations.

**Treatment.** Protect the actual carrier with a supported control. If a shared stylesheet is captured independently, verify a recorder or application-level control for that channel.

**Counterexample.** A fixed icon class and a public branding image can use the same style mechanism without conveying private data.

**Verify.** Change a private style input and inspect emitted attributes, rule changes, and URLs independently.

**Composes with.** [inference-02 · Order and presence encode a private state](pattern-inference.md#inference-02), [navigation-04 · Media and rich content carry private resources](pattern-navigation.md#navigation-04), [integration-03 · Pixel capture bypasses text masking](pattern-integration.md#integration-03).

**Evidence.** Teaching example. No observation is cited.

### representation-03

**An editor mirrors source into several views**

**Cues.** A rich editor has editable content, a source tab, a preview pane, or a read-only representation after save.

**Trace.** Follow the model and submitted value into each native control, contenteditable mount, rendered preview, and error or confirmation echo. Include asynchronous plugins that mount outside the editor.

**Treatment.** Apply supported protection per output. Preserve fixed toolbar labels where the boundary and interaction channel permit.

**Counterexample.** The same editor can render a published help article in read-only mode and a private draft in another context.

**Verify.** Edit, preview, save, and reopen with synthetic text and a private URL. Inspect each emitted carrier separately.

**Composes with.** [boundary-03 · Overlays mount outside the annotated ancestor](pattern-boundary.md#boundary-03), [interaction-01 · Editing paths emit different events](pattern-interaction.md#interaction-01), [navigation-04 · Media and rich content carry private resources](pattern-navigation.md#navigation-04).

**Evidence.**

- [source-review](../../../research/skill-led-review-results.md#what-the-reviews-found) — The Chatwoot source review followed rich-editor content to its mount. It did not verify editor recordings.

### representation-04

**A hidden sibling measures private content**

**Cues.** An autosizing field copies the selected content into a visually hidden node used to measure height or width.

**Trace.** Read the measurement expression, including value and placeholder selection. Resolve the measuring node and its ancestry independently of the primary field.

**Treatment.** Apply the required control to each private copy while preserving unannotated callers and existing layout behavior. Document loss if the same boundary covers fixed placeholder text.

**Counterexample.** A fixed public example in the same shared autosizing component can retain its measurement text.

**Verify.** Check initial, changed, empty, placeholder, and restored states in snapshots and mutations at the measurement node.

**Composes with.** [producer-02 · Fallbacks switch the value's meaning](pattern-producer.md#producer-02), [inference-03 · Length and dimensions survive masking](pattern-inference.md#inference-03), [evidence-01 · Final replay omits an earlier emitted value](pattern-evidence.md#evidence-01).

**Evidence.**

- [dom-runtime](../../../research/twenty-runtime-results.md#why-the-hidden-copy-finding-matters) — The Twenty autogrow sibling exposed private measurement text in a snapshot and mutation. The follow-up covered exercised value and placeholder states in the DOM emulator.
