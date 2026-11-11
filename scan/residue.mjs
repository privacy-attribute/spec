// The residue: sites whose origin the scan could not name (a hook, typed state or awaited call that
// no list knows). Instead of reviewing each unit, the agent answers one question per source: does it
// return data about people or an organisation, or only public content and UI state? The answers
// upgrade or drop every site of the source, and they are kept in the decisions cache, so the next
// scan does not ask again.
import fs from 'node:fs';
import path from 'node:path';
import { UNKNOWN_ORIGIN } from './components.mjs';

// The source of a low-confidence site: "unknown useLimits() via <Card limits>" -> "useLimits()".
export const sourceOf = (origin) => (UNKNOWN_ORIGIN.test(origin) ? origin.split(' via ')[0].replace(UNKNOWN_ORIGIN, '').replace(/^await /, '') : null);

// Where a source is defined: the hook or function declaration, or the type of typed state.
function definitionOf(source, files) {
  const name = source.replace(/^state /, '').replace(/\(\)$/, '');
  if (!/^[\w$]+$/.test(name)) return null;
  const decl = source.startsWith('state ')
    ? new RegExp(`(type|interface)\\s+${name}\\b|const\\s+Z?${name.replace(/^T/, '')}\\w*Schema\\s*=`)
    : new RegExp(`(function\\s+${name}\\b|(const|let)\\s+${name}\\s*=|export\\s+\\{[^}]*\\b${name}\\b)`);
  for (const [file, text] of files) {
    const m = text.match(decl);
    if (m) return `${file}:${text.slice(0, m.index).split('\n').length}`;
  }
  return null;
}

// One question per source, most used first. `root` is the app folder; definitions are looked up in
// the files that hold units and in the files that the component index names.
export function buildQuestions(scan, root) {
  const bySource = new Map();
  for (const c of scan.candidates) {
    if (!c.sites || c.cached) continue;
    for (const s of c.sites) {
      const source = s.confidence === 'low' && sourceOf(s.origin);
      if (!source) continue;
      if (!bySource.has(source)) bySource.set(source, { source, sites: 0, units: new Set(), shown: [] });
      const q = bySource.get(source);
      q.sites++;
      q.units.add(c.id);
      if (q.shown.length < 3 && !/^prop /.test(s.kind)) q.shown.push({ file: c.file, line: s.line, expr: s.expr.slice(0, 60) });
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
    .map((q, i) => ({ id: `Q${i + 1}`, source: q.source, defined_in: definitionOf(q.source, files), sites: q.sites, units: q.units.size, shown: q.shown }));
}

// Applies answers ({ "useLimits()": "data" | "public" }) to the sites of a scan. A `data` source
// gives its sites high confidence; a `public` source removes them. Returns the ids of units whose
// sites changed, and of units left with no sites.
export function applyAnswers(scan, answers) {
  const changed = new Set();
  const emptied = new Set();
  if (!answers || !Object.keys(answers).length) return { changed, emptied };
  for (const c of scan.candidates) {
    if (!c.sites) continue;
    const before = c.sites.length;
    let touched = false;
    c.sites = c.sites.filter((s) => {
      const source = s.confidence === 'low' && sourceOf(s.origin);
      const answer = source && String(answers[source] || '').toLowerCase();
      if (answer === 'public') { touched = true; return false; }
      if (answer === 'data') { s.confidence = 'high'; s.origin = `${source} (answered: data)${s.origin.includes(' via ') ? ` via ${s.origin.split(' via ').slice(1).join(' via ')}` : ''}`; touched = true; }
      return true;
    });
    if (touched) changed.add(c.id);
    if (before && !c.sites.length) emptied.add(c.id);
    if (touched) c.confidence = c.sites.some((s) => s.confidence === 'high') ? 'high' : 'low';
  }
  return { changed, emptied };
}
