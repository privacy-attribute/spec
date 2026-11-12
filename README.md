# Privacy Attribute Standard

The [draft Privacy Attribute Standard core](spec/core.md) defines `mask` and `block` for browser session recordings. Add the attribute to application markup and use a recorder that supports it.

```html
<div data-privacy="mask">Account balance: €12,480.30</div>
```

Optional classification labels share the same attribute, for example `data-privacy="mask confidential"`. A `block` token always supersedes `mask`, regardless of order. Combined values require a recorder that implements the [token grammar](spec/core.md); see [rrweb compatibility](ANNOTATION_COMPATIBILITY.md).

## Scan your application

The [privacy review skill](scan/skill/SKILL.md) teaches a coding agent to trace private information from application context to its rendered destinations. It maps surface purpose and content families, then selects focused review lenses for meaning, copies, shared boundaries, transitions, inference and public fidelity. Its pattern cards include examples and counterexamples for credentials, records, forms and private URLs. Supporting tools inventory source, validate evidence and check exact proposals. Review the proposed patch and test the recorder before you deploy it.

Use a checkout that contains the scanner you want to run. Install its dependencies from that checkout with `npm ci`. Replace the paths in this prompt. Then give it to a coding agent in your application's repository.

```text
Find the data in this application that a session recorder must mask or block.

1. Read <scanner checkout>/scan/skill/SKILL.md.
2. Create a scoped structural inventory:
   node <scanner checkout>/scan/cli.mjs inventory <application root> --include <feature paths> --out <new session folder>
3. Follow the skill. Read producers and component definitions, then write
   source-evidenced decisions in the session's review.json.
4. Run review-patch and review-proposals with --out <session folder>.
5. Test the reconciled patch in an isolated copy. Report unresolved work,
   public-content losses and checks actually executed. Keep the original
   application unchanged and leave the patch for review.
```

This draft workflow proposes `data-privacy` attributes. Verify attribute support and configuration in the exact deployed recorder. See the [implementation prompt](scan/PROMPT.md), [workflow outputs](scan/README.md#skill-led-review) and [rrweb guide](scan/recorders/rrweb.md). The earlier `find`, `place` and `patch` commands remain available as a heuristic baseline.

| Session file | Contents |
|--------------|----------|
| `proposal.patch` or `privacy.patch` | Mechanically resolved native edits, with partial work explicitly named as a proposal. |
| `review-report.json` | Evidence checks, placements, remaining work and public-content losses. |
| `source-proposals.patch` | Exact framework edits supported by cited source. These may overlap the native proposal and still need runtime verification. |

The patch command checks source edits and review decisions. After applying the patch and recorder settings, record each changed page with synthetic data. Inspect emitted events for private test values and play back the recording to check that public content survives.

### Feedback and release pin

The scanner writes reports to the session folder. A coding agent can send the source it reads to its model provider. Review drafts for real data before sharing them. Copy a reviewed synthetic example into the [blank feedback form](https://github.com/privacy-attribute/spec/issues/new?template=scan-feedback.yml). Use the private route for recorder weaknesses. [Security reporting](SECURITY.md)

`privacy-scan report --post <url>` sends the report JSON to the URL you supply. Run `report` first to inspect the draft.

The `v0.2.0` tag identifies an earlier scanner revision. Its feedback links include draft text in the URL. Use the blank form above with that revision. To use the draft core and the checks described here, run a checkout that contains them. [Changelog](CHANGELOG.md)

These instructions and scan results are provided as is, without warranty. A scan can miss private data and propose incorrect annotations. The implementer is responsible for recorder configuration, recording content, and legal and contractual compliance.

## For recorder maintainers

Run the [core browser check](audit/runner/README.md#check-the-privacy-attribute) with the SDK build you plan to ship. The wider [recorder audit](audit/AGENTS.md) compares recordings of synthetic values under different configurations to find leaks and changes to public content.

## License

MIT. Maintained by rrweb B.V.
