# Scanner design

The scanner finds the data on a web page that a session recorder must mask or block, and proposes the annotations. It is built for three properties, in this order:

1. **Accurate.** It finds every secret and nearly every other private value, and it annotates the smallest element that holds each one.
2. **Cheap.** Code makes the decisions. A model answers only the questions that code cannot settle, and each answer is cached.
3. **Fast.** A first scan of a large app takes minutes. A repeat scan reads only the files that changed.

## Why the design changed

In a Documenso validation run, the review agent decided about 710 units in about 516k tokens and 30 minutes. 59 of 77 labelled private values ended up annotated. Most misses were units the agent dismissed with a reason that was wrong for some of their lines, and units that pass data only to child components. Both are decisions that code can make: where a value comes from, and where it is shown.

## Pipeline

| Stage | What it does | Model |
|---|---|---|
| 1. Index | Lists the front-end files and skips files whose hash is in the decisions cache. | No |
| 2. Render graph | Parses JSX, TSX, Vue, Svelte and Blade into one graph: components, elements, props passed between components, and the places where values are shown. | No |
| 3. Classify sources | Gives every value an origin. The app's own schemas (Prisma, GraphQL, OpenAPI, Zod, TypeScript types) say which fields are secret, personal or about other people. Field names are the fallback. | No |
| 4. Propagate | Follows each value through the whole app to the elements that show it. A value whose origin is unknown counts as private. Each shown value gets a confidence: `high` when its origin is known, `low` when it is not. | No |
| 5. Decide and place | Turns each shown value into `mask` or `block` on the smallest element, and writes the edit from the syntax tree. A shared component with public uses is annotated where the parent passes the private value. | No |
| Residue | Sends each `low` confidence value to a model as one short question: the data path from origin to element, and a fixed set of answers. A small model answers first. A stronger model checks secrets and disagreements. Answers are cached by the hash of the path. | Yes |
| 6. Verify | Checks that every shown private value is inside an annotated element. Canary replay seeds marker values into test data, records the main flows, and searches the recordings for the markers. | No |
| Learn | Turns each verified miss into a rule and a benchmark case. | No |

## Rules that keep it accurate

- **Fail closed.** A value is public only when code can show it: a string literal, a translation call, an enum or status label, a constant, or a config value. Data from a query, hook, loader, store, route parameter or prop is private until shown otherwise.
- **Schema first.** A field that the schema declares on a record (for example `User.email`, `ApiToken.token`) has the category of that field wherever it is shown.
- **Every place a value can show up.** Text, input values, attributes (`href`, `title`, `alt`, `src`, `aria-*`, `data-*`), canvas and image data URLs, page titles, URLs and iframes.
- **A model can only confirm, never discover.** The model answers whether a `low` value is public, from a fixed set of reasons that code checks where it can. It does not search for data.

## Measurement

Accuracy is measured against labelled samples in `scan/benchmark/apps/<app>/`. Each sample names the app commit, the files, and the elements that two independent reviewers labelled. The targets:

| Measure | Target |
|---|---|
| Recall, secrets | 100% |
| Recall, all private values | 95% or more |
| Annotated public elements | Under 10% of annotations |
| Model tokens, first scan of a 2,000-file app | Under 50k |
| Static stages, 2,000-file app | Under 2 minutes |

## Build order

1. Labelled samples for each validation app, kept in the repository.
2. Stage 3 schema reader and stage 4 fail-closed propagation with confidence.
3. Stage 5 placement from the syntax tree.
4. The residue questions and their cache.
5. Canary replay.

The current review agent stays in use until stages 3 to 5 beat it on the labelled samples.
