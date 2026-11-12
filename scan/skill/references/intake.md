# Questions: three per review

Use this after an initial source investigation reveals missing business context. Do not open a new review with a generic questionnaire. First inspect the user's instructions, available policy and product documentation, routes and access rules, data producers, representative rendering components and recorder configuration. Follow relevant definitions rather than inferring meaning from names. Build a provisional project profile with source references and explicit uncertainties.

Ask only about uncertainties that materially change a classification, protection boundary or public-content loss and cannot be resolved through available source, documentation, existing policy, session context or feasible technical checks. Before asking, identify what was investigated, what remains genuinely ambiguous, why user knowledge or a policy decision is needed, and how the answer changes the review. A source file not yet inspected or a test not yet run is work for the agent, not a question for the user. Continue independent review work while answers are pending. Do not repeat answers already established in the session.

## Resolve genuine user-dependent ambiguities

These families cover the ambiguities the review has found and cannot settle. They feed the third question below. Include as few as necessary, and none when the evidence is sufficient. Phrase questions using concrete features found in the app and briefly state what the answer changes. Bundle shared uncertainty across related destinations instead of asking per field, and keep each batch manageable.

| Question | Answer to retain | How it changes the review |
| --- | --- | --- |
| Who uses the application, and whose information do they view or enter? | Public visitor, customer, employee, administrator; self, other people, own organization or other organizations | Establish subject and audience without treating all operator-entered text as about the operator |
| Which information is deliberately published or intended for everyone to see? | Specific public data types and their publication context | Preserve public catalogs, directories, fixed examples and public uses of shared components |
| Is there specific data you worry about showing up in a recording? | The named data, plus any existing policy, confidential business information or explicit recording exclusions it points to | Reuse organizational handling rules, including information that identifies no person; an existing policy can answer this question without a field-by-field list |

Prefill these questions where source supports an answer and skip known context. Do not expand them into mandatory subquestion lists. Inspect source for credentials, personal information and specially protected data without adding a separate intake question for each category. Never ask whether a demonstrated working credential is secret. Do not ask the user to identify technical prop forwarding, portal ownership or recorder behavior that the agent can investigate. A public webpage is not evidence that all its user-specific content is intended for unrestricted recording.

For example, after tracing a monitor picker to an account-scoped API, ask whether its monitor names are published service labels or confidential internal labels only if available publication paths and policy do not resolve that question. Explain that the answer determines whether their text stays visible in recordings. After finding both public and signed-in directory routes, ask whether the same fields are intentionally published in both only if the source and policy leave that unresolved. Use these examples only when the corresponding evidence exists; do not manufacture uncertainty to fill a quota.

Where an ambiguous family matters, use it as a concrete example within the relevant question: for example, whether monitor names are published service labels or confidential operational labels. Do not append another routine intake question. Apply the answer only to the supported data type and scope, then check exceptions. Preserve a policy assumption and unresolved status when an answer is unavailable; do not turn silence into permission to retain private content.

## Three questions per review

The three families in the table above are the only questions that go to the user. Each one carries the unresolved decisions that hinge on it and ends with one probe for information the source could not show.

1. **Who uses this, and whose information do they see or enter?** Probe: summarize the kinds of private information found in one line, then name up to three features seen in the source whose content could not be traced, and ask what they hold and what else is missing. Generic examples anchor the answer on the example, so use features from this application. For example: "Your support staff use these screens and see a customer's contact details, subscription and device information. Is that right? I saw conversation labels and custom attributes and could not see what they hold. What goes in them, and is any other private information missing?" An answer that names new information adds destinations to the trace worklist.
2. **Which of this is published on purpose?** Carry the public-or-private decisions, then name the two or three visible items most likely to be confidential. For example: "Integration names are hidden for now. Are they only your built-in list, which could stay visible? Plan names and prices are hidden too. I am keeping page headings and help text visible. Is any of that confidential?"
3. **Is there specific data you worry about showing up in a recording?** Ask about worry, since a question about rules or policy gets a vague answer. Offer up to three unresolved handling decisions as candidates so the user has something to react to. For example: "Is there specific data you worry about showing up in a recording? Candidates: whether a user has two-step verification on, and the page a customer came from. Both hidden for now. Anything a customer, contract or regulator has told you must never be captured?"

Keep the message short. Each question carries at most three groups of decisions, and a decision appears under one question only. For every group give the feature in the user's words, the default applied and what the other answer would change. The whole message stays under 250 words. Groups that do not fit stay unresolved in the report, lowest impact first.

Recorder version, options, plugins and recorded pages are investigated from configuration and the recorder guide. They are never asked. When they are absent from the inputs, the report states the assumption used.

An unanswered question is a stated limit of the review and appears in the report with the default that was applied.

## Keep the dimensions separate

- **Subject:** viewer, another person, own organization, another organization, mixed or unknown.
- **Confidentiality:** reuse the organization's labels. If it has none, propose public, internal, confidential and restricted as a working scheme with defined handling rules. These label names are not a universal standard.
- **Special handling:** access-granting secret, legal special category where applicable, other regulated data, contractual restriction, or project policy.
- **Recorder treatment:** none, mask, block, a recorder-level control, or unresolved placement, based on the actual channel and recorder capability.

A corporate budget can be confidential without being personal data. Personal information can be intentionally published while remaining personal information for legal purposes. A classification level does not mechanically select a DOM annotation: a private text value and a URL carrying the same value may require different controls.

The current scanner has a legacy four-category vocabulary: secret, personal, third-party and public. Retain the richer context in the rationale and project profile; do not silently change the schema. Its broad organization-related categories and `special_category` flag are project conventions, not a legal classification or an assertion that every flagged item falls under GDPR Article 9. A future schema migration must preserve that distinction explicitly.

## Use standards as inputs

Sources checked 2026-11-11:

- [NIST SP 800-122](https://csrc.nist.gov/pubs/sp/800/122/final) supplies context-based guidance for identifying personal information and choosing protection according to potential harm. Adapt its reasoning to the application; do not present this intake as a NIST-mandated questionnaire.
- [ISO/IEC 27002:2022](https://www.iso.org/standard/75652.html) provides organizational information-security control guidance. Accept the user's existing policy or licensed control mapping. The public overview alone does not verify compliance with a specific classification control.
- [HashiCorp's classification guidance](https://developer.hashicorp.com/well-architected-framework/secure-systems/data/classify-data) provides a practical public/internal/confidential/restricted example. This is vendor guidance and a useful starting scheme, not an international standard or a reason to overwrite an existing policy.
- [European Commission guidance on special categories](https://commission.europa.eu/law/law-topic/data-protection/information-business-and-organisations/legal-grounds-processing-data_en) identifies GDPR's specially protected personal-data categories. Use applicable legal categories as separate handling flags. Organizational sensitivity can extend beyond those categories.

Do not present [NIST IR 8496](https://csrc.nist.gov/pubs/ir/8496/ipd) as a finalized standard: NIST states that development of the initial public draft ceased on December 10, 2025.

The resulting project profile should record each rule's source, scope, whether the user confirmed it, and known exceptions. It should reduce repeated business-context questions while preserving source tracing and actual recording verification. A completed intake does not establish legal compliance or measured runtime protection.
