# Privacy Attribute Standard

A single `data-privacy` attribute lets a page tell any capture SDK what to mask, block, ignore or unmask, backed by a versioned capture policy. The privacy decision is made once, in application markup, and enforced by every recorder that implements the standard. Unrecognized values mask, so a mistake never exposes content.

```html
<div data-privacy="mask">Account balance: €12,480.30</div>
```

This package is a placeholder that reserves the `@privacy-attribute` scope. It contains no code. The specification, conformance suite and vendor registry will be published under this scope once the proposal leaves review.

Specification and reference implementation: https://github.com/privacy-attribute

Authored by rrweb B.V. MIT licensed.

## Auditing capture SDKs

[`audit/`](audit/AGENTS.md) holds instructions for an agent to audit a session-capture SDK for privacy leaks and for fidelity lost to masking: an objective, data categories, a threat model, high-risk UI patterns, a leak taxonomy and a findings format. Point the agent at `audit/AGENTS.md`, pinned to an `audit-v*` tag for reproducible results. The [runner](audit/runner/README.md) does the differential test without a model: one command records every pattern under every config and writes a single table.

Found a leak the audit missed? [Open an audit feedback issue](https://github.com/privacy-attribute/spec/issues/new?template=audit-feedback.yml). Accepted reports are tested by every later audit run. Reporting gaps is required for anyone using the audit.

These instructions and every audit produced with them are provided as is, without warranty. An audit can miss leaks and can misjudge fidelity. Its findings are not legal advice and not a certification of compliance with any privacy law. The implementer (whoever integrates, configures or ships the recorder) is responsible for the final output: what their recordings contain, how the recorder is configured, and whether that meets their legal and contractual obligations.
