import assert from 'node:assert/strict';
import test from 'node:test';
import { feedbackIssue } from '../lib/report.mjs';

test('the audit feedback URL carries only the form template', () => {
  const issue = feedbackIssue({
    kind: 'missed-leak',
    actor: 'human',
    out: {
      target: { repo: 'example/recorder', commit: 'fixture-commit' },
      runner_version: '0.0.0',
      audit_version: '0.0.0',
      differential: [{
        pattern: 'synthetic-case',
        config: 'default',
        differs: true,
        channels: { text: { a: ['synthetic-evidence'], b: [] } },
      }],
    },
    fixtureFile: 'fixture.mjs',
    fixtureSource: 'synthetic-fixture',
    what: 'synthetic-note',
  });

  assert.equal(issue.url, 'https://github.com/privacy-attribute/spec/issues/new?template=sdk-audit-feedback.yml');
  assert.match(issue.body, /synthetic-evidence/);
  assert.match(issue.body, /synthetic-fixture/);
  assert.match(issue.body, /synthetic-note/);
});
