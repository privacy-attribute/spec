# Live privacy-scan review — 2026-11-14

The published handoff is not yet a dependable assurance that an application is safe to record. Three independent reviews found a gap between the generated annotations and the default recorder, a false-completion path in discovery, and recorder channels that remain exposed despite DOM blocking. Full-codebase access helps resolve source and placement questions; it does not remove recorder defects or prove runtime protection.

Local improvements address the skill and narrow scanner defects. A separate dashboard patch is prepared for review. Nothing was pushed or deployed, and the original dashboard and rrweb repositories were not modified.

## Scope and provenance

| Item | Evidence |
| --- | --- |
| Published scan source | `privacy-attribute/spec` main at `7767b841146159f3dce45364a1169eeb00fc4158`, verified through GitHub and frozen before edits |
| Dashboard handoff | `apps/dashboard/src/components/onboarding/agent-prompts.ts` at `08c0959d6c8f490db6eaf3d9e69f21f480265daa`, fetched through GitHub |
| Full application source spot check | Local dashboard checkout `680aa9dc425e643a6dad5b4cd5de6836da8da457`; bounded teammate-invitation feature, its producers, shared renderers and two recorder initializers |
| Released-version source tested | rrweb commit `801c984d205bfab0f162d775b38033bd09c86b7a`, with seven package manifests at 2.2.2 |
| Native-policy comparison | Local feature-source commit `a4abb9478bd56bcf8ec9658bd7eb0a6c8c6b78f4`; this is not evidence about the published 2.1.1 package |
| Reviewers | Three independent `gpt-6.1-sol` reviewers: discovery, recorder protection, and workflow/fidelity; root reconciled findings and changes. Token usage was not measured. |

The dashboard URL resolves to a directory on moving `main`. This review verified source, not the deployed dashboard UI or the npm bytes a new user currently installs. The dashboard's unversioned npm instruction is not constrained by its own repository's 2.1.0 lockfile entry. Its CDN `current` catalog declared 2.2.2 at the checked source revision.

## Findings

### 1. High: the handoff can produce annotations that the recorder ignores

The dashboard prompt installs Browser Client, calls `start({ maskAllInputs: true })` as early as possible, and then asks the agent to scan. The primary `review-patch` command emits only `data-privacy`. The prompt supplies neither selectors nor a native policy that supports those attributes.

Actual `start()` tests against the 2.2.2 source build retained synthetic private page text, URL and media markers under core-only annotations. Supplying the unsupported `privacyPolicy` option did not activate them. Supported rrweb classes or token-aware selectors protected the exercised static DOM cases. The shipped skill mentions this compatibility distinction, but its default artifact and dashboard setup still permit the incompatible combination.

**Local correction:** the skill now requires one reconciled recorder-compatible patch and explicit configuration verification. The recorder guide distinguishes the legacy scanner's `--sdk rrweb` option from the skill-led commands. The proposed dashboard change scans before enabling capture and includes the token-aware selectors alongside the generated attributes. It also asks for verification of channels those selectors cannot reach.

### 2. High: a green inventory review can omit a private destination

A complete six-file fixture has two routes and four independently enumerated rendering destinations. The shipped scanner produced three sites, zero parser failures, and `review_complete: true`, while a private email rendered directly through an aliased React portal was absent from the patch. The zero-prop component leading to that destination also supplied no traversal cue. All source was available.

In the real application, the teammate-invitation path crosses aliases, shared components, a no-prop form, internally loaded Clerk context and a Radix portal. An outer wrapper could hide the invite trigger while leaving the portaled form outside its DOM ancestry. Two independent recorder initializers were also present in source. This was a bounded feature inspection, not an audit of every dashboard route.

**Local correction:** inventory now exposes non-native JSX component uses separately from rendered-value decisions and flags recognized scalar/opaque `createPortal` children as unsupported destinations. The same whole-fixture review now exits incomplete with the exact portal gap. The skill requires an application-wide route/capture ledger, dependency tracing across batch boundaries, and inspection of no-prop and identifier-only components. Unread source is unfinished work.

**Remaining limit:** this does not implement a complete route or alias graph. A scoped route-only inventory can still finish its own decisions; the agent must reconcile its result with the application ledger. Component uses are traversal cues, not proof that the dependencies were reviewed.

### 3. High: DOM blocking does not close every recorder channel

The recorder review exercised 19 sessions and 39 assertions through actual Browser Client `start()`, serialization and an in-memory WebSocket boundary, including an isolated radio-fix comparison. Assertions include expected exposures as well as successful controls; 39 passing assertions does **not** mean 39 privacy-safe scenarios.

| Observed exposure | Tested mitigation and cost |
| --- | --- |
| Changing an unblocked radio emitted a same-name blocked sibling's raw value in an input event with `id: -1`. | Keep the private radio blocked and suppress input events on every triggering radio in the group with a matching `ignoreSelector`, or block the whole group. The former retained public DOM but lost group input events. |
| Strengthening an already captured ancestor to block still allowed private descendant text/title/href mutations before checkout. | Replace it with a newly constructed subtree already blocked before attachment. The exercised replacement prevented those new private values from entering the payload. Earlier captured data remains captured. |
| A blocked keypad still emitted precise mousemove coordinates. | Disabling mousemove sampling removed the exercised coordinate channel while retaining the tested public click; cursor movement replay is lost. Other interaction channels remain separate checks. |
| Meta events contained full path, query and fragment despite DOM blocking and default `includePii: false`. | The tested pre-transport event processor replaced Meta URLs at initial capture and checkout. Application metadata, custom events, navigation changes and wrapper-added fields require their own allowlist or redaction. |
| Text masking left private attributes, CSS and some choice values/state clear. | Block appropriate native destinations and address separate stylesheet, metadata and interaction capture. Keep private values out of class names and location. |

