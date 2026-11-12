# Capture outside native DOM

<!-- Generated from scan/patterns/catalog.json by scan/patterns/render.mjs. -->

[Pattern catalog](catalog.md)

Recorder integrations can emit payloads independently of DOM annotations.

- [integration-01 · Custom event metadata has its own policy](#integration-01)
- [integration-02 · An enabled integration captures diagnostic data](#integration-02)
- [integration-03 · Pixel capture bypasses text masking](#integration-03)

### integration-01

**Custom event metadata has its own policy**

**Cues.** The application sends replay tags, identification fields, or custom action metadata to a recorder API.

**Trace.** Follow each configured payload field to its producer. Establish whether the integration emits it into a recording and whether a transform removes or changes it first.

**Treatment.** Protect private custom metadata at its source or through a verified recorder transform. Resolve DOM placement separately for any copies shown in the interface.

**Counterexample.** A fixed event name such as Help opened can remain if the payload and event timing carry no private context.

**Verify.** Trigger representative events and inspect the complete emitted fields.

**Composes with.** [interaction-03 · An action exports a private payload](pattern-interaction.md#interaction-03), [navigation-01 · Location and route events repeat private data](pattern-navigation.md#navigation-01), [evidence-01 · Final replay omits an earlier emitted value](pattern-evidence.md#evidence-01).

**Evidence.** Teaching example. No observation is cited.

### integration-02

**An enabled integration captures diagnostic data**

**Cues.** Network, console, or error instrumentation is configured alongside session recording.

**Trace.** Identify the deployed plugins, allowlists, and transformations. Check which request paths, headers, bodies, exceptions, or log arguments enter recording payloads and when.

**Treatment.** Use the applicable application or recorder filtering controls for captured private diagnostic values. A DOM decision covers only the destinations within its verified scope.

**Counterexample.** A value used only in server processing may have no recording destination when no enabled integration emits it.

**Verify.** Exercise synthetic success and failure paths under deployment settings. Check exact recorded diagnostic fields rather than the developer console alone.

**Composes with.** [integration-01 · Custom event metadata has its own policy](#integration-01), [producer-02 · Fallbacks switch the value's meaning](pattern-producer.md#producer-02), [evidence-02 · A recorder preset can hide patch impact](pattern-evidence.md#evidence-02).

**Evidence.** Teaching example. No observation is cited.

### integration-03

**Pixel capture bypasses text masking**

**Cues.** A chart, map, canvas, screen share, or screenshot can display private values outside ordinary text nodes.

**Trace.** Determine whether recorder plugins collect drawing commands, pixels, frames, hover text, or surrounding DOM. Locate any separately rendered labels or accessibility content.

**Treatment.** Protect private graphics and independent overlays through verified controls for each enabled capture path. Preserve fixed controls and public legends where possible.

**Counterexample.** A decorative canvas can contain public content, and a disabled pixel capture plugin leaves independently recorded labels to review.

**Verify.** Compare raw graphics events and overlays across synthetic private and public cases, using actual recorder options.

**Composes with.** [representation-01 · Accessible names reference separate nodes](pattern-representation.md#representation-01), [boundary-02 · An embedded root has its own capture boundary](pattern-boundary.md#boundary-02), [evidence-03 · A fixture bypasses part of the real flow](pattern-evidence.md#evidence-03).

**Evidence.** Teaching example. No observation is cited.
