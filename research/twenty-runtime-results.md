# Twenty runtime review: evidence and remaining work

Evaluated 2026-11-11. The source-review approach now has actual emitted-recording evidence for a bounded set of Twenty components. The original proposal protects the tested private email destinations and blocks the API-key input. Runtime challenges exposed a missed hidden text copy in the shared autogrow input. An additional patch closes that copy, including its placeholder branch, in the exercised states.

Execution used a DOM emulator with actual pinned component bodies and recorder code, plus declared adapters. This is not a full Twenty application build or a browser result. The revised guidance has not yet been tested on untouched features, so this exercise does not establish its general accuracy.

## Observed behavior

| Flow | Original source under balanced recording | Proposed source under the same configuration | Additional fix |
| --- | --- | --- | --- |
| API key, two different lengths | Masked native input and a scripted input event remain; mask lengths differ | Native input descendants and their input events are absent. Public Copy remains; the synthetic clipboard callback receives the exact original and changed key | None needed in this component flow |
| Private email | Raw email text and `mailto:` URLs appear in snapshots and updates; malformed fallback text also appears | Tested private markers disappear across initial render, changes and later snapshots. Valid links are blocked; malformed text is masked; the null state retains an empty anchor without a URL | None needed in this component flow |
| Public email through the shared display | Public text and URLs remain | Public text and URLs remain, including changed and malformed states | None |
| Annotated shared autogrow input | Value is copied into a CSS-hidden sizing span and recorded as text | The original proposal still exposes this sibling copy, including after edits | Follow-up carries the input's explicit privacy treatment to its measurement content |
| Empty-valued privacy attribute challenge | Hidden copy remains exposed | Hidden copy remains exposed | Follow-up also protects this runtime challenge; the normal TypeScript prop contract only declares `mask` and `block` |
| Private placeholder in an empty autogrow input | Placeholder is copied into the hidden span and recorded | Original proposal still exposes the placeholder copy | Follow-up protects the selected placeholder, subsequent value, and return to empty |
| Unannotated public autogrow caller | Public measurement value and empty-state placeholder are recorded | Public measurement value and placeholder remain | Both remain after the follow-up |

The API-key caller does not enable autogrow. The hidden-span failures come from separate challenges exercising the real shared TextInput component. The email fixture supplies the proposed `protectEmailAddress` prop directly; it does not execute the CRM route or overflow-menu parent that supplies it in the application.

## Why the hidden-copy finding matters

Twenty's autogrow wrapper renders a CSS-hidden span to measure the selected value or placeholder. The input's own privacy attribute does not cover that sibling. The original recording includes `PRIVATE_GROW_A_7913` in snapshot text, then `PRIVATE_GROW_B_8024` in a text mutation. The same failure appears with a private placeholder when the input is empty.

The follow-up wraps the selected measurement content in a span carrying the input's explicit treatment. It preserves unannotated callers and leaves the existing undefined-node fallback in place. The recorded tests exercise values, changes, empty states, placeholders and restoration; undefined-node fallback and real layout behavior still require targeted verification.

This supplies a concrete lesson for the agent: follow each value through every rendered copy and fallback branch. The guidance now includes layout copies, private placeholders, public counterexamples and channel-specific recording controls. An independent reviewer checked the actual measurement text-node mutations and challenged the scorer with fabricated unrelated fields. The scorer now rejects those substitutions and follows the measurement span's recorded node identities.

## Fidelity and function

Public Copy, the independent public control, field labels, hints and the public email caller survive the tested recordings. Scripted editing reaches the component's actual onChange callback. The actual copy hook reaches a synthetic clipboard sink with exact values; operating-system clipboard integration remains untested.

Two empty-state cases intentionally lose a public placeholder's hidden measurement copy after the follow-up. Both inputs explicitly request privacy protection. This is an additional fidelity cost of carrying that treatment to the copied content. The unannotated public caller retains its measurement text and placeholder.

The balanced recorder configuration already masks input values and selected text attributes, including placeholders, before any source patch. Those existing losses are attributed to the configuration. Marker absence in an API-key value alone therefore supplies no evidence that the source block added protection. Its observed contribution is removal of the input subtree and input events. The two patched key recordings match after timestamps are removed; a DOM emulator cannot establish layout or timing independence.

## Execution and provenance

