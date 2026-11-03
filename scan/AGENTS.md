# Front-end privacy scan

Use these instructions to scan the front-end code of a web application. The scan finds the elements that a session recorder must mask or block. The scan then proposes `data-privacy` annotations for these elements.

The goal is a recording with the highest fidelity that keeps the people on the page private. Each annotation removes some fidelity. Thus, add the smallest annotation that protects the data. Do not annotate public content.

## Responsibility

These instructions and every scan produced with them are provided as is, without warranty. A scan can miss data that needs protecting and can propose annotations that are wrong. Its output is not legal advice and not a certification of compliance with any privacy law. The implementer (whoever integrates, configures or ships the recorder) is responsible for the final output: what their recordings contain, how the recorder is configured, and whether that meets their legal and contractual obligations. You must report gaps in these instructions as described in "Report gaps" below.

## Inputs

The session folder contains these files:

- `scan-plan.md`: the lines that the static pass found, grouped by file. The most private files are first. Each line has a candidate id, the component, the rules that matched and a category. A category with `?` is a guess. "covered" shows that an annotation is already near the line.
- `annotations.json`: the file that you fill in.
- `PLAYBOOK.md`: the commands for this session.

When the recorder is known, also read `recorders/<sdk>.md` in the scan folder. It tells you how the recorder reads annotations, and the configuration to add.

## Data categories

Each value on a page has one of these four categories.

| Category | What it is | Examples |
|----------|------------|----------|
| `secret` | Data that gives access or moves money when another person knows it | Password, PIN, one-time code, card number, CVV, API key, token, recovery phrase |
| `personal` | Data about the person who uses the page | Their name, email, address, date of birth, balance, order history, form answers |
| `third-party` | Data about other people that the page shows to the user | Customer records, user tables, chat messages from others, comments, replays of other sessions |
| `public` | Content that is the same for all visitors | Navigation, labels, headings, help text, product names and prices |

Use these rules to find the category:

1. The data sets the category. The element type does not.
2. When an element holds data of two categories, use the more private category.
3. Free text that a person types is `personal` or more private.
4. Special categories are `personal` or `third-party` data about health, sex life, sexual orientation, religion, political opinion, ethnic origin, biometrics, union membership or criminal records.
5. Data about the organization of the user is `personal`. Examples are the workspace name, the billing plan, usage, limits, API key names, and webhook and integration settings.
6. A URL that gives access is `secret`. Examples are webhook URLs, invite links, password reset links and signed file URLs.

## What to annotate

Each annotation is one of `mask`, `block`, `ignore` or `unmask`. A recorder treats each other value as `mask`.

| Category | Annotation | Where |
|----------|------------|-------|
| `secret` | `block` | On the field or widget. Also keep the secret out of attributes, URLs and page titles. |
| `personal`, shown as text | `mask` | On the element that shows it. When a container holds only personal values, mask the container. |
| `personal`, typed into a field | `mask` | On the field. Use `ignore` when the input events also tell too much, for example in a symptom checker. |
| `personal`, special category | `block` for choices, `mask` for text | A recording shows which option a person clicked. A mask does not hide this. |
| `third-party` | `mask` | On the row, list or panel. Use `block` on an embedded session replay or screen share. |
| `public` | none | Use `unmask` only on public content in a masked container, for example a column header in a masked table. |

Annotate the smallest element that holds all of the private data. Do not include public content in it.

Some recorders do not mask attributes. When private data is in an attribute, for example an image `src`, a link `href`, a `title` or an `aria-label`, use `block` on the element. Also use `block` on an avatar of another person.

## Annotation style

`PLAYBOOK.md` names the annotation style of the session. Write `value` in `annotations.json` as `mask`, `block`, `ignore` or `unmask` for each style. The `patch` command writes the style.

| Style | What the patch adds |
|-------|---------------------|
| `data-privacy` | The attribute `data-privacy="<value>"` |
| `rrweb` | The class `rr-mask`, `rr-block` or `rr-ignore`. The patch adds the class to a static `className` or `class`, or adds a new attribute. |

For the `rrweb` style, obey these rules:

1. rrweb has no class for `unmask`. Move the public content out of the masked element.
2. `rr-mask` does not mask input values. For a field, `recorders/rrweb.md` gives the configuration that masks it.
3. When `className` is an expression, the `patch` command cannot add the class. Give an `edit` for the annotation, for example `"edit": { "from": "className={cn('row', active)}", "to": "className={cn('row rr-mask', active)}" }`.

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
6. When a shared layout gets private data as a prop, for example a page title with a person's name, annotate the element in the layout that shows the prop. Do not annotate the full layout.
7. When you do not know if a component gives `className` to its element, open the component. Annotate the element in the component.
8. Read `recorders/<sdk>.md`. Add the configuration changes that apply to `config` in `annotations.json`. Name the pages that need them.
9. Run the `patch` command from `PLAYBOOK.md`. The command writes `privacy.patch` and `app-privacy.json`. It also shows the candidates that you did not annotate or dismiss.
10. Repeat step 2 to step 9 until the `patch` command shows no candidates.
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
  "dismissed": { "C13": "copies a public code sample from a blog post" },
  "config": ["rrweb on all pages: blockSelector '[data-privacy=\"block\"]'"],
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

- `file` and `line` point to the opening tag of the element.
- `match` is the text at the start of the tag, for example `<Input`, `<td` or `<CustomerCard`. The `patch` command puts the attribute after this text. When the tag uses more than one line, use the line with the tag name.
- `candidates` lists each candidate id that the annotation closes.
- `edit` is optional. Use it when the `patch` command cannot place the annotation. `from` is the exact text on the line. `to` is the new text.

## Report gaps

A gap is a problem in the scan itself. You must report each gap. Use one of these kinds:

| Kind | Use it when |
|------|-------------|
| `missed-data` | No rule found private data in a file that you read. |
| `false-positive` | A rule finds many lines that never hold private data. |
| `wrong-guidance` | These instructions gave an annotation that does not protect the data, or that removes public content. |
| `recorder-gap` | No annotation protects the data in this recorder. |
| `unclear-instruction` | You had to guess what an instruction means. |

CAUTION: A gap report becomes visible to other people. Write a new, short `example` with made-up names and values. Do not copy code, names, URLs or data from the application.

Add each gap to `gaps` in `annotations.json`. For `missed-data` and `false-positive`, also give a `proposed_rule`: a JavaScript regular expression that finds the line, its category and its pattern id. Make sure that `re` matches your `example`. The `report` command tests this.

The `report` command writes one report for the scan. The report also counts, for each rule, the lines that the rule found, annotated and dismissed. These counts contain no code. It also shows a link that opens a filled-in issue form. A person must examine and send the report.

CAUTION: A `recorder-gap` tells about a weakness in a recorder. Do not put it in a public issue. The `report` command writes each `recorder-gap` to a private file. Send that file to the security contact in `SECURITY.md`.

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
     3. Play each recording. Look for private data in text, fields, page titles and URLs.
     4. When private data shows, report it as a gap of kind `missed-data`.
