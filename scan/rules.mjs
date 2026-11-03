// Static rules for finding front-end code that collects or shows data a recorder must mask or block.
// Each rule maps a source line to a pattern in ../audit/patterns.yaml and a likely data category.
// Rules are line-based so they work on any framework (JSX, Vue, Svelte, Angular templates, HTML).
// They over-report on purpose: the agent decides what each candidate really holds.
//
// A rule with `auto` decides on its own: find writes its annotation and the agent skips the candidate.
// Promote a rule to `auto` only when scan reports show it right almost every time (see README.md,
// "Maintaining the rules").

const ID = String.raw`[A-Za-z_$][\w$]*`;

// Variables that usually hold the signed-in person versus other people's records.
const SELF = /\b(me|viewer|currentUser|user|self|profile|account|session\??\.user|clerkUser|authUser)\??\.\w/;
const OTHERS = /\b(customer|member|contact|row|participant|invitee|invite|recipient|sender|author|owner|assignee|attendee|employee|client|lead|candidate|patient|visitor|recording|item|entry|u|m|c|p|r)\??\.\w/;

export const PERSON_FIELD = String.raw`(email|emailAddress|phone|phoneNumber|mobile|firstName|lastName|fullName|displayName|name|username|handle|address|street|city|zip|postalCode|postcode|birth|birthday|dob|dateOfBirth|age|gender|ssn|taxId|nationalId|passport|iban|bic|ip|ipAddress|userAgent|location|geo|lat|lng|country|avatar|avatarUrl|imageUrl|picture|photo|company|organization|orgName|title|jobTitle|salary|income|balance|amount|diagnosis|notes|bio)`;

