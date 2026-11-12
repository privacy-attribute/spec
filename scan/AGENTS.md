# Front-end privacy scan

For the skill-led `inventory`, `review-context`, `review-patch` and `review-proposals` workflow, follow [skill/SKILL.md](skill/SKILL.md) and its decision format. Semantic decisions come from source and product context. Keep unresolved meanings separate from unresolved placement. The instructions below describe the earlier `find`, `place` and `patch` workflow and its file formats.

Use these instructions to scan the front-end code of a web application. The scan finds the elements that a session recorder must mask or block. The scan proposes annotations in the style named in `PLAYBOOK.md`.

Use the smallest annotation that protects each private value. Keep public content outside the protected element.

## Responsibility

These instructions and scan results are provided as is, without warranty. A scan can miss private data and propose incorrect annotations. Review the patch, test emitted events and verify that the recorder meets your legal and contractual obligations. The implementer is responsible for the recorder configuration and the content of its recordings. Save feedback drafts locally. The person running the scan can choose to share them.

## Inputs

| File | Contents |
|------|----------|
| `scan-plan.md` | Units grouped by file, with the most private files first. A component unit gives the lines that show data and the source of the data. For Vue, Svelte and Blade, the unit is the full file. A line unit gives a source line and the rules it matches. A `?` marks a proposed category. |
| `annotations.json` | Proposed annotations and your review decisions. |
| `PLAYBOOK.md` | Commands and recorder settings for the session. |

Review source questions first. Open the source definition and identify the data it returns. In `answers`, use the question key from the plan, with its module path and source name. Give the `category` and the `evidence` for it. Keep uncertain values in a private category. Then run `place` to update the plan.

The `review` lines in a component unit need a decision. The scanner marks automatic annotations with `"auto": true`. If an automatic annotation is wrong, remove it and record the reason in `dismissed`. Use the unit and the line, for example `"C12:L40": "shows a public product name"`.

Leave `settled` and `cached` to the scanner. Put your review decisions in `annotations` or `dismissed`. For a source URL, address capture at the source or in the recorder configuration, or record an explicit reviewed dismissal. Start a new session when the source changes. Run `place` again after changing an answer.

When the recorder is known, read its guide in [recorders](recorders/).

## Data categories

Each value on a page has one of these four categories.

| Category | What it is | Examples |
|----------|------------|----------|
| `secret` | Data that gives access or moves money when another person knows it | Password, PIN, one-time code, card number, CVV, API key, token, recovery phrase |
| `personal` | Data about the person who uses the page | Their name, email, address, date of birth, balance, order history, form answers |
| `third-party` | Data about other people that the page shows to the user | Customer records, user tables, chat messages from others, comments, replays of other sessions |
| `public` | Content that is the same for all visitors | Navigation, labels, headings, help text, product names and prices |

Use these rules to find the category:

1. Set the category from the value that the element shows or collects.
2. When an element holds data of two categories, use the more private category.
3. Free text that a person types is `personal` or more private.
4. Special categories are `personal` or `third-party` data about health, sex life, sexual orientation, religion, political opinion, ethnic origin, biometrics, union membership or criminal records.
5. Data about the organization of the user is `personal`. Examples are the workspace name, the billing plan, usage, limits, API key names, and webhook and integration settings.
6. A URL that gives access is `secret`. Examples are webhook URLs, invite links, password reset links and signed file URLs.

## What to annotate

The [draft core](../spec/core.md) defines `mask` and `block`. Choose the treatment for the channel that carries the private value.

| Category and channel | Treatment | Where to apply it |
|----------------------|-----------|-------------------|
| `secret` | `block` | On the field or widget. Review other copies in attributes, URLs and page titles. |
| `personal` text | `mask` | On the element that shows the text. Mask the container when all its content is private. |
| `personal` input value | `mask` | On the field. Use a separate recorder control if input events also reveal private information. |
| `personal` or `third-party` special category | `block` for choices, `mask` for text | On the choice control or text element. Check interaction events for information such as which option the person clicked. |
| `third-party` records | `mask` | On the row, list or panel. Use `block` on an embedded session replay or screen share. |
| `public` | Leave clear | Put public content outside a masked container. |

