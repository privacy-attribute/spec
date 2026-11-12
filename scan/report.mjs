// One feedback report per scan: rule outcomes (counts only), gaps with proposed rules tested against
// their synthetic examples, and recorder gaps kept apart for private reporting.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseLabels } from './bench.mjs';
import { validateSession, writeSessionFile } from './session.mjs';

const DISCLAIMER = fs.readFileSync(new URL('./AGENTS.md', import.meta.url), 'utf8').match(/## Responsibility\n\n([^\n]+)/)?.[1] || 'The recorder operator is responsible for recording contents. This scan does not establish legal compliance.';
const FORM = 'https://github.com/privacy-attribute/spec/issues/new?template=scan-feedback.yml';
const PUBLIC_KINDS = ['missed-data', 'false-positive', 'wrong-guidance', 'unclear-instruction'];

// For each rule: how many lines it flagged, and what the agent did with them.
export function ruleOutcomes(candidates, decisions) {
  const annotatedAs = new Map();
  for (const a of decisions.annotations || []) for (const id of a.candidates || []) annotatedAs.set(id, a.value);
  const dismissed = new Set(Object.keys(decisions.dismissed || {}));
  const out = {};
  for (const c of candidates.filter((x) => !x.cached && !x.settled)) {
    for (const rule of c.rules) {
      const r = (out[rule] ||= { flagged: 0, annotated: {}, dismissed: 0, open: 0, auto: 0 });
      r.flagged++;
      if (c.auto) r.auto++;
      if (annotatedAs.has(c.id)) r.annotated[annotatedAs.get(c.id)] = (r.annotated[annotatedAs.get(c.id)] || 0) + 1;
      else if (dismissed.has(c.id)) r.dismissed++;
      else r.open++;
    }
  }
  return out;
}

// A proposed rule counts as tested when its pattern compiles and matches the gap's example.
function testProposal(gap) {
  const p = gap.proposed_rule;
  if (!p?.re) return null;
  try {
    const regex = new RegExp(p.re);
    const tested = regex.test(gap.example || '');
    const corpus = parseLabels(fileURLToPath(new URL('./benchmark/react-app', import.meta.url)));
    const matches = corpus.filter(label => regex.test(label.snippet));
    const publicMatches = matches.filter(label => label.category === 'public');
    return { ...p, tested, example_matches: tested, regression: {
      corpus: 'scan/benchmark/react-app', examples: corpus.length,
      private_matches: matches.length - publicMatches.length, public_false_positives: publicMatches.length,
      status: 'review-required',
      reason: 'Fixture checks inform review. A proposed rule needs independent cases and a complete scanner regression before adoption.',
    } };

  } catch (e) {
    return { ...p, tested: false, error: String(e.message) };
  }
}

export function buildScanReport({ scan, decisions }) {
  const gaps = (decisions.gaps || []).map((g) => (typeof g === 'string' ? { kind: 'unclear-instruction', title: g } : g));
  const recorderGaps = gaps.filter((g) => g.kind === 'recorder-gap');
  const publicGaps = gaps
    .filter((g) => g.kind !== 'recorder-gap')
    .map((g) => ({ ...g, kind: PUBLIC_KINDS.includes(g.kind) ? g.kind : 'unclear-instruction', proposed_rule: testProposal(g) }));
  const byValue = {};
  for (const a of decisions.annotations || []) byValue[`${a.value}/${a.category}`] = (byValue[`${a.value}/${a.category}`] || 0) + 1;
  const payload = {
    kind: 'scan-report',
    disclaimer: DISCLAIMER,
    scan_version: scan.scan_version,
    scan_revision: scan.scan_revision || null,
    recorder_version: 'unknown',
    recorder: scan.sdk,
    annotate: scan.annotate,
    size: { files: scan.scanned_files, candidates: scan.candidates.length },
    annotations: byValue,
    dismissed: Object.keys(decisions.dismissed || {}).filter((k) => !k.includes(':')).length,
    rule_outcomes: ruleOutcomes(scan.candidates, decisions),
    gaps: publicGaps,
  };
  const rows = Object.entries(payload.rule_outcomes)
    .sort((a, b) => b[1].flagged - a[1].flagged)
    .map(([id, r]) => `| ${id} | ${r.flagged} | ${Object.entries(r.annotated).map(([v, n]) => `${v} ${n}`).join(', ') || '0'} | ${r.dismissed} | ${r.open} |`);
  const gapText = publicGaps.length
    ? publicGaps.map((g, i) => [
      `${i + 1}. **${g.kind}**: ${g.title || ''}`,
      g.example ? `   Example (made-up): \`${g.example}\`` : '',
      g.expected ? `   Expected: ${g.expected}` : '',
      g.proposed_rule ? `   Proposed rule: \`${g.proposed_rule.re}\` (${g.proposed_rule.category || 'no category'}, ${g.proposed_rule.tested ? 'matches its example' : 'does not match its example'})` : '',
    ].filter(Boolean).join('\n')).join('\n')
    : 'None.';
  const title = `scan-report: ${payload.recorder || 'no recorder'}, ${payload.size.files} files, ${publicGaps.length} gap${publicGaps.length === 1 ? '' : 's'}`;
  const markdown = [
    `# ${title}`,
    '',
    DISCLAIMER,
    '',
    `Scan version ${payload.scan_version}, revision ${payload.scan_revision || 'unknown'}, recorder ${payload.recorder || 'not given'}, recorder version unknown, annotation style ${payload.annotate}. ${payload.size.candidates} candidates in ${payload.size.files} files; ${Object.values(byValue).reduce((n, x) => n + x, 0)} annotations, ${payload.dismissed} dismissed.`,
    '',
    '## Gaps',
    '',
    gapText,
    '',
    '## Rule outcomes',
    '',
    '| Rule | Flagged | Annotated | Dismissed | Open |',
    '|------|---------|-----------|-----------|------|',
    ...rows,
    '',
    '<details><summary>Payload</summary>',
    '',
    '```json',
    JSON.stringify(payload),
    '```',
    '',
    '</details>',
    '',
  ].join('\n');
  const privateText = recorderGaps.length
    ? [
      '# Recorder gaps (private)',
      '',
      'Do not post this file in a public issue. Send it as described in SECURITY.md.',
      '',
      `Recorder: ${payload.recorder || 'not given'}. Scan version: ${payload.scan_version}.`,
      '',
      ...recorderGaps.map((g, i) => `${i + 1}. ${g.title || ''}\n   Example (made-up): ${g.example || ''}\n   Expected: ${g.expected || ''}`),
      '',
    ].join('\n')
    : null;
  return { payload, markdown, url: FORM, privateText, title };
}

export function writeScanReport(out, report) {
  validateSession(out);
  const dir = path.join(out, 'feedback');
  fs.mkdirSync(dir, { recursive: true });
  const files = { json: path.join(dir, 'scan-report.json'), md: path.join(dir, 'scan-report.md') };
  writeSessionFile(dir, path.basename(files.json), JSON.stringify(report.payload, null, 1));
  writeSessionFile(dir, path.basename(files.md), report.markdown);
  if (!report.privateText) fs.rmSync(path.join(dir, 'private-recorder-gaps.md'), { force: true });
  if (report.privateText) {
    files.private = path.join(dir, 'private-recorder-gaps.md');
    writeSessionFile(dir, path.basename(files.private), report.privateText);
  }
  return files;
}
