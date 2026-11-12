# Content mapping and focused review lenses

Date: 2026-11-11. The instructions now begin with surface purpose and value families, then use focused review prompts to challenge the initial trace and proposal. This revision changes agent guidance and documentation; it does not migrate the scanner's architecture or change its review JSON schema.

## What changed

- Separate a surface's purpose (for example a record overview, index, form or activity feed) from the shape of each value. Fixed copy, bounded choices, record-derived values, free-form content, derived values, resources and mixed payloads guide investigation; they do not determine confidentiality.
- Establish constraints at the producer. A small sample, widget type or enum-looking name is insufficient. Separate fixed event kinds and option labels from private properties and selected states.
- Select focused lenses for meaning/constraints, copies/channels, placement/shared use, states/transitions, choices/inference/event payloads, and public fidelity/protection claims. Each prompt uses the actual feature scope and returns evidence or a named gap.
- Reconcile findings into the existing decision records, source proposals and verification obligations. Group duplicate findings and reuse evidence. A complex feature can use an agent-authored `review-map.md`; a simple field needs no additional document.
- Keep the research-first intake, optional classification tokens, strongest-treatment rule and source-versus-runtime distinction. No mandatory questionnaire or automatic subagent launch was added.

The main instructions increased from 1,422 to 1,670 words. The compared revision’s two new references contain 1,004 and 1,034 words; the final lens reference is 1,136 words after the two targeted refinements. These are document sizes, not measured model-token costs or evidence of faster review.

## Comparison design

Before collecting the evaluation source, the old guidance and exploratory protocol were frozen. The revised guidance and a common output request were then frozen before reviewer outputs were available. Fresh Sol reviewers used the same request, source pack and hypothetical recorder contract, with only their assigned guidance. They received no target list, expected answers or opposite-arm results. A third reviewer created an independent reference from source alone. Its original predictions are preserved.

The feature is Chatwoot's customer-satisfaction report at commit `5dedc3a8b1d2ca223605841e5f1cda5efed13e66`: eight unchanged application files, 1,031 lines, covering the report caller, table, contact and expanded-note views, directly used display components and an API serializer. No collected source path appeared in the prior local evidence packs. This is a new feature slice in a previously reviewed application, not a new application or proof that a model has never seen this public source.

The collector verified Git blob hashes. Independent local checks verified all ten pack files, nine upstream blobs including the license, both guidance snapshots and 146 local documentation links. Missing store, filter, metric, editor, formatter, tooltip and nested serializer implementations remain explicit scope limits.

One reviewer per arm gives exploratory evidence, not causal isolation from model variation. Read restrictions were procedural, not enforced process isolation. Reviewer token use and total review cost are unavailable. This is source-only proposed protection under an assumed contract, not recording or full-application verification.

## Frozen Chatwoot results

Both reviews identified all 33 original reference obligations. The old review produced 58 findings and the candidate 51; that difference reflects grouping, not discovery coverage. All 199 old-review, 192 candidate-review and 135 reference source quotations validated exactly against the frozen files.

| Adjudicated original reference obligations | Previous guidance | Content map and lenses |
| --- | ---: | ---: |
| Identified | 33 / 33 | 33 / 33 |
| Adequate source proposal or public preservation | 20 | 21 |
| Conditional on policy or boundary tradeoff | 3 | 2 |
| Unresolved evidence or placement | 10 | 10 |

The one adequacy shift concerns the generic avatar fallback. The candidate proposes blocking the nondefault inner avatar host and separately blocking the availability badge. The previous review proposes a broader wrapper and explicitly accepts losing the generic fallback. The narrower proposal preserves more public content if its branch behavior and layout validate. Neither proposal was applied or recorded in this experiment.

Additional inspection found two obligations outside the original reference. Both reviews identify visible filtered row counts. The previous review explicitly traces thumbnail URLs to independent request/resource capture; the candidate identifies the URLs but leaves that channel only in generic deployment dependencies, so it receives partial discovery credit there. The previous review also provides more concrete conditional cell blocks for concealing feedback or assignment presence. These tradeoffs prevent calling the result a broad improvement in discovery.

Both reviews overstate certainty that name-length color buckets and some aggregate/branch signals must be private. Their derivation is established; the handling policy is not. The independent reviewer preserved its original reference and wrote a separate clarification accounting for length-preserving masking. Conservative block proposals remain possible, but do not establish that a weaker control violates policy.

The candidate separates fixed analytics properties from potentially enriched context more explicitly; the previous review already recognizes their fixed semantics. That is clearer organization, not a newly discovered privacy issue.

## Final targeted refinements

After preserving the comparison, the active instructions received two further additions: require a source-specific dependency for independent capture of each private resource URL, and distinguish observed derived signals from a policy requirement to hide them. The final guidance has its own frozen hash manifest. It is not retroactively substituted into the Chatwoot comparison.

A separate author then produced a new 81-line synthetic attachment-review exercise with explicit product policy and a source-visible custom-event serializer. A fresh reviewer used the final instructions without seeing the author expectations or previous reviews. All seven author obligations were matched, with 43 exact review quotes verified: the permitted note-length styling stays clear, private text is masked, the resource URL is protected in both the DOM and its independent event payload, and the private selected state receives a stable group block with its public-label loss disclosed. The preview control and permitted type-only event remain clear. The source parsed successfully. This targeted teaching check has no baseline arm and supplies no real-app, cost or runtime improvement claim.

The original comparison shows comparable source discovery with one narrower fidelity proposal and a resource-channel omission to correct. It provides no measured model-cost, runtime-protection or full-application improvement and does not meet the gate for a complete repository architecture migration.

## Evidence

- [Frozen protocol](local-evidence/content-lenses/protocol.md)
- [Common review request](local-evidence/content-lenses/review-request.md)
- [Source provenance](local-evidence/content-lenses/collection-manifest.json)
- [Frozen guidance hashes](local-evidence/content-lenses/guidance-hashes.json)
- [Input and link validation](local-evidence/content-lenses/input-validation.json)
- [Original prediction hashes](local-evidence/content-lenses/prediction-hashes.json)
- [Quote and review validation](local-evidence/content-lenses/review-validation.json)
- [Previous-guidance review](local-evidence/content-lenses/baseline-review/review.json)
- [Candidate-guidance review](local-evidence/content-lenses/candidate-review/review.json)
- [Candidate working map](local-evidence/content-lenses/candidate-review/review-map.md)
- [Per-obligation comparison and adjudication](local-evidence/content-lenses/independent-reference/comparison.json)
- [Final guidance hashes](local-evidence/content-lenses/final-guidance-hashes.json)
- [Independent source reference](local-evidence/content-lenses/independent-reference/reference.json)
- [Reference clarification preserved separately](local-evidence/content-lenses/independent-reference/adjudication-notes.json)

- [Comparison mapping validation](local-evidence/content-lenses/comparison-validation.json)
- [Targeted follow-up protocol](local-evidence/content-lenses/calibration/protocol.md)
- [Targeted follow-up result](local-evidence/content-lenses/calibration/result.json)
- [Final-guidance exercise review](local-evidence/content-lenses/calibration/final-review/review.json)
