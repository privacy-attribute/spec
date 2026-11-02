// PLAYBOOK.md for a scan session: the steps and the exact commands for this session.
// `find` writes it, so an agent can follow it after it runs the scan itself.
export function playbook({ scanDir, sessionDir, src, sdk, cli, headless }) {
  const run = `node ${cli}`;
  return `# Privacy scan playbook

This session scans the front-end code in ${src}. The static pass is done. Your task is to examine each candidate, find its category, and add the smallest annotation that protects the data.

## Read

1. ${scanDir}/AGENTS.md. It gives the data categories, the annotations, the procedure and the format of annotations.json.
${sdk ? `2. ${scanDir}/caveats/${sdk}.md. It tells you what an annotation cannot fix in ${sdk}, and the configuration that closes each gap.\n` : ''}
Then do the procedure in AGENTS.md. Start with ${sessionDir}/scan-plan.md. Do not read candidates.json from start to end.

## Commands

- Make the patch and find open candidates: \`${run} patch --out ${sessionDir}\`
- Write the gap reports: \`${run} report --out ${sessionDir}\`

Run the patch command again until it shows no open candidates. Do all the work in this one session. Subagents read the same files again and increase the cost.

## Rules

- Do not change files in ${src}. Write only in ${sessionDir}. The implementer examines and applies privacy.patch.
- Do not copy real data about customers or users into the session folder.
${headless
    ? '- No person is at the terminal. Do not ask questions. Do not send issues. Leave the gap reports in the session folder.'
    : '- Tell the person what you do. Ask before you send an issue or run a command outside the session folder. Show the issue links. Let the person send them.'}
- At the end, write the summary that AGENTS.md describes. Start it with the "Responsibility" text, word for word.
`;
}
