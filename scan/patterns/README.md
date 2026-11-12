# Pattern-led review and evaluation

The pattern catalog teaches a reviewer to trace a fact through its producer, subject, derived forms, rendered destinations, lifecycle states and recorder channels. Patterns are composable review questions. A matching cue is never a privacy classification by itself.

`catalog.json` is the source of the teaching cards. `render.mjs` validates it and generates progressively loaded family references under `scan/skill/references`. Run `node scan/patterns/render.mjs --check` to check generated documentation without changing it.

## Evidence levels

Keep four separate denominators:

1. Documented mechanisms: cards with cues, investigation steps, treatment, counterexample and verification instructions.
2. Exercised mechanisms: cases that combine those mechanisms and have independently produced review decisions.
3. Correct source decisions: channel-specific classifications and treatments supported by literal source evidence, compared against separately prepared expectations.
4. Observed protection: exercised destinations in actual emitted recordings, with configuration, states, baseline positives and public controls preserved.

A card count is not application coverage. Passing a synthetic source exercise does not establish runtime protection or transfer to a production application. Existing source reviews and the bounded Twenty DOM-emulator recordings retain their original scopes.

## Initial comparison protocol

Protocol fixed before the initial comparison results were inspected on 2026-11-11:

- Preserve the previous guidance as a baseline before changing it.
- Have a separate author create new source cases, product context, explicit target channels and a hypothetical recorder contract, without reading the candidate guidance.
- Have fresh reviewers use the baseline or candidate guidance on the same cases. Supply identical output requirements. Reviewers receive no expected answers, prior reviews or evaluator results.
- Keep author expectations separate. Obtain a further independent source review for disputed decisions. Freeze original predictions and expectations before adjudication; never silently rewrite either to improve results.
- Record exact source, guidance, expectation and prediction hashes. Model provenance and unknown token usage stay explicit. A hash records the snapshot; procedural separation alone is not a technical guarantee that another process could not read a file.
- Evaluate category, special-category flag, treatment, private content classified public, unnecessary public protection, invalid evidence, missing answers and unresolved placement separately.
- Require source quotes. Missing answers get no credit. An appropriately unresolved placement remains unresolved even when it agrees with the expected answer.
- Treat this as a guided source-reasoning exercise because targets are supplied. It does not measure unconstrained discovery. Report whether another review finds omitted destinations.
- Use no hidden browser workaround. This evaluation is source-only; the existing manual browser gate remains open.

## Revising guidance after a miss

1. Save the original failure and an independent expected result before changing any guidance.
2. Add the missing discriminating evidence to a pattern card in `catalog.json`.
3. Include a counterexample with similar syntax and different meaning.
4. Test the revision on an untouched feature.
5. Keep prior predictions, disagreements and adjudication separate.
6. A reviewer never reads the answer key before producing its first decisions.

## Redesign decision

The user has authorized redesigning the scan repository around this method if it is meaningfully successful. That condition is not met by a larger catalog, more tests or higher agreement with an author alone.

The first comparison should demonstrate a reduction in concrete missed private channels or inadequate treatments without introducing comparable public-content loss. Category-only improvements are useful but weaker evidence for protection. Equal results mean this comparison has not established an incremental benefit. A single reviewer per arm is exploratory and cannot isolate guidance effects from model variability.

Before replacing the repository's architecture, extend the result to independent feature reviews in multiple real applications, require discovery without a supplied target list, and validate representative patches against emitted payloads. Preserve unresolved recorder capabilities and public controls. Use held-out features after any guidance revision; a corrected answer on its original teaching case is not transfer evidence.

If those conditions are met, migrate the existing structural inventory and exact-edit validators into supporting services for one pattern-led workflow. The redesign should make a destination's meaning, placement and observed protection separate states. Retain the existing heuristic scanner as a measurable baseline during migration. Do not delete working paths or rename source agreement to verified coverage to make the redesign appear complete.
