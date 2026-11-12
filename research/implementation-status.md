# Privacy attribute implementation status

Local draft: `0.3.0-dev.0`. Date: 2026-11-11. Release readiness is blocked.

The subsequent skill-led implementation and five-app evaluation are documented in [skill-led review results](skill-led-review-results.md). The results below retain the earlier heuristic hardening baseline; they do not describe the new agent review's accuracy or coverage.

The later [Twenty runtime evaluation](twenty-runtime-results.md) adds component recordings in a DOM emulator and a tested measurement-copy fix. Its browser artifact remains unexecuted. The historical gate status below refers to the earlier canary run.

The subsequent [pattern catalog and comparisons](pattern-method-results.md) add 39 mechanism cards, two frozen source-review comparisons and a short project intake. Both comparisons tied the previous agent guidance on their bounded references. The complete repository redesign remains conditional; the intake was added after the comparison and has not received a speed or accuracy evaluation.

The later [annotation compatibility work](../spec/rrweb-compatibility.md) changes the draft to a single token-list attribute: `data-privacy="mask confidential"`, with any `block` token taking precedence. Scanner patching, measurement and canary selectors follow this grammar; 190 tests pass on Node 20, 22 and 24. Existing exact-value recorder builds require compatibility work before relying on combined block values.

The later [content mapping and focused lens revision](content-lens-results.md) adds surface/value-family mapping and six cue-selected review prompts. It keeps the existing review schema and optional working notes. The report records a frozen comparison on a newly collected Chatwoot feature; source review remains distinct from observed recording protection.

The recorder operator remains responsible for recording contents. These checks do not establish legal compliance.

## Changes

The existing hardening patch was already applied when this work started. Its reverse check passed. Existing uncommitted changes and the core draft were retained. No project commit, push, tag, release, external report, or onboarding change was made.

The scanner now carries parsed targets and original columns through batch patch application. It checks the resulting treatment, preserves stronger controls, rejects ambiguous or cosmetic edits, and verifies source facts again before it accepts completion. JavaScript and TypeScript edits are parsed. Template checks remain lexical.

Classification now follows qualified model, module, import and lexical identities where supported. Secret inputs and sensitive choices require blocking. Dates and booleans do not become public by type. Multiple origins remain independent when source questions are answered. Failed parsing, ambiguous owners, custom controls and unresolved conditional disclosure remain visible.

Source answers use module-qualified keys and accept structured category and evidence records. Reuse checks the scanner implementation, package version, lockfile, settings and source snapshot. Exact-snapshot find reuse avoids repeated source analysis. Patch generation recomputes source facts before accepting completion. It still hashes all source and dependency files. Changed-source dependency-aware incremental analysis remains unfinished.

Session writes reject symlink escapes. Git inspection disables repository-configured filesystem monitors and optional index writes. Automatic agent execution requires a verified OS write boundary and fails closed if that boundary cannot run. Token reports include input, output and reported cache reads and writes across models. The 50,000-token threshold is a post-run acceptance check; a pre-call spending limit is not implemented.

The compact core and guides describe two core treatment tokens, precedence, dynamic changes, reparenting, shadow and frame boundaries, supported channels and recorder-specific extensions. Current prompts use the local draft. The historical `v0.2.0` pin does not include these changes.

## Executed evidence

- Initial local suite: 87/87 on Node 26.13.0. The historical hardening snapshot reproduced 107/107 nearby private detections, 97/107 same-line detections and 67/107 category agreement.
- Final runtime test logs: [Node 24](../local-evidence/node24-tests.log), [Node 22](../local-evidence/node22-tests.log) and [Node 20](../local-evidence/node20-tests.log), with 127 passing tests on each runtime.
- [Current synthetic benchmark](../local-evidence/synthetic-benchmark.log): 107/107 nearby private detections, 99/107 same-line detections, 22/22 secret detections, 88/107 category agreement, and 2/10 public examples flagged. These are detection metrics. They do not measure replay protection.
- [Static performance](../local-evidence/static-performance.json): three cold and warm scans of the 28-file synthetic fixture with labels removed produced equivalent decisions. This workload uses no model calls. It does not demonstrate the complete representative scan token target.
- [Real-app evidence](../local-evidence/real-app/summary.json): 86 source files from four exact upstream revisions were verified by Git blob hash. Both scanner versions generated patches that were applied to isolated Git indexes. The guarded comparison reported no regressions.
- [Reproduction script](../local-evidence/real-app/measure-scoped.mjs): run `node local-evidence/real-app/measure-scoped.mjs 2b2670a` from this checkout. Source blobs and separate baseline/current reports are retained beside the script.
- [Package inventory](../local-evidence/package-dry-run.json): required scanner, core, canary and audit modules are included; local evidence and private recording payloads are excluded.
- `git diff --check` and instruction dash-style checks passed. Independent integration tests reproduced and closed output containment, package-version invalidation and stale private-draft issues.

