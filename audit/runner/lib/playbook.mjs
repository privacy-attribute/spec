// The playbook handed to the user's agent by `privacy-audit agent`.
export function playbook({ auditDir, sessionDir, sdk, target, cli, headless }) {
  const run = `node ${cli}`;
  const common = `--adapter ${target.adapter} --sdk ${sdk} --out ${sessionDir}`;
  return `# Privacy audit playbook

You complete a privacy audit of the capture SDK in the current folder (${sdk}) for the person who started you. The runner already recorded each pattern and wrote a draft of each finding. Your task is the part that needs judgement. Trace each channel to the code, and tell how to fix it. Work quickly. Keep your output short.

## Read first

1. ${sessionDir}/trace-plan.md: one section for each channel, with its draft findings, the code starting points (file:line) and one evidence sample. This is your work list.
2. The Data categories, Severity and Responsibility sections of ${auditDir}/AGENTS.md. Do not read the other sections, unless the plan leaves you unsure.

Do not read draft-findings.json, results.json or patterns.yaml from start to end. When you need more evidence for one finding, query the file: \`jq '.differential[] | select(.pattern=="P-pin-pad" and .config=="targeted") | .channels' ${sessionDir}/results.json\`.

## Trace each channel once

For each channel in the plan, open the code starting points. Follow the value from the place where the code reads it from the page to the place where the code emits it. Then fill in the entry for that channel in ${sessionDir}/traces.json:

- \`path\`: two to five steps. Start each step with \`file:line\`, and tell what happens to the value there. End at the line that puts the value into an emitted event.
- \`masking_checked\`: the mask or block check on this path, and why it does not stop the leak (or "none").
- \`fix\`: a concrete change at a named location, with the smallest fidelity cost.
- \`fidelity_cost\`: the public content or behaviour that the fix removes.
- \`verdict\`: keep CONFIRMED. The runner reproduced the leak.

The entry applies to each finding under that channel. Use \`findings\` in traces.json only for exceptions, keyed by finding id. Use \`{"F12": {"drop": "runner noise: ..."}}\` when the evidence is not correct. Use field overrides, such as a different \`severity\` or \`recoverable\`, with a reason in \`title\`.

Also fill in the fidelity findings (the plan gives their ids) through \`findings\`. Trace all channels yourself in this one session. Subagents read the context again, which multiplies the cost and saves no time.

Then run \`${run} merge --out ${sessionDir}\`. This command writes privacy-audit.json and lists each finding that does not have a path or fix yet. Correct those findings. Run the command again until it lists no findings.

## Gaps (mandatory)

If you see a leak that no draft covers, do these steps:

1. Write a fixture in ${sessionDir}/fixtures/ (the format is in ${auditDir}/runner/README.md).
2. Run \`${run} report <fixture> ${common} --what "<what you found and expected>"\`.
3. In traces.json, add the finding to \`extra_findings\`. Include only submitted reports in \`feedback_sent\`.
4. Merge again.

Do this only for leaks that you find during the trace. Do not search for new leaks outside the plan.

## Rules

- Do not change files, commit or switch branches in ${sdk}. Write only inside ${sessionDir}.
- Use made-up values in each fixture and each report.
${headless
    ? '- No person is at the terminal. Do not ask questions. Do not file issues. Leave the reports in the session folder.'
    : '- Tell the person what you do. Ask before you file an issue, install anything, or run anything outside the session folder. Show the local drafts so the person can choose whether to share them.'}
- End with a short summary. Start it with the disclaimer from the Responsibility section of AGENTS.md, word for word. Then give counts by severity, the findings that leak under \`targeted\` or \`strictest\`, and the paths of the local feedback drafts.
`;
}
