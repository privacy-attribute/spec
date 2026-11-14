# Research and working records

These documents record how the Scan, the SDK Audit and the draft specification were developed and tested. They are working records. They are not part of the [proposal](../proposal.md), and their conclusions apply only to the scope each one states.

| Document | What it covers |
| --- | --- |
| [Live skill review](live-skill-review-2026-11-14.md) | Three independent reviews of the dashboard handoff, full-codebase discovery, recorder protection and workflow; bounded reproductions and local corrections. |
| [Recording results](recording-results.md) | Patches produced by the review skill, recorded in a browser on Chatwoot, Twenty and Documenso components and searched for seeded private values. |
| [Skill-led review results](skill-led-review-results.md) | The first source reviews on five open source applications and their comparison with labelled samples. |
| [Twenty runtime results](twenty-runtime-results.md) | Component recordings for a reviewed Twenty patch, including a leak through a hidden sizing copy and its fix. |
| [Pattern method results](pattern-method-results.md) | The pattern catalog, two guided comparisons and the project intake. |
| [Content lens results](content-lens-results.md) | Content mapping and focused review lenses, compared on Chatwoot. |
| [Implementation status](implementation-status.md) | The state of the earlier heuristic scanner and its release gates. |
| [Scan design](scan-design.md) | Design of the deterministic scanner. |
| [Scan redesign](scan-redesign.md) | A candidate architecture built around facts and their destinations. |

Some of these documents refer to local evidence folders that are not published with the repository.

Supporting code that these experiments use stays next to the tools that share it: the labelled samples in `scan/benchmark`, the Twenty component harness in `scan/runtime`, the browser canary in `scan/canary.mjs`, and the evaluation rules in [scan/patterns/README.md](../scan/patterns/README.md).
