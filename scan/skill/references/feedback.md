# Feed discoveries back into the project

Use this when a review discovers a reusable gap in the scanner, skill, annotation guidance or recorder. Finish feasible application work and keep its remaining gaps visible. Feedback is an output of the review, not a substitute for fixing or documenting the application risk.

## Choose the reporting route

| Finding | Route |
| --- | --- |
| A missed rendering pattern, false positive, wrong annotation guidance, unclear instruction or reproducible tool failure | Suggest a public [scan feedback issue](https://github.com/privacy-attribute/spec/issues/new?template=scan-feedback.yml). |
| A recorder captures private data despite correctly applied, supported protection, or a vulnerability affects the scanner/audit runner | Keep the draft private. Follow the project's [security policy](https://github.com/privacy-attribute/spec/blob/main/SECURITY.md): the recorder maintainer's security contact, or this project's [private security advisory](https://github.com/privacy-attribute/spec/security/advisories/new). Do not suggest a public issue for the weakness. |
| Business meaning still needs a user's decision, source is genuinely inaccessible, or a check has not run | Record the dependency in the review. Do not label it a product defect without supporting evidence. |

Separate a discovery or guidance failure from a recorder failing to enforce a correct control. If the distinction is unclear and the finding may expose a protection bypass, retain a private draft until the mechanism is understood. Reuse an existing relevant issue when one is known. If searching for duplicates, use generic pattern descriptions only; never put application details in a search query. A failed or unavailable duplicate search does not block preparing a draft.

## Prepare a useful local draft

For each distinct public feedback item, write `feedback/scan-gap-<short-name>.md` in the session folder. Combine repeated occurrences of the same mechanism. Put recorder or security weaknesses in `feedback/private-recorder-gaps.md` or another clearly labelled private draft, separate from public feedback.

Write a new minimal example using invented components and values. Preserve the mechanism needed to reproduce the gap, such as prop forwarding, an aliased portal or an asynchronous copy. Do not copy application source, proprietary identifiers, customer data, paths, hostnames, screenshots, recordings, logs, configuration secrets or links to private resources. Never attach the application's `review.json`, coverage ledger or raw session artifacts to a public draft. If a useful synthetic reproduction is not yet possible, explain that limit locally; do not replace it with application material.

Check the newly written example itself. When feasible, run it in an isolated fixture with the relevant tool revision, options and capture setup, and confirm that the same gap remains. Simplification must not remove the mechanism being reported. Separate what was observed in the application from what was reproduced synthetically. If the example was not run or does not reproduce the gap, say so explicitly and keep it labelled as an unverified illustration; do not call its steps a confirmed reproduction. Preserve the original finding while refining the example. Do not fabricate a command, output or missing version to complete the draft.

Use this structure, mapping it into the issue form when shared:

```markdown
Title: <kind>: <short mechanism-based description>
Kind: missed-data | false-positive | wrong-guidance | unclear-instruction | scan-report
Scan/skill revision: <commit or version; unknown if unavailable>
Recorder: <package, exact version and relevant non-secret options>
Environment: <framework/tool versions; static, DOM emulator, browser or full app>

What happened:
<Observed result and why it is a reusable gap. Distinguish evidence from inference.>

Example (made-up):
<Minimal newly written source and synthetic values.>

Steps and checks:
<Reproduction commands, actual output summary, and checks not run.>
Synthetic reproduction status: <confirmed same gap | not run | did not reproduce>

Expected:
<Required discovery, annotation, guidance or tool behavior; public content to preserve.>

Workaround:
<What was tried, its observed result and any remaining limitation.>
```

Use `scan-report` for a tool failure that does not fit a more specific form option. For a private recorder report, describe the supported protection and exact captured channel. Claim a runtime leak only when an executed recording demonstrates it; distinguish a suspected source-level weakness. Record baseline positives and the relevant event phase when tested. A proposed workaround or passing source check is not observed recording protection.

The form has fields for Kind, Recorder, Scan / skill version or revision, What happened, Example (made-up), Environment, Steps and checks, Expected and Workaround. Put the synthetic reproduction status in Steps and checks. If a destination uses an older form without a dedicated field, put that information under What happened rather than dropping it. Use portable relative fixture paths and invented URLs in commands; unknown values and unexecuted checks remain explicit.

## Offer the report to the user

In the final review summary, name the reusable gap, link or give the path to the local sanitized draft, and suggest the appropriate reporting route. For example: “The scan missed a detached rendering pattern. I prepared a synthetic issue draft at `<session>/feedback/scan-gap-portal.md`; you can review it and report it through the scan feedback form.” For a recorder weakness, explicitly point to the private route instead.

Keep all drafts local by default. Do not create an issue, comment, advisory or message unless the user explicitly authorizes sharing that content with that destination. Running the scan does not grant publication permission. Do not place draft contents in a prefilled issue URL. If publishing is authorized, recheck the exact outgoing content and attachments for application details, then report the resulting issue or advisory link. If the user declines, retain the local review outcome and continue the application work.
