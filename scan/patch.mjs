// Places annotations in source lines and builds the unified diff. Pure functions on arrays of
// lines, so the placement rules can be tested without a scan session.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const RRWEB_CLASS = { mask: 'rr-mask', block: 'rr-block', ignore: 'rr-ignore' };

const JSX_FILE = /\.(tsx|jsx|ts|js|mjs)$/;
// A static class value: class="a", className='a', className={"a"}, className={`a`}. The attribute
// must not be a framework binding (Vue :class or v-bind:class, Angular [class]).
const STATIC_CLASS = /(^|[\s<])(className|class)=(\{\s*)?(["'`])/;
const BOUND_CLASS = /(^|[\s<])(className|class)=\{|(^|\s)(:class|v-bind:class|\[class\]|\[className\]|\[ngClass\])=/;

// The index of the first line within three lines of `line` (1-based) that contains `text`.
export function findNear(lines, line, text) {
  return [0, 1, -1, 2, -2, 3, -3].map((d) => line - 1 + d).filter((i) => i >= 0 && i < lines.length).find((k) => lines[k].includes(text));
}

// Adds an rrweb class to the tag that starts at lines[i]. Returns null on success, or the reason.
export function addClass(lines, i, match, cls, jsx) {
  if (!cls) return 'rrweb has no class for this value (rrweb has no unmask): restructure, or use an edit';
  for (let k = i; k < Math.min(lines.length, i + 12); k++) {
    const from = k === i ? lines[k].indexOf(match) + match.length : 0;
    const line = lines[k];
    const rest = line.slice(from);
    // An existing rrweb class: keep it when it is the same, replace it when the scan asks for another.
    const existing = rest.match(/\b(rr-block|rr-mask|rr-ignore)\b/);
    if (existing) {
      if (existing[1] !== cls) lines[k] = line.slice(0, from) + rest.replace(existing[1], cls);
      return null;
    }
    const stat = rest.match(STATIC_CLASS);
    if (stat) {
      const q = from + stat.index + stat[0].length;
      lines[k] = `${line.slice(0, q)}${cls} ${line.slice(q)}`;
      return null;
    }
    if (BOUND_CLASS.test(rest)) return 'the class is a binding or expression: give an edit that adds the class';
    // The tag ends on this line: add a new attribute after the tag name.
    if (/(^|[^=])>/.test(rest) || (k > i && /^\s*\/?>/.test(line))) break;
  }
  const at = lines[i].indexOf(match) + match.length;
  lines[i] = `${lines[i].slice(0, at)} ${jsx ? 'className' : 'class'}="${cls}"${lines[i].slice(at)}`;
  return null;
}

// Applies one annotation to the lines of its file. Returns null on success, or the reason.
export function applyAnnotation(lines, a, style) {
  if (a.edit) {
    const i = findNear(lines, a.line, a.edit.from);
    if (i === undefined) return `edit text "${a.edit.from}" not found near line ${a.line}`;
    lines[i] = lines[i].replace(a.edit.from, a.edit.to);
    return null;
  }
  const i = findNear(lines, a.line, a.match);
  if (i === undefined) return `"${a.match}" not found near line ${a.line}`;
  if (style === 'data-privacy') {
    if (/data-privacy=/.test(lines[i])) return 'line already has data-privacy';
    const at = lines[i].indexOf(a.match) + a.match.length;
    lines[i] = `${lines[i].slice(0, at)} data-privacy="${a.value}"${lines[i].slice(at)}`;
    return null;
  }
  return addClass(lines, i, a.match, RRWEB_CLASS[a.value], JSX_FILE.test(a.file));
}

// A unified diff for one file, with forward-slash paths relative to the repository root.
export function unifiedDiff(rel, before, after) {
  const posix = rel.split(path.sep).join('/');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'privacy-scan-'));
  try {
    for (const [side, text] of [['a', before], ['b', after]]) {
      const file = path.join(tmp, side, ...posix.split('/'));
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, text);
    }
    const r = spawnSync('git', ['diff', '--no-index', '--no-color', '--src-prefix=', '--dst-prefix=', `a/${posix}`, `b/${posix}`], { cwd: tmp, encoding: 'utf8' });
    if (r.error) throw new Error(`git is needed to build the patch: ${r.error.message}`);
    return r.stdout;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// Annotations inside a shared component that gets its private data only from some of its parents
// also cover the uses that show public content. Returns one warning for each such annotation
// when at least two uses, and at least a quarter of all uses, are public.
export function overMaskWarnings(scan, annotations) {
  const index = scan.component_index || {};
  const usage = scan.component_usage || {};
  const warnings = [];
  for (const a of annotations) {
    // A secret is private at every use, so a shared secret field is never over-masked.
    if (a.accept_shared || a.auto || a.category === 'secret') continue;
    const enclosing = (index[a.file] || [])
      .filter(([, start, end]) => a.line >= start && a.line <= end)
      .sort((x, y) => (x[2] - x[1]) - (y[2] - y[1]))[0];
    if (!enclosing) continue;
    const [name, , , ownData] = enclosing;
    const [uses = 0, tainted = 0, at = []] = usage[name] || [];
    const publicUses = uses - tainted;
    if (ownData || publicUses < 2 || publicUses < uses / 4) continue;
    warnings.push({
      file: a.file,
      line: a.line,
      component: name,
      uses,
      private_uses: tainted,
      private_at: at.filter((u) => u[2]).map(([f, l]) => `${f}:${l}`),
      public_at: at.filter((u) => !u[2]).map(([f, l]) => `${f}:${l}`),
      message: `<${name}> is used ${uses} times and gets private data in ${tainted} of them (${at.filter((u) => u[2]).slice(0, 8).map(([f, l]) => `${f}:${l}`).join(', ')}): annotate at those uses, or set accept_shared with a reason`,
    });
  }
  return warnings;
}

const SECRET_SITE = /secret name|token|secret|password|apiKey|api_key/i;
const ID_EXPR = /(\.id|Id|_id|\.length|Count)$/;
// Elements passed in by the parent (children, a trigger button) are checked where they are made.
const NODE_EXPR = /^(props\.)?(children|trigger|icon|actions?)$/;

// Lines where a unit puts data in the page (text and attributes) that no annotation covers: no
// annotated element contains the line. Data passed to a child component is checked in the child. Checked for
// annotated and dismissed units alike: a reason for a whole unit can be wrong for one of its lines.
// Data attributes and ids are skipped in dismissed units. `spans(file)` returns the element spans of a
// file (elementSpans); `dismissed` may hold "C12:L40" keys that accept a line.
export function uncoveredSites(scan, decisions, spans) {
  const annotations = decisions.annotations || [];
  const dismissed = decisions.dismissed || {};
  const annotatedIds = new Set(annotations.flatMap((a) => a.candidates || []));
  const byFile = new Map();
  for (const a of annotations) {
    if (!byFile.has(a.file)) byFile.set(a.file, []);
    const els = spans(a.file).filter(([s, open]) => a.line >= s && a.line <= open).sort((x, y) => (x[2] - x[0]) - (y[2] - y[0]));
    byFile.get(a.file).push(els[0] ? [els[0][0], els[0][2]] : [a.line - 1, a.line + 1]);
  }
  const out = [];
  for (const c of scan.candidates) {
    if (!c.sites || c.cached || c.settled) continue;
    const annotated = annotatedIds.has(c.id);
    if (!annotated && !(c.id in dismissed)) continue;
    const ranges = byFile.get(c.file) || [];
    const lines = new Set();
    for (const site of c.sites) {
      // Data passed to a child component is checked where the child renders it.
      if (/^prop /.test(site.kind)) continue;
      if (NODE_EXPR.test(site.expr)) continue;
      // With rrweb, maskAllInputs masks input values.
      if (scan.sdk === 'rrweb' && /^attr (value|defaultValue)$/.test(site.kind) && /^(input|textarea|select|Input|Textarea|TextArea|Select|PasswordInput|PinInput\w*|InputOTP\w*)$/.test(site.tag.split('.').pop())) continue;
      if (!annotated && !SECRET_SITE.test(`${site.origin} ${site.expr}`) && (/^attr data-/.test(site.kind) || ID_EXPR.test(site.expr))) continue;
      if (`${c.id}:L${site.line}` in dismissed) continue;
      if (ranges.some(([s, e]) => site.line >= s && site.line <= e)) continue;
      lines.add(site.line);
    }
    if (lines.size) out.push({ id: c.id, file: c.file, component: c.component, lines: [...lines].sort((x, y) => x - y), dismissed: !annotated });
  }
  return out;
}
