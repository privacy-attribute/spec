# Front-end privacy scan

You are scanning a web application's front-end code to decide what a session recorder must mask or block on its pages, and to propose the annotations that do it. The goal is the one from the audit: the highest-fidelity recording that keeps the people on the page private. Every annotation you add costs fidelity, so add the smallest one that protects the data, and add none to public content.

## Responsibility

These instructions and every scan produced with them are provided as is, without warranty. A scan can miss data that needs protecting and can propose annotations that are wrong. Its output is not legal advice and not a certification of compliance with any privacy law. The implementer (whoever integrates, configures or ships the recorder) is responsible for the final output: what their recordings contain, how the recorder is configured, and whether that meets their legal and contractual obligations. Report gaps in these instructions to [`privacy-attribute/spec`](https://github.com/privacy-attribute/spec/issues) as described in `../audit/feedback.md`.

## Inputs

- `scan-plan.md`: every line the static pass flagged, grouped by file, most private first. Each line has a candidate id, the enclosing component, the rules that matched, a guessed category (a trailing `?` means unsure) and whether an annotation is already nearby.
- `../audit/AGENTS.md`, section Data categories: what counts as `secret`, `personal`, `third-party` and `public`.
- `caveats/<sdk>.md`, when the recorder is known: what an annotation cannot fix in that recorder, and the config that closes the gap.

## What to annotate

Use the `data-privacy` attribute from this standard. Annotate the smallest element that holds all of the private data and nothing else that is public.

| Category | Annotation | Notes |
|----------|------------|-------|
| `secret` | `block` on the widget or field | Secrets need zero information in the recording: length, timing, clicks and pointer paths count. Block the field or widget, and keep the secret out of attributes, URLs and titles. |
| `personal` shown as text | `mask` | On the element that renders it. If a container holds several personal values and no public content, mask the container. |
| `personal` typed into a field | `mask` | `ignore` when the input events themselves are sensitive (a symptom checker). |
| `personal`, special category | `block` for choices (health, religion, orientation answers), `mask` for text | Choices leak through which option was clicked; masking text does not hide that. |
| `third-party` | `mask` on the row, list or panel | Other people's data in tables, lists, threads and replays. For an embedded session replay or screen share, `block` the player. |
| `public` | nothing | Use `unmask` only for public content inside a masked container, such as a column header in a masked table. |

Every annotation is one of `mask`, `block`, `ignore` or `unmask`. A recorder treats any other value as `mask`.

## Method

1. Read `scan-plan.md`. Work file by file: open each file once, around its candidate lines, and decide every candidate in that file before moving on. Do not read files without candidates unless a candidate points to a component defined elsewhere (for example a `<CustomerCard>` used in a flagged list).
2. For each candidate, decide what data the element holds at run time and its category. Follow props one level up when the value comes from a parent. Dismiss candidates that hold no private data on the page (a fetch header, a type definition, a public code sample) with a one-line reason.
3. While a file is open, add annotations for private data the rules missed. Report the missing rule as a gap.
4. Prefer annotating the shared component (`<Avatar>`, `<UserName>`, `<RecordingRow>`) over each use, when the component only ever shows private data.
5. Add each annotation to `annotations.json` (format below). Then run `node <scan>/cli.mjs patch --out <session>`. It writes `privacy.patch`, builds `app-privacy.json`, and lists candidates you have neither annotated nor dismissed. Repeat until it lists none.
6. Read `caveats/<sdk>.md` and add the config changes that apply to `config` in `annotations.json`, naming the pages they are for.

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
  "config": ["rrweb: blockSelector '[data-privacy=\"block\"]' ..."],
  "gaps": ["No rule flags <KeyField>, which renders API keys"]
}
```

- `file` and `line` point at the element's opening tag. `match` is the text that starts the tag (`<Input`, `<td`, `<CustomerCard`); the patch inserts the attribute right after it. If the tag spans lines, point at the line with the tag name.
- `candidates` lists every candidate id this annotation settles.

## Rules

- Do not modify the application. Write only in the session folder. The patch is for the implementer to review and apply.
- Use made-up values in anything you write. Never copy real customer or user data from fixtures, seeds or comments.
- End with a short summary that starts with the Responsibility text above, word for word, then gives the number of annotations by value and category, the config changes, and the gaps.
