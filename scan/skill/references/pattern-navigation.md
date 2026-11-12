# Navigation and resource metadata

<!-- Generated from scan/patterns/catalog.json by scan/patterns/render.mjs. -->

[Pattern catalog](catalog.md)

Location, document metadata, links, or resources can carry private data.

- [navigation-01 · Location and route events repeat private data](#navigation-01)
- [navigation-02 · Document metadata lies outside a component](#navigation-02)
- [navigation-03 · A link may identify a record or grant access](#navigation-03)
- [navigation-04 · Media and rich content carry private resources](#navigation-04)

### navigation-01

**Location and route events repeat private data**

**Cues.** A route stores a record ID, search term, selected state, or token in the pathname, query string, or fragment.

**Trace.** Follow location writes and determine which location fields, navigation events, or referrers the recording integration emits. Trace the initiating link and global metadata independently.

**Treatment.** Use a verified route or recorder metadata control for any private location value. Protect rendered anchors separately where required.

**Counterexample.** A static public help route can remain in recorded navigation metadata.

**Verify.** Exercise direct load and in-app navigation with distinct synthetic values. Inspect first snapshot metadata and later route events.

**Composes with.** [navigation-02 · Document metadata lies outside a component](#navigation-02), [navigation-03 · A link may identify a record or grant access](#navigation-03), [integration-01 · Custom event metadata has its own policy](pattern-integration.md#integration-01).

**Evidence.** Teaching example. No observation is cited.

### navigation-02

**Document metadata lies outside a component**

**Cues.** A feature writes a record name or status into a document title, head element, or route metadata.

**Trace.** Find server and client writers, including shared layout fallbacks. Determine when document-level values change and which recorder channels serialize them.

**Treatment.** Protect or remove the private metadata from the captured channel using a verified control. Keep fixed product or navigation text where feasible.

**Counterexample.** A fixed product title can accompany a private heading because the two destinations have different producers.

**Verify.** Switch records and navigate away. Inspect initial document metadata, updates, and any stale intermediate titles.

**Composes with.** [lifecycle-01 · Initial markup precedes the client boundary](pattern-lifecycle.md#lifecycle-01), [lifecycle-02 · Previous data survives a record switch](pattern-lifecycle.md#lifecycle-02), [navigation-01 · Location and route events repeat private data](#navigation-01).

**Evidence.** Teaching example. No observation is cited.

### navigation-03

**A link may identify a record or grant access**

**Cues.** A URL includes an opaque segment, signature, record key, or slug, while its visible label is ordinary text.

**Trace.** Read the route and access contract. Determine whether the URL grants access on possession, points to a record behind separate authorization, or identifies intentionally public content.

**Treatment.** Block a rendered bearer URL as a secret. Independently classify ordinary private identifiers and protect their URL channel as supported by the recorder.

**Counterexample.** A published product slug can resemble a private record identifier while having a public purpose.

**Verify.** Check the source contract and inspect href, navigation metadata, and any copied form with synthetic values.

**Composes with.** [audience-02 · Private preview shares a public renderer](pattern-audience.md#audience-02), [navigation-01 · Location and route events repeat private data](#navigation-01), [controls-04 · Credentials require blocking across states](pattern-controls.md#controls-04).

**Evidence.** Teaching example. No observation is cited.

### navigation-04

**Media and rich content carry private resources**

**Cues.** A link, image, embed, or rendered rich text uses private text, attributes, or resource URLs.

**Trace.** Find the original values and each serialized carrier, including href, src, srcset, inline styles, and embedded output. Determine what sanitization changes and what recorder channels remain.

**Treatment.** Block the smallest native boundary that covers a private resource or unsupported rich-content channel. Protect related text or separately captured resources independently.

**Counterexample.** A fixed public branding image can use the same rendering and sanitization pipeline.

**Verify.** Inspect emitted attributes, additions, and updates. Retain a public resource that uses the same component as a control.

**Composes with.** [representation-02 · Styles carry private values](pattern-representation.md#representation-02), [boundary-02 · An embedded root has its own capture boundary](pattern-boundary.md#boundary-02), [navigation-03 · A link may identify a record or grant access](#navigation-03).

**Evidence.**

- [dom-runtime](../../../research/twenty-runtime-results.md#observed-behavior) — The Twenty emulator captured private mailto URLs before the source proposal. In the exercised fixture, blocking removed private links and the public caller's URLs remained.
