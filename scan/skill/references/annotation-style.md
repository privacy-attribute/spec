# Recorder annotations and optional classification

Use the project's existing annotation convention and verify the actual native destination. For rrweb-first work, use `rr-mask` or `rr-block` as appropriate. A matching core `data-privacy` attribute can accompany the class for portability when the edit is straightforward. Use `className` in JSX and the framework's native syntax elsewhere. Keep both controls consistent and preserve stronger existing protection.

```html
<span class="rr-mask" data-privacy="mask confidential">
  Customer display name
</span>
```

```html
<div class="rr-block" data-privacy="block restricted">
  Credential widget
</div>
```

Classification uses optional tokens in the same `data-privacy` attribute. Do not introduce a separate classification attribute. Labels do not cause masking or blocking; the explicit treatment token does. Emit only a generic classification level already supported by the project's policy and reviewed meaning. Do not put private values, sensitive descriptions or inferred diagnoses in the label. An ordinary data attribute can itself be captured.

## Keep the overhead small

- Add classification in the same source edit when the label is already known and useful.
- Omit it when it would require another classification pass, new dependencies, a wrapper or an extra user question merely to supply a label.
- Do not infer `confidential` automatically from the scanner's `personal` or `third-party` category. Those describe different dimensions.
- When the component API drops or rejects these attributes, keep the classification in the review record unless forwarding it is already necessary and justified. Protection must still reach the actual native destination.
- Verify classification metadata and privacy control updates together when the element changes context. Metadata never overrides a stronger protection requirement.

## Block supersedes mask

The core uses case-sensitive ASCII-whitespace tokens. Any complete `block` token supersedes `mask`, regardless of order: `data-privacy="mask block confidential"` blocks. A label such as `confidential` never weakens protection. An empty or unknown-only value falls back to mask. Preserve existing labels when strengthening mask to block.

Older exact-value consumers can misread `block confidential` as mask and expose private URLs. Verify token support before relying on combined values. For rrweb, use the tested token-support patch or verified token-aware selectors; an accompanying `rr-block` class can retain blocking on older builds. Do not assume a spec change updates a deployed recorder. If the deployment cannot support combined values, retain exact treatment values and the classification in the review record until compatibility is established.

## Verify the recorder channels

`rr-mask` masks DOM text; field values require the appropriate rrweb input configuration. Legacy class or selector support may leave `title`, `placeholder` and `aria-label` clear. Adding a core attribute does not enable native support in a recorder that lacks it. Use a verified block or supported recorder control for those private channels. Test the actual deployed build and settings.

The existing scanner CLI selects one annotation style at a time. Do not invent a dual-output switch. Where dual annotations or metadata are useful, supply an exact source-supported change through the existing review-proposals workflow and reconcile it with any native patch. This is optional authoring guidance, not a new automatic CLI mode.

The bounded [compatibility probe](../../../ANNOTATION_COMPATIBILITY.md) exercised the pinned recorder in a DOM emulator. It supports the stated local compatibility distinction, not universal SDK or full-application guarantees.
