// Static pass: lists every line in a front-end codebase that may collect or show data a recorder
// must mask or block. Deterministic and model-free; the agent reviews the output.
import fs from 'node:fs';
import path from 'node:path';
import { RULES, COVERAGE, MARKUP } from './rules.mjs';

const EXT = /\.(tsx|jsx|ts|js|mjs|vue|svelte|astro|html|hbs|erb|cshtml|php)$/;
const SKIP_DIR = new Set(['node_modules', 'dist', 'build', '.next', '.nuxt', '.output', '.svelte-kit', 'coverage', '.git', '.claude', 'vendor', 'public', 'storybook-static']);
const SKIP_FILE = /\.(test|spec|stories|e2e|d)\.|\.gen\.|routeTree\.gen|\.min\.|[-.](fixtures?|mocks?)\.|__mocks__/;
const COMPONENT = /^\s*(export\s+)?(default\s+)?(async\s+)?(function|const|let|class)\s+([A-Z][\w$]*)/;
const CATEGORY_ORDER = ['secret', 'secret?', 'third-party', 'third-party?', 'personal', 'personal?'];

function files(root) {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) { if (!SKIP_DIR.has(e.name) && !e.name.startsWith('.')) walk(path.join(d, e.name)); }
      else if (EXT.test(e.name) && !SKIP_FILE.test(e.name)) out.push(path.join(d, e.name));
    }
  };
  walk(root);
  return out.sort();
}

export function find(root) {
  const candidates = [];
  let scanned = 0;
  let lines = 0;
  for (const file of files(root)) {
    const src = fs.readFileSync(file, 'utf8').split('\n');
    scanned++;
    lines += src.length;
    let component = null;
    src.forEach((line, i) => {
      const c = line.match(COMPONENT);
      if (c) component = c[5];
      if (line.length > 2000 || /^\s*(\/\/|\*|import\b)/.test(line)) return;
      const markup = MARKUP.test(line);
      const applies = (r) => (!r.render || markup) && r.re.test(line);
      const hits = RULES.filter((r) => !r.fallback && applies(r));
      if (!hits.some((h) => h.id.startsWith('person-field'))) hits.push(...RULES.filter((r) => r.fallback && applies(r)));
      if (!hits.length) return;
      const near = src.slice(Math.max(0, i - 3), i + 4).join('\n');
      const category = hits.map((h) => h.category).sort((a, b) => CATEGORY_ORDER.indexOf(a) - CATEGORY_ORDER.indexOf(b))[0];
      candidates.push({
        id: null,
        file: path.relative(root, file),
        line: i + 1,
        component,
        rules: hits.map((h) => h.id),
        patterns: [...new Set(hits.map((h) => h.pattern).filter(Boolean))],
        category_hint: category,
        covered: COVERAGE.test(near),
        snippet: line.trim().slice(0, 200),
      });
    });
  }
  candidates.sort((a, b) => CATEGORY_ORDER.indexOf(a.category_hint) - CATEGORY_ORDER.indexOf(b.category_hint)
    || a.file.localeCompare(b.file) || a.line - b.line);
  candidates.forEach((c, i) => { c.id = `C${i + 1}`; });
  return { root, scanned_files: scanned, scanned_lines: lines, candidates };
}

// Compact plan for the agent: one section per file, most private category first.
export function planMarkdown(result) {
  const byFile = new Map();
  for (const c of result.candidates) {
    if (!byFile.has(c.file)) byFile.set(c.file, []);
    byFile.get(c.file).push(c);
  }
  const rank = (list) => Math.min(...list.map((c) => CATEGORY_ORDER.indexOf(c.category_hint)));
  const files = [...byFile.entries()].sort((a, b) => rank(a[1]) - rank(b[1]) || a[0].localeCompare(b[0]));
  const count = (k) => result.candidates.filter((c) => c.category_hint.replace('?', '') === k).length;
  return [
    '# Scan plan',
    '',
    `${result.candidates.length} candidates in ${byFile.size} of ${result.scanned_files} files (${result.scanned_lines} lines): ${count('secret')} secret, ${count('third-party')} third-party, ${count('personal')} personal. A trailing ? means the category is a guess. "covered" means a masking annotation is already within three lines.`,
    '',
    ...files.flatMap(([file, list]) => [
      `## ${file}`,
      '',
      ...list.map((c) => `- ${c.id} L${c.line} ${c.component ? `<${c.component}> ` : ''}[${c.category_hint}; ${c.rules.join(', ')}]${c.covered ? ' covered' : ''}: \`${c.snippet.slice(0, 140).replace(/`/g, "'")}\``),
      '',
    ]),
  ].join('\n');
}
