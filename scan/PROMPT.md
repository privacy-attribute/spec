# Implementation prompt

Copy the prompt below into a coding agent that runs in your application's repository, for example Claude Code, Codex or Cursor. Replace `<front-end source folder>` and `<recorder>`. Use `rrweb` as the recorder when you record with rrweb or rrweb Cloud. Remove `--sdk <recorder>` when `scan/recorders/` has no file for your recorder.

With `--sdk rrweb`, the patch uses rrweb's own classes (`rr-block`, `rr-mask`, `rr-ignore`). rrweb reads them with no configuration. To use the `data-privacy` attribute, add `--annotate data-privacy`.

The agent needs Node.js 18 or later and read access to `github.com/privacy-attribute/spec`.

The scanner sends no data. The agent reads your code and sends it to its own model provider. A scan report leaves your computer only when you send it, and it contains counts and made-up examples only.

```text
Find the data in this application that a session recorder must mask or block.

1. Run this command in the repository root:
   npx -y -p github:privacy-attribute/spec#v0.2.0 privacy-scan find <front-end source folder> --sdk <recorder>
2. The command shows the path of a PLAYBOOK.md file. Read that file.
3. Do the procedure in the playbook. Do not change files in this repository.
4. When the patch command shows no open candidates, show me:
   - the path of privacy.patch,
   - the summary from the playbook,
   - the issue links for the gaps.
5. Do not apply the patch. I will examine it first.
```

## Without npx

Clone the release and run the scanner from the clone:

```bash
git clone --branch v0.2.0 https://github.com/privacy-attribute/spec privacy-attribute-spec
node privacy-attribute-spec/scan/cli.mjs find <front-end source folder> --sdk <recorder>
```

Then give the agent steps 2 to 5 of the prompt.

## Start the agent from the scanner

When Claude Code or Codex is installed, the scanner can start the agent for you:

```bash
npx -y -p github:privacy-attribute/spec#v0.2.0 privacy-scan agent <front-end source folder> --sdk <recorder>
```

Add `--headless` to run the agent without questions, for example in CI.
