import { execFileSync } from 'node:child_process';
import { parse } from '@babel/parser';
import { walk } from './components.mjs';
import { applyAnnotations, resolveAnnotationTarget, staticPrivacyTreatment } from './patch.mjs';
import { spansFor } from './templates.mjs';

export function assertLabelRevision(source, revision) {
  const git = (...args) => execFileSync('git', ['--no-optional-locks', '-c', 'core.fsmonitor=false', '-C', source, ...args], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 16 * 1024 * 1024,
  }).trim();
  let head;
  try {
    head = git('rev-parse', 'HEAD');
  } catch {
    throw new Error('Benchmark source must be a Git checkout at the labelled commit.');
  }
  let labelled;
  if (/^[0-9a-f]{7,64}$/.test(revision) && head.startsWith(revision)) {
    try { labelled = git('rev-parse', '--verify', `${revision}^{commit}`); } catch { /* Missing or ambiguous revision. */ }
  }
  if (head !== labelled) throw new Error(`Benchmark source is at ${head.slice(0, 7)}, but the labels require ${revision}.`);
  if (git('ls-files', '-v', '-z').split('\0').some((entry) => /^[a-zS] /.test(entry))) {
    throw new Error('Benchmark source must have a complete checkout with no hidden tracked changes.');
  }
  if (git('status', '--porcelain', '--untracked-files=all', '--ignored')) {
    throw new Error('Benchmark source must have a clean working tree with no ignored files.');
  }
  return head;
}

const JSX = /\.(tsx|jsx|ts|js|mjs)$/;
const NATIVE = /^[a-z][a-z0-9]*$/;
const FIELD = /^(input|textarea|select)$/;
const native = (tag) => NATIVE.test(tag) && !/^(template|slot|script|style|component|teleport|suspense)$/.test(tag);

// A label can point to the rendered value and name its opening tag separately.
export function labelledElement(elements, label) {
  const targets = elements.filter(([line, , , tag, column]) => (
    line === (label.target_line ?? label.line)
    && (label.column == null || column + 1 === label.column)
    && (!label.tag || tag === label.tag)
  ));
  return targets.length === 1 ? targets[0] : null;
}

// Read only statically recognizable controls on actual JSX opening elements.
function jsxControls(file, source) {
  const ast = parse(source, { sourceType: 'unambiguous', plugins: /\.tsx?$/.test(file) ? ['jsx', 'typescript', 'decorators-legacy'] : ['jsx', 'decorators-legacy'] });
  const result = new Map();
  walk(ast, (node) => {
    if (node.type !== 'JSXOpeningElement' || node.attributes.some((a) => a.type === 'JSXSpreadAttribute')) return;
    const attrs = node.attributes.filter((a) => a.name?.name === 'className');
    if (attrs.length !== 1) return;
    const value = attrs[0].value;
    const expr = value?.expression || value;
    if (expr?.type === 'StringLiteral') {
      result.set(`${node.loc.start.line}:${node.loc.start.column}`, expr.value);
    }
  });
  return result;
}

// Quoted static attributes in a template. Stop at the end of the opening tag and
// consume quoted values whole so strings containing markup cannot become controls.
function templateControl(lines, [start, open, , tag, column]) {
  const text = lines.slice(start - 1, open).join('\n').slice(column + tag.length + 1);
  const attrs = /\s+([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/y;
  const values = [];
  while (true) {
    const at = attrs.lastIndex;
    if (/^\s*\/?>/.test(text.slice(at))) break;
    const match = attrs.exec(text);
    if (!match) return null;
    if (match[1] === 'class') values.push(match[2] ?? match[3]);
    if (/^(v-bind$|v-html$|\.\.\.|\{)/.test(match[1]) || match[1] === ':class' || match[1] === 'v-bind:class') return null;
  }
  return values.length === 1 ? values[0] : null;
}

const position = ([line, , , , column]) => `${line}:${column}`;
const encloses = (parent, child) => parent[5] < child[5] && child[6] <= parent[6];

function elementControls(file, source, elements, style) {
  if (style === 'data-privacy') {
    return elements.map((el) => native(el[3]) ? staticPrivacyTreatment(file, source, el) : null);
  }
  const lines = source.split('\n');
  const controls = JSX.test(file) ? jsxControls(file, source) : null;
  return elements.map((el) => {
    if (!native(el[3])) return null;
    const control = controls ? controls.get(position(el)) : templateControl(lines, el);
    const classes = (control || '').split(/\s+/);
    return ['block', 'mask'].find((value) => classes.includes(`rr-${value}`)) || null;
  });
}

// Project successful edits against the source. Count only unambiguous controls
// that the edits actually leave in the opening tag. This is source evidence.
export function measureTreatments({ file, source, labels, annotations, style, patchReady = true, editedSource }) {
  const original = spansFor(file, source);
  const proposed = annotations.filter((annotation) => annotation.file === file);
  const projection = patchReady && editedSource === undefined
    ? applyAnnotations(file, source, proposed, style)
    : null;
  const applied = projection?.effects || proposed;
  const edited = patchReady ? (editedSource ?? projection.text) : source;
  const updated = spansFor(file, edited);
  const unverified = (label) => ({ ...label, treatment: null, exact_treatment: null, placement: null, static: null, target_verified: false });
  const unavailable = () => ({ rows: labels.map(unverified), annotations: [] });
  let controls, prior;
  try {
    controls = elementControls(file, edited, updated, style);
    prior = elementControls(file, source, original, style);
  } catch {
    return unavailable();
  }
  // Match the same sequence of opening tags and line ranges after projection.
  if (!patchReady || original.length !== updated.length || original.some((el, i) => el.slice(0, 4).some((value, k) => value !== updated[i][k]))) {
    return unavailable();
  }
  const resolved = [];
  const placed = new Set();
  for (const a of applied) {
    const target = a.element || resolveAnnotationTarget(file, source, a);
    if (!target) continue;
    const index = original.findIndex((element) => element[5] === target[5]);
    const element = original[index];
    const value = controls[index];
    if (value && value !== prior[index] && !placed.has(element)) {
      resolved.push({ ...a, value, element });
      placed.add(element);
    }
  }
  const rows = labels.map((label) => {
    const target = labelledElement(original, label);
    if (!target || !native(target[3])) return unverified(label);
    const covers = (element) => (
      element === target || (
        encloses(element, target)
        && !original.some((other) => !native(other[3]) && encloses(element, other) && encloses(other, target))
      )
    );
    const covering = resolved.filter(({ element }) => covers(element));
    const placement = placed.has(target) ? 'exact' : (covering.length ? 'ancestor' : null);
    const mayContainInput = FIELD.test(target[3]) || original.some((other) =>
      encloses(target, other) && (FIELD.test(other[3]) || !native(other[3]))
    );
    const score = (values) => {
      if (label.category === 'public') return values.some(Boolean) ? 'over-treated' : null;
      if (values.includes('block')) return label.value === 'block' ? 'matched' : 'over-treated';
      if (values.includes('mask')) return label.value === 'mask' && !(style === 'rrweb' && mayContainInput) ? 'matched' : 'insufficient';
      return null;
    };
    const treatment = score(covering.map((a) => a.value));
    const staticCoverage = score(controls.filter((_, i) => covers(original[i])));
    const exactTreatment = placed.has(target) ? staticCoverage : null;
    return { ...label, treatment, exact_treatment: exactTreatment, placement, static: staticCoverage, target_verified: true, covering };
  });
  return { rows, annotations: resolved };
}
