// The playbook handed to the user's agent by `privacy-audit agent`.
export function playbook({ auditDir, sessionDir, sdk, target, cli, headless }) {
  const rerun = `node ${cli} run --adapter ${target.adapter} --sdk ${sdk} --out ${sessionDir}`;
  return `# Privacy audit playbook

You are running the capture SDK privacy audit on this machine for the person who started you. The SDK under audit is in the current folder (${sdk}). The audit instructions are in ${auditDir}/AGENTS.md. Read that file and the files it links before you start, and follow them. Query ${auditDir}/patterns.yaml with grep instead of reading it end to end.

## What is already done

- **Step 0 (version):** the target block is in ${sessionDir}/context.json. Copy it into your findings file.
- **Step 6 (differential test) and the end-state part of step 6b (fidelity):** the runner recorded every pattern with two hidden values under every config. Read ${sessionDir}/summary.md first: one row per pattern, one column per config, and the channels that differ in each cell. Open ${sessionDir}/results.json only for the cells you trace (for example with \`jq '.differential[] | select(.pattern=="P-pin-pad" and .config=="targeted")' ${sessionDir}/results.json\`). Do not read raw event dumps.

Re-run the runner only after you add or change a fixture: \`${rerun} --pages <page>\` (add \`--fixtures <file>\` for a fixture outside the runner).

## What you do

1. Steps 1 to 5 of AGENTS.md, guided by the table: for each cell that differs, find the code that emits that channel and trace it back to the DOM read. That trace is the finding's path. Cells under \`targeted\` and \`strictest\` come first.
2. The parts of step 6b the runner does not cover (replay over time, hover, animation, layout) for pages where the table or the code suggests a problem.
3. Steps 7 and 8: a results.json cell is a valid reproduction; cite the pattern, config and sample lines. Write ${sessionDir}/privacy-audit.json in the format of ${auditDir}/output-format.md.
4. Step 9 (gaps, mandatory): for a leak the patterns did not lead you to, write a fixture in ${sessionDir}/fixtures/ (format in ${auditDir}/runner/README.md) and run \`node ${cli} report <fixture> --adapter ${target.adapter} --sdk ${sdk} --out ${sessionDir}\`. It writes the issue body and prints a pre-filled issue link.

## Rules

- Do not modify, commit or switch branches in ${sdk}. Write only inside ${sessionDir}.
- Use made-up values in every fixture and report. Never copy data from a real session, page, customer or user.
${headless
    ? '- You are running without a person at the terminal. Do not ask questions and do not file issues: leave every report in the session folder and list the files and links in your summary for the implementer to file.'
    : '- Tell the person what you are doing at each step. Ask before you file an issue, post a comment, install anything, or run anything outside the session folder. Show the pre-filled links and let the person submit them.'}
- Start your summary with the disclaimer from the Responsibility section of AGENTS.md, word for word.
`;
}
