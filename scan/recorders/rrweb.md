# rrweb

Choose the annotation style for the rrweb build and configuration you deploy. The scanner selects rrweb classes when you pass `--sdk rrweb`. Add `--annotate data-privacy` to generate the [draft core attribute](../../spec/core.md).

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
