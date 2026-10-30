# Leak taxonomy

Each class below has an id (used in the `leak_class` field of a finding), what leaks, what to check, and what to grep for. Grep patterns are starting points written for `rg`. Adapt names to the SDK under audit, and widen the search when a pattern finds nothing.

Run every class. A class with no finding still gets a row in the coverage table naming the code you checked.

## 1. `input-value`: input values by type

What leaks: the raw value of `input`, `textarea`, `select` and `contenteditable` elements.

Check:
- which input types are masked by default and which by each option (a type allow-list or a per-type map often misses `number`, `range`, `date`, `time`, `color`, `tel`, `search`, `hidden`)
- whether the check uses the `type` attribute, the `type` property, or both (`type="PASSWORD"`, a missing type, and a type changed at runtime behave differently)
- every path that reads `.value`: snapshot, input observer, mutation observer for the `value` attribute, form reset, programmatic `value` setter hooks
- `input type="hidden"` values, which are often never masked because the user cannot see them
- whether ignore and mask checks match ancestors of the target (a class on a container) or only the target itself

Grep: `\.value\b`, `maskInputOptions`, `maskAllInputs`, `maskInputFn`, `maskInputValue`, `getInputType`, `toLowerCase\(\)` near `type`, `HTMLInputElement\.prototype`, `Object\.getOwnPropertyDescriptor\(.*'value'`

## 2. `length-side-channel`: length of masked values

What leaks: the length of a hidden value, through a mask that preserves length (one `*` per character) or through bucketed lengths.

Check:
- how the mask function builds its output; a mask that repeats a character `value.length` times leaks exact length
- for `number` and `range`, length is the order of magnitude (`99` versus `100000`), which is often the sensitive part (salary, age, balance). Report number and range magnitude as a separate finding from password length: the fix differs, and integrators who mask all inputs believe numbers are covered
- run the per-type matrix in `patterns.md` (`P-input-types`) and list the masked output for each type
- whether text masking (class 8) does the same for text nodes
- whether width, `size`, or `maxlength` attributes, or layout events, reveal length indirectly

Grep: `'\*'\.repeat`, `\.repeat\(`, `\.length` inside mask functions, `replace\(/\[\^`, `bucket`, `maskTextFn`, `maskInputFn`

## 3. `timing-side-channel`: emits driven by the hidden value

What leaks: information about a masked value from when events are emitted. If the recorder suppresses duplicate emits by comparing masked output, an event fires only when the masked string changes. With length-preserving masks that means one event per length change; with bucketed masks, one event per bucket boundary. Either way the event timeline encodes the hidden value.

Check:
- every deduplication, throttle or "last value" cache on the input path and what it compares (raw value, masked value, or both)
- whether keystrokes that do not change the masked value still emit an event
- whether the same applies to text mutations and attribute mutations

Test it with the `custom-nonconstant` config from `AGENTS.md`: use two values whose lengths cross bucket boundaries at different keystrokes (start one from a prefilled value of a different length, or type values of different lengths at a fixed key delay), and compare the timestamps of emitted events. Report this as its own finding even when a length-preserving default mask makes every keystroke emit, because any coarser mask (bucketing, hashing) turns the deduplication into the leak.

Grep: `dedup`, `lastInputValue`, `lastValue`, `!==.*\.text`, `throttle`, `debounce`, `WeakMap` near input handlers

## 4. `checked-state`: checkbox and radio state

What leaks: whether a checkbox or radio is checked. Consent choices, medical questionnaires and survey answers live here.

Check:
- whether the snapshot records `checked` as an attribute or property, and under which options
- whether the input event carries an `isChecked` (or similar) field that bypasses value masking
- radio-group side effects: one change emits events for siblings, which reveals which option was chosen
- `indeterminate` state

Grep: `checked`, `type === 'radio'`, `type === 'checkbox'`, `indeterminate`

## 5. `option-selected`: select and option state

What leaks: which `option` is selected, through the `selected` attribute or property, or through the option's text.

Check:
- snapshot handling of `option` elements and their `selected` state
- whether masking the `select` value also masks the visible option text, and the `value` attribute of every `option`
- `selectedIndex` and multi-select

Grep: `selected`, `HTMLOptionElement`, `tagName === 'option'`, `selectedIndex`, `'select'`

## 6. `text-node`: text content

What leaks: text node content, through snapshot and character-data mutations.

Check:
- the text masking option and its scope (class name, selector, ancestor walk)
- whether the mutation path applies the same check as the snapshot path
- text inside `textarea`, `<script>`, `<noscript>`, `<template>` and `<style>`
- whether the ancestor check uses `closest` on elements only, which skips text nodes whose parent check differs

Grep: `textContent`, `characterData`, `maskTextClass`, `maskTextSelector`, `needMaskingText`, `maskTextFn`, `nodeValue`

## 7. `attribute`: privacy-relevant attributes

What leaks: attribute values that carry user or page data. Check at least:

