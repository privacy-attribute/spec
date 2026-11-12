# Recording results

Evaluated 2026-11-12. These runs test whether patches produced by the [review skill](../scan/skill/SKILL.md) keep private values out of an actual recording. The recorder operator remains responsible for recording contents. These checks do not establish legal compliance.

## Method

1. A fixture mounts the real upstream components of an application at a pinned commit. Boundaries such as stores, API clients, routing and translations are replaced with declared stand-ins.
2. Every private value the components can show is seeded with a unique synthetic marker. Public strings are seeded as controls.
3. A fresh reviewer runs the skill on the source without seeing the fixture, and produces a patch.
4. The unpatched and the patched fixture are recorded with a pinned rrweb build in a Chromium-based browser. The flow renders each page, updates the data to a second marker set, types into inputs and opens dialogs.
5. The recorded events are searched for each marker. The result is the share of markers present in the unpatched recording that are absent from the patched one, under the `balanced` preset.

## Results

| Application | Scope | Skill tuned on it | Private markers removed |
| --- | --- | --- | ---: |
| Chatwoot | 6 files: subscription card, conversation details, integrations, two-step verification, Telegram setup, chat cards | yes, three rounds | 47 of 47 |
| Twenty | 10 files: email and link fields, API key pages | yes, two rounds | 19 of 19 |
| Documenso | 6 routes: profile and security settings | no, first pass | 51 of 51 |

By round:

| Round | Change to the skill | Result |
| --- | --- | --- |
| Chatwoot 0 | none | 25 of 30 with stand-in children |
| Chatwoot 1 | a private value always gets a protection; each prop is a destination | 27 of 30 with stand-in children |
| Chatwoot 2 | a child that loads its own records is unknown content | 30 of 30 with stand-ins, 42 of 47 with real children |
| Chatwoot 3 | full source available; check how a child mounts; mask server text in toasts | 47 of 47 with real children |
| Twenty 1 | none | 11 of 19 |
| Twenty 2 | a shared component carries the treatment to copies it makes | 19 of 19 |

## Leaks the recordings exposed

Each of these led to a rule in the skill:

- A side panel title passed as a prop while only the panel body was blocked.
- Integration settings rendered by child components that load their own records.
- A hidden sizing copy of an auto-growing text input.
- A side panel and dialogs that teleport to the document body, outside a call-site wrapper.
- Server error text shown in an application-wide toast.

Stand-in child components hid the fourth kind. A patch that removed every marker with stand-ins still leaked five once the real components were mounted.

## Limits

- One run per application per round, on three applications. The result supports "no known leak in these fixtures". The sample is too small to state a leak rate.
- Documenso is the only application the skill was not tuned on.
- Destinations the reviews named and the fixtures do not exercise: the Documenso application header and sidebar, signature strokes reproducible from pointer movement, clipboard copies, file downloads, and the parent of the Chatwoot subscription card.
- The fixtures load no stylesheets and drive input by script. Some third-party packages are stand-ins.
- Under legacy selector configuration, the Documenso recording still contains one value: the file name of an uploaded avatar.
- Protection became stricter each round. In Chatwoot round 3 about 12 public or configuration strings are lost, including every fixed toast message. In Twenty a public email shown through the shared email component is lost.
- The fixtures, recordings and marker tables are local evidence and are not published with the repository.
