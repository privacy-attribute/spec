# Leak taxonomy

Each class below has an id, a description of what leaks, the items to check, and the text to grep for. Use the id in the `leak_class` field of a finding. The grep patterns are starting points for `rg`. Change the names to suit the SDK under audit. When a pattern finds nothing, make the search wider.

Run each class. A class with no finding also gets a row in the coverage table. The row names the code that you checked.

## 1. `input-value`: input values by type

What leaks: the raw value of `input`, `textarea`, `select` and `contenteditable` elements.

Check:
- which input types the SDK masks by default, and which types each option masks. A type allow-list or a per-type map often does not include `number`, `range`, `date`, `time`, `color`, `tel`, `search`, `hidden`.
- whether the check uses the `type` attribute, the `type` property, or both (`type="PASSWORD"`, a missing type, and a type that changes at runtime behave differently)
- each path that reads `.value`: snapshot, input observer, mutation observer for the `value` attribute, form reset, programmatic `value` setter hooks
- `input type="hidden"` values. The SDK often does not mask them, because the user cannot see them.
- whether ignore and mask checks match ancestors of the target (a class on a container) or only the target itself

Grep: `\.value\b`, `maskInputOptions`, `maskAllInputs`, `maskInputFn`, `maskInputValue`, `getInputType`, `toLowerCase\(\)` near `type`, `HTMLInputElement\.prototype`, `Object\.getOwnPropertyDescriptor\(.*'value'`

## 2. `length-side-channel`: length of masked values

What leaks: the length of a hidden value, through a mask that keeps the length (one `*` for each character), or through bucketed lengths.

Check:
- how the mask function makes its output. A mask that repeats a character `value.length` times leaks the exact length.
- for `number` and `range`, the length is the order of magnitude (`99` against `100000`). This is often the sensitive part (salary, age, balance). Report the magnitude of number and range as a finding that is separate from password length. The fix is different, and integrators who mask all inputs think that the mask covers numbers.
- run the per-type matrix (`P-input-types` in `patterns.yaml`) and list the masked output for each type
- whether the SDK records the scroll offset of a masked field (a long value scrolls the input). This offset gives the length.
- whether text masking (class 6) does the same for text nodes
- whether width, `size`, or `maxlength` attributes, or layout events, show the length indirectly

Grep: `'\*'\.repeat`, `\.repeat\(`, `\.length` inside mask functions, `replace\(/\[\^`, `bucket`, `maskTextFn`, `maskInputFn`

## 3. `timing-side-channel`: emits driven by the hidden value

What leaks: data about a masked value, from the times when the SDK emits events. Some recorders compare the masked output to suppress duplicate emits. In that case, an event fires only when the masked string changes. With a mask that keeps the length, there is one event for each length change. With a bucketed mask, there is one event for each bucket boundary. In the two cases, the event timeline encodes the hidden value.

Check:
- each deduplication, throttle or "last value" cache on the input path, and what it compares (raw value, masked value, or both)
- whether keystrokes that do not change the masked value still emit an event
- whether the same applies to text mutations and attribute mutations

Test it with the `custom-nonconstant` config from `AGENTS.md`. Use two values whose lengths cross bucket boundaries at different keystrokes. To do this, start one value from a prefilled value of a different length, or type values of different lengths at a fixed key delay. Compare the timestamps of the emitted events. Report this as a separate finding, also when a default mask that keeps the length makes each keystroke emit. The reason is that any coarser mask (a bucket or a hash) turns the deduplication into the leak.

Grep: `dedup`, `lastInputValue`, `lastValue`, `!==.*\.text`, `throttle`, `debounce`, `WeakMap` near input handlers

## 4. `checked-state`: checkbox and radio state

What leaks: whether a checkbox or radio is checked. Consent choices, medical questionnaires and survey answers are in this class.

Check:
- whether the snapshot records `checked` as an attribute or property, and under which options
- whether the input event carries an `isChecked` (or similar) field that goes around the value mask
- radio-group side effects: one change emits events for siblings, and these events show which option the person chose
- `indeterminate` state

Grep: `checked`, `type === 'radio'`, `type === 'checkbox'`, `indeterminate`

## 5. `option-selected`: select and option state

What leaks: which `option` the person selected, through the `selected` attribute or property, or through the text of the option.

Check:
- how the snapshot handles `option` elements and their `selected` state
- whether the mask of the `select` value also masks the visible option text and the `value` attribute of each `option`
- `selectedIndex` and multi-select

