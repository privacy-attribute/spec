# Privacy Attribute Standard core

Status: draft

The `data-privacy` attribute specifies how a browser session recorder captures an element and its descendants. **MUST** and **MAY** have the meanings defined in [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119).

## Values and inheritance

The value is a list of case-sensitive tokens separated by ASCII whitespace: space (U+0020), tab (U+0009), line feed (U+000A), form feed (U+000C), or carriage return (U+000D). Leading, trailing, and repeated separators are allowed. Match complete tokens, not substrings. Non-ASCII spaces do not separate tokens.

| Tokens present | Treatment |
|---|---|
| `block`, with or without `mask` or other tokens | Omit the element, its descendants, and their DOM capture payloads. A recorder **MAY** emit a placeholder with the element dimensions. Include styling metadata only when it contains no private values. |
| `mask`, without `block` | Keep the recorded element structure. Replace or omit the protected values listed below. |
| Empty or no recognized treatment token | Apply `mask`. |
| Attribute absent | Apply inherited protection and the recorder's ordinary policy. |

The recorder **MUST** give `block` precedence regardless of token order or repetition. For example, `mask block confidential`, `confidential block mask`, and `block` all request block. `blocked` and `Block` are not the `block` token and fall back to mask when no recognized treatment token is present.

Optional tokens such as `confidential` or `restricted` may carry the project's classification in the same attribute: `data-privacy="mask confidential"`. They do not select or weaken a treatment. This core does not prescribe a classification vocabulary or infer a treatment from a classification label. Authors should include an explicit treatment token. Labels should contain only generic policy terms, since the attribute itself may be captured.

For each captured node, the recorder **MUST** apply the strongest treatment on the node or its ancestors. `block` is stronger than `mask`. A recorder **MAY** apply stronger protection through its own policy. `ignore` and `unmask` are recorder-specific controls. They are not recognized core treatment tokens and cannot cancel a `mask` or `block` token or inherited protection.

Follow DOM parent links. At a shadow root, continue from its host. Apply this rule to every shadow root the recorder captures. Slotted nodes keep their light DOM ancestry. If the recorder includes a frame document as part of the parent recording, continue from the frame element at the document boundary. An independent frame recording evaluates its own document and policy.

## Capture requirements

For `mask`, the recorder **MUST** replace or omit these values before emission:

- DOM text node contents.
- Live `<input>` and `<textarea>` values and their serialized `value` attributes or equivalent fields.
- The values of `title`, `placeholder`, and `aria-label` attributes.

Apply this treatment wherever those values appear in a DOM snapshot, a DOM mutation, or an input event. The recorder **MAY** use a replacement that preserves length. Use `block` for private values in other attributes, resource URLs, or embedded content represented in the recorded subtree.

For `block`, the recorder **MUST** omit DOM content and values from snapshots, mutations and input events for the blocked subtree. A removal or placeholder update **MAY** identify a previously recorded node so the replay can remove or replace it.

## Changes during capture

The recorder **MUST** evaluate protection for new nodes, annotation additions and removals, value changes, and moves between parents or roots. When a change strengthens protection, the recorder **MUST** update or remove any affected replay representation, even when its content stays the same. For buffered records, the recorder **MUST** apply the stronger of the treatment when the mutation or input occurred and the treatment at emission. If a recorder cannot determine the earlier treatment, it **MUST** omit the value when the earlier treatment could have protected it. When protection weakens, the recorder **MAY** capture the current state under the new policy. Previously emitted recordings retain the data they received.

## Capture scope

The core covers DOM capture. Configure separate capture of network requests, console messages, browser navigation, canvas, media, and interaction telemetry through the recorder. Recordings can still reveal layout, timing, selection, checkbox state, or pointer coordinates. Review those channels for the data and settings you use.

## Verify an implementation

Run the [browser check](../audit/runner/README.md#check-the-privacy-attribute) with the SDK build and settings you plan to ship. It tests synthetic values in emitted events. Use the wider audit to examine other capture channels and ways that a recording can reveal private data.