- `aria-valuenow`, `aria-valuetext`, `aria-label`, `aria-checked`, `aria-selected`, `aria-pressed`
- inline `style` (custom sliders and progress bars encode values as `width`, `left`, `transform`)
- `title`, `placeholder`, `alt`, `value` on non-input elements
- `href` and `src` query strings and fragments (tokens, emails, search terms)
- `data-*` attributes
- `srcset`, `poster`, `action`, `formaction`, `ping`

Check whether attribute values pass through any masking function at all, on both the snapshot and the attribute-mutation path, and whether masked elements have their attributes masked too.

Grep: `attributes`, `getAttribute`, `transformAttribute`, `attributeName`, `aria-`, `'style'`, `'title'`, `'placeholder'`, `'alt'`, `'href'`, `'src'`, `data-`

## 8. `css`: inlined and observed CSS

What leaks: CSS text, which can carry content (`content: "..."`, `attr()`), background image URLs with tokens, and font URLs. Also CSS-in-JS rules generated from user data.

Check: stylesheet inlining, `insertRule` and `replace` hooks, adopted stylesheets, `<style>` text mutations, and whether any of them pass through masking.

Grep: `cssText`, `insertRule`, `deleteRule`, `replaceSync`, `adoptedStyleSheets`, `inlineStylesheet`, `stringifyStylesheet`, `url\(`

## 9. `media`: canvas, images and media

What leaks: canvas pixels and draw calls, inlined image data, video frames, audio sources.

Check:
- canvas recording modes (draw-call replay, `toDataURL`, WebGL) and whether blocked or masked ancestors stop them
- `inlineImages` or equivalent, and whether it respects blocking
- media element state (current time, source URL)

Grep: `toDataURL`, `getContext`, `recordCanvas`, `inlineImages`, `drawImage`, `HTMLCanvasElement`, `HTMLMediaElement`, `currentTime`, `blockClass`, `blockSelector`

## 10. `coverage-gap`: iframes and shadow DOM

What leaks: content inside same-origin iframes, open shadow roots, closed shadow roots, slotted content, and custom elements, when the masking check does not cross the boundary.

Check:
- whether a mask on the iframe element or shadow host applies inside it
- whether the ancestor walk uses `parentNode` (which stops at a shadow root) or crosses to `host`
- whether iframe and shadow recorders receive the same options object
- `<slot>` content, which is in the light DOM but rendered in the shadow tree

Grep: `shadowRoot`, `attachShadow`, `ShadowRoot`, `\.host\b`, `contentDocument`, `contentWindow`, `iframe`, `assignedNodes`, `getRootNode`

## 11. `url-meta`: URLs and meta tags

What leaks: page URL, referrer, `title`, and `meta` content. Query strings and fragments carry tokens, emails, search terms and IDs.

Check: the meta event, `<title>` and `<meta>` serialisation, navigation and `pushState` hooks, `<base>`, and any URL sanitisation option.

Grep: `location\.href`, `document\.referrer`, `document\.title`, `'meta'`, `pushState`, `replaceState`, `EventType\.Meta`, `sanitize`

## 12. `console-network`: console and network payloads

What leaks: console arguments (often full objects with user data) and network request and response headers and bodies.

Check: default enablement, header and body allow-lists, size limits, whether any masking option applies, and whether error stack traces include URLs with tokens.

Grep: `console\.`, `stringify`, `fetch`, `XMLHttpRequest`, `PerformanceObserver`, `recordHeaders`, `recordBody`, `maskRequestFn`, `Authorization`, `Cookie`

## 13. `pointer-position`: mouse, selection and scroll positions

What leaks: where the user points, selects and scrolls inside masked or blocked regions. Pointer paths over a masked or blocked on-screen keyboard or PIN pad recover the input: the path pauses on each key, and the attacker knows where the keys are. Selection ranges reveal which words a user highlighted inside masked text.

Check:
- whether mouse, touch, selection, scroll and focus events are suppressed or coarsened for masked and blocked elements
- whether a blocked region drops only events whose target is inside it, while move events with page coordinates over it (and a null or placeholder target id) still go out
- whether sampling or throttling of moves still keeps the last position before a click

Treat any recorded coordinate inside a blocked or masked widget as a leak until the differential test shows the pattern cannot be recovered.

Grep: `mousemove`, `pointermove`, `touchmove`, `selectionchange`, `getSelection`, `scroll`, `focus`, `MouseInteraction`, `isBlocked`

## 14. `widget-state`: custom widgets with state in classes or attributes

What leaks: state of custom controls (toggles, sliders, date pickers, star ratings, tabs, colour pickers) held in class names, `aria-*`, `data-*`, inline style, or text. Input masking does not see these because they are not form controls.

Check: whether any option masks class names, `aria-*` and inline style on masked elements, and whether `maskAllInputs` reaches any of this.

Grep: `className`, `classList`, `role=`, `aria-`, `'style'`, combined with the mask checks from classes 6 and 7

## 15. `path-inconsistency`: masking on one record path but missing on another

