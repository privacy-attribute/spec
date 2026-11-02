# Implementation prompt

Copy the prompt below into a coding agent that runs in your application's repository, for example Claude Code, Codex or Cursor. Replace `<front-end source folder>` and `<recorder>`. Use `rrweb` as the recorder when you record with rrweb or rrweb Cloud. Remove `--sdk <recorder>` when no caveats file exists for your recorder.

The agent needs Node.js 18 or later and read access to `github.com/privacy-attribute/spec`.

```text
Find the data in this application that a session recorder must mask or block.

1. Run this command in the repository root:
   npx -y -p github:privacy-attribute/spec privacy-scan find <front-end source folder> --sdk <recorder>
2. The command shows the path of a PLAYBOOK.md file. Read that file.
3. Do the procedure in the playbook. Do not change files in this repository.
4. When the patch command shows no open candidates, show me:
   - the path of privacy.patch,
   - the summary from the playbook,
   - the issue links for the gaps.
5. Do not apply the patch. I will examine it first.
```

## Without npx

Clone the repository and run the scanner from the clone:

```bash
git clone https://github.com/privacy-attribute/spec privacy-attribute-spec
node privacy-attribute-spec/scan/cli.mjs find <front-end source folder> --sdk <recorder>
```

Then give the agent steps 2 to 5 of the prompt.

## Start the agent from the scanner

When Claude Code or Codex is installed, the scanner can start the agent for you:

```bash
npx -y -p github:privacy-attribute/spec privacy-scan agent <front-end source folder> --sdk <recorder>
```

Add `--headless` to run the agent without questions, for example in CI.
