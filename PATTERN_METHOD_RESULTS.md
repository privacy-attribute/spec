# Pattern method: catalog, comparisons and project intake

Date: 2026-11-11. The repository now contains a structured catalog of 39 mechanisms in 11 families, with recognition cues, investigation steps, treatment rules, public counterexamples, verification instructions and composition links. The review procedure follows one fact through its producer, subject, derivations, copies, rendering owner, lifecycle states and capture channels.

The catalog is a working taxonomy. Its size does not establish that it covers most applications. Nineteen cards cite narrowly scoped observations from the earlier source reviews or Twenty DOM-emulator recordings; twenty are teaching hypotheses without such citations. Those citations do not verify every branch of their card.

A subsequent [content mapping and focused lens revision](CONTENT_LENS_RESULTS.md) adds an explicit starting map and targeted challenge passes. Its new Chatwoot source comparison is reported separately so the original frozen comparisons below remain intact.

## Guided source comparison

A separate author produced 12 synthetic cases with 40 explicit target channels and a declared hypothetical recorder contract without reading the expanded catalog. A further independent reviewer corroborated all 40 expected classifications, sensitivity flags and treatments. Fresh Sol reviewers used either the frozen previous guidance or the expanded guidance. They did not receive expected answers or each other's results.

| Outcome | Previous guidance | Expanded guidance |
| --- | ---: | ---: |
| Targets reviewed | 40 / 40 | 40 / 40 |
| Category agreement | 40 / 40 | 40 / 40 |
| Sensitivity-flag agreement | 40 / 40 | 40 / 40 |
| Treatment agreement | 40 / 40 | 40 / 40 |
| Private targets marked public | 0 | 0 |
| Public targets unnecessarily protected | 0 | 0 |
| Missing decisions or invalid source quotes | 0 | 0 |
| Unresolved capture channels | 2 | 2 |

This is a ceiling result, with no observed incremental benefit from the expanded guidance. Both arms are agent-led; this comparison does not compare agents with the earlier heuristic scanner. Agreement on an unresolved treatment does not mean the channel is protected. Canvas pixels and a cross-origin frame interior remain unresolved under the exercise contract.

The cases include 27 private targets and 13 public targets. Root review associated parts of 17 catalog cards with the cases after inputs were frozen. That association was not supplied to the reviewers and establishes no full-pattern verification. Supplying a target list makes this a guided reasoning exercise, not an application discovery benchmark.

The independent reviewer also identified two private channels omitted from the target list: the receipt thumbnail URL and the document head's title text. Both review arms found those channels. Additional public-impact notes differed in granularity and are not counted as extra privacy coverage.

All expectations and original predictions are retained. Procedural read restrictions and hashes document the comparison; they do not provide process-level isolation. There was one reviewer per arm, no human ground truth, and no measured token or elapsed-review cost. Runtime protection was not tested in this experiment.

## Discovery on real source

After the guided comparison reached a ceiling, fresh reviewers inspected nine byte-verified files from pinned Documenso and Chatwoot source without a target list. A third reviewer independently produced a bounded reference inventory. The pack includes previously unreviewed renderer destinations, but some callers and supporting files appeared in earlier reviews; this is not an entirely held-out application sample.

Both arms identified all ten reference source destinations and proposed the reference treatments under the same hypothetical recorder contract:

| Reference scope | Previous guidance found | Expanded guidance found | Boundary |
| --- | ---: | ---: | --- |
| Chatwoot monitor option names and IDs | 4 / 4 | 4 / 4 | Operational confidentiality and subject depend on omitted producers and policy |
| Documenso signed-in account label | 1 / 1 | 1 / 1 | The supplied caller does not set the optional label |
| Documenso signature image, text, name and length-derived styles | 5 / 5 | 5 / 5 | The sampled completion branch is marked unused |

This second comparison also establishes no incremental discovery advantage. It demonstrates source reasoning on those destinations, including non-text attributes and derived styles. It does not establish ten active application exposures or ten verified fixes. Unknown subject relationships remain explicitly unresolved even when a proposed protective treatment is supported.

The baseline reported 89 findings and the expanded reviewer 72, with different grouping of public controls, unsupported component paths, non-DOM channels and state implications. Those totals are not coverage denominators. Some additional structure and validation-state judgments differ and need policy or producer evidence. The independent reference is model-authored and bounded, not complete human ground truth. No patches were applied and no app or recorder was executed in this discovery comparison.

## Project classification intake

A short intake was added after the comparison snapshots were frozen. It therefore has not been evaluated for speed, question reduction or accuracy. It asks only for business context that the agent cannot establish from the current instructions, project policy and source:

1. Who uses the application and whose data they view or enter.
2. Which information is deliberately public.
3. Additional confidentiality rules, answered through an existing policy or specific business restrictions.

