// The playbook handed to the user's agent by `privacy-scan agent`.
export function playbook({ scanDir, sessionDir, src, sdk, cli, headless }) {
  return `# Privacy scan playbook

You are reviewing the front-end code in the current folder (${src}) to decide what a session recorder must mask or block, for the person who started you. A static pass has already flagged every candidate line. Your job is the judgement: what each candidate holds, its category, and the smallest annotation that protects it. Work fast and keep your output short.

## Read first

1. ${scanDir}/AGENTS.md: what to annotate, the method, and the annotations.json format.
2. The Data categories section of ${scanDir}/../audit/AGENTS.md.
${sdk ? `3. ${scanDir}/caveats/${sdk}.md: what annotations cannot fix in ${sdk}, and the config that closes the gap.\n` : ''}
Then work through ${sessionDir}/scan-plan.md file by file. Do not read candidates.json end to end.

## Output

Fill ${sessionDir}/annotations.json, then run \`node ${cli} patch --out ${sessionDir}\`. Repeat until it reports no unreviewed candidates and nothing failed to apply. Trace everything yourself in this one session: subagents re-read the context and multiply the cost.

## Rules

- Do not modify anything in ${src}. Write only in ${sessionDir}. privacy.patch is for the implementer to review and apply.
- Never copy real customer or user data into your output.
${headless
    ? '- No person is at the terminal. Do not ask questions and do not file issues.'
    : '- Tell the person what you are doing. Ask before you file an issue or run anything outside the session folder.'}
- End with the summary described in AGENTS.md, starting with its Responsibility text word for word.
`;
}
