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

When the recorder is known, also read `caveats/<sdk>.md` in the scan folder. It tells you what an annotation cannot fix in that recorder. It also gives the recorder configuration that closes each gap.

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
5. Read `caveats/<sdk>.md`. Add the configuration changes that apply to `config` in `annotations.json`. Name the pages that need them.
6. Run the `patch` command from `PLAYBOOK.md`. The command writes `privacy.patch` and `app-privacy.json`. It also shows the candidates that you did not annotate or dismiss.
7. Repeat step 2 to step 6 until the `patch` command shows no candidates.
8. Run the `report` command from `PLAYBOOK.md` when `gaps` is not empty.

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
      "expected": "A secret candidate on the KeyField line"
    }
  ]
}
```

- `file` and `line` point to the opening tag of the element.
- `match` is the text at the start of the tag, for example `<Input`, `<td` or `<CustomerCard`. The `patch` command puts the attribute after this text. When the tag uses more than one line, use the line with the tag name.
- `candidates` lists each candidate id that the annotation closes.

## Report gaps

A gap is a problem in the scan itself. You must report each gap. Use one of these kinds:

| Kind | Use it when |
|------|-------------|
| `missed-data` | No rule found private data in a file that you read. |
| `false-positive` | A rule finds many lines that never hold private data. |
| `wrong-guidance` | These instructions gave an annotation that does not protect the data, or that removes public content. |
| `recorder-gap` | No annotation protects the data in this recorder, and `caveats/<sdk>.md` does not tell you this. |
| `unclear-instruction` | You had to guess what an instruction means. |

CAUTION: A gap report becomes visible to other people. Write a new, short `example` with made-up names and values. Do not copy code, names, URLs or data from the application.

Add each gap to `gaps` in `annotations.json`. The `report` command writes one issue text for each gap. It also shows a link that opens a filled-in issue form. A person must examine and send each issue.

## Rules

- Do not change the application. Write only in the session folder. The implementer examines and applies `privacy.patch`.
- Do not copy real data about customers or users into the session folder. This includes data from fixtures, seed files and comments.
- At the end, write a short summary. Start it with the text of "Responsibility" above, word for word. Then give:
  1. The number of annotations for each value and category.
  2. The configuration changes.
  3. The gaps and the paths of their issue texts.
