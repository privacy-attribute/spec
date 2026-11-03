// Static pass: lists every line in a front-end codebase that may collect or show data a recorder
// must mask or block. Deterministic and model-free; the agent reviews the output.
import fs from 'node:fs';
import path from 'node:path';
import { RULES, COVERAGE, MARKUP, PERSON_FIELD, PUBLIC_OWNER } from './rules.mjs';
import { componentPass } from './components.mjs';

// In TypeScript and JSX files the component pass finds rendered data, so these line rules only
// run on templates (Vue, Svelte, HTML and others).
const RENDER_RULES = new Set(['person-field', 'person-field-self', 'person-field-others', 'template-binding', 'attribute-data', 'attribute-expr', 'generic-cell', 'metadata-render', 'message-content', 'echo-search', 'avatar-image', 'chart', 'style-from-data']);
const PARSEABLE = /\.(tsx|jsx|ts|js|mjs)$/;
// Files without markup cannot render; only these rules apply to them.
const NO_MARKUP_RULES = new Set(['dom-write', 'url-with-data', 'title-from-data', 'console']);

const EXT = /\.(tsx|jsx|ts|js|mjs|vue|svelte|astro|html|hbs|erb|cshtml|php)$/;
const SKIP_DIR = new Set(['node_modules', 'dist', 'build', '.next', '.nuxt', '.output', '.svelte-kit', 'coverage', '.git', '.claude', 'vendor', 'public', 'storybook-static']);
const SKIP_FILE = /\.(test|spec|stories|e2e|d)\.|\.gen\.|\.generated\.|routeTree\.gen|\.min\.|[-.](fixtures?|mocks?)\.|__mocks__/;
// Generated code (GraphQL types, API clients) holds no rendered data.
const GENERATED_DIR = /^(generated|__generated__|generated-.+|.+-generated|gql|__gql__)$/;
const COMPONENT = /^\s*(export\s+)?(default\s+)?(async\s+)?(function|const|let|class)\s+([A-Z][\w$]*)/;
const CATEGORY_ORDER = ['secret', 'secret?', 'third-party', 'third-party?', 'personal', 'personal?'];

// `include` limits the scan to paths under these prefixes, relative to root.
export function files(root, include) {
  const out = [];
  const prefixes = (include || []).map((p) => path.normalize(p).replace(/[\\/]+$/, ''));
  const wanted = (rel) => !prefixes.length || prefixes.some((p) => rel === p || rel.startsWith(p + path.sep) || p.startsWith(rel + path.sep));
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const abs = path.join(d, e.name);
      const rel = path.relative(root, abs);
      if (e.isDirectory()) {
        if (!SKIP_DIR.has(e.name) && !e.name.startsWith('.') && !GENERATED_DIR.test(e.name) && wanted(rel)) walk(abs);
      } else if (EXT.test(e.name) && !SKIP_FILE.test(e.name) && wanted(rel)) out.push(abs);
    }
  };
  walk(root);
  return out.sort();
}

// Source-first pass: variables that hold fetched data or person-like records, and the markup
// lines that render them. Finds private data that no field name gives away.
const SOURCE = /\b(const|let|var)\s+(\{[^}]*\}|[A-Za-z_$][\w$]*)\s*=\s*(await\s+)?(use\w*Query|useSWR|useSuspenseQuery|useLoaderData|useFetcher|useFetch|useAsyncData|use(Current)?(User|Viewer|Session|Auth|WorkspaceMember|Member|Profile|Account)\w*|useRecoilValue|useAtomValue|fetch|axios(\.\w+)?|api\.\w+|trpc\.[\w.]+|client\.\w+|useSelector|useStore|useRecords|useList)\b/;
const PERSON_TYPE = /\b([A-Za-z_$][\w$]*)\s*[?]?:\s*(User|Customer|Member|Contact|Account|Profile|Person|Patient|Client|Employee|Lead|Visitor|Recording|Session|Order|Invoice|Message|Comment|Ticket|Participant|Invitee)(\[\]|<|\b)/g;

