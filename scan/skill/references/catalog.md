# Session privacy pattern catalog

<!-- Generated from scan/patterns/catalog.json by scan/patterns/render.mjs. -->

This finite working taxonomy contains 39 mechanisms in 11 families. It does not establish coverage of every application, feature, or recorder channel.

Start with the family that explains the observed cue, then follow its crosslinks when a value changes source, state, destination, or recorder channel. Read further families as those changes appear. For each destination, confirm the application meaning, actual boundary, and recorder behavior before deciding treatment.

Use each counterexample to identify the evidence that could change the decision. Mark missing semantic or placement evidence explicitly. Linked source-review and DOM-runtime observations apply to the stated scope. Cards without citations are teaching examples.

| Family | Read when | Cards |
| --- | --- | ---: |
| [Subject and audience](pattern-audience.md) | The viewer, record owner, and intended audience can differ. | 3 |
| [Indirect disclosure](pattern-inference.md) | Structure, ordering, dimensions, or summaries can reveal the underlying value. | 3 |
| [Value producers and derivations](pattern-producer.md) | The rendered expression does not identify every source or transformation. | 4 |
| [Parallel representations](pattern-representation.md) | A value can have several copies, including outside visible text. | 4 |
| [Runtime DOM ownership](pattern-boundary.md) | Source component boundaries and actual recorder boundaries can differ. | 4 |
| [Lifecycle and changing identity](pattern-lifecycle.md) | A transition can expose a value even when the settled view is protected. | 3 |
| [Editing and interaction](pattern-interaction.md) | User actions and events can disclose private input or choices. | 3 |
| [Navigation and resource metadata](pattern-navigation.md) | Location, document metadata, links, or resources can carry private data. | 4 |
| [Capture outside native DOM](pattern-integration.md) | Recorder integrations can emit payloads independently of DOM annotations. | 3 |
| [Control selection and fidelity](pattern-controls.md) | An annotation needs the right placement, recorder support, and public boundary. | 5 |
| [Verification and attribution](pattern-evidence.md) | A clean replay, accepted patch, or passing fixture can leave a claim unverified. | 3 |
