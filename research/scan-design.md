# Scanner design

The scanner finds private values in application source and proposes the smallest annotation that protects each value. The review step resolves uncertain sources and verifies where components render their values.

## Scan and review

| Step | What happens |
|------|--------------|
| Index | The scanner reads supported source files and schema files. It reuses completed decisions when the source snapshot, schemas, scanner implementation and settings match. |
| Find sources and uses | The scanner uses syntax analysis for JSX, TSX, Vue, Svelte and Blade. Line rules cover other supported files. The scanner follows supported data flows to text, form values, attributes and component props. |
| Classify | The scanner uses known sources and schema fields where available. It groups uncertain sources into questions. A reviewer checks the source and records its category and the evidence. |
| Place | `find` and `place` generate annotations for supported high-confidence sites. The plan lists cases that need review, including values passed to a component whose rendered element is unclear. |
| Check the patch | `patch` checks source freshness, edits, open review decisions and coverage of the known sites. It reports annotations in shared components when they can affect public uses. |
| Check emitted events | Apply the proposed patch and recorder configuration in a test application. Use synthetic private values and inspect the events from the recorder. |

The cache applies to the full scan snapshot. A change to source or schema files invalidates the saved decisions. Use `find --reuse <prior-session>` to skip static analysis when the source, scanner, root and include paths match. This command still reads and hashes the full source snapshot. Questions group uncertain values by module and source.

## Data and placement

- Follow values from queries, hooks, loaders, stores, route parameters and props to their rendered destinations. Keep a destination open for review when analysis cannot resolve it.
- Use schema fields and clear secret names to identify known private data. A reviewer can confirm whether an unknown value is private or whether it comes from public content, configuration or UI state.
- Choose the annotation for the recorder and the channel that carries the value. Text, input values, attributes and URLs can need different treatments. A page URL requires a source or recorder configuration decision.
- For shared components, place the annotation at a private use when a component-wide annotation would remove public content. Check that the annotation reaches the element that carries the value.

## Measurement

The [fixture benchmark](../scan/benchmark/baseline.json) detects regressions in scanner rules. The real-application measurement uses labelled files at pinned source revisions. It reports detection, placement and static evidence separately. The score credits the requested treatment when a valid patch places it on the labelled native element or a qualifying ancestor. An unrelated child annotation, an assumed recorder setting or a failed edit earns no treatment credit. The measurement reports stronger treatments separately because they can remove additional public content.

Each sample records its source revision and review status. Documenso and Chatwoot carry unverified legacy labels. Immich and Akaunting include individual review submissions and rulings. Held-out files are reserved for evaluation and are visible in the sample. CI compares each available split and category with the pull request base scanner.

Earlier coverage estimates counted nearby candidates and assumed recorder settings. Use the current evidence measures for evaluation. Application replay protection is unmeasured in the static score.

| Measure | Target |
|---------|--------|
| Detection recall for secrets | 100% |
| Detection recall for private values | At least 95% |
| Annotations on public elements | Under 10% of annotations |
| Review model tokens, first scan of a 2,000-file app | Under 50,000 |
| Static scan time, first scan of a 2,000-file app | Under two minutes |

The targets guide development. The launcher assesses token usage after an agent run when the provider supplies usage data. Measure on pinned application checkouts and verify emitted events for the recorder and options you ship.

The [browser canary](../scan/README.md#check-emitted-events-with-rrweb) applies the generated patch to a synthetic application and compares rrweb's emitted events. It records a separate fixture for attribute behavior. The real-application static measurement and the synthetic replay measurement report separate results.