Grep: `selected`, `HTMLOptionElement`, `tagName === 'option'`, `selectedIndex`, `'select'`

## 6. `text-node`: text content

What leaks: text node content, through the snapshot and through character-data mutations.

Check:
- the text mask option and its scope (class name, selector, ancestor walk)
- whether the mutation path applies the same check as the snapshot path
- text inside `textarea`, `<script>`, `<noscript>`, `<template>` and `<style>`
- whether the ancestor check uses `closest` on elements only. This skips text nodes whose parent check is different.

Grep: `textContent`, `characterData`, `maskTextClass`, `maskTextSelector`, `needMaskingText`, `maskTextFn`, `nodeValue`

## 7. `attribute`: privacy-relevant attributes

What leaks: attribute values that carry user or page data. Check at least:

- `aria-valuenow`, `aria-valuetext`, `aria-label`, `aria-checked`, `aria-selected`, `aria-pressed`
- inline `style` (custom sliders and progress bars encode values as `width`, `left`, `transform`)
- `title`, `placeholder`, `alt`, `value` on non-input elements
- `href` and `src` query strings and fragments (tokens, emails, search terms)
- `data-*` attributes
- `srcset`, `poster`, `action`, `formaction`, `ping`

Check whether attribute values go through a mask function at all, on the snapshot path and on the attribute-mutation path. Also check whether the SDK masks the attributes of masked elements.

Grep: `attributes`, `getAttribute`, `transformAttribute`, `attributeName`, `aria-`, `'style'`, `'title'`, `'placeholder'`, `'alt'`, `'href'`, `'src'`, `data-`

## 8. `css`: inlined and observed CSS

What leaks: CSS text, which can carry content (`content: "..."`, `attr()`), background image URLs with tokens, and font URLs. Also, CSS-in-JS rules that the page makes from user data.

Check: stylesheet inlining, `insertRule` and `replace` hooks, adopted stylesheets, `<style>` text mutations, and whether any of them go through a mask.

Grep: `cssText`, `insertRule`, `deleteRule`, `replaceSync`, `adoptedStyleSheets`, `inlineStylesheet`, `stringifyStylesheet`, `url\(`

## 9. `media`: canvas, images and media

What leaks: canvas pixels and draw calls, inlined image data, video frames, audio sources.

Check:
- the modes that record canvas (draw-call replay, `toDataURL`, WebGL), and whether blocked or masked ancestors stop them
- `inlineImages` or equivalent, and whether it obeys the block options
- media element state (current time, source URL)

Grep: `toDataURL`, `getContext`, `recordCanvas`, `inlineImages`, `drawImage`, `HTMLCanvasElement`, `HTMLMediaElement`, `currentTime`, `blockClass`, `blockSelector`

## 10. `coverage-gap`: iframes and shadow DOM

What leaks: content inside same-origin iframes, open shadow roots, closed shadow roots, slotted content, and custom elements, when the mask check does not cross the boundary.

Check:
- whether a mask on the iframe element or shadow host applies inside it
- whether the ancestor walk uses `parentNode` (which stops at a shadow root) or crosses to `host`
- whether iframe and shadow recorders get the same options object
- `<slot>` content, which is in the light DOM, but which the browser renders in the shadow tree

Grep: `shadowRoot`, `attachShadow`, `ShadowRoot`, `\.host\b`, `contentDocument`, `contentWindow`, `iframe`, `assignedNodes`, `getRootNode`

## 11. `url-meta`: URLs and meta tags

What leaks: page URL, referrer, `title`, and `meta` content. Query strings and fragments carry tokens, emails, search terms and IDs.

Check: the meta event, `<title>` and `<meta>` serialisation, navigation and `pushState` hooks, `<base>`, and any URL sanitisation option.

Grep: `location\.href`, `document\.referrer`, `document\.title`, `'meta'`, `pushState`, `replaceState`, `EventType\.Meta`, `sanitize`

## 12. `console-network`: console and network payloads

What leaks: console arguments (often full objects with user data), and the headers and bodies of network requests and responses.

Check: whether the capture is on by default, header and body allow-lists, size limits, and whether a mask option applies. Also check whether error stack traces include URLs with tokens.

Grep: `console\.`, `stringify`, `fetch`, `XMLHttpRequest`, `PerformanceObserver`, `recordHeaders`, `recordBody`, `maskRequestFn`, `Authorization`, `Cookie`

## 13. `pointer-position`: mouse, selection and scroll positions

