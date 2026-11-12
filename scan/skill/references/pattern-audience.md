# Subject and audience

<!-- Generated from scan/patterns/catalog.json by scan/patterns/render.mjs. -->

[Pattern catalog](catalog.md)

The viewer, record owner, and intended audience can differ.

- [audience-01 · Delegated access changes the subject](#audience-01)
- [audience-02 · Private preview shares a public renderer](#audience-02)
- [audience-03 · A record contains several subjects](#audience-03)

### audience-01

**Delegated access changes the subject**

**Cues.** A person can switch workspaces, act as a delegate, or view the same profile form from an admin route.

**Trace.** Join the session actor, selected record, and organization relationship using the route and query. Identify which fields concern the viewer and which concern somebody else.

**Treatment.** Protect private values while ownership is unresolved. Record the open category distinction and the evidence needed to settle it.

**Counterexample.** A staff member editing their own profile through the same form is the subject of those fields.

**Verify.** Compare two authorized roles using distinct synthetic identities and confirm that the decision follows the record subject.

**Composes with.** [audience-03 · A record contains several subjects](#audience-03), [producer-04 · A child fetches its own records](pattern-producer.md#producer-04), [lifecycle-02 · Previous data survives a record switch](pattern-lifecycle.md#lifecycle-02).

**Evidence.**

- [source-review](../../../research/skill-led-review-results.md#what-the-reviews-found) — The Documenso signing title's audience was corrected using the sender/recipient query. Several Akaunting organization labels remained disputed.

### audience-02

**Private preview shares a public renderer**

**Cues.** A public page, draft preview, and signed review link render a common component with similar props.

**Trace.** Follow the publication condition and each route's query. Identify which fields, versions, and people the general audience can actually see.

**Treatment.** Keep confirmed public fields clear in the published context. Protect private fields and draft or restricted variants at their actual destinations.

**Counterexample.** A published profile can deliberately expose a display name while its preview also contains an internal note.

**Verify.** Use a public revision and an unpublished revision with different markers. Check the preview route and public endpoint independently.

**Composes with.** [boundary-04 · Public and private callers share a renderer](pattern-boundary.md#boundary-04), [navigation-03 · A link may identify a record or grant access](pattern-navigation.md#navigation-03), [lifecycle-01 · Initial markup precedes the client boundary](pattern-lifecycle.md#lifecycle-01).

**Evidence.** Teaching example. No observation is cited.

### audience-03

**A record contains several subjects**

**Cues.** A thread, timeline, or combined record displays messages, draft notes, automated notices, and imported metadata together.

**Trace.** Identify author, subject, and audience per entry or field. An operator's typed search and the customer address it returns have different producers and subjects.

**Treatment.** Carry each supported classification to its own destination. If a shared boundary protects several private entries, verify what fixed controls it also affects.

**Counterexample.** A fixed service announcement can be public in the same list as an operator's draft and a customer's reply.

**Verify.** Use separate markers per subject and a fixed announcement. Confirm which channels each entry contributes.

**Composes with.** [audience-01 · Delegated access changes the subject](#audience-01), [producer-01 · A schema supplies labels and values](pattern-producer.md#producer-01), [controls-05 · Mask private text and supported input values](pattern-controls.md#controls-05).

**Evidence.**

- [source-review](../../../research/skill-led-review-results.md#frozen-prediction-comparisons) — The Twenty comparison found a disagreement over the operator's typed search category. Both reviews required masking.
