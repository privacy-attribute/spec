# Output format

Write one JSON file, `privacy-audit.json`, in your scratch directory. When you finish, print its path. Then write a short summary in prose. The summary contains these items, in this order:

1. the disclaimer from the Responsibility section of `AGENTS.md`, word for word
2. counts by kind, severity and verdict
3. the privacy findings that leak under `targeted` or `strictest`
4. the gap reports from step 9 with their issue URLs. For reports that you did not file, give their paths and a note that the implementer must file them.

## Top level

```json
{
  "disclaimer": "These instructions and every audit produced with them are provided as is, ...",
  "audit_version": "1.0.0",
  "audit_source": "https://github.com/privacy-attribute/spec/blob/audit-v1.0.0/audit/AGENTS.md",
  "target": {
    "repo": "example-org/example-recorder",
    "ref": "main",
    "commit": "0a1b2c3d4e5f60718293a4b5c6d7e8f901234567",
    "nearest_tag": "v3.4.0",
    "commits_past_tag": 3,
    "packages": { "example-recorder": "3.4.0", "@example/cloud-client": "3.4.0" }
  },
  "previous_audit": { "commit": "9f8e7d6c5b4a39281706f5e4d3c2b1a098765432", "audit_version": "1.0.0" },
  "configs": {
    "default-core": {},
    "default-cloud-client": { "note": "wrapper sets maskText: true when unset" },
    "strictest": { "maskText": true, "maskInputs": true, "blockMedia": true, "captureConsole": false },
    "opt-in:captureConsole": { "captureConsole": true }
  },
  "method_note": "Harness, browser, configs run per page, and anything skipped with the reason.",
  "sinks": [
    { "id": "S2", "name": "attribute mutation records", "file": "src/record/mutations.ts", "line": 210 }
  ],
  "findings": [],
  "resolved": [
    { "fingerprint": "url-meta:recordMeta:location.href", "removed_in": "v3.4.0", "now_stopped_at": "src/record/meta.ts:22" }
  ],
  "feedback_applied": [
    { "issue": 12, "pattern": "FB-12", "result": "F3" }
  ],
  "feedback_sent": [
    { "kind": "missed-leak", "title": "missed-leak: async image load writes pixels into an emitted blocked node", "filed": true, "url": "https://github.com/privacy-attribute/spec/issues/31", "path": null, "reason": null }
  ],
  "pattern_coverage": [
    { "pattern": "P-pin-pad", "configs": ["strictest", "strictest-block", "default-core"], "result": "F1, F4" }
  ],
  "coverage": [
    { "leak_class": "media", "checked": ["src/record/canvas.ts"], "result": "no finding" }
  ]
}
```

`configs` lists each config that you tested, with the exact options object. The finding fields refer to these ids.

## Finding

```json
{
  "id": "F1",
  "fingerprint": "attribute:processAttributeMutation:title",
  "kind": "privacy",
  "leak_class": "attribute",
  "data_category": "third-party",
  "special_category": false,
  "pattern": null,
  "pattern_rank": null,
  "title": "title attribute of masked elements is recorded in the clear",
  "sink": { "id": "S2", "file": "src/record/mutations.ts", "line": 214 },
  "additional_sinks": [],
  "path": [
    "src/record/mutations.ts:198 reads target.getAttribute(name) for every changed attribute",
    "src/record/mutations.ts:205 calls maskAttribute only when name === 'value'",
    "src/record/mutations.ts:214 pushes { id, attributes: { title } } into the mutation record"
  ],
  "masking_checked": "maskAttribute (src/record/mask.ts:40) runs only for value; maskText covers text nodes only",
  "leaks_under": ["default-core", "default-cloud-client", "strictest"],
  "safe_under": [],
  "severity": "high",
  "recoverable": true,
  "verdict": "CONFIRMED",
  "affected_since": "v3.1.0",
  "affected_since_exact": true,
  "status": "new",
  "reproduction": {
    "page": "<span class=\"masked\" id=\"s\">x</span>",
    "actions": "document.getElementById('s').title = 'jane@example.com'",
    "config": "strictest",
    "event": { "type": 3, "data": { "source": 0, "attributes": [{ "id": 7, "attributes": { "title": "jane@example.com" } }] } }
  },
  "fix": "In src/record/mutations.ts:205, run maskAttribute for every attribute on the privacy-relevant list in taxonomy.md class 7 when the element is masked.",
  "fidelity_cost": "None for public content: only attributes of masked elements change. Without this fix the integrator must block the element, which loses its box styling and hover state."
}
```

## Field rules

