# Decision records

Use JSON with `schema_version: 1`, `reviewer` and `decisions`. Set reviewer `kind` to `model` or `human`. Record unknown token usage as null.

Each decision has these fields:

| Field | Meaning |
| --- | --- |
| site_id | Exact structural inventory site. |
| status | decided or unresolved. |
| category | secret, personal, third-party, public, or null while unresolved. |
| special_category | Boolean sensitivity flag. |
| treatment | mask, block, none, or null while unresolved. |
| meaning | What information can appear, including whose information it is. |
| rationale | Why the evidence requires this treatment at this destination. |
| evidence | List of source references: file, start_line, end_line, quote, sha256. Quotes must be exact source text within that line range. |
| reason | Required explanation for unresolved work. |
| accept_shared | Optional explicit explanation for necessary public-content loss. Report the affected public sites separately. |

Read the source before filling in these fields. Scripts may attach IDs, line numbers and hashes to conclusions you actually reviewed. Scripts must not invent semantic decisions from expression names.

`status` describes the semantic decision. If the value is demonstrably a password, its category and required treatment are decided even when an external input implementation is unavailable. Preserve that decision; the patch validator will separately report unresolved placement. Use an unresolved semantic decision when the information's meaning, audience or required treatment remains uncertain. Do not erase a supported meaning because DOM placement is unknown.

For an omitted destination, add `additional_findings` records with file, line, quote, channel, meaning and reason. The inventory must be corrected or the destination must stay unresolved; it cannot silently count as reviewed.

Treat evidence validity and semantic correctness as separate checks. A valid quote can still support an incorrect interpretation. Independent review and executable examples test that interpretation.

Use `groups` for sites that share one reviewed meaning, audience and treatment. Each group has a unique `id`, an explicit `site_ids` list and the same decision fields except `site_id`. Cite representative source evidence and any producer or caller required to establish that shared meaning. Groups cannot overlap other groups or individual decisions. Do not group unrelated expressions because their names resemble each other.

When a precise framework edit requires a call-site wrapper, a forwarded prop or a split public/private text node, add `proposed_changes`. Each change has `file`, literal original `from`, replacement `to`, `site_ids`, `rationale` and source `evidence` in the format above. The original text must occur exactly once. Multiple edits refer to the same original snapshot and cannot overlap. Include evidence for the actual forwarding behavior, all copies of the value, and any public content removed. Preserve stronger existing controls.

Run `privacy-scan review-proposals --out <session>` to validate exact replacements, check JavaScript/TypeScript syntax and apply the diff to an isolated copy. Vue, Svelte and Blade still require framework compilation. This produces `source-proposals.patch` separately from mechanically resolved native proposals. Neither file establishes runtime protection. Never apply both blindly: their edits may overlap or represent alternatives.
