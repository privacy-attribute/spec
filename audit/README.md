# SDK Audit

A test for maintainers of session recorders and product analytics SDKs. It finds private values that reach a recording and public content that is lost.

## What it does

The audit records the same browser journey several times with different synthetic values. Anything in the recording that changes with the value is a channel that carries it. The journeys cover patterns that are easy to miss, such as PIN pads, one-time-code inputs and password reveal toggles.

You get a summary of which capture channels vary with private input, which public content did not survive, and which patterns were skipped.

## Start here

| If you want to | Use |
| --- | --- |
| Check that your SDK honours `data-privacy` | The [browser check](runner/README.md#check-the-privacy-attribute) |
| Run the full audit on your SDK | The [audit runner](runner/README.md) |
| Have a coding agent run and interpret the audit | The [agent instructions](AGENTS.md) |

```bash
cd audit/runner
npm ci
node cli.mjs run --adapter rrweb --sdk /path/to/sdk --out out
```

Use Node.js 18 or later and Chrome or Chromium.

## Reference

- [Patterns](patterns.md): the high-risk interface patterns the audit tests.
- [Taxonomy](taxonomy.md): the classes of leak the audit covers.
- [Output format](output-format.md): the shape of the findings file.
- [Feedback](feedback.md): how to report what the audit missed.

## Reporting

Report a recorder weakness privately. See [SECURITY.md](../SECURITY.md). Use the [SDK audit feedback form](https://github.com/privacy-attribute/spec/issues/new?template=sdk-audit-feedback.yml) for gaps in these instructions, with synthetic examples only.

The audit is provided as is, without warranty. It can miss leaks and can misjudge recording fidelity. The implementer is responsible for recorder configuration, recording content, and legal and contractual compliance.
