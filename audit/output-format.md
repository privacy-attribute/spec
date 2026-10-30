# Output format

Write one JSON file, `privacy-audit.json`, in your scratch directory, and print its path when you finish. Then write a short summary in prose: counts by severity and verdict, and the findings that leak under `strictest`.

## Top level

```json
{
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

`configs` lists every config you evaluated, with the exact options object. Finding fields refer to these ids.

## Finding

```json
{
  "id": "F1",
  "fingerprint": "attribute:processAttributeMutation:title",
  "leak_class": "attribute",
  "pattern": null,
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
  "fix": "In src/record/mutations.ts:205, run maskAttribute for every attribute on the privacy-relevant list in taxonomy.md class 7 when the element is masked."
}
```

## Field rules

| Field | Rule |
|-------|------|
| `audit_version`, `target` | Required. Filled in step 0 of the method. `commit` is the full SHA. |
| `previous_audit` | Present only when you compared with an earlier audit. Its target commit and audit version. |
| `fingerprint` | `<leak_class>:<sink function>:<source property or attribute>`. Use function and property names, never line numbers, so the same leak gets the same fingerprint in every version. Two findings in one report never share a fingerprint. |
| `affected_since`, `affected_since_exact` | Oldest release tag that has the leak, found as described in `AGENTS.md` under "Affected releases". |
| `status`, `status_note` | `new`, `unchanged` or `changed` against `previous_audit`. Use `new` for every finding when there is no previous audit. `status_note` is required for `changed`. |
| `resolved` | Earlier fingerprints that no longer leak, each with `removed_in` and `now_stopped_at`. Empty when there is no previous audit. |
| `pattern` | The `patterns.md` id whose test page found this, or `null` if the code track found it. |
| `recoverable` | `true` if the attacker can reconstruct the full value from one recording, in at least one of your runs. Give the success rate across runs in `reproduction` when it is below all of them. Show the reconstruction in `reproduction`. `false` for partial leaks (length, range, which of a few options). |
| `leak_class` | One id from `taxonomy.md`. Make one finding per leak class. When one event shows two classes (an echo element whose text length also leaks), report it under each class and cite the same evidence; merge only findings of the same class. |
| `sink` | The `file:line` where the data is placed into an emitted structure. When one leaking behaviour reaches several sinks (for example a URL in the meta event and in iframe attributes), keep one finding, put the main sink here and the others in `additional_sinks`. |
| `path` | Ordered steps from the source (DOM read, attribute read, event) to the sink. Each step has a `file:line` and says what happens to the value there. At least two steps. |
| `masking_checked` | The masking or blocking function on this path and why it does not stop the leak. Write `none` if no check runs. |
| `leaks_under` / `safe_under` / `not_evaluated` | Config ids from `configs`. Together the three lists cover every config in `configs`. Use `not_evaluated` for configs that did not apply to this finding's pages. |
| `audit_source` | The link or path you read the instructions from. |
| `feedback_applied` | One row per accepted feedback issue you tested, with its `FB-` pattern id and the finding ids or `no finding`. Empty if there was none or the fetch failed (say which in `method_note`). |
| `feedback_sent` | One row per report from step 9. `filed` is `true` with the issue or comment `url`, or `false` with the local `path` and the `reason` (failed, no permission, user declined, dry run). |
| `method_note`, `pattern_coverage` | Required. `pattern_coverage` has one row per `patterns.md` id with the configs run and the finding ids or `no finding`. |
| `coverage[].table` | Optional. Put per-type or per-config result tables (such as the `P-input-types` matrix) on the coverage row of their leak class. |
| `severity` | `critical`, `high`, `medium` or `low`, per the table in `AGENTS.md`. |
| `verdict` | `CONFIRMED` when `reproduction.event` was copied from output you ran. `PLAUSIBLE` otherwise. |
| `reproduction` | Required for `CONFIRMED`. For `PLAUSIBLE`, give `page`, `actions`, `config` and the event you expect, and set `event_observed: false`. |
| `fix` | A concrete change at a named location. Reject vague fixes such as "improve masking". |

## Rejected findings

Do not include a finding that:

- has no `path`, or a path whose steps lack `file:line`
- says a class "may" leak without naming the code that emits it
- repeats another finding with different wording; merge them and list every sink
- depends on the page author putting secrets in a place the SDK documents as recorded in the clear (for example a custom event the app emits itself), unless the docs say otherwise
