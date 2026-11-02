// Turns the gaps in annotations.json into issue texts and links to a filled-in scan feedback form.
// Gap examples are written by hand with made-up values, so no application code reaches the issue.
import fs from 'node:fs';
import path from 'node:path';

const FORM = 'https://github.com/privacy-attribute/spec/issues/new';
const KINDS = ['missed-data', 'false-positive', 'wrong-guidance', 'recorder-gap', 'unclear-instruction'];
const URL_LIMIT = 7500;

export function gapReports({ gaps, sdk, scanVersion }) {
  return (gaps || []).map((g, i) => {
    const gap = typeof g === 'string' ? { kind: 'unclear-instruction', title: g } : g;
    const kind = KINDS.includes(gap.kind) ? gap.kind : 'unclear-instruction';
    const title = `${kind}: ${gap.title || 'scan gap'}`.slice(0, 100);
    const body = [
      `**Kind:** ${kind}`,
      `**Scan version:** ${scanVersion}`,
      `**Recorder:** ${sdk || 'not given'}`,
      '',
      '### What happened',
      gap.title || '',
      '',
      '### Example (made-up)',
      '```',
      gap.example || '',
      '```',
      '',
      '### Expected',
      gap.expected || '',
      '',
    ].join('\n');
    const params = new URLSearchParams({
      template: 'scan-feedback.yml',
      title,
      kind,
      recorder: sdk || '',
      'scan-version': scanVersion,
      what: gap.title || '',
      example: gap.example || '',
      expected: gap.expected || '',
    });
    let url = `${FORM}?${params}`;
    if (url.length > URL_LIMIT) {
      params.set('example', 'Too long for a link: paste it from the issue text file.');
      url = `${FORM}?${params}`;
    }
    return { file: `gap-${i + 1}-${kind}.md`, title, body, url };
  });
}

export function writeGapReports(out, reports) {
  const dir = path.join(out, 'feedback');
  fs.mkdirSync(dir, { recursive: true });
  return reports.map((r) => {
    const file = path.join(dir, r.file);
    fs.writeFileSync(file, `# ${r.title}\n\n${r.body}\nFile it: ${r.url}\n`);
    return { ...r, path: file };
  });
}