1. Use `mask` when it covers the channel that carries the value. It preserves the element structure. A recorder can replace a blocked element with a layout placeholder.
2. Use `block` for secrets, private choices and private values in channels that the recorder's mask leaves visible. For example, use `block` for a private image `src` or link `href`. Check which text and attributes the deployed recorder masks.
3. Block the smallest element that carries the value. For a chip with an avatar and a name, block the image and mask the name.
4. For a component that shows both private and public values at different call sites, annotate the private uses. For example, write `title={<span className="rr-mask">{member.name}</span>}` in the parent. If the prop accepts only text, find the element that renders it and check that the annotation reaches that element.
5. The `patch` command shows "Over-masking" when an annotation in a shared component also covers public uses. Move the annotation to the uses that get private data. When the public uses are few or not important, keep the annotation and give the reason in `accept_shared`.
6. Each line of a component unit that shows data must be in an annotated element. An annotation in a shared component, for example an avatar, does not cover the other lines of the unit. The `patch` command shows "Uncovered" for each line that no annotated element contains. It also shows these lines for a unit that you dismissed, because a reason for a full unit can be wrong for one line. Annotate these lines. When a line shows no private data, add a key with the unit and the line to `dismissed`, for example `"C12:L40": "shows the role label"`.

## Annotation style

`PLAYBOOK.md` names the annotation style. Set `value` in `annotations.json` to one of the values for that style.

| Style | Values | What the patch adds |
|-------|--------|---------------------|
| `data-privacy` | `mask`, `block` | The `data-privacy` attribute. |
| `rrweb` | `mask`, `block`, `ignore` | `rr-mask`, `rr-block` or `rr-ignore` in a static `className` or `class` attribute. |

Use `rr-ignore` to request input event suppression. Use `mask` or `block` to protect a private value that the recorder captures. For rrweb classes, record the required field value configuration in `config` and test it separately. See [rrweb configuration](recorders/rrweb.md) for field values and for native attribute support.

For an expression in `className`, supply an exact `edit`. For example, use `"edit": { "from": "className={cn('row', active)}", "to": "className={cn('row rr-mask', active)}" }`.

## Procedure

1. Read `scan-plan.md`.
2. Do the steps that follow for one file at a time:
   1. Open the file at the lines of its candidates.
   2. For each candidate, find the data that the element shows or collects when the page runs.
   3. When the value comes from a parent component, follow the props one level up.
   4. Give the data a category.
   5. When the element holds private data, add an annotation to `annotations.json`.
   6. When the element holds no private data, dismiss the candidate. Give a reason in one line, for example "a fetch header that the page does not show".
   7. Look at the open file for private data that no rule found. Annotate this data. Then add a gap of kind `missed-data`.
3. Do not open files that have no candidates. Exception: a candidate uses a component from a different file, for example `<CustomerCard>` in a list.
4. When a shared component (`<Avatar>`, `<UserName>`) shows only private data, annotate the component one time. Do not annotate each use.
5. When a candidate uses a component for a record or a person, open that component. Examples are `<RecordChip>`, `<MemberAvatar>`, `<RecordPicker>` and `<PhonesDisplay>`. These components show private data on many pages. Annotate them one time.
6. When a shared layout gets private data as a prop, for example a page title with a person's name, annotate the value where the parent passes it. See rule 4 in "What to annotate".
7. When you do not know if a component gives `className` to its element, open the component. Annotate the element in the component.
8. Read `recorders/<sdk>.md`. Add the configuration changes that apply to `config` in `annotations.json`. Name the pages that need them.
9. Run the `patch` command from `PLAYBOOK.md`. Review `app-privacy.json` for open candidates, failed edits, over-masking and uncovered sites.
10. Resolve each reported issue and run `patch` again. Use `privacy.patch` after the command succeeds.
11. Run the `report` command from `PLAYBOOK.md` when `gaps` is not empty.

