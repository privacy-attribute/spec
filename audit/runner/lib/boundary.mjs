import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

// An agent may read the application, but its only writable tree is the session.
// Verify the OS restriction before starting any model process. There is no fallback.
export function sandboxCommand(session, command, args, platform = process.platform) {
  const directory = fs.realpathSync(session);
  if (platform === 'darwin' && fs.existsSync('/usr/bin/sandbox-exec')) {
    const profile = `(version 1)(allow default)(deny file-write*)(allow file-write* (subpath ${JSON.stringify(directory)}))(allow file-write-data (literal "/dev/null"))`;
    return { command: '/usr/bin/sandbox-exec', args: ['-p', profile, command, ...args] };
  }
  if (platform === 'linux') {
    const probe = spawnSync('which', ['bwrap'], { encoding: 'utf8' });
    if (probe.status === 0) return { command: probe.stdout.trim(), args: ['--die-with-parent', '--ro-bind', '/', '/', '--bind', directory, directory, '--', command, ...args] };
  }
  throw new Error('No supported OS write sandbox. Automatic agent launch is disabled; review the generated session separately.');
}

export function verifyBoundary(session) {
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'privacy-boundary-'));
  const target = path.join(outside, 'must-stay-absent');
  const inside = path.join(session, `.boundary-${process.pid}`);
  try {
    const script = 'const fs=require("node:fs");fs.writeFileSync(process.argv[1],"ok");try{fs.writeFileSync(process.argv[2],"bad");process.exit(3)}catch{process.exit(0)}';
    const invocation = sandboxCommand(session, process.execPath, ['-e', script, inside, target]);
    const result = spawnSync(invocation.command, invocation.args, { cwd: session, encoding: 'utf8' });
    if (result.status !== 0 || !fs.existsSync(inside) || fs.existsSync(target)) throw new Error(`OS write boundary could not be verified. Agent launch refused. ${result.stderr || result.error?.message || ''}`.trim());
    return true;
  } finally { fs.rmSync(inside, { force: true }); fs.rmSync(outside, { recursive: true, force: true }); }
}

export function usageSummary(result, maxTokens = 50000) {
  const models = Object.values(result?.modelUsage || {});
  const keys = ['inputTokens', 'cacheCreationInputTokens', 'cacheReadInputTokens', 'outputTokens'];
  const raw = result?.usage;
  const values = models.length ? models.flatMap(m => keys.map(k => m[k])) : raw && ['input_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens', 'output_tokens'].map(k => raw[k]);
  const known = Boolean(values?.length) && values.every(n => Number.isFinite(n) && n >= 0);
  const total = known ? values.reduce((a, b) => a + b, 0) : null;
  return { total_tokens: total, limit: maxTokens, within_limit: known ? total < maxTokens : null, measurement: known ? 'agent-reported' : 'unknown', enforcement: 'post-run acceptance only; no pre-call token cap' };
}
