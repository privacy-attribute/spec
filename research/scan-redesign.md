# Candidate redesign around pattern-led review

Status: proposed architecture, conditional on the comparison and transfer gates in [patterns/README.md](../scan/patterns/README.md). This document does not claim the migration has been implemented or that the current experiment establishes app-wide coverage.

## Primary unit: a fact and its destinations

The primary workflow should ask what information a feature exposes, follow it through every applicable rendering and capture mechanism, and verify the chosen controls. The unit of review is a fact about a subject and its destinations across states. A list of suspicious variable names cannot supply that model.

The coding agent reads product context and source, selects relevant pattern cards, traces producers and callers, and makes evidence-backed decisions. Deterministic tools enumerate structure, check source evidence, validate exact changes and inspect emitted events. Each can reject unsupported conclusions without pretending to make the semantic decision.

Start with application research and an evidence-backed provisional classification profile. Ask only about material ambiguities that available evidence and feasible technical checks cannot settle without the user's knowledge or decision. There is no numerical cap, but every question must justify that dependency and its effect on the review. Group related uncertainties; a questionnaire is not a prerequisite to starting the scan. Keep subject/audience, confidentiality level, special handling and recorder treatment as separate dimensions. Reuse existing organizational policy; do not reinterpret the current scanner's broad `personal` category as a legal determination. The initial comparison predates this intake addition and supplies no evidence that it reduces questions or review cost.

## One workflow

| Stage | Required output | Existing implementation to retain or adapt |
| --- | --- | --- |
| Scope | Features, subjects/audiences, pinned source, recorder contract, exclusions | Session metadata and source snapshots |
| Discover | Structural inventory plus destinations found by the agent, including channels outside DOM | `review/inventory.mjs`, source navigation and explicit diagnostics |
| Trace | Producer, meaning, derivations, actual rendering owner, copies, states and pattern IDs | `review/workflow.mjs` context access; extend decision records after schema design |
| Decide | Per-channel meaning and required treatment, separate from placement | `review/decisions.mjs` and exact evidence validation |
| Place | Native boundary or recorder control, public impacts, supported or unresolved placement | Native placement checks and `review/changes.mjs` |
| Patch | Reconciled exact changes against the pinned snapshot | Source hashes, literal replacements, syntax checks and isolated application |
| Verify | State/channel obligations with actual baseline and patched events, plus public controls | Runtime harness, payload inspection and recorder capability checks |
| Report and learn | Independent discovery, decision, placement and observed-protection counts; preserved misses and new transfer cases | Review evaluators, runtime reports and pattern catalog |

Keep the reviewer in control of meaning. Keep the evidence tools in control of whether a claimed quote, edit, target or recorded result exists. A pattern cue should open an investigation, never auto-complete a classification.

## Evidence model

Preserve separate records for:

- **Fact:** what can be disclosed, the subject, audience and semantic evidence.
- **Destination:** channel, native or external owner, transformation and applicable states.
- **Decision:** privacy category, sensitivity, required treatment and rationale with pattern IDs.
- **Placement:** exact control location, forwarding evidence, public effects and unresolved dependencies.
- **Verification obligation:** source and configuration, baseline positive, private absence, public retention, exercised phase and environment.

One fact can have several destinations. One destination can change subjects or content class across states. Several facts can share a valid protection boundary, but must retain independent evidence. A recorder-level channel must remain representable even when no JSX element exists.

Do not collapse these into a single covered flag. Meaning can be decided while placement is unresolved. A correct applied annotation can remain unverified at runtime. A successful recording test can cover one state while another remains open. Reports must display those differences.

## Content mapping and focused review

The current instructions now map surface purpose and value shape before selecting patterns. Fixed copy, constrained choices, record-derived values, unrestricted content, derived values, resources and mixed payloads guide investigation; none determines confidentiality by itself. The reviewer checks constraints at the producer and keeps subject/audience policy separate.

After the first trace, cue-selected review lenses challenge meaning, copies, placement, transitions, inference and public fidelity. Prompts use concrete feature scope and reconcile findings into existing decisions. `review-map.md` is an optional working note for complex features, not a new schema or completion gate. This instruction change does not implement the proposed architecture migration or establish improved discovery.

## Catalog role

The catalog provides stable mechanism IDs, recognition cues, investigation steps, treatment rules, public counterexamples, verification requirements and links to combinations. Load relevant families progressively. Attach evidence with its original scope; distinguish proposed mechanisms, source-review examples and actual recording observations.

Do not require every possible combination to have an individual card. Teach the worklist traversal and test combinations selected for distinct failure mechanisms. Feed misses into reusable cards, then test the revision on a fresh feature before marking transfer evidence.

## Migration sequence

1. Freeze and compare the baseline and candidate methods. Preserve source judgments before exposing expectations. Report false-public decisions, inadequate treatments, excess protection, unresolved work and cost separately.
2. Extend to multiple real apps with no supplied destination list. Independently inspect omissions and run representative patch/recording checks. Include at least one new feature after each material guidance correction.
3. Introduce the fact/destination/obligation schema with converters from current review records. Add compatibility tests for preserved evidence, unresolved states and public impacts.
4. Make one review workflow the documented CLI entry point. Inventory and exact-edit tools become supporting commands. Remove heuristic classifications from the primary path only after the comparison supports doing so.
5. Move the earlier heuristic commands into a clearly identified baseline path during migration. Keep their benchmark results reproducible. Remove obsolete duplication only after compatibility and end-to-end checks pass.
6. Rework caching around unchanged source evidence, component dependencies, the project classification profile and recorder contracts. Invalidate affected facts and destinations on changes to policy, subject assumptions, source or capture behavior. Reuse does not erase obligations for untested states.

The first synthetic target-list comparison can expose bad teaching or a useful improvement. It cannot alone justify this whole migration. If both guidance versions perform similarly, preserve the catalog as organized knowledge and run a harder discovery evaluation before changing the architecture.