function sourceNames(src) {
  const names = new Set();
  for (const line of src) {
    const m = line.match(SOURCE);
    if (m) {
      const binding = m[2];
      if (binding.startsWith('{')) {
        for (const part of binding.slice(1, -1).split(',')) {
          const name = (part.split(':')[1] || part.split(':')[0]).replace(/=.*/, '').trim();
          if (/^[A-Za-z_$][\w$]*$/.test(name)) names.add(name);
        }
      } else names.add(binding);
    }
    for (const t of line.matchAll(PERSON_TYPE)) names.add(t[1]);
  }
  // Values built from person fields, then rendered: const greeting = `Hi ${user.firstName}`.
  const built = new RegExp(String.raw`\b(const|let|var)\s+([A-Za-z_$][\w$]*)\s*=.*\.${PERSON_FIELD}\b`);
  for (const line of src) {
    const b = line.match(built);
    if (b && !PUBLIC_OWNER.test(line)) names.add(b[2]);
  }
  // Parameters of callbacks that iterate over a source, repeated for nested loops:
  // rows.map((row) => row.cells.map((cell) => ...)).
  for (let pass = 0; pass < 3; pass++) {
    for (const line of src) {
      for (const it of line.matchAll(/\b([A-Za-z_$][\w$.]*)\.(map|flatMap|forEach|filter)\(\s*\(?\s*([A-Za-z_$][\w$]*)/g)) {
        if (names.has(it[1].split('.')[0])) names.add(it[3]);
      }
    }
  }
  ['data', 'props', 'children', 'error', 'isLoading'].forEach((n) => names.delete(n));
  return names;
}

export function find(root, { include } = {}) {
  const candidates = [];
  let scanned = 0;
  let lines = 0;
  for (const file of files(root, include)) {
    const src = fs.readFileSync(file, 'utf8').split('\n');
    const parseable = PARSEABLE.test(file);
    const hasMarkup = !parseable || /\.(tsx|jsx)$/.test(file) || /<[A-Za-z][\w.]*[\s>/]/.test(src.join('\n'));
    scanned++;
    lines += src.length;
    let component = null;
    const sources = sourceNames(src);
    src.forEach((line, i) => {
      const c = line.match(COMPONENT);
      if (c) component = c[5];
      if (line.length > 2000 || /^\s*(\/\/|\*|import\b)/.test(line)) return;
      const markup = MARKUP.test(line);
      const publicOwner = PUBLIC_OWNER.test(line);
      const applies = (r) => (hasMarkup || NO_MARKUP_RULES.has(r.id)) && !(parseable && RENDER_RULES.has(r.id)) && (!r.render || markup) && !(publicOwner && /^(person-field|template-binding|attribute-data|attribute-expr)/.test(r.id)) && r.re.test(line);
      const hits = RULES.filter((r) => !r.fallback && applies(r));
      if (!hits.some((h) => h.id.startsWith('person-field'))) {
        const fallback = RULES.filter((r) => r.fallback && applies(r));
        hits.push(...(fallback.some((r) => r.id === 'person-field') ? fallback.filter((r) => r.id !== 'template-binding') : fallback));
      }
      if (!parseable && !hits.length && markup && sources.size) {
        const rendered = [...line.matchAll(/\{([^{}]*)\}/g)].map((m) => m[1]);
        if (rendered.some((expr) => [...sources].some((n) => new RegExp(`(^|[^\\w$.])${n.replace(/\$/g, '\\$')}\\b`).test(expr)))) {
          hits.push({ id: 'data-flow', pattern: 'P-crm-record', category: 'third-party?' });
        }
      }
      if (!hits.length) return;
      const near = src.slice(Math.max(0, i - 3), i + 4).join('\n');
      const autoRule = hits.find((h) => h.auto);
      let auto = null;
      if (autoRule) {
        // The tag that holds this line: this line or the nearest line above that opens a tag.
        for (let k = i; k >= Math.max(0, i - 10); k--) {
          const t = src[k].match(/<([A-Za-z][\w.]*)/);
          if (t) { auto = { ...autoRule.auto, rule: autoRule.id, line: k + 1, match: `<${t[1]}` }; break; }
        }
      }
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
        auto: COVERAGE.test(near) ? null : auto,
        snippet: line.trim().slice(0, 200),
      });
    });
  }
  // Component pass over the whole tree, so data passed from components outside --include is seen.
  const comp = componentPass(root, include ? files(root) : files(root, include));
  const wanted = (f) => !include || include.some((p) => f === p || f.startsWith(p.replace(/[\\/]+$/, '') + path.sep));
  const units = comp.candidates.filter((c) => wanted(c.file)).map((c) => ({ ...c, id: null, covered: false, auto: null, merged: [] }));
  // A line hit inside a flagged component joins that component's unit, so the agent decides it there.
  const remaining = [];
  for (const c of candidates) {
    const unit = !c.auto && units.find((u) => u.file === c.file && c.line >= u.line && c.line <= u.end_line);
    if (unit) {
      unit.merged.push({ line: c.line, rules: c.rules, snippet: c.snippet.slice(0, 120) });
      for (const r of c.rules) if (!unit.rules.includes(r)) unit.rules.push(r);
      if (CATEGORY_ORDER.indexOf(c.category_hint) < CATEGORY_ORDER.indexOf(unit.category_hint)) unit.category_hint = c.category_hint;
    } else remaining.push(c);
  }
  const all = [...units, ...remaining];
  all.sort((a, b) => CATEGORY_ORDER.indexOf(a.category_hint) - CATEGORY_ORDER.indexOf(b.category_hint)
    || a.file.localeCompare(b.file) || a.line - b.line);
  all.forEach((c, i) => { c.id = `C${i + 1}`; });
  return { root, include: include || null, scanned_files: scanned, scanned_lines: lines, parsed_files: comp.parsed, components: comp.components, candidates: all };
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
    `${result.candidates.length} candidates in ${byFile.size} of ${result.scanned_files} files (${result.scanned_lines} lines): ${count('secret')} secret, ${count('third-party')} third-party, ${count('personal')} personal. A trailing ? means the category is a guess. "covered" means a masking annotation is already within three lines. "decided" means a rule made the annotation; it is already in annotations.json, so examine it only when the file is open for other candidates.`,
    '',
    ...files.flatMap(([file, list]) => [
      `## ${file}`,
      '',
      ...list.flatMap((c) => (c.sites
        ? [
          `- ${c.id} L${c.line}-${c.end_line} component <${c.component}> [${c.category_hint}]: data from ${[...new Set(c.sites.map((s) => s.origin.split(' via ')[0]))].slice(0, 2).join('; ').slice(0, 110)}`,
          `  - renders at L${c.site_lines.slice(0, 12).join(', L')}${c.site_lines.length > 12 ? ' and more' : ''}: ${c.sites.slice(0, 3).map((s) => `<${s.tag}> ${s.kind} \`${s.expr.replace(/`/g, "'").slice(0, 50)}\``).join('; ')}`,
          ...(c.merged.length ? [`  - rule hits at L${c.merged.map((m) => m.line).slice(0, 10).join(', L')}: ${[...new Set(c.merged.flatMap((m) => m.rules))].join(', ')}`] : []),
        ]
        : [`- ${c.id} L${c.line} ${c.component ? `<${c.component}> ` : ''}[${c.category_hint}; ${c.rules.join(', ')}]${c.covered ? ' covered' : ''}${c.auto ? ` decided: ${c.auto.value}` : ''}: \`${c.snippet.slice(0, 140).replace(/`/g, "'")}\``])),
      '',
    ]),
  ].join('\n');
}
