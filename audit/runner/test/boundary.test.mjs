import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { sandboxCommand, usageSummary, verifyBoundary } from '../lib/boundary.mjs';

test('unsupported runtimes refuse automatic agent execution', (t) => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'privacy-boundary-test-')));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  assert.throws(() => sandboxCommand(dir, 'agent', [], 'unsupported'), /disabled/);
});

test('token reports include reads, writes, output and every reported model', () => {
  const model = {inputTokens: 100, cacheCreationInputTokens: 200, cacheReadInputTokens: 300, outputTokens: 400};
  assert.equal(usageSummary({ modelUsage: { one: model, two: model } }).total_tokens, 2000);
  assert.equal(usageSummary({ modelUsage: { one: model } }, 1000).within_limit, false);
  assert.equal(usageSummary({ usage: { input_tokens: 1 } }).within_limit, null);
  assert.equal(usageSummary(null).measurement, 'unknown');
});
