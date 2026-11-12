# Privacy Attribute Community Group: proposed charter

> **This is a proposal.** No W3C Community Group has been formed for this work. This document describes the group we propose to form and follows the [W3C Community Group charter template](https://w3c.github.io/cg-charter/CGCharter.html). Sections marked "to be decided" are left for the group's first participants.

| | |
| --- | --- |
| **This charter** | https://github.com/privacy-attribute/spec/blob/main/charter.md |
| **Status** | Proposed, open for comment |
| **Proposed by** | rrweb B.V. |
| **Last modified** | 2026-11-12 |

## Goals

Web applications show private information, and session recorders and product analytics SDKs capture what applications show. Today each recorder has its own way to mark what must be hidden, with its own meaning. Authors re-annotate when they change recorder, reviewers cannot tell from markup what is protected, and no test applies across recorders.

This group will develop one author-declared mechanism in HTML markup that tells any recorder how to treat an element, with a definition exact enough to test. We want an application team to annotate once, a recorder maintainer to implement one small contract, and a reviewer to check one attribute.

The group intends to produce a Community Group Report suitable for adoption by a W3C Working Group.

## Scope of work

### In scope

1. **The privacy attribute.** The `data-privacy` attribute, its treatment tokens, token grammar, precedence and inheritance through the document tree, shadow roots and frames.
2. **Capture requirements.** What a recorder must replace or omit for each treatment in snapshots, mutations and input events, including changes during capture.
3. **Conformance testing.** A test suite that a recorder maintainer can run in a browser to check an implementation.
4. **Guidance for authors.** Non-normative advice on where to place annotations, how to handle shared components, and how to verify the result in a recording.
5. **Guidance for recorder maintainers.** Non-normative advice on implementing the attribute alongside existing controls, and on auditing what an SDK captures.

### Out of scope

1. **Automatic detection of private data.** The work concerns an explicit declaration by the author. Tools that help authors find what to annotate may be published as supporting software and are not specified.
2. **Legal interpretation.** The group produces technical documents. It does not give legal advice or state how to comply with a regulation.
3. **A classification vocabulary.** The group may allow project-defined labels and will not standardize a taxonomy of data categories.
4. **Recorder product behavior beyond capture.** Storage, retention, access control and replay user interfaces are for each product.
5. **Consent.** Whether and when a session may be recorded is outside this work.
6. **Capture outside the DOM,** in the first report. Network, console, canvas, media and interaction telemetry may be taken up later through a charter amendment.

## Deliverables

### Specifications

- **Privacy Attribute.** A Community Group Report defining the attribute, its values, inheritance and capture requirements. The current draft is [spec/core.md](spec/core.md), and the [proposal](proposal.md) lists the open questions.

### Non-normative reports

The group may produce:

- **Explainer.** The problem, the proposed solution, alternatives considered, and privacy and security considerations.
- **Author guide.** How to annotate an application and verify the result.
- **Implementer guide.** How to support the attribute in a recorder, including a transition path from existing controls.

### Test suites and other software

The group may produce:

- **A conformance test suite** for recorders. The starting point is the [browser check](audit/runner/README.md#check-the-privacy-attribute).
- **The SDK Audit,** a wider test of what a recorder captures and what public content it loses. See [audit/](audit/README.md).
- **The Scan,** a source review that helps application teams find what to annotate. See [scan/](scan/README.md).

## Success criteria

The group will consider the first report ready when:

- at least two independent recorders implement the attribute and pass the conformance tests;
- at least two application teams outside the proposing organization have annotated a production application with it and reported their experience;
- the open questions in the [proposal](proposal.md#questions-for-feedback) each have a recorded decision.

## Dependencies or liaisons

### W3C groups

- **[Privacy Working Group](https://www.w3.org/groups/wg/privacy/)** for privacy review.
- **[Real User Monitoring Community Group](https://www.w3.org/community/rumcg/)** whose participants build and operate monitoring and recording tools.
- **[Technical Architecture Group](https://www.w3.org/2001/tag/)** for architectural review if the work moves toward a global attribute.
- **[Accessible Rich Internet Applications Working Group](https://www.w3.org/WAI/ARIA/)** because `mask` covers `aria-label` and related text.

### External organizations

- **[WHATWG](https://whatwg.org/)** as the home of HTML, where a global attribute would be defined.
- **Maintainers of session recording and product analytics SDKs,** open source and commercial, as implementers.

## Communication

- **GitHub:** [privacy-attribute/spec](https://github.com/privacy-attribute/spec), for issues and pull requests. This is the channel in use today.
- **Mailing list, chat and meetings:** to be decided when the group forms.

## Community and Business Group Process

If formed, the group will operate under the [W3C Community and Business Group Process](https://www.w3.org/community/about/process/). Terms in this charter that conflict with that process are void.

## Code of ethics and professional conduct

All participants are expected to follow the [W3C Code of Ethics and Professional Conduct](https://www.w3.org/Consortium/cepc/). The project applies it today. See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## Work limited to charter scope

The group will not publish specifications on topics other than those listed under [Specifications](#specifications). See [Amendments to this charter](#amendments-to-this-charter).

## Contribution mechanics

Until a group forms, contributions are made under the repository's [MIT license](LICENSE), as described in [CONTRIBUTING.md](CONTRIBUTING.md).

Once the group forms:

- substantive contributions to specifications can only be made by participants who have agreed to the [W3C Community Contributor License Agreement](https://www.w3.org/community/about/process/cla/);
- specifications created in the group will use the [W3C Software and Document License](https://www.w3.org/copyright/software-license/);
- all contributions are made in the group's GitHub repository, as a pull request, an issue or a comment.

## Transparency

The group will conduct its technical work in public. Technical discussion takes place in GitHub issues, on a public mailing list or in meetings whose minutes are published.

## Decision process

The group will seek to decide by consensus. When an issue has been discussed and the Chair judges that consensus has been reached, the Chair closes the issue with a summary of the decision. Any participant may object within 7 days with a technical rationale, and the group will then revisit the decision.

If consensus cannot be reached, the Chair may call a vote of participants, with one vote per participating organization and a simple majority deciding.

## Chair selection

To be decided when the group forms. Participants choose their Chair or Chairs and can replace them at any time.

## Amendments to this charter

Before the group forms, comment on this charter through a GitHub issue or a pull request. After it forms, the group can amend the charter by consensus, with notice to participants of at least 7 days.
