# Privacy Attribute

One HTML attribute that tells any session recorder what to hide.

```html
<div data-privacy="mask">Account balance: €12,480.30</div>
<input data-privacy="block" name="api-key" />
```

`mask` keeps the element in the recording and hides its text and values. `block` leaves the element and everything inside it out of the recording.

**Status:** draft proposal, open for feedback. This is not a W3C standard. A W3C Community Group is proposed in the [charter](charter.md).

## What is here

| | What it is | Start with |
| --- | --- | --- |
| **Proposal** | The `data-privacy` attribute: why it is needed, how it works and the questions we want feedback on. | [proposal.md](proposal.md), then the [draft specification](spec/core.md) |
| **Scan** | A review that a coding agent runs on your application's source to find what must be masked or blocked, and to propose the annotations as a patch. | [scan/](scan/README.md) |
| **SDK Audit** | A test that recorder maintainers run against their SDK to find private values that reach a recording and public content that is lost. | [audit/](audit/README.md) |
| **Charter** | What this work aims to achieve, what is in and out of scope, and how a community group would run it. | [charter.md](charter.md) |

## Who this is for

- **Application teams** annotate their markup once and keep the same protection when they change recorder. Use the [Scan](scan/README.md) to find what to annotate.
- **Recorder and analytics SDK maintainers** implement one small contract and can test it. Use the [SDK Audit](audit/README.md) and the [browser check](audit/runner/README.md#check-the-privacy-attribute).
- **Privacy and security reviewers** get one attribute to look for in code review and one definition of what it guarantees.

## Give feedback

The [proposal](proposal.md#questions-for-feedback) lists the open questions. To respond:

- Open an [issue](https://github.com/privacy-attribute/spec/issues) for a question, objection or use case.
- Use the [scan feedback form](https://github.com/privacy-attribute/spec/issues/new?template=scan-feedback.yml) or the [SDK audit feedback form](https://github.com/privacy-attribute/spec/issues/new?template=sdk-audit-feedback.yml) to report what a run missed or got wrong. Use synthetic examples only.
- Report a recorder weakness or a vulnerability privately. See [SECURITY.md](SECURITY.md).

[CONTRIBUTING.md](CONTRIBUTING.md) explains how to propose changes.

## Releases

The `v0.2.0` tag identifies an earlier scanner revision. The draft specification and the checks described here are on the main line and are not yet tagged. See the [changelog](CHANGELOG.md).

## Background material

Evaluation results, design notes and experiments that informed this work are kept in [research/](research/README.md). They are working records and are not part of the proposal.

## Responsibility

The specification, the scan and the audit are provided as is, without warranty. A scan can miss private data and an audit can miss leaks. The implementer is responsible for recorder configuration, for what a recording contains, and for legal and contractual compliance.

## License

MIT. Maintained by rrweb B.V.