## annotations.json

```json
{
  "annotations": [
    {
      "file": "routes/api-keys.tsx",
      "line": 195,
      "match": "<Input",
      "value": "block",
      "category": "secret",
      "special_category": false,
      "data": "Private API key, shown when the reveal toggle is on",
      "candidates": ["C7", "C9"]
    }
  ],
  "dismissed": { "C13": "copies a public code sample from a blog post", "C12:L40": "shows the role label" },
  "answers": {
    "routes/api-keys.tsx::useLimits()": {
      "category": "personal",
      "evidence": "hooks/useLimits.ts returns the workspace quota"
    }
  },
  "config": ["rrweb on account pages: maskAllInputs: true"],
  "gaps": [
    {
      "kind": "missed-data",
      "title": "No rule finds API keys shown through a custom field component",
      "example": "<KeyField value={account.apiKey} />",
      "expected": "A secret candidate on the KeyField line",
      "proposed_rule": { "re": "<KeyField\\b[^>]*value=\\{", "category": "secret", "pattern": "P-reveal-secret" }
    }
  ]
}
```

- `file` and `line` point to the opening tag of the element. If two matching tags start on the same line, set `column` to the zero-based column of the opening `<`.
- `match` is the text at the start of the tag, for example `<Input`, `<td` or `<CustomerCard`. The `patch` command puts the attribute after this text. When the tag uses more than one line, use the line with the tag name.
- `candidates` lists each candidate id that the annotation closes.
- Use an `edit` when the patch command needs an exact edit. `from` is the exact text on the edit line. `to` is the new text. For a multiline opening tag, `line` can point to the edit line. `column` still identifies the opening `<`.
- `accept_shared` is optional. Use it to keep an annotation in a shared component that also has public uses. Give the reason, for example "1 of 10 uses is public: a sample value in the help page".

## Report gaps

Record each gap in the local draft. Use one of these kinds:

| Kind | Use it when |
|------|-------------|
| `missed-data` | No rule found private data in a file that you read. |
| `false-positive` | A rule finds many lines that never hold private data. |
| `wrong-guidance` | These instructions gave an annotation that does not protect the data, or that removes public content. |
| `recorder-gap` | No annotation protects the data in this recorder. |
| `unclear-instruction` | You had to guess what an instruction means. |

CAUTION: A shared gap report becomes visible to other people. Write a new, short `example` with made-up names and values. Do not copy code, names, URLs or data from the application.

Add each gap to `gaps` in `annotations.json`. For `missed-data` and `false-positive`, also give a `proposed_rule`: a JavaScript regular expression that finds the line, its category and its pattern id. Make sure that `re` matches your `example`. The `report` command checks the example and reports matches across labelled synthetic private and public snippets. Review the results before proposing a change to the rules.

The `report` command writes one report for the scan. The report also counts, for each rule, the lines that the rule found, annotated and dismissed. These counts contain no code. It also prints the address of the blank feedback form. The person running the scan can review the draft and copy it into the form.

CAUTION: A `recorder-gap` tells about a weakness in a recorder. Do not put it in a public issue. The `report` command writes each `recorder-gap` to a private file. Use the private route in `SECURITY.md` if the person running the scan chooses to share it.

## Rules

- Do not change the application. Write only in the session folder. The implementer examines and applies `privacy.patch`.
- Do not copy real data about customers or users into the session folder. This includes data from fixtures, seed files and comments.
- At the end, write a short summary. Start it with the text of "Responsibility" above, word for word. Then give:
  1. The number of annotations for each value and category.
  2. The configuration changes.
  3. The gaps, and the paths of the report files.
  4. These steps for the person, to check the result:
     1. Apply `privacy.patch` and add the configuration changes.
     2. Record one session on each page that the patch changes. Use test data.
     3. Inspect the emitted events and play each recording. Check text, fields, page titles and URLs for test values that should be private. Confirm that public content survives.
     4. When private data appears, determine whether the scanner missed a value or the recorder failed to protect it. Save a local feedback draft.