What leaks: where the user points, selects and scrolls inside masked or blocked regions. A pointer path over a masked or blocked on-screen keyboard or PIN pad lets the attacker recover the input. The path stops on each key, and the attacker knows the positions of the keys. Selection ranges show which words a user highlighted inside masked text.

Check:
- whether the SDK suppresses or coarsens mouse, touch, selection, scroll and focus events for masked and blocked elements
- whether a blocked region drops only the events whose target is inside it. Move events with page coordinates over the region (and a null or placeholder target id) can still go out.
- whether sampling or throttling of moves still keeps the last position before a click

Treat each recorded coordinate inside a blocked or masked widget as a leak, until the differential test shows that the attacker cannot recover the pattern.

Grep: `mousemove`, `pointermove`, `touchmove`, `selectionchange`, `getSelection`, `scroll`, `focus`, `MouseInteraction`, `isBlocked`

## 14. `widget-state`: custom widgets with state in classes or attributes

What leaks: the state of custom controls (toggles, sliders, date pickers, star ratings, tabs, colour pickers) that class names, `aria-*`, `data-*`, inline style, or text hold. The input mask does not see this state, because these controls are not form controls.

Check: whether any option masks class names, `aria-*` and inline style on masked elements, and whether `maskAllInputs` has an effect on any of this.

Grep: `className`, `classList`, `role=`, `aria-`, `'style'`, combined with the mask checks from classes 6 and 7

## 15. `path-inconsistency`: masking on one record path but missing on another

What leaks: data that one path masks and another path emits raw. Typical pairs: full snapshot versus incremental mutation, input observer versus attribute mutation of `value`, main document versus iframe or shadow root, text node versus `textarea` child text, initial value versus programmatic change.

Check:
- for each mask function, list all of its call sites. Then list each place where the SDK serialises the same data. Each serialisation without a call site is a candidate.
- asynchronous callbacks (image `load`, font load, `requestAnimationFrame`, promises) that write into a node after the SDK serialised and emitted it. These callbacks skip the block or mask check that ran at serialisation time.

Grep: the names of each mask function, then `rg -n` for each property that it guards (`value`, `checked`, `textContent`, attribute names) to find the uncovered sites

## 16. `default-divergence`: defaults that differ between packages

What leaks: data that one shipped package protects by default and another package does not protect. Some users change packages, or read the docs of one package and install a different one. These users get weaker defaults, and nothing tells them.

Check: the defaults of each option in the core recorder, each wrapper, each framework integration, each hosted client, and the docs. Report each option whose default is different.

Grep: `=== undefined`, `?? `, `\|\| `, `defaults`, `default:` in the entry point of each package, plus the option names from step 1 of the method

## 17. `interaction-target`: which element the user acted on

What leaks: the identity of the clicked, tapped or focused element. When the attacker knows the page layout, a node id or DOM position is the value. For example, the eighth key of a PIN pad is `8`, and the third answer card is the third answer.

Check:
- whether click, mousedown, mouseup, touch, focus and blur events carry a node id for masked elements
- whether a masked container hides the ids of its children or only their text
- whether blocked elements suppress these events (and whether the block check runs on the event target or on its ancestors)
- whether the snapshot keeps the DOM order of masked siblings. If it does, each node id becomes a position.

Grep: `MouseInteraction`, `click`, `mousedown`, `pointerdown`, `touchstart`, `focus`, `blur`, `getId\(`, `mirror\.getId`, `isBlocked`, `needMaskingText`

## 18. `keystroke-dynamics`: event count and cadence

What leaks: the number of key presses and the gaps between them. The count gives the length of a value when the mask does not. The cadence identifies the person (keystroke biometrics). It also shows hesitation over specific digits.

Check:
- whether each keystroke in a masked field makes an event, a mutation, or a change in an echo element (such as a dot display)
- whether event timestamps keep millisecond precision
- whether the SDK batches or coarsens the timestamps of masked fields

Grep: `keydown`, `keyup`, `input`, `timestamp`, `Date\.now`, `performance\.now`, `throttle`, `sampling`

## 19. `echo`: values reflected elsewhere on the page

What leaks: the value of a masked input, which another element shows or summarises: a greeting, a preview, search results, a character counter, a strength meter, a validation message, a computed total.

Check:
- whether the input mask has an effect on other elements. Usually it has no effect, and only a text mask on the echo element helps.
- under the strictest config, whether the structure of the echo (result count, bar width, message changes) still changes with the value

