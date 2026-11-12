# Map surfaces and content before tracing

Use this after initial application research to choose where to investigate. Map a feature's purpose and its distinct content families. Do not annotate a whole surface merely because its name sounds private, and do not create a row for every repeated field.

## Surface purpose

| Observed surface | Start by separating | Useful follow-up |
| --- | --- | --- |
| People, account or record overview | Fixed column headings and actions from record-derived cells, avatars and links | Check whose records appear, shared cell renderers, selection state and row destinations |
| Navigation, index or table of contents | Authored product navigation from headings, filenames or collections derived from user content | Follow the source of captions, search results and destination URLs; an index of private documents can itself be private |
| Settings or choice form | Instructions and available options from the current selection and account-specific configuration | Check schema constraints, sensitive predicates, custom options and interaction capture |
| Activity feed or event history | Event kind and template from actor, subject, timestamp, interpolated message and payload | Follow formatting branches and properties individually, including unknown event types |
| Editor, conversation or document | Fixed toolbar and instructions from authored content, previews, mentions and attachments | Check all copies, saved/draft audience, resources and editing states |
| Dashboard or summary | Fixed metric labels from individual values, aggregates, filters and group membership | Check what can be inferred from small groups, ordering, dimensions and applied filters |

These are starting examples, not a closed list. Give an unfamiliar surface a short purpose description and inspect its values using the same procedure. A page may contain several surface types.

## Value shape

Classify the actual producer and reachable values. A UI widget, TypeScript name or small observed sample is not sufficient proof of a constraint.

| Shape | Evidence to look for | Common trap |
| --- | --- | --- |
| Fixed application copy | Literal or application-owned translation with no private substitutions or private variant selection | A constant caption can disclose a private condition through its presence or position |
| Bounded choice | A defined vocabulary and the code/schema that constrains values to it; separate option captions from selected state | Two choices such as a health yes/no answer can be sensitive. Tenant-created labels are not a fixed public vocabulary |
| Record reference or structured field | Model, query or caller establishing subject and audience; format constraints where relevant | A UUID, email, date or generated identifier can identify a person or private record despite being structured |
| Free-form authored content | Entry, import, external integration or model output that can carry unrestricted content | Length limits and escaping do not establish public meaning. Publicly published prose may be intentionally clear |
| Derived or aggregate value | Original inputs, transformation, grouping and branches | Initials, counts, hashes, sorting and truncation can retain identifying or sensitive information |
| Resource or embedded content | URL construction, access semantics and the renderer for an image, attachment, document or other payload | Masking visible text can leave a private resource URL or embedded contents exposed |
| Mixed structured payload | Schema, discriminator, formatter and each property that reaches a captured destination | A fixed event name does not make its arbitrary properties safe; unknown-property fallbacks can bypass known-field treatment |

Shapes can compose. A record field may be a bounded choice; its caption may be free-form tenant configuration. Record both facts when they change the investigation. Mark unsupported bounds as unknown and follow the missing producer rather than inventing an enum from observed examples.

## Meaning stays separate

For each content family, retain its subject, intended audience/publication context, applicable confidentiality policy and special handling. Shape guides investigation; meaning and recorder capability determine treatment. Keep these distinctions concrete:

- A user overview can mix public team-directory names with private account contact details. Check the publication context of each family.
- A table of contents can contain public documentation headings or confidential user-authored headings. Trace the headings and links separately.
- A status selector may have public option labels but a private selected answer. Include control state and interaction inference in the review.
- An activity event may have a fixed kind and private actor, record link or free-form message. Review the rendered message and any separately recorded event payload independently.
- A shared editor can serve a private draft and an intentionally published article. Do not force the same audience onto both callers.

Only ask the user when the missing distinction requires their knowledge or a policy decision after the available source has been investigated. Do not ask them to categorize controls or enumerate schemas the agent can read.

## Keep a compact working map

In the session's `review-map.md`, use one row per distinct family when the feature is complex enough to need a map:

| Surface / family | Producer and constraint evidence | Shape | Subject / audience / policy | Destinations or open trace | Selected lenses |
| --- | --- | --- | --- | --- | --- |
| Concrete feature and field family | Source location and what it establishes | One or more shapes, or unknown | Supported meaning and remaining ambiguity | Known carriers, branches and missing definitions | Lens IDs and concrete scope |

For a single obvious field, keep this information in its existing decision rationale; a second document is unnecessary. Reuse source evidence from the decision records. This map is working context, not a new completion score or a replacement for destination-level decisions.

Use the map to choose relevant cards and [review lenses](review-lenses.md). If a new producer, free-form field, discriminator branch or caller changes the map, revisit the affected decisions and lens scope. Preserve unknown families in the report rather than treating only the successfully mapped content as the feature's full scope.
