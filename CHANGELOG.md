# Changelog

The prompts in `README.md` and `scan/PROMPT.md` run a tagged release. A change on `main` reaches users only after a new tag and an update of the tag in the prompts.

## Unreleased

- Component pass: `find` parses TypeScript and JSX with `@babel/parser` (the first dependency, pinned with `npm-shrinkwrap.json`) and follows data from hooks, context, fetches and record-typed props to the elements that render it, across components. The plan lists one unit per component. On the validation sample it finds 29 of 34 reviewer labels without a model (10 with line rules); on the benchmark recall is 92.5% with 55 units (97 before).
- Over-masking check: the component pass records how often each component is used and how many uses pass private data. `patch` reports an annotation inside a shared component when at least two uses, and at least a quarter of all uses, show public content; `accept_shared` keeps it with a reason. `scan/AGENTS.md` asks for `mask` before `block`, blocking only the smallest element (the avatar image, not the chip), and annotating private values where a parent passes them.
- The over-masking warning lists the file and line of each use that gets private data, so an agent can move the annotation without searching. The component pass no longer counts handlers or nested elements as data, treats flags such as `hasValidToken` as non-secret, and follows data from awaited `fetch…`/`load…`/`get…` calls into React state through its setter.
- Template pass: Vue and Svelte single-file components and Laravel Blade views get one unit per file, as JSX components do. It follows props (typed, declared as `Object` or `Array`, or named for records), store getters, awaited calls, refs filled by assignment, loop aliases and slot scopes, and passes data on to child components. Render line rules no longer run in the files it reads. Translation folders are skipped.
- The component pass also follows React Router `loaderData`, table cell renderers (`cell: ({ row }) => ...`), and record words inside compound type names such as `TDocumentRow`.
- Uncovered lines: `patch` reports each line of an annotated component unit that shows data outside every annotated element, and the same lines of each dismissed unit (ids and data attributes excepted). An agent annotates the line or accepts it with a `"C12:L40"` key in `dismissed`. In a Documenso validation, agents annotated a shared avatar and left plain names, titles and a signing link unmasked; this check finds those lines. In a second run, the agent dismissed an organisation switcher as "shown through AvatarWithText" while it showed organisation and team names in plain spans; checking dismissed units finds that kind of wrong reason.
- The component pass no longer counts a JSX condition, a mapped list of elements or a translation call as shown text. The over-masking check skips secrets, which are private at every use.
- Less to review: with `--sdk rrweb`, plain input units are settled automatically (rrweb masks input values with `maskAllInputs`); translation calls are removed before the line rules run; the console rule is opt-in; in TypeScript and JSX files the table, list, validation and secret-display line rules give way to the component pass, which now counts data passed under any prop. On the validation apps the units to review drop by 14% (Twenty) to 49% (Documenso).
- Template pass gets the same schema fields, fail-closed composables and confidence as the component pass, and follows getter arrows such as `(key) => props.metrics[key]`. State typed as a named type (`useState<TFormSchema>()`) is a low-confidence source. `templateSpans` gives element spans for Vue, Svelte and Blade, so the uncovered check in `patch` now works in those files. A second labelled sample, 40 Chatwoot Vue files, joins Documenso; `measure.mjs` reports how each label is found. Labels with a shown value on the element (or a text field that `maskAllInputs` masks): Documenso 57% to 95%, Chatwoot 60% to 82%, counting low-confidence sites.
- Schema and fail-closed sources: `find` reads the app's Prisma schema or Rails `db/schema.rb` and counts a field that the schema declares as free text, JSON or an account count as data wherever it is shown; ids, flags, dates and enums do not count. Hooks and awaited calls that no list names count as data with `low` confidence, and each site and unit now has a `confidence`. The pass also follows form fields (`render={({ field }) => ...}` and `{...field}`), route parameters (`useParams()`, the `params` prop of a route module) and skips items of constant lists. On a 40-file Documenso sample labelled by two reviewers, the share of labelled elements with a site on them rises from 46% to 92% (all 3 secrets). `scan/DESIGN.md` describes the new scanner design; `scan/benchmark/apps/` holds the labelled sample and `measure.mjs`.
- Schema and fail-closed sources: `find` reads the app's Prisma schema or Rails `db/schema.rb` and counts a field that the schema declares as free text, JSON or an account count as data wherever it is shown; ids, flags, dates and enums do not count. Hooks and awaited calls that no list names count as data with `low` confidence, and each site and unit now has a `confidence`. The pass also follows form fields (`render={({ field }) => ...}` and `{...field}`), route parameters (`useParams()`, the `params` prop of a route module) and skips items of constant lists. On a 40-file Documenso sample labelled by two reviewers, the share of labelled elements with a site on them rises from 46% to 92% (all 3 secrets). `scan/DESIGN.md` describes the new scanner design; `scan/benchmark/apps/` holds the labelled sample and `measure.mjs`.
- Decisions cache: `patch` writes `.privacy-scan/decisions.json` into the patch. When it is committed, the next scan skips files that did not change.

From the first validation run on an open-source CRM front end:

- New rules: record and person components (chips, pickers, field displays), URLs that give access (webhook, invite and reset links), message subjects and bodies, OTP components, secret form field names, and names inside translated text.
- Quieter rules: `toast` only flags messages built from data, `auth-user` is gone (user hooks feed the data-flow pass), `metadata-render` no longer flags schema metadata, `generic-cell` only flags cells read by a column key, and `secret-copy` only flags copies of secrets.
- `scan/AGENTS.md`: organization data is personal, access URLs are secret, block private data in attributes and avatars of other people, open record and person components, and annotate inside layouts.
- `find` skips generated code. `--include` limits a scan to path prefixes. A headless agent may run node only for the scanner's own CLI.
- The benchmark has a CRM page with these cases and a new baseline.

## 0.2.0

- The application scan is the primary use. The README and `scan/PROMPT.md` give a prompt for any coding agent.
- `--annotate rrweb` writes `rr-block`, `rr-mask` and `rr-ignore`, which rrweb reads with no configuration. It is the default with `--sdk rrweb`. `--annotate data-privacy` writes the standard attribute.
- `patch` adds rrweb classes to static `className` and `class` values, upgrades a weaker rrweb class, and asks for an exact edit for expressions and Vue or Angular class bindings.
- `report` writes one report per scan: rule outcomes as counts, and gaps with a proposed rule tested against a made-up example. Recorder weaknesses go to a private file (see `SECURITY.md`). `--post <url>` sends the report to a feedback endpoint.
- Rules can decide on their own (`auto`). The password field rule is the first.
- A source-first pass follows fetched data and person-typed values to the lines that render them.
- `bench` scores the rules on a labelled benchmark and fails below `scan/benchmark/baseline.json`. CI runs it and the unit tests on Node 18 to 24 and on Windows.

## 0.1.0

- First internal version of the scan and the SDK audit.
