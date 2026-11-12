# Editing and interaction

<!-- Generated from scan/patterns/catalog.json by scan/patterns/render.mjs. -->

[Pattern catalog](catalog.md)

User actions and events can disclose private input or choices.

- [interaction-01 · Editing paths emit different events](#interaction-01)
- [interaction-02 · A public caption identifies a private choice](#interaction-02)
- [interaction-03 · An action exports a private payload](#interaction-03)

### interaction-01

**Editing paths emit different events**

**Cues.** A field can be changed by typing, autofill, paste, composition, selection, or a scripted update.

**Trace.** Determine how each supported path changes the native value and which events or mutations the deployed recorder emits. Check validation and notifications that echo the input.

**Treatment.** Apply supported value protection and an independent event control when an event can still disclose the value. Keep fixed validation instructions clear.

**Counterexample.** An unbound demonstration control can show fixed public text, while the same widget can collect private data in a working form.

**Verify.** Exercise relevant trusted interactions in a browser and inspect recorded value and event channels separately.

**Composes with.** [controls-05 · Mask private text and supported input values](pattern-controls.md#controls-05), [representation-03 · An editor mirrors source into several views](pattern-representation.md#representation-03), [evidence-03 · A fixture bypasses part of the real flow](pattern-evidence.md#evidence-03).

**Evidence.** Teaching example. No observation is cited.

### interaction-02

**A public caption identifies a private choice**

**Cues.** Fixed survey options, lookup results, or keypad buttons display ordinary captions while a selection or sequence carries meaning.

**Trace.** Follow the selected state and events. Check whether recorded target IDs, coordinates, order, or selected classes can be associated with the answer or entered secret.

**Treatment.** Protect or suppress the revealing structure or interaction using supported controls. Preserve public captions when doing so leaves the private choice unobservable.

**Counterexample.** A fixed link to public help can record the same click shape without representing a private choice.

**Verify.** Compare different choices under fixed captions and inspect event sequences and related attributes.

**Composes with.** [inference-02 · Order and presence encode a private state](pattern-inference.md#inference-02), [controls-02 · A control has recorder-specific scope](pattern-controls.md#controls-02), [controls-04 · Credentials require blocking across states](pattern-controls.md#controls-04).

**Evidence.**

- [source-review](../../../research/skill-led-review-results.md#what-the-reviews-found) — Chatwoot source review distinguished public keypad captions from a potentially private interaction sequence. Recorder behavior remained open.

### interaction-03

**An action exports a private payload**

**Cues.** Copy, download, or drag uses private data while its button displays fixed public text.

**Trace.** Follow the action to its callback, clipboard or transfer data, URL, and filename. Identify what the recorder can observe about the action, metadata, and any confirmation.

**Treatment.** Protect captured private destinations and preserve action behavior. Check separate recorder integrations when the payload bypasses native DOM protection.

**Counterexample.** A fixed Copy button can remain visible while its underlying credential field is blocked.

**Verify.** Use synthetic values to check the exact action output and emitted payload separately. State which platform integrations were exercised.

**Composes with.** [controls-04 · Credentials require blocking across states](pattern-controls.md#controls-04), [navigation-04 · Media and rich content carry private resources](pattern-navigation.md#navigation-04), [integration-01 · Custom event metadata has its own policy](pattern-integration.md#integration-01).

**Evidence.**

- [dom-runtime](../../../research/twenty-runtime-results.md#fidelity-and-function) — Twenty's exercised Copy control survived and the real hook passed the exact key to a synthetic clipboard sink. Operating-system clipboard remained untested.
