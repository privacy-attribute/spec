# Lifecycle and changing identity

<!-- Generated from scan/patterns/catalog.json by scan/patterns/render.mjs. -->

[Pattern catalog](catalog.md)

A transition can expose a value even when the settled view is protected.

- [lifecycle-01 · Initial markup precedes the client boundary](#lifecycle-01)
- [lifecycle-02 · Previous data survives a record switch](#lifecycle-02)
- [lifecycle-03 · A transient update precedes protection](#lifecycle-03)

### lifecycle-01

**Initial markup precedes the client boundary**

**Cues.** Server rendering, streaming, or bootstrap markup is visible before hydration installs client behavior.

**Trace.** Determine which private data is in the first document and when recording begins. Check whether initial markup and later client renders carry equivalent privacy controls.

**Treatment.** Protect every captured initial destination or verify a recording start policy that excludes it. Check serialized bootstrap data only when an enabled recorder can capture that channel.

**Counterexample.** A fixed public skeleton can appear before an already protected client-rendered record.

**Verify.** Observe the first actual recording snapshot and streaming mutations, then compare after hydration with synthetic data.

**Composes with.** [audience-02 · Private preview shares a public renderer](pattern-audience.md#audience-02), [lifecycle-03 · A transient update precedes protection](#lifecycle-03), [evidence-01 · Final replay omits an earlier emitted value](pattern-evidence.md#evidence-01).

**Evidence.** Teaching example. No observation is cited.

### lifecycle-02

**Previous data survives a record switch**

**Cues.** A screen retains cached or optimistic data during query changes, account switches, or a failed save.

**Trace.** Follow record identity, cache keys, and pending or rollback values. Identify which version appears in the main view, overlays, titles, and notices before the next response.

**Treatment.** Keep protection aligned with the data actually displayed throughout the transition. Resolve destinations for the outgoing, pending, and restored records.

**Counterexample.** An invariant loading skeleton without record-derived attributes can remain clear while the query changes.

**Verify.** Use two identities with different markers. Exercise delayed success, failure, and rollback, and inspect the emitted sequence.

**Composes with.** [audience-01 · Delegated access changes the subject](pattern-audience.md#audience-01), [navigation-02 · Document metadata lies outside a component](pattern-navigation.md#navigation-02), [lifecycle-03 · A transient update precedes protection](#lifecycle-03).

**Evidence.** Teaching example. No observation is cited.

### lifecycle-03

**A transient update precedes protection**

**Cues.** Reveal, lazy rendering, node reuse, or an imperative update adds a value before a selector or marker may take effect.

**Trace.** Identify when the destination mounts, receives the private content, and gains protection relative to recorder observation. Check the transition back to the original state.

**Treatment.** Keep the required control in place when the private node or mutation first becomes observable. Use an independently verified recorder control where a native marker cannot cover that timing.

**Counterexample.** A node created with its final supported protection can keep the same boundary across value changes.

**Verify.** Check first additions and mutations and subsequent reuse, as well as the settled snapshot.

**Composes with.** [lifecycle-01 · Initial markup precedes the client boundary](#lifecycle-01), [controls-04 · Credentials require blocking across states](pattern-controls.md#controls-04), [evidence-01 · Final replay omits an earlier emitted value](pattern-evidence.md#evidence-01).

**Evidence.** Teaching example. No observation is cited.