- Twenty: `0036a6f7f9d3d5112d03c9c3f142f66c09224ff7`. Source and supplemental files were checked against Git blob hashes before isolated patch application.
- rrweb: `a4abb9478bd56bcf8ec9658bd7eb0a6c8c6b78f4`. Package manifests say 2.1.1, but this commit is 25 commits beyond the nearest tag. It is not an unmodified released 2.1.1 build.
- React / React DOM 19.2.4; jsdom 16.7.0; esbuild 0.28.2. The bundle uses pinned Linaria runtime 7.0.1, core cx 7.0.0 and Base UI merge helpers 1.9.0.
- Declared adapters compile CSS templates into fixture metadata and provide basic theme, field/render wrappers, icons, focus/hotkey stubs, translations, a native Copy button, clipboard sink and toast observations. Production Linaria compilation and full Twenty platform behavior are outside this fixture. Adapters do not choose privacy annotations.
- Ten flows × original/proposed source × default/balanced recorder configurations = 40 recordings before the follow-up and 40 after. Every emitted event was cloned at emission and retained. Initial, update, input and final-snapshot phases are separately identified.
- Before follow-up: 556 checks passed, with three explicitly reported privacy findings. After follow-up: 559 checks passed, with those three findings absent. The first result deliberately preserves known findings; zero failed harness checks does not mean zero leaks.

Manifests retain source, patch, adapter, bundle, recorder and driver hashes. Artifact checks record the scorer and browser-file hashes. Tooling test totals are reported separately from privacy outcomes.

The complete local suite passes 179 tests on Node.js 20, 22 and 24. Ten scorer tests include adversarial checks for missing runs and roots, mislabeled configurations, corrupted Copy output, missing input events, vanished public controls, wrong-phase evidence and unrelated text substituted for a measurement mutation. `git diff --check` passes. Package dry-run includes the runtime tooling and excludes local application source snapshots and recording payloads.

## Evidence and reproduction

| Artifact | Location |
| --- | --- |
| Original proposal recordings and findings | [recordings.json](../local-evidence/runtime-twenty/expanded-before/recordings.json), [score.json](../local-evidence/runtime-twenty/expanded-before/score.json) |
| Follow-up recordings and findings | [recordings.json](../local-evidence/runtime-twenty/expanded-after/recordings.json), [score.json](../local-evidence/runtime-twenty/expanded-after/score.json) |
| Follow-up source change | [autogrow-followup.patch](../local-evidence/runtime-twenty/autogrow-followup.patch), [source evidence](../local-evidence/runtime-twenty/autogrow-followup.json) |
| Exact source and runtime provenance | [manifest.json](../local-evidence/runtime-twenty/expanded-after/manifest.json), [artifact checks](../local-evidence/runtime-twenty/expanded-after/artifact-checks.json) |
| Independent pre-recording expectations | [oracle.md](../local-evidence/runtime-twenty/oracle.md) |
| Prepared manual browser test | [browser.html](../local-evidence/runtime-twenty/expanded-after/browser.html) |
| Reproduction commands and dependency contract | [runtime README](../scan/runtime/README.md) |
| Final tooling test logs | [Node 20](../local-evidence/runtime-twenty/node20-tests.log), [Node 22](../local-evidence/runtime-twenty/node22-tests.log), [Node 24](../local-evidence/runtime-twenty/node24-tests.log) |
| Package inventory | [package-dry-run.json](../local-evidence/runtime-twenty/package-dry-run.json) |

Earlier exploratory runs remain in separate directories. The `expanded-before` and `expanded-after` artifacts above are the final matrices for this report. Local source snapshots and recording payloads are excluded from the published package inventory.

## Remaining verification

The browser tool rejected local file URLs and explicitly prohibited alternate browser access as a workaround. The self-contained browser artifact has passed JavaScript syntax checking, but has not been executed. It makes no network requests. Open it manually, select **Run browser checks**, and download the JSON for scoring with the command in the runtime README. Partial runs remain incomplete evidence.

After that, the remaining work is full-app compilation and route execution, overflow portals, real clipboard and trusted input, visual layout and replay checks, followed by an untouched-feature evaluation of the revised guidance. The earlier reviews of Documenso, Chatwoot, Immich and Akaunting remain source-level evaluations; this runtime result does not extend to those apps.

No upstream application was modified, and no commit, push, release or external report was made. The recorder operator remains responsible for recording contents. This bounded test does not establish legal compliance.
