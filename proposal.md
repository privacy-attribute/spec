# Proposal: the `data-privacy` attribute

**Request for feedback.** This document explains the proposal and lists the questions we want answered. The normative draft is [spec/core.md](spec/core.md).

| | |
| --- | --- |
| **Status** | Draft, open for feedback |
| **Draft specification** | [spec/core.md](spec/core.md) |
| **Respond** | [Open an issue](https://github.com/privacy-attribute/spec/issues) |

## The problem

Session recorders and product analytics SDKs capture what a page shows: text, form values, attributes and changes to the DOM. Pages show passwords, account balances, health answers and other people's contact details, so every recorder offers a way to hide parts of a page.

Each recorder does this its own way. One uses class names, another a custom attribute, a third a list of selectors in its configuration. This has four costs:

- **Annotations do not travel.** A team that changes recorder, or runs two, has to annotate its application again.
- **The meaning differs.** "Mask" can cover text only, or text and input values, or also `title` and `aria-label`. Authors cannot tell from the markup what is protected.
- **Reviewers have nothing stable to check.** A code reviewer or auditor has to learn each recorder's rules before they can judge a page.
- **Nothing is testable across recorders.** Without a shared contract there is no shared test.

## Goals

1. One attribute that application authors write once and any recorder can honour.
2. A small, exact definition of what each value protects, including during changes to the page.
3. Protection that an ancestor or a recorder policy can strengthen and that nothing can silently weaken.
4. A contract that a recorder maintainer can test in a browser.

## Non-goals

- **Detecting private data automatically.** The attribute is an author's declaration. Finding what to annotate is a separate task, which the [Scan](scan/README.md) addresses.
- **Legal compliance.** The attribute does not make a recording lawful. It gives authors and recorders a shared instruction.
- **A classification vocabulary.** The draft allows a project's own labels and does not define them.
- **Capture outside the DOM.** Network requests, console output, canvas pixels and interaction telemetry are configured in the recorder.

## The proposal in brief

Authors add `data-privacy` to an element. The value is a list of tokens.

```html
<!-- Keep the layout, hide the text and values -->
<td data-privacy="mask">jane.doe@example.com</td>

<!-- Leave the element and its children out of the recording -->
<div data-privacy="block">
  <img src="/documents/passport-scan.png" alt="" />
</div>

<!-- An optional project label next to the treatment -->
<p data-privacy="mask confidential">Renewal price: €4,200</p>
```

| Value | What the recorder does |
| --- | --- |
| `mask` | Keeps the element structure. Replaces or omits text, the values of inputs and text areas, and the `title`, `placeholder` and `aria-label` attributes. |
| `block` | Omits the element, its descendants and their captured content. It may record a placeholder with the element's size. |
| empty, or no recognized treatment | Treated as `mask`. |

Four rules complete the contract:

- **`block` wins.** If `block` is present, token order and other tokens do not matter.
- **Protection inherits.** A node gets the strongest treatment found on itself or its ancestors, across shadow roots and through frames recorded as part of the same recording.
- **Recorder-specific controls cannot weaken it.** A recorder may protect more than the attribute asks. Its own "unmask" or "ignore" controls cannot cancel `mask` or `block`.
- **Changes count.** New nodes, moved nodes, changed values and added or removed annotations are evaluated when they happen. When protection becomes stronger, the recorder updates what it already holds for replay.

Use `block` for private values that `mask` does not cover, such as an image source, a link target or embedded content.

The [draft specification](spec/core.md) gives the exact wording, the token grammar and the requirements for buffered records.

## Why a `data-*` attribute

- It works today in every browser and every framework, with no change to HTML.
- It is visible in markup, in code review and in the DOM inspector.
- A recorder can support it with a selector while it adds native support. See [rrweb compatibility](spec/rrweb-compatibility.md) for one worked example.

## Alternatives considered

| Alternative | Why the draft does not take it |
| --- | --- |
| Agree on shared class names | Classes are styling hooks. Build tools rename and drop them, and a class cannot carry a value. |
| Keep selectors in each recorder's configuration | The rule lives far from the markup it protects, goes stale when the markup changes and has to be rewritten for each recorder. |
| A new global HTML attribute | It needs a standards process before anyone can use it. A `data-*` attribute can ship now and inform that process. This remains an open question below. |
| Detect private data automatically | Detection misses values that are private because of context. An explicit declaration is still needed as the fallback and as the override. |

## Privacy and security considerations

- **The attribute is itself recorded.** Labels should be generic policy terms. Never put a private value or a sensitive description in the attribute.
- **It is a request to the recorder.** An application that loads a recorder without support gets no protection. Verify the exact recorder build and settings you deploy.
- **Masking can preserve length.** A masked value of a known length can still reveal information. Use `block` when length matters.
- **The DOM is one channel.** Layout, timing, pointer movement, selection state and separately captured network or console data can reveal what an annotation hides.
- **Removal does not reach the past.** Weakening or removing an annotation affects new capture only. Recordings already sent keep what they received.

## Questions for feedback

We would like answers from application teams, recorder maintainers, privacy engineers and standards participants. Refer to the question number in your issue.

1. **Name and form.** Is `data-privacy` the right name? Should the long-term goal be a global HTML attribute, and if so what should it be called?
2. **Two treatments.** Are `mask` and `block` enough? Is there a treatment you need that cannot be expressed with them?
3. **What `mask` covers.** The draft covers text, input values, `title`, `placeholder` and `aria-label`. Should `alt`, `href`, `src` or other attributes be included, or is "use `block`" the right answer?
4. **Empty value means `mask`.** Is that the safest default for a mistyped or empty attribute?
5. **No way to weaken.** The draft has no `unmask`. Do you have a case where a public child inside a private parent has to stay visible, and would restructuring the markup be acceptable there?
6. **Classification tokens.** Is it useful to let a project add its own labels in the same attribute, or should labels live elsewhere?
7. **Frames and shadow DOM.** Do the inheritance rules match how your recorder or application handles them?
8. **Changes during capture.** Can your recorder meet the requirement to apply the stronger of the treatment at the time of a change and at the time of emission?
9. **Beyond the DOM.** Should a later version say anything about network, console, canvas or interaction capture, or should those stay with the recorder?
10. **Conformance.** Is the [browser check](audit/runner/README.md#check-the-privacy-attribute) a reasonable basis for a shared test suite? What is missing?

## How this proposal is supported

- The [Scan](scan/README.md) helps application teams find what to annotate and proposes the annotations.
- The [SDK Audit](audit/README.md) helps recorder maintainers test what their SDK captures.
- The [charter](charter.md) describes the group proposed to take this work forward.
