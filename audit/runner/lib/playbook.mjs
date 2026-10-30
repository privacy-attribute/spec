// The playbook handed to the user's agent by `privacy-audit agent`.
export function playbook({ auditDir, sessionDir, sdk, target, cli, headless }) {
  const run = `node ${cli}`;
  const common = `--adapter ${target.adapter} --sdk ${sdk} --out ${sessionDir}`;
  return `# Privacy audit playbook

You are finishing a privacy audit of the capture SDK in the current folder (${sdk}) for the person who started you. The runner has already recorded every pattern and drafted every finding. Your job is the part that needs judgement: trace each channel to the code, and say how to fix it. Work fast and keep your output short.

## Read first

1. ${sessionDir}/trace-plan.md: one section per channel, with its draft findings, code starting points (file:line) and one evidence sample. This is your work list.
2. The Data categories, Severity and Responsibility sections of ${auditDir}/AGENTS.md. Skip the rest unless the plan leaves you unsure.

Do not read draft-findings.json, results.json or patterns.yaml end to end. When you need more evidence for one finding, query it: \`jq '.differential[] | select(.pattern=="P-pin-pad" and .config=="targeted") | .channels' ${sessionDir}/results.json\`.

## Trace each channel once

For each channel in the plan, open the code starting points and follow the value from where it is read from the page to where it is emitted. Then fill that channel's entry in ${sessionDir}/traces.json:

- \`path\`: two to five steps, each starting with \`file:line\` and saying what happens to the value there. End at the line that puts it into an emitted event.
- \`masking_checked\`: the mask or block check on this path, and why it does not stop the leak (or "none").
- \`fix\`: a concrete change at a named location, with the smallest fidelity cost.
- \`fidelity_cost\`: what public content or behaviour that fix removes.
- \`verdict\`: keep CONFIRMED; the runner reproduced it.

The entry applies to every finding under that channel. Use \`findings\` in traces.json only for exceptions, keyed by finding id: \`{"F12": {"drop": "runner noise: ..."}}\` when the evidence does not hold up, or field overrides such as a different \`severity\` or \`recoverable\` with a reason in \`title\`. Fill the fidelity findings (ids in the plan) through \`findings\` too. Trace everything yourself in this one session: subagents re-read the context and multiply the cost without saving time.

Then run \`${run} merge --out ${sessionDir}\`. It writes privacy-audit.json and lists any finding still missing a path or fix. Fix those and run it again until it reports none.

## Gaps (mandatory)

If you notice a leak that no draft covers, write a fixture in ${sessionDir}/fixtures/ (format in ${auditDir}/runner/README.md), run \`${run} report <fixture> ${common} --what "<what you found and expected>"\`, add the finding to \`extra_findings\` and the report to \`feedback_sent\` in traces.json, and merge again. Only do this for leaks you actually find while tracing; do not search for new ones beyond the plan.

## Rules

- Do not modify, commit or switch branches in ${sdk}. Write only inside ${sessionDir}.
- Use made-up values in every fixture and report.
${headless
    ? '- No person is at the terminal. Do not ask questions and do not file issues: leave reports in the session folder.'
    : '- Tell the person what you are doing. Ask before you file an issue, install anything, or run anything outside the session folder. Show pre-filled links and let the person submit them.'}
- End with a short summary that starts with the disclaimer from the Responsibility section of AGENTS.md, word for word, then gives counts by severity, the findings that leak under \`targeted\` or \`strictest\`, and the report files for the implementer to file.
`;
}