export const RULES = [
  // Secrets typed or shown
  { id: 'secret-input-password', auto: { value: 'block', category: 'secret' }, re: /type=\{?["'`]password["'`]\}?|autoComplete=\{?["'`](current-password|new-password)/, pattern: 'P-password', category: 'secret' },
  { id: 'secret-input-otp', re: /autoComplete=\{?["'`]one-time-code|\b(otp|one[-_ ]?time[-_ ]?code|verification[-_ ]?code|totp|mfa[-_ ]?code|2fa[-_ ]?code)\b/i, pattern: 'P-otp-single', category: 'secret' },
  { id: 'secret-input-card', re: /autoComplete=\{?["'`]cc-|\b(card[-_ ]?number|cardNumber|cvv|cvc|security[-_ ]?code|iban|routing[-_ ]?number|account[-_ ]?number)\b/i, pattern: 'P-card-number', category: 'secret' },
  { id: 'secret-otp-component', re: /<(OTPInput|InputOTP\w*|OtpInput|PinField|CodeInput|VerificationCodeInput)\b|from ["']input-otp["']/, pattern: 'P-otp-split', category: 'secret' },
  { id: 'secret-field-name', re: /\bname=\{?["'`][^"'`]*([sS]ecret|[tT]oken|[pP]assword|[aA]pi_?[kK]ey|[pP]rivate_?[kK]ey|[cC]vv|[cC]vc)[^"'`]*["'`]/, pattern: 'P-password', category: 'secret' },
  { id: 'secret-url', render: true, re: /\b(webhookUrl|webhook_url|targetUrl|callbackUrl|redirectUri|inviteLink|inviteUrl|invitationLink|magicLink|resetLink|signedUrl|presignedUrl|shareUrl|shareLink)\b/, pattern: 'P-reveal-secret', category: 'secret' },
  { id: 'secret-pin', re: /\b(pin[-_ ]?code|pinCode|enterPin|PinInput|PinPad|Keypad|NumberPad)\b/, pattern: 'P-pin-pad', category: 'secret' },
  { id: 'secret-display', render: true, re: new RegExp(String.raw`\{[^}]*\b(apiKey|api_key|secretKey|secret|token|accessToken|refreshToken|clientSecret|privateKey|webhookSecret|signingSecret|password|recoveryCodes?|backupCodes?|seedPhrase|plaintext|secretValue)\b[^}]*\}`), pattern: 'P-reveal-secret', category: 'secret' },
  { id: 'secret-reveal-toggle', re: /\b(showPassword|revealed|isRevealed|showSecret|showKey|setShow(Password|Secret|Key))\b/, pattern: 'P-password-reveal', category: 'secret' },
  { id: 'secret-copy', re: /(copyToClipboard|clipboard\.writeText|useCopy\w*|onCopy)\s*\(\s*[\w?.]*([sS]ecret|[tT]oken|[aA]pi_?[kK]ey|[pP]assword|[rR]ecoveryCode|[pP]rivateKey|[pP]laintext)\b|<CopyButton\b[^>]*\{[^}]*([sS]ecret|[tT]oken|[kK]ey|[pP]assword)/, pattern: 'P-copy-button', category: 'secret' },
  { id: 'secret-qr', re: /\bQRCode|qrcode|otpauth:/, pattern: 'P-qr-secret', category: 'secret' },
  { id: 'secret-gov-id', re: /\b(ssn|socialSecurity|taxId|nationalId|passportNumber|driversLicen[cs]e)\b/i, pattern: 'P-gov-id', category: 'secret' },

  // Personal or third-party data rendered as text, attributes or images
  { id: 'person-field-self', render: true, re: new RegExp(String.raw`\{[^}]*${SELF.source}[^}]*\.${PERSON_FIELD}\b[^}]*\}`), pattern: 'P-pii-text', category: 'personal' },
  { id: 'person-field-others', render: true, re: new RegExp(String.raw`\{[^}]*${OTHERS.source}[^}]*\.${PERSON_FIELD}\b[^}]*\}`), pattern: 'P-crm-record', category: 'third-party' },
  { id: 'person-field', render: true, re: new RegExp(String.raw`\{[^}]*\.${PERSON_FIELD}\b[^}]*\}`), pattern: 'P-pii-text', category: 'personal?', fallback: true },
  // Hooks that return the signed-in user are sources for the data-flow pass in find.mjs.
  { id: 'record-list', re: new RegExp(String.raw`\.map\(\s*\(?\s*(${ID}\s*,\s*)?(user|member|customer|contact|row|session|recording|invite|invitation|account|org|organization|team|comment|message|participant|log|event|key|apiKey|visitor)s?\b`, 'i'), pattern: 'P-admin-table', category: 'third-party?' },
  { id: 'table', re: /<(table|Table|DataTable|DataGrid|TableRow|TableCell)\b/, pattern: 'P-admin-table', category: 'third-party?' },
  { id: 'avatar-image', re: /<(Avatar|AvatarImage|img|Image)\b[^>]*\bsrc=\{/, pattern: 'P-media-preview', category: 'personal?' },
  { id: 'chart', re: /<(LineChart|BarChart|AreaChart|PieChart|ResponsiveContainer|Sparkline|Chart)\b|from ["'](recharts|chart\.js|d3|@nivo\/|victory)/, pattern: 'P-svg-text', category: 'personal?' },
  { id: 'html-injection', re: /dangerouslySetInnerHTML|v-html=|\{@html /, pattern: 'P-pii-text', category: 'personal?' },
  { id: 'attribute-data', render: true, re: new RegExp(String.raw`\b(title|aria-label|aria-valuetext|alt|placeholder|data-[\w-]+)=\{[^}]*\.${PERSON_FIELD}\b`), pattern: 'P-pii-text', category: 'personal?' },
  { id: 'attribute-expr', render: true, re: /\b(title|aria-label|aria-description|alt|href|src|data-(?!audit|privacy|testid|state|slot|side|align|orientation|variant|size)[\w-]+)=\{(?!\s*["'`])[^}]*\b(row|item|session|recording|meta|metadata|user|member|customer|value|label|title|name|q|query|search)\b/, pattern: 'P-pii-text', category: 'personal?', note: 'Attributes are recorded even inside masked elements in most recorders.' },
  { id: 'set-attribute', re: /\.setAttribute\(\s*["'`](href|src|title|aria-label|alt|value|data-[\w-]+)["'`]/, pattern: 'P-pii-text', category: 'personal?' },
  { id: 'metadata-render', render: true, re: /\{[^}]*\b(traits|customData|userMetadata|customAttributes|userProperties|customFields)\b[^}]*\}/, pattern: 'P-crm-record', category: 'third-party?' },
  { id: 'echo-search', render: true, re: /\{[^}]*\b(q|query|searchQuery|searchTerm|searchText)\b[^}]*\}/, pattern: 'P-search-as-you-type', category: 'personal?' },
  { id: 'template-binding', render: true, re: new RegExp(String.raw`(\{\{[^}]*|:[\w-]+="[^"]*|\{[^}]*)\.${PERSON_FIELD}\b`), pattern: 'P-pii-text', category: 'personal?', fallback: true },
  { id: 'generic-cell', render: true, re: /\{\s*[A-Za-z_$][\w$]*\[\s*[A-Za-z_$][\w$]*\.(key|accessor|accessorKey|field|dataIndex|name)\s*\]\s*\}|>\s*\{\s*cell\s*\}\s*</, pattern: 'P-admin-table', category: 'third-party?' },
  { id: 'dom-write', re: /\.(textContent|innerText|innerHTML|outerHTML)\s*\+?=|\.insertAdjacentHTML\(|document\.write\(/, pattern: 'P-pii-text', category: 'personal?' },
  { id: 'style-from-data', re: /style=\{\{[^}]*(width|left|height|transform)\s*:\s*`?[^}]*\$\{|content:\s*attr\(/, pattern: 'P-strength-meter', category: 'personal?' },

  { id: 'record-component', re: /<(RecordChip|RecordPicker|MultipleRecordPicker|SingleRecordPicker|AvatarGroup)\b|<\w*(Record|Person|People|Contact|Member|Customer|Company|User|Participant|Assignee|Owner|Attendee|Recipient)\w*(Chip|Picker|Select|Card|Cell|Display|Avatar|Name|Link|List|Item|Row)\b|<\w*(Emails|Phones|Links|FullName|Address|Json|Currency)(Display|FieldDisplay)\b/, pattern: 'P-crm-record', category: 'third-party?' },
  { id: 'message-content', render: true, re: /\{[^}]*\.(subject|body|snippet|preview|messageBody|lastMessageBody|text|content|excerpt)\b[^}]*\}/, pattern: 'P-chat-thread', category: 'third-party?', fallback: true },
  { id: 'name-in-text', re: /\$\{\s*[\w?.]*(member|user|person|contact|customer|owner|sender|recipient)\w*\.?(name|Name|email|Email)\w*\s*\}|\$\{\s*\w*(Name|Email)\s*\}/, pattern: 'P-echo-greeting', category: 'personal?' },

  // Inputs and widgets that collect personal data
  { id: 'input', re: /<(input|textarea|select)\b|<\w*(Input|TextField|TextArea|Textarea|Select|Combobox|Autocomplete|PhoneField|EmailField)\b/, pattern: 'P-input-types', category: 'personal' },
  { id: 'rich-editor', re: /<\w*(Advanced|Rich)\w*(Editor|Input)\b|contentEditable|<(ProseMirror|EditorContent|LexicalComposer|Slate|Editable|CodeMirror|MonacoEditor|Editor|ReactQuill)\b|from ["'](@tiptap|lexical|slate-react|@uiw\/react-codemirror|@monaco-editor|react-quill)/, pattern: 'P-chat-composer', category: 'personal' },
  { id: 'file-upload', re: /type=\{?["'`]file|Dropzone|useDropzone|\bonDrop=/, pattern: 'P-file-upload', category: 'personal' },
  { id: 'choice-widget', re: /type=\{?["'`](checkbox|radio)|<(Checkbox|Radio|RadioGroup|RadioGroupItem|Switch|Toggle|ToggleGroup)\b|role=\{?["'`](switch|checkbox|radio)/, pattern: 'P-checkbox-radio', category: 'personal' },
  { id: 'slider', re: /type=\{?["'`]range|<Slider\b|role=\{?["'`]slider/, pattern: 'P-slider-secret', category: 'personal' },
  { id: 'date-picker', re: /type=\{?["'`](date|datetime-local|month)|<(DatePicker|Calendar|DateRangePicker)\b/, pattern: 'P-date-picker', category: 'personal' },
  { id: 'search', re: /type=\{?["'`]search|placeholder=\{?["'`][^"'`]*search|\b(useSearch|setQuery|setSearch|onSearch)\b/i, pattern: 'P-search-as-you-type', category: 'personal' },
  { id: 'validation', re: /errors?\??\.\w+\??\.message|<FormMessage\b|setError\(/, pattern: 'P-validation', category: 'personal' },

  // Page metadata, URLs and messages
  { id: 'title-from-data', re: /document\.title\s*=|<title>\{|title:\s*`[^`]*\$\{|use\w*Title\(|head:\s*\(\s*\{/, pattern: 'P-pii-text', category: 'personal?' },
  { id: 'url-with-data', re: /(navigate|router\.push|redirect|Link)\b[^;]*(search|params):\s*\{[^}]*(email|token|key|secret|q|query|name)\b|\?[\w&=]*(email|token|key|secret)=\$\{/, pattern: 'P-search-as-you-type', category: 'personal?' },
  { id: 'toast', re: /\b(toast|enqueueToast|enqueueSnackbar|notify)(\.\w+)?\([^)]*\$\{|\b(children|message|description|title):\s*`[^`]*\$\{/, pattern: 'P-toast', category: 'personal?' },
  { id: 'console', optIn: 'console', re: /console\.(log|info|debug|warn|error)\(/, pattern: null, category: 'personal?', note: 'Recorded only when a console plugin is on.' },

  // Embedded content
  { id: 'iframe', re: /<iframe\b/, pattern: 'P-embedded-iframe', category: 'personal?' },
  { id: 'canvas-video', re: /<(canvas|video)\b|getUserMedia|captureStream/, pattern: 'P-media-preview', category: 'personal?' },
  { id: 'session-replay', re: /rrweb-player|new\s+\w*(Replayer|Player)\s*\(|rrwebPlayer\s*\(|<(Replayer|Player|ReplayPlayer|SessionPlayer)\b|from ["'](rrweb|@rrweb\/replay)|\b(playerRef|replayerRef|playerContainer)\b/, pattern: 'P-shared-doc', category: 'third-party', note: 'A replay of someone else\'s session shows their data.' },
];

// Rules marked `render` only count on lines that look like markup, so values passed to fetch
// headers or hooks (which never reach the page) are skipped.
export const MARKUP = /<[A-Za-z]|\/>|<\/|^\s*\{[^}]*\}\s*$|>\s*\{|\}\s*<|=\{[^}]*\}|\{\{[^}]+\}\}|\s:[\w-]+="/;

// Objects that usually hold public content; person-field matches on them are skipped.
export const PUBLIC_OWNER = /\b(hero|plan|plans|tier|brand|product|feature|features|post|article|page|site|seo|meta|config|copy|content|nav|menu|faq|testimonial|footer|header|link|category|tag|step|section|col)\??\.\w+/;

// Translation calls hold label keys, never data: their text is removed before the rules run.
export const TRANSLATION_CALL = /(\$t|\bt|\btrans|\b__|\bi18n\.t|\b\$i18n\.t|\bformatMessage|\b_)\(\s*(['"`])[^'"`]*\2[^)]*\)/g;

// Existing masking annotations from the standard and from common vendors.
export const COVERAGE = /data-privacy=|\brr-(mask|block|ignore)\b|data-rr-(mask|block|ignore)|ph-no-capture|ph-mask|data-hj-(suppress|allow)|fs-(exclude|mask|unmask)|sentry-(mask|block|unmask)|data-sentry-(mask|block)|data-dd-privacy|data-clarity-(mask|unmask)|data-private\b|data-mask\b|lr-(hide|block)|data-(heap|mp|amp)-(redact|mask)/;
