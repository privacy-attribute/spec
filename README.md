# Privacy Attribute Standard

A single `data-privacy` attribute lets a page tell any capture SDK what to mask, block, ignore or unmask, backed by a versioned capture policy. The privacy decision is made once, in application markup, and enforced by every recorder that implements the standard. Unrecognized values mask, so a mistake never exposes content.

```html
<div data-privacy="mask">Account balance: €12,480.30</div>
```

## Scan your application

The scanner reads your front-end code and finds what a session recorder must mask or block: passwords and API keys, the signed-in user's details, other people's records in tables and lists, embedded replays, and the attributes, URLs and titles that carry the same data. It proposes the smallest `data-privacy` annotation for each one and writes them as a patch you review before applying. It never changes your code.

Paste this into the coding agent you use in your repository (Claude Code, Codex, Cursor or similar):

```text
Find the data in this application that a session recorder must mask or block.

1. Run this command in the repository root:
   npx -y -p github:privacy-attribute/spec#v0.2.0 privacy-scan find <front-end source folder> --sdk rrweb
2. The command shows the path of a PLAYBOOK.md file. Read that file.
3. Do the procedure in the playbook. Do not change files in this repository.
4. When the patch command shows no open candidates, show me:
   - the path of privacy.patch,
   - the summary from the playbook,
   - the issue links for the gaps.
5. Do not apply the patch. I will examine it first.
```

[`scan/PROMPT.md`](scan/PROMPT.md) has the same prompt with notes, a version without `npx`, and a command that starts Claude Code or Codex for you.

The scan has two passes. A static pass with no model flags every line that may hold private data; on a 260-file app it takes about 0.1 seconds. Your agent then reviews the flagged lines file by file, decides what each one holds, and writes the annotations. A 260-file React app takes about four minutes of agent time.

What you get:

| File | Contents |
|------|----------|
| `privacy.patch` | The `data-privacy` annotations, ready for `git apply` |
| `app-privacy.json` | Each annotation with its reason, every dismissed candidate, and recorder configuration to add |
| `feedback/` | One report for the scan: how each rule performed, as counts only, and gaps with a proposed rule. Recorder weaknesses go to a separate private file. |

Recorders do not all read `data-privacy` yet, so the patch can use the recorder's own classes. With `--sdk rrweb` it writes `rr-block`, `rr-mask` and `rr-ignore`, which rrweb reads with no configuration; add `--annotate data-privacy` to write the standard attribute instead. [`scan/recorders/rrweb.md`](scan/recorders/rrweb.md) explains both and lists the rrweb options to set.

### What leaves your machine

The scanner sends nothing. It writes its session folder to your system temp folder and never changes your repository. Your coding agent reads your code and sends it to the agent's own model provider under your agreement with that provider. A scan report leaves your machine only when you submit it, and it contains counts and made-up examples, never your code.

After you apply the patch, record a session on each changed page with test data and play it back to check that nothing private shows.

### Report a problem with the scan

If the scan missed private data, flagged too much, or suggested the wrong annotation, [open a scan feedback issue](https://github.com/privacy-attribute/spec/issues/new?template=scan-feedback.yml). Agents write these reports for you in `feedback/`, with a link that fills in the form. `privacy-scan report --post <url>` sends the same report to a feedback endpoint. Use made-up names and values: never paste code or data from your application.

These instructions and every scan produced with them are provided as is, without warranty. A scan can miss data that needs protecting and can propose annotations that are wrong. Its output is not legal advice and not a certification of compliance with any privacy law. The implementer (whoever integrates, configures or ships the recorder) is responsible for the final output: what their recordings contain, how the recorder is configured, and whether that meets their legal and contractual obligations.

## The attribute

| Value | Effect |
|-------|--------|
| `mask` | Text, input values and privacy-relevant attributes are replaced before they leave the page. Structure may be recorded. |
| `block` | The element is replaced by a placeholder of the same size. Nothing inside it is recorded. |
| `ignore` | Input in the element is not recorded. The element itself may be. |
| `unmask` | The element is recorded in the clear, overriding an inherited `mask`. |

Values inherit to descendants unless a descendant sets its own. Any other value, including an empty string, is treated as `mask`.

## For recorder maintainers

[`audit/`](audit/AGENTS.md) audits a capture SDK itself: which leaks no configuration can stop. A [runner](audit/runner/README.md) records 63 high-risk UI patterns under every configuration and reports what differs between two hidden values, so the agent only traces the differences to code. Report problems with the audit through the [SDK audit feedback form](https://github.com/privacy-attribute/spec/issues/new?template=sdk-audit-feedback.yml).

## License

MIT. Maintained by rrweb B.V.
