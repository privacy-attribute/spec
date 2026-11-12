// Turns results into the compact summary an agent reads, and a fixture run into a feedback issue.
import fs from 'node:fs';
import path from 'node:path';

const ISSUES = 'https://github.com/privacy-attribute/spec/issues/new?template=sdk-audit-feedback.yml';

const ABBR = {
  'input-value': 'val', 'value-length': 'len', 'emit-timing': 'emit', 'key-count': 'keys', 'key-timing': 'time',
  'checked-state': 'chk', 'select-state': 'sel', focus: 'foc', 'click-target': 'clk', 'pointer-path': 'ptr',
  'touch-path': 'tch', 'hover-state': 'hov', attribute: 'attr', text: 'txt', 'title-meta': 'title', url: 'url',
  stylesheet: 'css', canvas: 'cnv', image: 'img', iframe: 'ifr', 'shadow-dom': 'shd', network: 'net',
  clipboard: 'clip', selection: 'slct', scroll: 'scr', viewport: 'vp', 'layout-size': 'size',
};

export function summaryMarkdown(out) {
  const configs = out.configs.map((c) => c.id);
  const rows = new Map();
  for (const r of out.differential) {
    const key = `${r.pattern}|${r.page}`;
    if (!rows.has(key)) rows.set(key, { r, cells: {} });
    rows.get(key).cells[r.config] = r.error ? 'ERR'
      : !r.differs ? '·'
        : [...Object.keys(r.channels).map((c) => ABBR[c] || c), ...(r.timing.differs ? ['time'] : [])].filter((x, i, a) => a.indexOf(x) === i).join(' ');
  }
  const sorted = [...rows.values()].sort((x, y) => (x.r.rank ?? 999) - (y.r.rank ?? 999));
  const lines = [
    `# Differential results`,
    ``,
    `Target: ${out.target.repo || ''} ${out.target.commit || ''} (${Object.entries(out.target.packages || {}).map(([k, v]) => `${k}@${v}`).join(', ')}). Runner ${out.runner_version}, audit ${out.audit_version}.`,
    ``,
    `A cell lists the channels whose events differ between hidden value A and B (· means identical). Channel abbreviations: ${Object.entries(ABBR).map(([k, v]) => `${v}=${k}`).join(', ')}.`,
    `Details per cell are in results.json under differential[] (sample lines for each channel).`,
    ``,
    `| rank | pattern | category | ${configs.join(' | ')} |`,
    `|---|---|---|${configs.map(() => '---').join('|')}|`,
    ...sorted.map(({ r, cells }) => `| ${r.rank ?? ''} | ${r.pattern} | ${r.category ?? ''} | ${configs.map((c) => cells[c] ?? '').join(' | ')} |`),
    ``,
    `## Fidelity (public elements that differ from the live page)`,
    ``,
    ...out.fidelity.map((f) => `- ${f.page} / ${f.config}: ${f.error ? 'ERR ' + f.error : f.mismatches.length === 0 ? 'all public elements intact' : f.mismatches.length + ' mismatches, e.g. ' + f.mismatches.slice(0, 3).map((m) => `${m.tag}#${m.id} ${m.problem}: "${m.live}" → ${JSON.stringify(m.recorded)}`).join('; ')}`),
    ``,
    `## Not run`,
    ``,
    ...(out.not_run.length ? out.not_run.map((n) => `- ${n.pattern}: ${n.reason}`) : ['- none']),
    ``,
  ];
  return lines.join('\n');
}

export function auditVersion(auditDir) {
  try {
    const m = fs.readFileSync(path.join(auditDir, 'AGENTS.md'), 'utf8').match(/^Audit version: (\S+)/m);
    return m ? m[1] : 'unknown';
  } catch {
    return 'unknown';
  }
}

// Builds the issue body (same headings as feedback.md) and the blank issue-form URL.
export function feedbackIssue({ kind, actor, out, fixtureFile, fixtureSource, what: whatText }) {
  const leaking = out.differential.filter((r) => r.differs && r.category !== 'public');
  const patterns = [...new Set(out.differential.map((r) => r.pattern))];
  const title = `${kind}: ${patterns.join(', ')} ${leaking.length ? 'differs between hidden values' : 'shows no difference'}`.slice(0, 80);
  const target = `${out.target.repo || 'unknown repo'}@${out.target.commit || 'unknown'}, ${Object.entries(out.target.packages || {}).map(([k, v]) => `${k}@${v}`).join(', ')}`;
  const measured = leaking.length
    ? `Running the fixture below with two hidden values gave different recordings under: ${[...new Set(leaking.map((r) => r.config))].join(', ')}. Channels that differ: ${[...new Set(leaking.flatMap((r) => Object.keys(r.channels)))].join(', ')}.`
    : `The fixture below gave identical recordings for both hidden values under every config run.`;
  const what = `${measured} ${whatText || (leaking.length ? '<Describe what you expected and where you saw this pattern.>' : '<Describe why you expected a leak.>')}`;
  const evidence = leaking.slice(0, 4).map((r) => `${r.pattern} / ${r.config}:\n` + Object.entries(r.channels).slice(0, 3).map(([c, d]) => `  ${c}\n    A: ${d.a[0] ?? ''}\n    B: ${d.b[0] ?? ''}`).join('\n')).join('\n');
  const body = [
    `**Title:** ${title}`,
    `**Actor:** ${actor}`,
    `**Audit version:** ${out.audit_version}`,
    `**Target:** ${target}`,
    `**Pattern / leak class:** ${patterns.join(', ')} / <leak class>`,
    `**Step:** 6 (differential test, run with the audit runner ${out.runner_version})`,
    ``,
    `### What happened`,
    what,
    ``,
    `### Test page`,
    '```js',
    `// ${path.basename(fixtureFile)}`,
    fixtureSource.trim(),
    '```',
    ``,
    `### Recorded evidence`,
    '```',
    evidence || 'none',
    '```',
    ``,
    `### Proposed change`,
    `<The rule, pattern row or grep to add or change.>`,
    ``,
  ].join('\n');
  return { title, body, url: ISSUES };
}
