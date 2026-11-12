# Contributing

Thank you for helping with the Privacy Attribute. Feedback on the [proposal](proposal.md) is the most useful contribution at this stage.

## Ways to contribute

- **Comment on the proposal.** Open an [issue](https://github.com/privacy-attribute/spec/issues) and say which [question](proposal.md#questions-for-feedback) it concerns, or describe a use case the draft does not cover.
- **Report a scan or audit result.** Use the feedback forms linked from the [README](README.md#give-feedback). Use synthetic values in every example. Never paste real customer data, credentials or recordings.
- **Propose a change.** Fork the repository, create a branch with a descriptive name and open a pull request. Keep one topic per pull request.

## Changes to the specification

A change to [spec/core.md](spec/core.md) needs an issue first, so the reasoning is on record. Say what recorders and application authors would have to do differently.

## Changes to the scan and the audit

- Use Node.js 18 or later. Run `npm ci` in the repository root, and in `audit/runner` when you change the runner.
- Run `npm test` before you open a pull request.
- Run `node scan/patterns/render.mjs --check` when you change the pattern catalog. Edit `scan/patterns/catalog.json`, since the pattern cards under `scan/skill/references` are generated from it.
- A change to the review skill needs evidence. Follow [revising guidance after a miss](scan/patterns/README.md#revising-guidance-after-a-miss).

## Licensing

Contributions are accepted under the [MIT license](LICENSE) that covers this repository. If the proposed community group forms, specification text would move to the terms in the [charter](charter.md#contribution-mechanics), and this file will be updated before that happens.

## Security

Do not open a public issue for a recorder weakness or a vulnerability. See [SECURITY.md](SECURITY.md).
