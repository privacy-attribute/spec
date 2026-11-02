# rrweb

This file tells you how rrweb reads annotations and the configuration to add. It applies to rrweb 2.x and to rrweb Cloud (`@rrweb/browser-client`).

## Annotation style `rrweb`

rrweb reads these classes with no configuration:

| Annotation | Class | Effect in rrweb |
|------------|-------|-----------------|
| `block` | `rr-block` | rrweb records a placeholder of the same size. rrweb records nothing in the element. |
| `mask` | `rr-mask` | rrweb masks the text in the element and in its descendants. |
| `ignore` | `rr-ignore` | rrweb does not record input events from the element. |
| `unmask` | none | rrweb has no class for this. Move the public content out of the masked element. |

- `rr-mask` does not mask input values. rrweb masks input values only with `maskAllInputs` or `maskInputOptions`. `@rrweb/browser-client` sets `maskAllInputs: true` by default. With core rrweb, set it in `record()`.
- To protect a secret field completely, use `rr-block` on the field or on its container.

## Annotation style `data-privacy`

rrweb does not read the `data-privacy` attribute. Add these options to `record()`:

```js
record({
  blockSelector: '[data-privacy="block"]',
  maskTextSelector: '[data-privacy="mask"], [data-privacy="mask"] *',
  ignoreSelector: '[data-privacy="ignore"], [data-privacy="ignore"] input, [data-privacy="ignore"] textarea, [data-privacy="ignore"] select',
  maskAllInputs: true,
});
```

## Configuration for both styles

Add these options when they apply:

| Option | Add it when |
|--------|-------------|
| `maskAllInputs: true` | Always with core rrweb. `@rrweb/browser-client` sets it by default. |
| `maskInputFn: () => '*'` and `maskTextFn: () => '*'` | The page has secret fields or masked numbers. The default masks write one `*` for each character. |
| `slimDOMOptions: { comment: true }` | The page has HTML comments in private areas. |