| Field | Rule |
|-------|------|
| `audit_version`, `target` | Required. Fill them in step 0 of the method. `commit` is the full SHA. |
| `previous_audit` | Include it only when you compared with an earlier audit. It holds the target commit and the audit version of that audit. |
| `fingerprint` | `<leak_class>:<sink function>:<source property or attribute>`. Use function and property names. Never use line numbers. Then the same leak gets the same fingerprint in each version. Two findings in one report never share a fingerprint. |
| `affected_since`, `affected_since_exact` | The oldest release tag that has the leak. Find it as `AGENTS.md` describes under "Affected releases". |
| `status`, `status_note` | `new`, `unchanged` or `changed` against `previous_audit`. Use `new` for each finding when there is no previous audit. `status_note` is required for `changed`. |
| `resolved` | Earlier fingerprints that no longer leak, each with `removed_in` and `now_stopped_at`. Empty when there is no previous audit. |
| `pattern_rank` | The `rank` of `pattern` in `patterns.yaml`, or `null`. |
| `kind` | `privacy` or `fidelity`. |
| `data_category` | `secret`, `personal`, `third-party` or `public`, from the Data categories table in `AGENTS.md`. Fidelity findings use `public`. |
| `special_category` | `true` for `personal` or `third-party` data in a special category (health, sex life or orientation, religion, political views, ethnicity, biometrics, union membership, criminal records). |
| `fidelity_cost` | For privacy findings: the public content or behaviour that the proposed fix removes, and what the cheapest config that works today removes. For fidelity findings: the lost content, and the pages where the loss would show. Required. |
| `pattern` | The `patterns.yaml` id whose test page found this finding, or `null` if the code track found it. |
| `recoverable` | `true` if the attacker can reconstruct the full value from one recording, in at least one of your runs. When the attacker does not succeed in all runs, give the success rate across runs in `reproduction`. Show the reconstruction in `reproduction`. `false` for partial leaks (length, range, which of a few options). |
| `leak_class` | One id from `taxonomy.md` (a fidelity class id for fidelity findings). Make one finding for each leak class and data category. If the evidence of one class covers categories that leak under different configs, split the finding by category. One event can show two classes (for example, an echo element whose text length also leaks). Then report it under each class with the same evidence. Merge only findings of the same class. |
| `sink` | The `file:line` where the code puts the data into an emitted structure. One leaking behaviour can reach more than one sink (for example, a URL in the meta event and in iframe attributes). Then keep one finding, put the main sink here, and put the other sinks in `additional_sinks`. |
| `path` | Ordered steps from the source (DOM read, attribute read, event) to the sink. Each step has a `file:line` and tells what happens to the value there. At least two steps. |
| `masking_checked` | The mask or block function on this path, and why it does not stop the leak. Write `none` if no check runs. |
| `leaks_under` / `safe_under` / `not_evaluated` | Config ids from `configs`. Together, the three lists cover each config in `configs`. Use `not_evaluated` for configs that do not apply to the pages of this finding. |
| `disclaimer` | Required. The full disclaimer text from the Responsibility section of `AGENTS.md`, word for word. |
| `audit_source` | The link or path that you read the instructions from. |
| `feedback_applied` | One row for each accepted feedback issue that you tested, with its `FB-` pattern id and the finding ids or `no finding`. Empty if there was no accepted feedback or the fetch failed (write which in `method_note`). |
| `feedback_sent` | One row for each report from step 9. `filed` is `true` with the issue or comment `url`, or `false` with the local `path` and the `reason` (failed, no permission, user declined, dry run). |
| `method_note`, `pattern_coverage` | Required. `pattern_coverage` has one row for each `patterns.yaml` id, with the configs that you ran and the finding ids or `no finding`. |
| `coverage[].table` | Optional. Put result tables for each type or config (such as the `P-input-types` matrix) on the coverage row of their leak class. |
| `severity` | `critical`, `high`, `medium` or `low`, as the table in `AGENTS.md` gives. |
| `verdict` | `CONFIRMED` when you copied `reproduction.event` from output that you ran. `PLAUSIBLE` in all other cases. |
| `reproduction` | Required for `CONFIRMED`. For `PLAUSIBLE`, give `page`, `actions`, `config` and the event that you expect, and set `event_observed: false`. |
| `fix` | A concrete change at a named location. Do not accept vague fixes such as "improve masking". |

## Rejected findings

Do not include a finding that:

- has no `path`, or has a path whose steps have no `file:line`
- says that a class "may" leak, and does not name the code that emits it
- repeats another finding with different words. Merge the two findings and list each sink.
- depends on the page author to put secrets in a place that the SDK documents as recorded in the clear, unless the docs say otherwise. An example of such a place is a custom event that the app emits itself.