What leaks: data that one path masks and another path emits raw. Typical pairs: full snapshot versus incremental mutation, input observer versus attribute mutation of `value`, main document versus iframe or shadow root, text node versus `textarea` child text, initial value versus programmatic change.

Check:
- for every masking function, list all of its call sites, then list every place the same data is serialised. Any serialisation without a call site is a candidate.
- asynchronous callbacks (image `load`, font load, `requestAnimationFrame`, promises) that write into a node after it was serialised and emitted, skipping the block or mask check that ran at serialisation time

Grep: the names of each masking function, then `rg -n` for each property it guards (`value`, `checked`, `textContent`, attribute names) to find the uncovered sites

## 16. `default-divergence`: defaults that differ between packages

What leaks: data that one shipped package protects by default and another does not. Users who switch packages, or who read one package's docs and install another, get weaker defaults without being told.

Check: the defaults of every option in the core recorder, each wrapper, each framework integration, each hosted client, and the docs. Report every option whose default differs.

Grep: `=== undefined`, `?? `, `\|\| `, `defaults`, `default:` in each package's entry point, plus the option names from step 1 of the method

## 17. `interaction-target`: which element the user acted on

What leaks: the identity of the clicked, tapped or focused element. When the attacker knows the page layout, a node id or DOM position is the value: the eighth key of a PIN pad is `8`, the third answer card is the third answer.

Check:
- whether click, mousedown, mouseup, touch, focus and blur events carry a node id for masked elements
- whether a masked container hides the ids of its children or only their text
- whether blocked elements suppress these events (and whether the block check runs on the event target or on its ancestors)
- whether DOM order of masked siblings is preserved in the snapshot, which turns any node id into a position

Grep: `MouseInteraction`, `click`, `mousedown`, `pointerdown`, `touchstart`, `focus`, `blur`, `getId\(`, `mirror\.getId`, `isBlocked`, `needMaskingText`

## 18. `keystroke-dynamics`: event count and cadence

What leaks: the number of key presses and the gaps between them. The count gives the length of a value when the mask does not. The cadence identifies the person (keystroke biometrics) and reveals hesitation over specific digits.

Check:
- whether every keystroke in a masked field produces an event, a mutation, or a change in an echo element (such as a dot display)
- whether event timestamps keep millisecond precision
- whether any batching or coarsening of timestamps applies to masked fields

Grep: `keydown`, `keyup`, `input`, `timestamp`, `Date\.now`, `performance\.now`, `throttle`, `sampling`

## 19. `echo`: values reflected elsewhere on the page

What leaks: the value of a masked input shown or summarised in another element: a greeting, a preview, search results, a character counter, a strength meter, a validation message, a computed total.

Check:
- whether input masking has any effect on other elements; usually it does not, and only text masking of the echo element helps
- under the strictest config, whether the structure of the echo (result count, bar width, message changes) still differs with the value

Grep: there is no reliable grep in the SDK for this class. Cover it through the `P-echo-*`, `P-search-as-you-type`, `P-char-counter`, `P-strength-meter`, `P-validation` and `P-computed-total` patterns.

## 20. `type-switch`: masking decided once while the element changes

What leaks: values recorded after an element changes into something the mask check would have caught, or out of something it caught. Examples: a password reveal toggle switches `type` to `text`; a field gets `type=password` after load; a mask class is added or removed at runtime; an element moves into or out of a masked container.

Check: whether the mask decision is cached per node at snapshot time or re-evaluated on every event and mutation, and whether a `type` or class mutation triggers re-evaluation.

Grep: `getInputType`, `'type'`, `attributeName === 'type'`, `classList`, `WeakMap`, `WeakSet`, `cache`, `memo`

## 21. `css-masked-text`: values hidden by CSS

What leaks: values that the page hides visually with CSS (`-webkit-text-security`, password fonts, `color: transparent`) and the recorder treats as normal text or input.

Check: whether any mask check looks at computed style. Usually none does, so these values follow the plain text and input rules.

Grep: `text-security`, `getComputedStyle`, `computedStyle`

## 22. `layout-size`: sizes that track the hidden value

What leaks: element dimensions that depend on content. A blocked placeholder keeps the original width and height. Masked text with the same length keeps the original width. Later resize or mutation events track changes.

Check: how blocked placeholders are sized, whether their size is updated on mutation, and whether masked text replacement preserves width.

Grep: `rr_width`, `rr_height`, `getBoundingClientRect`, `offsetWidth`, `ResizeObserver`, `blockClass`

## 23. `clipboard-ime`: clipboard and composition events

What leaks: copied or pasted text, and composition (IME) strings for non-Latin input.

Check: whether copy, cut, paste and composition events are recorded, and whether masked fields filter their payloads.

Grep: `paste`, `copy`, `clipboardData`, `compositionstart`, `compositionupdate`

## 24. `data-privacy-conformance`

Use this class only when the audit includes the `data-privacy` conformance check described in `AGENTS.md`.