The native-policy feature branch also misread combined `block` tokens and retained URL markers. Matching classes or token-aware selectors mitigated the static cases; they did not fix the late-block mutation defect.

**Local correction:** the guide and skill now teach these measured limits, source cues, mitigation costs and verification requirements. A separate isolated SDK patch checks block/ignore controls on each radio sibling; the extended probe stopped the private sibling emissions while preserving eligible public radio updates. That patch is not landed or deployed and has not run the full SDK test suite. The radio and dynamic-mutation defects still require SDK release work or verified application-specific mitigation. A DOM patch cannot justify a blanket recording-safety claim.

### 4. Medium: available source work could end too early or hide too much public content

The shipped instructions allowed a review to finish when artifacts existed or their absence was explained, accepted explained `review_complete: false` as a valid finish, recommended wrappers around unread children, and globally masked unknown notification messages. They also treated native dialogs and popovers as necessarily detached.

**Local correction:** return a clearly labelled partial result only for a concrete remaining blocker; complete feasible source work first. Trace notification producers and preserve proven public messages. A wrapper is interim containment only when its ancestry is supported. Native top-layer presentation does not itself reparent DOM nodes; library portals must be inspected separately. The [CSS top-layer specification](https://drafts.csswg.org/css-position-4/#top-layer) distinguishes rendered boxes from document position.

### 5. Medium: the user-question policy and generated commands were inconsistent

The shipped skill imposed a hard three-question ceiling and speculative probes even when useful decisions were settled. Its longer implementation prompt allowed evidence-driven follow-ups. Generated `REVIEW.md` invoked a bare `privacy-scan` command even though the documented `npm ci` checkout does not install that command globally.

**Local correction:** at most three necessary questions in the initial batch; additional questions only for consequential ambiguity requiring user knowledge or a decision. Technical questions remain agent work. Generated commands now use the actual Node executable and CLI path, with shell-quoted session paths. A regression executes them without a scanner on `PATH`, including spaces, an apostrophe and literal shell syntax in the path.

### 6. Medium: some genuine findings cannot use the exact-proposal schema

`proposed_changes` requires a reviewed inventory site ID. An omitted portal or metadata-only capture finding may have no such ID, even when source establishes the meaning and exact correction. Two independently valid generated patches can also conflict through overlapping diff context.

**Local correction:** retain the genuine finding and tool gap; never borrow an unrelated ID. Produce a source-hashed supplemental patch, verify it separately in an isolated copy, and reconcile all edits into `privacy-review.patch`. Identify supplemental edits as outside scanner proposal validation. A schema extension remains future work; exact patch application does not prove runtime protection.

**Lower-priority packaging issue:** the npm package includes the skill but excludes research documents referenced by some cards. The Git checkout has those references. The package's evidence links should be made self-contained before positioning the tarball as the complete review package.

## Verification

| Check | Result and limit |
| --- | --- |
| Frozen repository test suite | 380/380 passed before the review; these passing tests did not detect the demonstrated gaps |
| Updated repository test suite | 383/383 passed on Node 24 |
| New discovery regressions | Component traversal cues and scalar/opaque portal failures; full fixture changes from false green to explicit incomplete |
| New bootstrap regression | Generated commands execute without global installation and preserve difficult session paths literally |
| Recorder exercise | 19 sessions, 39 assertions on two committed source builds and an isolated radio-fix build; JSDOM 16.7, Node 26.13, esbuild 0.28.2 |
| Forward workflow exercise | Three reconciled patches applied in isolated copies; synthetic React renders retained public headings and labels; a supplemental metadata correction removed its marker in a local fixture. No rrweb protection claim from these checks. |
| Dashboard prompt proposal | Four scan/metadata combinations executed; no recorder started; separate patch prepared against the fetched source |
| Diff hygiene | `git diff --check` passed |

Recorder tests used synthetic markers, baseline positives, public text/image controls and public clicks. Resource loading and real network transport were disabled. The unused canvas worker was stubbed, placeholder geometry mocked, and a test-only CSSOM owner link supplied for JSDOM. No real browser, real user input, replay player, authenticated app or production deployment was exercised. Full dashboard lint/build/replay checks have not been run for the separate dashboard proposal.

The three reviewers establish concrete failure cases and bounded improvements. They do not measure whole-application recall or prove that every possible sensitive data path is covered. No claim is made that Twenty CRM or other previously tested applications were rerun in this live-skill review.

## Review artifacts and next release steps

Evidence is in `local-evidence/live-skill-review-2026-11-14/` (kept out of the public repository by the existing ignore rule):

- `shipped-spec/`, `dashboard-agent-prompts.ts`, `provenance.json`: frozen inputs.
- `review1/review.md`, `reproduce.mjs`, `shipped-result.json`, `candidate-result.json`: discovery findings and reproduction.
- `review2/README.md`, `repro.mjs`, `results.json`: recorder findings, exact build hashes, emitted-event observations and mitigations.
- `review2/rrweb-radio-privacy.patch`: isolated SDK correction, tested by the recorder probe but not applied upstream.
- `review3/`: workflow/bootstrap fixtures, findings and forward exercises.
- `baseline-tests.log`, `candidate-tests.log`: repository test output.
- `dashboard-handoff.patch`, `dashboard-agent-prompts.candidate.ts`: separate dashboard proposal.

Before describing the live flow as protective, land and deploy the compatible dashboard handoff together with the skill changes. Verify actual installed recorder bytes, apply the resulting patch in a representative full application, and exercise real browser flows with baseline-positive canaries. For the demonstrated recorder defects, land SDK corrections or keep affected recording scopes behind verified mitigations. Keep the source-review and observed-protection results separate in the dashboard-facing outcome.