Grep: there is no reliable grep in the SDK for this class. Cover it through the `P-echo-*`, `P-search-as-you-type`, `P-char-counter`, `P-strength-meter`, `P-validation` and `P-computed-total` patterns.

## 20. `type-switch`: masking decided once while the element changes

What leaks: values that the SDK records after an element changes. The element changes into a state that the mask check would catch, or out of a state that it caught. Examples:

- a password reveal toggle changes `type` to `text`
- a field gets `type=password` after load
- the page adds or removes a mask class at runtime
- an element moves into or out of a masked container

Check: whether the SDK caches the mask decision for each node at snapshot time, or makes the decision again on each event and mutation. Also check whether a `type` or class mutation causes a new decision.

Grep: `getInputType`, `'type'`, `attributeName === 'type'`, `classList`, `WeakMap`, `WeakSet`, `cache`, `memo`

## 21. `css-masked-text`: values hidden by CSS

What leaks: values that the page hides visually with CSS (`-webkit-text-security`, password fonts, `color: transparent`), and that the recorder treats as normal text or input.

Check: whether any mask check looks at computed style. Usually no check does, so the plain text and input rules apply to these values.

Grep: `text-security`, `getComputedStyle`, `computedStyle`

## 22. `layout-size`: sizes that track the hidden value

What leaks: element dimensions that depend on content. A blocked placeholder keeps the original width and height. Masked text with the same length keeps the original width. Later resize or mutation events track changes.

Check: how the SDK sets the size of blocked placeholders, and whether it updates that size on mutation. Also check whether the replacement of masked text keeps the width.

Grep: `rr_width`, `rr_height`, `getBoundingClientRect`, `offsetWidth`, `ResizeObserver`, `blockClass`

## 23. `clipboard-ime`: clipboard and composition events

What leaks: copied or pasted text, and composition (IME) strings for non-Latin input.

Check: whether the SDK records copy, cut, paste and composition events, and whether masked fields filter their payloads.

Grep: `paste`, `copy`, `clipboardData`, `compositionstart`, `compositionupdate`

## 24. `third-party-content`: other people's data shown on the page

What leaks: data about people other than the recorded person: customer records in a back office, user tables in an admin panel, chat messages and comments from others, contact lists, shared documents. The input mask has no effect on this data, because it is page text, attributes and images.

Check:
- under each default config, whether the SDK masks any page text at all
- whether a text mask can target a container (a table, a chat pane) and not mask the public chrome around it
- whether row and list structure (row count, item order, avatar image URLs, initials) shows who is in the data when the SDK masks the text
- lazy-loaded and virtualised lists, where rows arrive through mutations after the snapshot

Grep: the text-node and attribute mask functions from classes 6 and 7, `maskTextClass`, `maskTextSelector`, plus `img` and `src` handling for avatars

## 25. `data-privacy-conformance`

Use this class only when the audit includes the `data-privacy` conformance check that `AGENTS.md` describes.

## Fidelity classes

Use these ids in `leak_class` for fidelity findings. Find these findings with the fidelity check in step 6b of `AGENTS.md`.

### `over-masking`

Public content that the SDK masks or blocks, because its options cannot target a small enough area. Examples: a mask option that applies to all text on the page, a block that hides a full form to protect one field, a mask that does not stop at a nested `unmask` or public label.

Check: the finest grain that each option supports (whole page, selector, class, element, attribute), and whether you can nest options. Also check what `targeted` must mask to stop each privacy finding.

### `global-switch`

A privacy leak that only a page-wide switch stops. Examples: a switch that turns off all mouse moves to protect one keypad, or a switch that turns off canvas, CSS inlining, or network capture for the whole page.

Check: for each privacy finding that leaks under `targeted`, the narrowest option that stops it, and its scope.

### `replay-distortion`

The replay of the recording is different from the page, also for public content. Examples: masked text that changes width and reflows the public layout, placeholders with the wrong size, lost styles, missing hover or animation states, and fonts or images that do not load in replay.

Check: compare the rebuilt DOM and layout with the live page under `targeted`, and list each difference on a `public` element.

### `lost-interaction`

Public interactions that the SDK drops as a side effect of a privacy option. Examples: clicks, scrolls or focus on public controls that the SDK suppresses, because the controls are inside a masked or blocked ancestor, or because an ignore option matches too much.

Check: under `targeted`, make sure that each interaction with a `public` element in the journey is in the recording.
