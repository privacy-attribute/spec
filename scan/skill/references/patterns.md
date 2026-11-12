# Privacy review patterns

- [Credentials and reveal controls](#credentials-and-reveal-controls)
- [Records about the viewer and other people](#records-about-the-viewer-and-other-people)
- [Shared presentation components](#shared-presentation-components)
- [Layout copies and fallback text](#layout-copies-and-fallback-text)
- [Recording controls and attribution](#recording-controls-and-attribution)
- [Components that load their own records](#components-that-load-their-own-records)
- [Conditional and sensitive UI](#conditional-and-sensitive-ui)
- [Links, media and rich content](#links-media-and-rich-content)
- [Inputs, errors and notifications](#inputs-errors-and-notifications)

## Credentials and reveal controls

**Look for:** authentication flows, secret creation, reveal/copy/download actions, QR provisioning, recovery codes and signed links.

**Trace:** creation response, field binding, revealed text, copy value, surrounding tooltip, URL and error state.

**Decide:** block every rendered credential destination. A hidden password input may become plain text after a toggle.

**Counterexample:** a documentation page showing a fixed example API key can be public. Establish that it is a nonfunctional example; a variable called `exampleKey` is insufficient evidence.

**Verify:** exercise hidden, revealed, copied and regenerated states with synthetic markers. Inspect attributes as well as text.

## Records about the viewer and other people

**Look for:** account settings, CRM records, conversations, invoices, signers, partners and customer tables.

**Trace:** route scope, logged-in identity, query arguments, selected record and renderer. Determine whether a row belongs to the viewer or another party.

**Decide:** mask private text. Block private links, avatars and unsupported channels separately. Keep column labels and public actions clear.

**Counterexample:** a public staff directory or published customer testimonial may contain intentionally public person data. Establish the intended audience and publication purpose.

**Verify:** inspect empty values, fallbacks, truncation tooltips and avatar alternatives. A masked abbreviated value can still leak through `title`.

## Shared presentation components

**Look for:** Text, Badge, Avatar, Field, row, cell, card and page-title components.

**Trace:** the private call site through imports and prop transformations to native DOM. Inspect attribute forwarding, portals, slots and other callers.

**Decide:** protect the actual destination in the private context. Record unresolved placement when the implementation is missing. Do not assume a custom tag accepts `data-privacy`.

**Counterexample:** the same Badge can display a public deployment state or a private diagnosis. Component identity alone does not settle the policy.

**Verify:** include one private and one public use in the regression. Confirm that forwarding protects the private DOM without changing the public use.

**Concrete forwarding checks:** one input may spread every remaining prop onto a native input; another may accept only `inputProps`. A styled native element can pass DOM attributes, while a function component with the same visual appearance may discard them. Read the implementation. Check CSS-hidden measurement spans, tooltip copies and portal children. A wrapper at the call site does not surround a portal mounted elsewhere.

## Layout copies and fallback text

**Look for:** autogrow, autosize, hidden sizing spans, mirrored inputs and text used to calculate dimensions.

**Trace:** the expression that selects the measured content. A nonempty value may be copied into a sibling span; an empty value may select a placeholder instead. Follow both branches to native DOM. CSS visibility does not establish recorder exclusion.

**Decide:** carry an explicitly declared privacy treatment to each copy of the selected content. Preserve unannotated public callers. Preserve the component's existing fallback behavior when the selected node is undefined. Do not assume a placeholder is public: applications can populate it with record data.

**Counterexample:** a public search field's sizing text can remain public. An explicitly private field with a fixed public placeholder presents a fidelity tradeoff if the same treatment protects both branches; record that loss rather than claiming all public text survives.

**Verify:** record initial value, changed value, empty value, placeholder and restored value. Check full snapshots and text mutations, plus a public caller. A passing native-input check does not cover a sibling measurement span. The bounded Twenty exercise exposed private text in this second destination even with globally masked input values.

## Recording controls and attribution

**Look for:** a privacy result based only on absent markers, a recorder preset that already masks inputs, or a fixture replacing production components.

**Trace:** the complete configuration, exact component and recorder revisions, adapters, initial snapshots and each exercised mutation or input event.

**Decide:** compare baseline and patched source under the same recorder configuration. Require evidence that the baseline exercised the claimed channel. Report a preset's existing fidelity loss separately from a patch's additional loss. For secrets, verify blocked structure and suppressed input events even when the preset already masks values.

**Counterexample:** no leaked marker in an empty recording establishes nothing. Text appearing somewhere in the JSON does not prove that a link URL or a particular update was recorded.

**Verify:** require the complete case matrix, live DOM observations, serialized component roots, exact public controls and channel-specific positive controls for relevant phases. Check exact callback outputs for Copy and editing. Keep source checks, DOM-emulator recordings, browser recordings and full-application tests separately identified. Preserve the original failure before updating the guidance, then evaluate the revised guidance on an untouched feature.

## Components that load their own records

**Look for:** dialogs, recipient rows, document titles, integration lists and components whose only visible props are an ID, an open state, a callback or a test identifier.

**Trace:** context hooks, stores, query hooks and route parameters inside the component. Follow the returned data through child components even when no private value appears in the parent JSX.

**Decide:** classify the rendered record values independently of public control props. A public `isOpen` or `data-testid` does not make the component's contents public. Keep a separate record for the child destination, with its producer evidence.

**Counterexample:** a static help dialog can use the same open state and callback without loading private data.

**Verify:** open the dialog with synthetic records, inspect initial loading and resolved content, and verify descendants and portals. Record any destination absent from the structural inventory.

## Conditional and sensitive UI

**Look for:** health or financial choices, selected states, status badges, branch-specific labels, empty-state messages and visibility based on a record.

**Trace:** predicate and branches. Ask what the existence, color, class, checked state or position reveals even after the text is masked.

**Decide:** block the smallest sensitive choice or revealing structure. Keep unrelated controls usable. For ordinary private text, mask can suffice.

**Counterexample:** `isOpen` for a dropdown is public UI state. `isPositive` for a medical result can reveal sensitive information. Boolean type does not distinguish them.

**Verify:** exercise both branches and selection changes. Check interaction and attribute events.

**Separate interaction evidence:** fixed keypad digits can be public while a sequence of clicks enters a secret. Fixed survey option labels can remain public while the selected class reveals a private answer. Do not classify fixed captions as credentials merely because the control can accept a credential. Record and test the interaction channel separately.

## Links, media and rich content

**Look for:** href, src, rich HTML, Markdown, CSS URLs, iframes and screen-sharing content.

**Trace:** URL construction, identifier or bearer token, HTML sanitization and rendered links/images. Sanitization does not determine privacy.

**Decide:** block the private channel's DOM element. Masking visible link text does not protect its href under a recorder that retains URLs.

**Counterexample:** a fixed branding image or public login announcement can remain public, even when supplied as configuration or HTML.

**Verify:** inspect emitted attributes and subtree additions. Retain public branding and headings in a separate control.

## Inputs, errors and notifications

**Look for:** unbound form controls, v-model/bind:value, form libraries, rich editors, server errors, validation, toasts and success messages.

**Trace:** what a user can enter, any transformation, the error producer and the element used by the notification renderer.

**Decide:** protect user-entered private data and echoed values. A generic fixed validation label can remain public. Keep an unresolved destination when a global notification renderer is unavailable.

**Counterexample:** public product search terms can be deliberately public input; an internal customer search may contain names or identifiers. The input type is insufficient evidence.

**Verify:** type synthetic data, cause validation, submit, and inspect the resulting notification and errors.

**Separate source and audience:** an operator's typed filter is personal input even when it searches third-party CRM records. A stored customer email returned by that filter concerns the customer. Owning access to several workspaces does not establish that every organization belongs to the viewer. Resolve organization ownership from product context or leave that category distinction open while preserving the required protection.
