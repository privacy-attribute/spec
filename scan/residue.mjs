// The residue: sites whose origin the scan could not name (a hook, typed state or awaited call that
// no list knows). Instead of reviewing each unit, the agent answers one question per source: does it
// return data about people or an organisation, or only public content and UI state? The answers
// upgrade or drop every site of the source, and they are kept in the decisions cache, so the next
// scan does not ask again.
import fs from 'node:fs';
import path from 'node:path';
import { UNKNOWN_ORIGIN, categoryOf, strongestOrigin, isSecretOrigin, originCategory } from './components.mjs';

// The source of a low-confidence site: "unknown useLimits() via <Card limits>" -> "useLimits()".
export const sourceOf = (origin) => (UNKNOWN_ORIGIN.test(origin) ? origin.split(' via ')[0].replace(UNKNOWN_ORIGIN, '').replace(/^await /, '') : null);

const moduleOf = (origin, fallback) => origin.split(' via source ')[1]?.split(' via ')[0] || fallback;

// Where a source is defined: the hook or function declaration, or the type of typed state.
function definitionOf(source, files) {
  const name = source.replace(/^state /, '').replace(/\(\)$/, '');
  if (!/^[\w$]+$/.test(name)) return null;
  const decl = source.startsWith('state ')
    ? new RegExp(`(type|interface)\\s+${name}\\b|const\\s+Z?${name.replace(/^T/, '')}\\w*Schema\\s*=`)
    : new RegExp(`(function\\s+${name}\\b|(const|let)\\s+${name}\\s*=|export\\s+\\{[^}]*\\b${name}\\b)`);
  const matches = [];
  for (const [file, text] of files) {
    const m = text.match(decl);
    if (m) matches.push(`${file}:${text.slice(0, m.index).split('\n').length}`);
  }
  return matches.length === 1 ? matches[0] : null;
}

// One question per source, most used first. `root` is the app folder; definitions are looked up in
// the files that hold units and in the files that the component index names.
export function buildQuestions(scan, root) {
  const bySource = new Map();
  for (const c of scan.candidates) {
    if (!c.sites || c.cached) continue;
    for (const s of c.sites) {
      for (const origin of s.origins || [s.origin]) {
      const source = sourceOf(origin);
      if (!source) continue;
      const module = moduleOf(origin, c.file);
      const key = `${module}::${source}`;
      if (!bySource.has(key)) bySource.set(key, { key, source, module, sites: 0, units: new Set(), shown: [] });
      const q = bySource.get(key);
      q.sites++;
      q.units.add(c.id);
      if (q.shown.length < 3 && !/^prop /.test(s.kind)) q.shown.push({ file: c.file, line: s.line, expr: s.expr.slice(0, 60) });
      }
    }
  }
  const files = new Map();
  for (const f of new Set([...scan.candidates.map((c) => c.file), ...Object.keys(scan.component_index || {})])) {
    try { files.set(f, fs.readFileSync(path.join(root, f), 'utf8')); } catch { /* removed since the scan */ }
  }
  // Hooks are often defined in files with no unit; look in every script file under the root as well.
  const extra = [];
  const walk = (dir, depth) => {
    if (depth > 8) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith('.') || /^(node_modules|dist|build|coverage|vendor)$/.test(e.name)) continue;
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) walk(abs, depth + 1);
      else if (/\.(ts|tsx|js|jsx|mjs|vue)$/.test(e.name) && !/\.(test|spec|stories|d)\./.test(e.name)) extra.push(abs);
    }
  };
  try { walk(root, 0); } catch { /* unreadable folder */ }
  for (const abs of extra) {
    const rel = path.relative(root, abs);
    if (!files.has(rel)) files.set(rel, fs.readFileSync(abs, 'utf8'));
  }
  return [...bySource.values()]
    .sort((a, b) => b.sites - a.sites || a.source.localeCompare(b.source))
    .map((q, i) => ({ id: `Q${i + 1}`, key: q.key, module: q.module, categories: ['secret', 'personal', 'third-party', 'public'], source: q.source, defined_in: definitionOf(q.source, files), sites: q.sites, units: q.units.size, shown: q.shown }));
}

// Applies answers ({ "useLimits()": "data" | "public" }) to the sites of a scan. A `data` source
// gives its sites high confidence; a `public` source removes them. Returns the ids of units whose
// sites changed, and of units left with no sites.
export function applyAnswers(scan, answers) {
  const changed = new Set();
  const emptied = new Set();
  if (!answers || !Object.keys(answers).length) return { changed, emptied };
  const modules = new Map();
  for (const c of scan.candidates) for (const site of c.sites || []) {
    for (const origin of site.origins || [site.origin]) {
      const source = sourceOf(origin);
      if (source) { if (!modules.has(source)) modules.set(source, new Set()); modules.get(source).add(moduleOf(origin, c.file)); }
    }
  }
  for (const [key, value] of Object.entries(answers)) {
    const category = typeof value === 'object' && value ? value.category : value;
    if (!['data', 'secret', 'personal', 'third-party', 'public'].includes(category)) throw new Error(`Invalid category for answer ${key}`);
    if (typeof value === 'object' && (typeof value.evidence !== 'string' || !value.evidence.trim())) throw new Error(`Answer ${key} needs source evidence`);
    if (modules.has(key) && modules.get(key).size > 1) throw new Error(`Ambiguous source answer ${key}; use the module-qualified question key`);
  }
  for (const c of scan.candidates) {
    if (!c.sites) continue;
    const before = c.sites.length;
    let touched = false;
    c.sites = c.sites.filter((s) => {
      const retained = [];
      const rank = { personal: 1, 'third-party': 2, secret: 3 };
      for (const origin of s.origins || [s.origin]) {
        const source = sourceOf(origin);
        const raw = source && (answers[`${moduleOf(origin, c.file)}::${source}`] ?? (modules.get(source)?.size === 1 ? answers[source] : undefined));
        const answer = typeof raw === 'object' && raw ? raw.category : raw;
        if (answer === 'public') { touched = true; continue; }
        if (['data', 'secret', 'personal', 'third-party'].includes(answer)) {
          const category = answer === 'data' ? 'personal' : answer;
          if (!s.category || rank[category] > rank[s.category]) s.category = category;
          retained.push(`${source} (answered: ${category})${origin.includes(' via ') ? ` via ${origin.split(' via ').slice(1).join(' via ')}` : ''}`);
          touched = true;
        } else retained.push(origin);
      }
      if (!retained.length) return false;
      s.origins = retained;
      s.category = retained.map(origin => origin.match(/\(answered: (secret|personal|third-party)\)/)?.[1] || originCategory(origin)).sort((a, b) => (rank[b] || 0) - (rank[a] || 0))[0];
      s.origin = strongestOrigin(retained);
      s.confidence = s.category === 'secret' || retained.some(isSecretOrigin) || !retained.some(origin => UNKNOWN_ORIGIN.test(origin)) ? 'high' : 'low';
      return true;
    });
    if (touched) changed.add(c.id);
    if (before && !c.sites.length) emptied.add(c.id);
    if (touched) { c.confidence = c.sites.some((s) => s.confidence === 'high') ? 'high' : 'low'; c.category_hint = categoryOf(c.sites); }
  }
  return { changed, emptied };
}
