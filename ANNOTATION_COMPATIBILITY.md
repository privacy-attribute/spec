# One privacy attribute: treatment and optional classification

Updated 2026-11-11. Classification belongs in the same attribute:

```html
<span data-privacy="mask confidential">Customer display name</span>
<div data-privacy="block restricted">Credential widget</div>
```

`block` supersedes `mask` wherever it appears in the token list. `mask block confidential` and `confidential block mask` both block. Labels such as `confidential` supply no recording behavior. A present attribute with only unknown tokens still falls back to mask. The [core](spec/core.md) defines case-sensitive complete tokens separated by ASCII whitespace; the same rules are represented by CSS `[data-privacy~="block"]`.

Classification is optional. Add an already-established generic label in the existing source edit; do not require another attribute, classification pass, or user question just to fill it. The scanner's category and the organization's confidentiality level are separate decisions. Do not infer one mechanically from the other.

## Compatibility baseline

The previous core draft and pinned rrweb commit `a4abb9478bd56bcf8ec9658bd7eb0a6c8c6b78f4` used an exact block value. That recorder treats `block confidential` as mask, retaining descendants and potentially exposing private URLs. The core draft has now changed; existing deployed recorders do not change with it.

The historical probe captured 14 recordings: seven markup variants under native balanced policy and class configuration with `maskAllInputs: true`. It used jsdom 16.7.0 on Node 24, synthetic text/title/input/URL markers, initial and final snapshots, live mutations and a scripted input event. Each run required two snapshots, no reported runtime errors and a retained public button. The recorder bundle hash was checked against its saved manifest. Package manifests say 2.1.1, but the commit is 25 commits beyond the nearest tag; this is not a test of an unmodified released 2.1.1 build.

| Baseline check | Observation |
| --- | --- |
| `mask confidential`, native balanced | Text masked by fallback; input structure retained |
| `block confidential`, native balanced | Input descendants retained; private URL markers exposed initially and after change |
| Exact `block`, native balanced | Input descendants and private URL markers absent |
| A separate classification attribute alone | Private text remains exposed |
| Matching rrweb classes and exact core values | Text/input masking or subtree blocking worked in the tested configurations |
| Class-only masking | Private title attributes remained exposed |
| Native balanced masking | Private title markers absent in this build |

All ten baseline checks passed, including assertions of expected exposures. Those exposures are compatibility findings, not successful protection. The old separate-attribute recommendation is superseded by the token grammar.

Historical evidence is preserved unchanged:

- [Baseline probe](local-evidence/annotation-metadata/probe.mjs)
- [Baseline recordings and checks](local-evidence/annotation-metadata/results.json)

## Isolated rrweb patch and executed recording checks

The [rrweb patch](local-evidence/privacy-tokens/rrweb-privacy-tokens.patch) is prepared against the pinned commit in an isolated archive. It changes native block matching to `[data-privacy~="block"]`, excludes block tokens from the mask fallback, updates guidance and adds regression cases. Existing rrweb-specific bare `unmask` and `ignore` behavior is retained; this patch is not a claim of complete core conformance.

The recording probe also exposed a pre-existing live-update issue: after an already captured ancestor becomes blocked, descendant text and attribute mutations can still be emitted. The patch adds ancestor checks for those two mutation paths. This fix is separate from the token grammar.

The [reproducible probe](local-evidence/privacy-tokens/verify.mjs) builds the pinned source, a grammar-only variant, and the full patch with esbuild 0.28.2. It executed on Node 26.13.0 with jsdom 16.7.0 and nwsapi 2.2.0. Run from this repository:

```sh
node local-evidence/privacy-tokens/verify.mjs /path/to/rrweb-checkout
```

Results: **38 scenarios passed, zero failed; two additional scenarios expose emulator limitations.** Checks exercise initial snapshots, live text/attribute/child mutations, input events, a subsequent full snapshot, and public controls. Configurations include native balanced policy, one strict case, default behavior, and the documented legacy selector configuration. Cases include classification labels, both mask/block orders, repeated block tokens, ASCII separators, case/substrings, fallback values, rrweb extensions and dynamic strengthening.

| Dynamic transition | Pinned descendant mutation records | Grammar-only | Full patch |
| --- | ---: | ---: | ---: |
| Native: mask to exact block | 4 | 4 | 0 |
| Native: mask to mixed block tokens | 7 | 4 | 0 |
| Legacy selectors: mask to exact block | 4 | 4 | 0 |
| Legacy selectors: mask to mixed block tokens | 4 | 4 | 0 |

The pinned and grammar-only variants expose changed private values in those transitions; the full patch suppresses the tested mutations and input events and omits the descendants in the subsequent snapshot. Previously emitted values are not retroactively erased. This does not verify every reparenting, buffering, shadow-root or replay transition requirement.

For non-breaking space and vertical tab, jsdom's selector engine incorrectly treats the character as a CSS token separator, while its DOM token list does not. Those cases are reported separately, not counted as passes. The scanner tests the specified ASCII grammar; correct recorder behavior for these two cases still needs a real-browser check.

Both focused upstream Vitest suites also passed: 103 snapshot privacy tests and 25 recorder privacy tests, **128 total**. They ran in the isolated archive with source aliases and jsdom environments. [Complete test log](local-evidence/privacy-tokens/rrweb-upstream-vitest.log) and [reproduction instructions](local-evidence/privacy-tokens/README.md) are retained. These are focused suites, not the full upstream test suite.

[Recorded results and source/build hashes](local-evidence/privacy-tokens/rrweb-probe-results.json) preserve the comparison. The patch hash matches the executed probe. No original rrweb checkout or deployed recorder was modified.

## Scanner implementation and checks

The patcher recognizes complete block tokens, preserves stronger existing controls, and keeps classification labels when upgrading a static value to block. The benchmark measurement uses the same treatment recognition; the executable canary's legacy selectors now use token matching. Tests cover both token orders, ASCII whitespace, non-ASCII non-separators, case and substring mismatches, encoded source values, unknown-only fallback, label preservation and rejected weakening edits. Dynamic expressions still require explicit review.

All 190 repository tests passed on Node 20, 22 and 24. The generated pattern references and diff whitespace check also passed. The core browser-check fixture now includes combined values and precedence cases; that browser check has not been executed here.

- [Node 20 test log](local-evidence/privacy-tokens/node20-tests.log)
- [Node 22 test log](local-evidence/privacy-tokens/node22-tests.log)
- [Node 24 test log](local-evidence/privacy-tokens/node24-tests.log)

## Deployment and scope

Use an updated recorder or verified token-aware selectors before relying on combined block values. The [rrweb guide](scan/recorders/rrweb.md) supplies selectors and their channel limits. Matching `rr-block` classes can retain blocking on older class-based configurations. Native policy support alone does not establish token support.

The CLI still selects one annotation style. Optional classification tokens and dual rrweb/core annotations can use exact source proposals; there is no new classification questionnaire or dual-output flag.

The recorder checks use a DOM emulator, not a real browser or full application. No runtime performance or model-token savings have been measured. Upstream recorder source and deployed builds have not been modified.
