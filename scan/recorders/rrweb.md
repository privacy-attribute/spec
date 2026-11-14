# rrweb

Choose the annotation style for the rrweb build and configuration you deploy. The scanner selects rrweb classes when you pass `--sdk rrweb`. Add `--annotate data-privacy` to generate the [draft core attribute](../../spec/core.md).

Those switches belong to the earlier `find`/`patch` workflow. In the skill-led workflow, `review-patch` emits `data-privacy` only. Use `proposed_changes` and `review-proposals` for rrweb classes or recorder configuration, then reconcile both outputs into one usable patch. Do not present an attribute-only patch as effective when its consumer is absent.

The dashboard's `start({ maskAllInputs: true })` example masks inputs; it does not itself activate `data-privacy` or mask private page text, URLs, attributes or separate metadata. Inspect the installed package, lockfile, wrapper defaults and every initializer. Prefer the deployed build's supported classes unless native attribute support or selector configuration is verified. A local feature branch implementing `privacyPolicy` is not evidence that a released package supports it.

## rrweb classes

| Class | Default rrweb control |
|-------|----------------------|
| `rr-block` | Replace the element with a layout placeholder in the DOM snapshot. |
| `rr-mask` | Mask text in the element and its descendants. |
| `rr-ignore` | Suppress input events. |

`rr-mask` covers DOM text. Set `maskAllInputs: true` or the appropriate `maskInputOptions` in `record()` to mask field values. Verify the options your wrapper supplies. The rrweb audit adapter models `@rrweb/browser-client` with `maskAllInputs: true`.

Use `rr-block` for a secret field or a private value in an attribute. Keep public content outside the protected element. Test live updates and events with the deployed build and options.

Matching core attributes can accompany rrweb classes, for example `class="rr-mask" data-privacy="mask confidential"`. Classification is optional and uses a token in the same attribute. It supplies no recording control: any `block` token supersedes `mask`, regardless of order. See [annotation authoring](../skill/references/annotation-style.md) and the [pinned compatibility check](../../spec/rrweb-compatibility.md). The CLI still emits one selected style; combined annotations use exact source proposals.

## Native `data-privacy` support

For a build that supports `privacyPolicy`, use `privacyPolicy: { version: 1, preset: 'balanced' }` in `record()`. The previously tested commit `a4abb9478bd56bcf8ec9658bd7eb0a6c8c6b78f4` recognizes only exact `block`; combined block values require the token-support patch described in the compatibility check or verified token-aware selectors. Native policy support alone does not prove token support. Check the exact SDK build with the [core browser check](../../audit/runner/README.md#check-the-privacy-attribute).

## Legacy selectors

For older builds, the selectors below request block for matching elements and mask for text. The mask selector also matches empty and unrecognized attribute values.

```js
const mask = '[data-privacy]:not([data-privacy~="block"])';

record({
  blockSelector: '[data-privacy~="block"]',
  maskTextSelector: `${mask}, ${mask} *`,
  maskAllInputs: true,
});
```

This configuration requests global input masking. Older builds can expose `title`, `placeholder`, and `aria-label`, and may handle live updates or shadow roots differently. Use a verified block for private values in those attributes and test each capture path you depend on. Use a separate rrweb control when you need to suppress input events.

## Other recorder options

| Option | When to use it |
|--------|----------------|
| `maskInputFn: () => '*'` and `maskTextFn: () => '*'` | Use a fixed replacement to hide value length in the replacement text. |
| `slimDOMOptions: { comment: true }` | Omit HTML comments when the page contains comments with private data. |

## Measured limits to check before claiming protection

The [2026-11-14 live-skill review](../../research/live-skill-review-2026-11-14.md) exercised actual `@rrweb/browser-client` `start()` from release-source commit `801c984d205bfab0f162d775b38033bd09c86b7a` (2.2.2) in JSDOM with an in-memory transport. These are bounded source-build observations, not a deployed application or published-package audit. Recheck the installed build and relevant browser flows.

- **Attributes are not enabled by input masking.** This release-source build ignored `data-privacy`, including when supplied the unsupported `privacyPolicy` option. Supported classes or verified selectors were needed. Masking text left private title, placeholder, ARIA, URL, style and other attribute channels clear; use a verified block for those channels.
- **Same-name radio groups can cross a block boundary.** Changing an unblocked radio emitted a blocked sibling's raw value in an input event. Inspect the whole group. In this probe, an `ignoreSelector` covering all radios in the group suppressed those input events while preserving public DOM; blocking the entire group also prevented the leak with greater fidelity loss. Input masking and `sampling.input: 'last'` are not substitutes. Test the chosen control with baseline-positive interaction events.
- **Pointer coordinates can reveal a blocked keypad.** The probe retained mousemove coordinates with a blocked target ID. `sampling: { mousemove: false }` removed the exercised coordinate channel while preserving the tested public click, at the cost of cursor movement replay. Other interaction channels still need their own checks.
- **Adding block after capture is not a reliable transition.** Descendant text and attribute mutations leaked when an already captured ancestor was strengthened to block. In the probe, replacing it with a new subtree already blocked before attachment prevented the new private values from appearing. Already captured data cannot be removed by a later annotation. Prefer protection present before first private render and test state transitions explicitly.
- **Navigation metadata is separate.** Default Meta events included path, query and fragment despite DOM blocks and default `includePii: false`. Inspect all wrapper and recorder metadata. The tested pre-transport `plugins[].eventProcessor` replacement removed the URL marker from initial and checkout events; use an application-specific allowlist or redaction before transmission, not after upload. Check navigation updates and other integrations separately.

If a required channel has no verified control, report it as a blocker for that recording scope. A clean DOM snapshot alone cannot settle these cases.
