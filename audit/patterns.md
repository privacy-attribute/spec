# High-risk UI patterns

Each pattern below is a common way pages collect or show sensitive data where masking characters is not enough. Build a test page for every pattern and run the differential test from step 6 of `AGENTS.md` on it, under the `strictest` config, under `strictest-block` (the pattern's container blocked), and under each default config.

Each entry lists the channels to watch. The channel names are defined at the end of this file. Treat the lists as a minimum: anything else that differs between the two runs is also a leak.

Use the pattern id (for example `P-pin-pad`) in the finding's `pattern` field.

## Secrets entered by pointer or touch

These are always `critical` when they leak, because the value is almost always a PIN, passcode or unlock secret.

| Id | Pattern | Channels | Test page |
|----|---------|----------|-----------|
| `P-pin-pad` | On-screen number pad (PIN entry, ATM-style login, phone unlock, banking step-up) built from `button` or `div` keys | click target, pointer path, touch path, hover and active state, attribute mutation, display echo, key count, inter-key timing | 0 to 9 grid of buttons, a dot display that adds one `•` per press. Enter `1397` and `8240`. Repeat with the pad blocked. |
| `P-shuffled-pad` | Number pad whose key order is randomised per session | the shuffled order recorded in the snapshot or in mutations, plus all `P-pin-pad` channels | Same pad, with key labels assigned at load from a random order. Check whether the labels or their order reach the recording when text is masked. |
| `P-virtual-keyboard` | On-screen QWERTY keyboard (anti-keylogger login, kiosk, accessibility keyboard) | as `P-pin-pad`, plus shift and caps state in classes | Letter grid with shift toggle. Enter two passwords of different length and case. |
| `P-pattern-lock` | Swipe pattern on a grid of dots | pointer path, touch path, attribute or class mutation on each dot, canvas or SVG line drawing | 3x3 grid, each dot gets class `hit` when crossed. Draw two different patterns. |
| `P-picture-password` | Choose images or points on an image as a secret | click target, click coordinates, pointer path | Grid of images; select three in two different orders. |
| `P-signature-pad` | Signature drawn on a canvas | canvas draw calls, pointer path, touch path | Canvas that draws on pointer move. Draw two shapes. |
| `P-slider-secret` | Slider or dial used for a secret or a sensitive number (salary, age, weight, debt) | pointer path, `aria-valuenow`, inline style, value text, input value length | Native `range` and a custom div slider. Drag to two values with different digit counts. |

## Secrets typed into fields

| Id | Pattern | Channels | Test page |
|----|---------|----------|-----------|
| `P-input-types` | One field of every input type: `text`, `password`, `email`, `tel`, `number`, `range`, `date`, `time`, `datetime-local`, `month`, `week`, `color`, `search`, `url`, `hidden`, `file`, plus `textarea`, `select` and `contenteditable` | value, value length, magnitude for `number` and `range`, emit timing, snapshot value attribute | Fill each with two values of different length (for `number`: `42` and `125000`). Record the masked output per type and per config in a table in `coverage`. |
| `P-prefilled` | Fields that load with a value (saved password, prefilled profile), which the user then edits or clears | snapshot `value` attribute, `textarea` default text, value in later full snapshots | `input type=password value="..."` and a prefilled `textarea`. Clear both, then force a new full snapshot. |
| `P-password` | Password field | value length, key count, inter-key timing, emit timing, strength meter echo | `input type=password`. Type `abc` and `correct horse battery`. |
| `P-password-reveal` | Show/hide toggle that switches `type="password"` to `type="text"` | type mutation, value recorded after the switch, attribute mutation | Type a password, click the eye button, type more, click again. |
| `P-otp-split` | One-time code split into one input per digit with auto-advance | focus sequence, per-field input events, value length per field, key count, paste event | Six `maxlength=1` inputs. Type `123456` and `900000`. Also paste the code. |
| `P-otp-single` | One-time code in one field with `autocomplete=one-time-code` | as `P-password` | Single numeric input. |
| `P-card-number` | Card number field with live formatting and brand detection | value length, inserted spaces, brand logo or class change (reveals the first digits), Luhn validation message, attribute mutation | Field that formats as `4111 1111 ...` and swaps a Visa or Mastercard icon. Type a Visa and an Amex number. |
| `P-cvv-expiry` | CVV and expiry fields | value length (3 versus 4 digit CVV reveals the card brand), select state for month and year | |
| `P-masked-display` | Field rendered by CSS as dots (`-webkit-text-security: disc`, password fonts) without `type=password` | raw value or text recorded, since the recorder may treat it as plain text | `input style="-webkit-text-security:disc"` and a `div` with the same style. |
| `P-security-question` | Security question answer, recovery phrase, seed words | value, length, word count from layout | Twelve inputs for a seed phrase. |
| `P-gov-id` | National ID, tax ID, passport number with format hints | value length, formatting mutations, validation message | |

## Values echoed elsewhere on the page

The input itself may be masked while the page shows the value, or something derived from it, somewhere else.

| Id | Pattern | Channels | Test page |
|----|---------|----------|-----------|
| `P-echo-greeting` | Typed value repeated in other text ("Hi Jane", live preview, summary step) | text mutation, title mutation | Name field that updates a heading as you type. |
| `P-search-as-you-type` | Search or filter box whose results update live | result count, result text, URL query, title, network request, empty-state message | Filter a list of names as you type. |
| `P-autocomplete` | Address, email or name suggestions dropdown | suggestion text, suggestion count, chosen option node, network request | Address field with a suggestion list. |
| `P-char-counter` | "12 / 140" counters and remaining-character hints | counter text mutation | Textarea with a live counter. |
| `P-strength-meter` | Password strength bar or label | width style, class, label text, `aria-valuenow` | Meter that changes with length and character classes. |
| `P-validation` | Inline validation and error messages ("must contain a digit", "email already registered", "card declined") | message text, `aria-invalid`, class change, timing | Field with live and on-submit validation. |
| `P-computed-total` | Totals, taxes, loan or insurance quotes computed from inputs | result text, chart canvas, network response | Salary field that updates a computed tax figure. |
| `P-reveal-secret` | "Show" button for an account number, API key or recovery code | text mutation on reveal, clipboard event | Masked `****1234` that reveals the full number on click. |
| `P-qr-secret` | QR code or image showing a 2FA secret or wallet address | image `src` or data URL, canvas, alt text | `img` with a data-URL QR and a canvas-rendered QR. |
| `P-copy-button` | "Copy to clipboard" for codes, keys, addresses | clipboard event payload, toast text | |

## Choices that are sensitive

The data is which option the person picked: consent, health, religion, sexuality, finances, political views.

| Id | Pattern | Channels | Test page |
|----|---------|----------|-----------|
| `P-checkbox-radio` | Native checkboxes and radios | checked state, sibling events in a radio group, focus sequence | Health questionnaire with yes/no radios. |
| `P-custom-toggle` | Switches, toggles and segmented controls built from divs | class, `aria-checked`, `aria-pressed`, inline style, click target | Div switch that flips class `on`. |
| `P-choice-buttons` | Answer chosen by clicking one of several buttons or cards | click target (node id maps to the option), hover, selected class | Survey with four answer cards. |
| `P-native-select` | `select` with sensitive options | selected option, option text, `selectedIndex` | Select for gender or diagnosis. |
| `P-custom-select` | Listbox or combobox built from divs | `aria-selected`, `aria-activedescendant`, click target, displayed label text | ARIA listbox. |
| `P-rating` | Star ratings, pain scales, NPS | click target, class mutation, `aria-valuenow`, hover path | Ten-point pain scale. |
| `P-date-picker` | Date of birth or appointment picked from a calendar | click target day cell, header text (month, year), `aria-selected` | Calendar widget for date of birth. |
| `P-accordion` | Which sensitive section the user opens | `open` attribute on `details`, `aria-expanded`, scroll position | Medical FAQ with `details` elements. |
| `P-tabs` | Which tab is active (account type, plan) | `aria-selected`, class, click target | |
| `P-map-picker` | Location chosen on a map | click coordinates, canvas, tile image URLs (reveal the area), network requests | Map with click-to-place marker. |
| `P-color-picker` | Colour picker (low risk alone, high for some accessibility settings) | inline style, value | |

## Content that reaches the recording outside form fields

| Id | Pattern | Channels | Test page |
|----|---------|----------|-----------|
| `P-pii-text` | Names, emails, addresses, account numbers rendered as page text | text node, title, attribute | Account page with personal details as plain text. Under the default config, record whether any of it is masked. |
| `P-svg-text` | Text inside SVG (`<text>`, `<title>`) | SVG text nodes, which masking may not reach | Chart with labels showing a balance. |
| `P-css-content` | Values shown with CSS `content:` or `attr()` | stylesheet text, inline style | `::after { content: attr(data-balance) }`. |
| `P-chat-composer` | Chat input, `contenteditable` rich text editors | text mutations, character data, caret and selection, key count | `contenteditable` div and a rich editor. |
| `P-file-upload` | File inputs and drag-and-drop | file name in value, preview image or blob URL, file size text | `input type=file` with a name preview. |
| `P-media-preview` | Avatar upload preview, camera or video preview | image data, canvas, video frames | |
| `P-toast` | Notifications, toasts, unread counts in title and favicon | text mutation, title, favicon `href` | |
| `P-embedded-iframe` | Payment, chat or identity widgets in iframes | iframe content when same-origin, URL and query of cross-origin frames, postMessage payloads in custom events | Same-origin iframe with a card form; cross-origin iframe URL with a token in the query. |
| `P-web-component` | Inputs inside shadow DOM web components | values, text, attributes inside open and closed shadow roots | Custom element wrapping an input in an open shadow root. |
| `P-autofill` | Browser or password-manager autofill | value set without key events, `:autofill` style, injected overlay DOM | |

## Layout and sizing leaks

| Id | Pattern | Channels | Test page |
|----|---------|----------|-----------|
| `P-blocked-size` | Blocked element whose size depends on its content | placeholder width and height, later resize mutations | Blocked `div` whose height grows with a list of diagnoses. |
| `P-masked-width` | Masked text whose replacement keeps the length, so the element width tracks the original | text length, element box in snapshot | Masked balance `€12,480.30` versus `€9`. |
| `P-viewport-keyboard` | Mobile viewport resizing when the soft keyboard opens | viewport resize events, timing | |

## Channels

| Channel | What to compare between the two runs |
|---------|---------------------------------------|
| click target | node id and DOM position of the element in click, mousedown, mouseup, touch and focus events |
| pointer path | coordinates and node ids in mouse move and pointer events, including over blocked and masked elements |
| touch path | coordinates in touch events |
| hover and active state | class, style and attribute mutations caused by `:hover`, `:active`, `:focus` or JS handlers |
| attribute mutation | any attribute value change, `aria-*`, `data-*`, `class`, `style`, `type` |
| text mutation | added, removed or changed text, including masked text whose length changes |
| display echo | the masked or dotted display next to a widget, and its length |
| value length | length of the masked value in input events and snapshots |
| key count | number of input, keydown or mutation events |
| inter-key timing | gaps between events (keystroke dynamics identify people and reveal hesitation on specific digits) |
| emit timing | whether events fire only when a masked value changes (deduplication) |
| focus sequence | order and count of focus and blur events |
| checked state | `checked`, `isChecked`, `selected` and similar fields |
| canvas | draw calls, image data, data URLs |
| image data | `src`, `srcset`, data URLs, blob URLs, inlined images |
| URL query | page URL, `pushState` URLs, link and frame URLs |
| network request | request and response bodies, headers and URLs from network capture |
| clipboard event | copy and paste payloads |
| scroll position | scroll events inside masked or blocked containers |
| viewport resize | viewport size events |