## Real-app limits

These are scoped source-file evaluations. Local DNS prevented full Git checkouts. The CI workflow fetches all four exact revisions and compares current and base scanners, but that workflow has not run here.

| App and split | Private labels | Exact treatment in the applied proposal | Static source coverage |
| --- | ---: | ---: | ---: |
| Documenso development | 79 | 6 | 7 |
| Chatwoot development | 83 | 15 | 20 |
| Immich development | 2 | 0 | 0 |
| Immich held-out | 4 | 1 | 3 |
| Akaunting development | 1 | 0 | 0 |
| Akaunting held-out | 6 | 1 | 1 |

The low coverage leaves substantial review work. Full-app reviewed coverage and observed recording protection remain unmeasured. Immich and Akaunting retain separate independent model submissions, omissions, disagreements and adjudications. No human review is claimed. Existing Documenso and Chatwoot review provenance remains unverified legacy evidence.

## Canary and recorder gate

The canary executes scan, fixture review, placement, patch verification, Git patch application, application build and a recorder build from an exact archived commit. Its baseline and patched pages contain synthetic private markers and explicit public controls. The scorer checks every emitted JSON key and value, requires baseline evidence that each private channel was exercised, and scores public retention separately.

The rrweb target is commit `a4abb9478bd56bcf8ec9658bd7eb0a6c8c6b78f4`. Package manifests report `2.1.1`; the commit is 25 commits after the nearest `@rrweb/all@2.1.1` tag. The manifest records the bundle and lockfile hashes, configurations and scanner revision. This does not identify an unmodified released 2.1.1 build.

Six prepared cases compare baseline, native-policy and selector configurations for an application and a capability fixture. The capability fixture includes dynamic annotations, reparenting and open shadow roots. Iframes, closed shadow roots, replay rendering, encoded values, inference channels and untested plugins require more verification.

The browser recording gate is blocked. Chrome exited during headless launch, the loopback server returned `EPERM`, and native UI access did not complete. No recording payload, marker-absence result or public-retention score was produced. The current [prepared page](../audit/runner/evidence/handoff/browser.html), [manifest](../audit/runner/evidence/handoff/manifest.json) and [run status](../audit/runner/evidence/handoff/run-status.json) are retained locally.

## Open gates

| Acceptance area | Status and remaining work |
| --- | --- |
| Regression coverage and source patch correctness | Tested on supported source patterns. Template compiler validation and unresolved framework boundaries remain open. |
| Secret treatment and completion | Required blocking and unresolved-candidate behavior have regression tests. Universal discovery is not established. |
| Real-app reproducibility and CI | Pinned scoped evidence passes. Full upstream checkouts and CI execution remain blocked or unrun. |
| Independent labels | New independent submissions and adjudication are retained. Older labels still need independent review. |
| Complete canary recording and recorder capability matrix | Preparation completed. Actual browser recording and capability results remain blocked. |
| Cost and incremental performance | Synthetic cold/warm timings are recorded. Complete model-assisted workload, strict token-cap enforcement and changed-dependency incremental analysis remain open. |
| Release and onboarding | Draft metadata and guides are prepared. GitHub repository, tag and release lookups returned 404 through the available connection, so remote release state is unknown. Publication and onboarding are not ready. |
| Required checks | Local Node tests and source checks pass. Node 18, Windows, full-app CI and the browser completion gate still require execution. |

The OS sandbox probe also returns `sandbox_apply: Operation not permitted` on this host. The automatic reviewer launcher refuses to run without verified confinement. A complete model-assisted scan under 50,000 tokens cannot be claimed from the static-only measurements.
