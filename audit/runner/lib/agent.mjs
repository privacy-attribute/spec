// Hands the audit to the user's own coding agent: writes a session folder with the playbook and
// context, finds an installed agent CLI, and starts it. The pattern follows T3 Code's `triage`
// command (pingdotgg/t3code, apps/server/src/cli/triage.ts).
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { spawn, spawnSync } from 'node:child_process';

// `interactive` and `headless` build the arguments that carry the one-line launch prompt.
export const AGENTS = [
  { id: 'claude', command: 'claude', label: 'Claude Code', interactive: (p) => [p], headless: (p) => ['-p', p] },
  { id: 'codex', command: 'codex', label: 'Codex', interactive: (p) => [p], headless: (p) => ['exec', p] },
];

const onPath = (command) =>
  spawnSync(process.platform === 'win32' ? 'where' : 'which', [command], { stdio: 'ignore' }).status === 0;

async function ask(installed) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const menu = installed.map((a, i) => `  [${i + 1}] ${a.label}`).join('\n');
    for (;;) {
      const answer = (await rl.question(`Run the audit with:\n${menu}\n> `)).trim().toLowerCase();
      const pick = installed[Number.parseInt(answer, 10) - 1] || installed.find((a) => a.id === answer);
      if (pick) return pick;
    }
  } finally {
    rl.close();
  }
}

// Returns the agent to launch, or null when none is installed. `requested` is an id or any command.
export async function chooseAgent(requested) {
  if (requested) {
    const known = AGENTS.find((a) => a.id === requested);
    const agent = known || { id: requested, command: requested, label: requested, interactive: (p) => [p], headless: (p) => [p] };
    if (!onPath(agent.command)) throw new Error(`\`${agent.command}\` is not installed or not on PATH.`);
    return agent;
  }
  const installed = AGENTS.filter((a) => onPath(a.command));
  if (installed.length <= 1) return installed[0] || null;
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error(`Several agents are installed (${installed.map((a) => a.id).join(', ')}) and there is no terminal to ask. Pass --agent <id>.`);
  }
  return ask(installed);
}

export function writeSession({ dir, playbook, context }) {
  fs.mkdirSync(dir, { recursive: true });
  const promptFile = path.join(dir, 'PLAYBOOK.md');
  const contextFile = path.join(dir, 'context.json');
  fs.writeFileSync(promptFile, playbook);
  fs.writeFileSync(contextFile, JSON.stringify(context, null, 1));
  return { promptFile, contextFile };
}

// A single line, because Windows .cmd shims cannot carry multi-line arguments.
export const launchPrompt = (promptFile) =>
  `Read ${promptFile} and follow it. It sets up a privacy audit of the SDK in the current folder.`;

export function launch({ agent, promptFile, cwd, headless, model }) {
  const prompt = launchPrompt(promptFile);
  const args = [...(model ? ['--model', model] : []), ...(headless ? agent.headless(prompt) : agent.interactive(prompt))];
  return new Promise((resolve, reject) => {
    const child = spawn(agent.command, args, {
      cwd,
      stdio: 'inherit',
      // Agent CLIs installed through npm are .cmd shims on Windows, which need a shell.
      shell: process.platform === 'win32',
    });
    child.once('error', (e) => reject(new Error(`Could not start \`${agent.command}\`: ${e.message}`)));
    child.once('exit', (code, signal) => resolve(code ?? (signal ? 1 : 0)));
  });
}