The intake follows initial application research and has no numerical cap. These are question families rather than a fixed opening questionnaire. Every question must concern a material ambiguity that available evidence and feasible technical checks cannot resolve without the user's knowledge or decision. The agent identifies what it investigated and what the answer changes, groups related uncertainties, skips known context and continues independent work while answers are pending. It inspects source for credentials, personal information and specially protected data instead of asking a separate question for each category.

The profile keeps subject, confidentiality, special handling and recorder treatment separate. It reuses organizational labels, allows explicit unknowns, records exceptions and avoids classifying every keystroke as about the operator. The existing scanner schema is unchanged; its broad labels are not silently reinterpreted as legal categories.

The intake draws on [NIST SP 800-122's contextual privacy guidance](https://csrc.nist.gov/pubs/sp/800/122/final), [ISO/IEC 27002's organizational control framework](https://www.iso.org/standard/75652.html), [HashiCorp's example classification scheme](https://developer.hashicorp.com/well-architected-framework/secure-systems/data/classify-data), and [European Commission guidance on specially protected personal data](https://commission.europa.eu/law/law-topic/data-protection/information-business-and-organisations/legal-grounds-processing-data_en). The question families are our proposed product workflow, not a questionnaire mandated by these sources. Their use does not establish compliance.

## Repository redesign decision

The user authorized redesigning the scan repository around this method if it proves meaningfully successful. The [candidate architecture](scan/REDESIGN.md) makes a fact and its destinations the primary unit, with structural inventory, exact-edit validation and recording verification as supporting services. It separates semantic decisions, placement and observed protection.

The ties in the guided and bounded discovery comparisons do not justify claiming that the expanded catalog improves the current agent method. The catalog and composition procedure are implemented; the complete architecture migration remains conditional. Existing heuristic commands and the previously validated review workflow remain available. No source-agreement result has been relabeled as runtime coverage. A future comparison should measure against the earlier heuristic pipeline and test broader active features with sufficient producer context, independent adjudication and representative recording evidence.

## Implementation checks and evidence

The complete local suite passes 186 tests on Node.js 20, 22 and 24. Seven new evaluator tests cover fixed denominators, missing versus unresolved answers, independent classification/treatment metrics, fabricated quotes, malformed IDs and source-path containment. Catalog generation and freshness checks pass. The generator checks IDs, fields, composition links and evidence types. Package dry-run includes the catalog and tools and excludes local application evidence.

| Evidence | Location |
| --- | --- |
| Catalog source and generation | [catalog.json](scan/patterns/catalog.json), [render.mjs](scan/patterns/render.mjs) |
| Evaluation protocol and redesign gate | [patterns README](scan/patterns/README.md) |
| Frozen source and guidance hashes | [frozen-inputs.json](local-evidence/pattern-transfer/frozen-inputs.json) |
| Guided comparison | [comparison.json](local-evidence/pattern-transfer/comparison.json) |
| Author and independent expectations | [author-oracle.json](local-evidence/pattern-transfer/author-oracle.json), [independent-oracle.json](local-evidence/pattern-transfer/independent-oracle.json) |
| Original predictions | [baseline-review.json](local-evidence/pattern-transfer/baseline-review.json), [candidate-review.json](local-evidence/pattern-transfer/candidate-review.json) |
| Mechanism associations and prior evidence | [coverage-ledger.json](local-evidence/pattern-transfer/coverage-ledger.json) |
| Real-source collection and prior overlap | [collection-manifest.json](local-evidence/pattern-discovery/collection-manifest.json) |
| Discovery comparison and exact finding mappings | [comparison.json](local-evidence/pattern-discovery/comparison.json) |
| Independent bounded source reference | [reference.json](local-evidence/pattern-discovery/reference.json) |
| Final test logs | [Node 20](local-evidence/pattern-transfer/node20-tests.log), [Node 22](local-evidence/pattern-transfer/node22-tests.log), [Node 24](local-evidence/pattern-transfer/node24-tests.log) |
| Package inventory | [package-dry-run.json](local-evidence/pattern-transfer/package-dry-run.json) |

Run `node scan/patterns/render.mjs --check` and `node --test` from the checkout for the structural and tooling checks. `evaluatePatternReview` in `scan/patterns/evaluate.mjs` accepts the frozen target list, oracle, review and source root. Exact quotes establish source provenance; semantic correctness still requires independent review.

The earlier [Twenty runtime report](RUNTIME_REVIEW_RESULTS.md) retains its bounded DOM-emulator evidence and the outstanding browser handoff. This work did not execute a browser, modify upstream applications, install a personal skill, commit, push or publish. The recorder operator remains responsible for recording contents.
