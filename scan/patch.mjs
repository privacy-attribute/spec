// Places annotations on parsed source elements and builds the unified diff.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseExpression } from '@babel/parser';
import { isSecretOrigin, SECRET_NAME } from './components.mjs';
import { spansFor } from './templates.mjs';

export const RRWEB_CLASS = { mask: 'rr-mask', block: 'rr-block', ignore: 'rr-ignore' };

const JSX_FILE = /\.(tsx|jsx|ts|js|mjs)$/;
const FIELD = /^(input|textarea)$/;
export const isNativeTag = (tag) => /^[a-z][a-z0-9]*$/.test(tag) && !/^(template|slot|script|style|component|teleport|suspense|head|meta|title)$/.test(tag);

const lineOffset = (lines, line) => lines.slice(0, line - 1).reduce((n, value) => n + value.length + 1, 0);
const contains = (element, offset) => element[5] <= offset && offset < element[6];

// Edits must identify one exact occurrence on the recorded line.
export function findNear(lines, line, text) {
  const value = lines[line - 1];
  if (!text || value === undefined) return undefined;
  const at = value.indexOf(text);
  return at >= 0 && value.indexOf(text, at + 1) < 0 ? line - 1 : undefined;
}

function editPosition(lines, a, target) {
  const value = lines[a.line - 1];
  const from = a.edit?.from;
  if (!from || typeof from !== 'string' || value === undefined) return null;
  const offset = lineOffset(lines, a.line);
  let match = null;
  for (let at = value.indexOf(from); at >= 0; at = value.indexOf(from, at + 1)) {
    if (offset + at < target[5] || offset + at + from.length > target[7]) continue;
    if (match !== null) return null;
    match = offset + at;
  }
  return match;
}

function targetIn(elements, lines, a) {
  if (!Number.isInteger(a.line) || a.line < 1 || !/^<[A-Za-z][\w.:-]*$/.test(a.match)) return null;
  const choices = elements.filter(([start, open, , tag, column]) => (
    (a.edit ? a.line >= start && a.line <= open : a.line === start)
    && `<${tag}` === a.match && (a.column == null || column === a.column)
  ));
  if (choices.length === 1) return choices[0];
  if (!a.edit || a.column != null) return null;
  const located = choices.filter((target) => editPosition(lines, a, target) != null);
  return located.length === 1 ? located[0] : null;
}

export function resolveAnnotationTarget(file, source, annotation) {
  return targetIn(spansFor(file, source), source.split('\n'), annotation);
}

// Read an expression container or a quoted attribute value in a template tag.
function templateValue(tag, start) {
  const quote = tag[start];
  if (quote === '"' || quote === "'") {
    const end = tag.indexOf(quote, start + 1);
    return end < 0 ? null : { end: end + 1, value: tag.slice(start + 1, end), offset: start + 1, valueEnd: end, quoted: true };
  }
  if (quote === '{') {
    let depth = 0;
    let string = null;
    for (let i = start; i < tag.length; i++) {
      const ch = tag[i];
      if (string) {
        if (ch === '\\') i++;
        else if (ch === string) string = null;
      } else if (ch === '"' || ch === "'" || ch === '`') string = ch;
      else if (ch === '{') depth++;
      else if (ch === '}' && --depth === 0) return { end: i + 1, expression: tag.slice(start + 1, i) };
    }
    return null;
  }
  const value = tag.slice(start).match(/^[^\t\n\f\r >"'<=`]+/)?.[0];
  return value ? { end: start + value.length, value, offset: start, valueEnd: start + value.length } : null;
}

function templateAttributes(tag, tagName) {
  const attrs = [];
  let i = tagName.length + 1;
  while (i < tag.length) {
    const spaces = tag.slice(i).match(/^[\t\n\f\r ]*/)[0].length;
    i += spaces;
    if (/^\/?>$/.test(tag.slice(i))) return attrs;
    if (!spaces) return null;
    const start = i;
    if (tag[i] === '{') {
      const binding = templateValue(tag, i);
      if (!binding) return null;
      i = binding.end;
      attrs.push({ name: '', raw: tag.slice(start, i), spread: true });
      continue;
    }
    const name = tag.slice(i).match(/^[^\t\n\f\r =/>"'{}<]+/)?.[0];
    if (!name) return null;
    i += name.length;
    const assignment = tag.slice(i).match(/^[\t\n\f\r ]*=[\t\n\f\r ]*/);
    if (!assignment) {
      attrs.push({ name, raw: name, start });
      continue;
    }
    i += assignment[0].length;
    const parsed = templateValue(tag, i);
    if (!parsed) return null;
    i = parsed.end;
    attrs.push({ name, raw: tag.slice(start, i), start, ...parsed });
  }
  return null;
}

function jsxAttributes(file, tag) {
  // Parsing the complete opening tag as a self-closing element preserves JSX
  // attribute syntax, including quoted markup, regex literals and generics.
  const opening = tag.endsWith('/>') ? tag : `${tag.slice(0, -1)}/>`;
  const plugins = /\.tsx?$/.test(file) ? ['jsx', 'typescript'] : ['jsx'];
  try {
    const node = parseExpression(opening, { plugins });
    return node.openingElement.attributes.map((attr) => {
      const raw = tag.slice(attr.start, attr.end);
      if (attr.type === 'JSXSpreadAttribute') return { name: '', raw, spread: true };
      const name = tag.slice(attr.name.start, attr.name.end);
      const value = attr.value;
      const expression = value?.expression || value;
      const literal = expression?.type === 'StringLiteral' ? expression.value
        : expression?.type === 'TemplateLiteral' && !expression.expressions.length ? expression.quasis[0].value.cooked : null;
      return {
        name, raw, expression, start: attr.start,
        ...(typeof literal === 'string' ? { value: literal, offset: expression.start + 1, valueEnd: expression.end - 1, quoted: true } : {}),
      };
    });
  } catch {
    return null;
  }
}

function attributes(file, text, target) {
  const tag = text.slice(target[5], target[7]);
  return JSX_FILE.test(file) ? jsxAttributes(file, tag) : templateAttributes(tag, target[3]);
}

const CLASS_HELPER = /^(cn|clsx|classNames|classnames|twMerge|cx|tw)$/;
const CLASS_BINDING = /^(?:class|className|:class|v-bind:class|\[class\]|\[className\]|\[ngClass\]|class:.*|@class)$/;
const PRIVACY_BINDING = /^(?:(?::|v-bind:|bind:|x-bind:|\.)data-privacy|\[(?:attr\.)?data-privacy\])$/i;
const OVERRIDE = /^(?:(?:v-bind|x-bind)$|(?:v-bind:|x-bind:|:)\[|@props\b)/i;
const asciiTokens = (text) => text?.split(/[\t\n\f\r ]+/) || [];

function classExpression(attr) {
  if (typeof attr?.expression !== 'string') return attr?.expression;
  try { return parseExpression(attr.expression, { plugins: ['typescript'] }); }
  catch { return null; }
}

function fixedClass(file, attr) {
  if (!attr) return [];
  if (typeof attr.value === 'string' && (!file.endsWith('.svelte') || !attr.value.includes('{'))) return asciiTokens(attr.value);
  const expression = classExpression(attr);
  if (expression?.type === 'TemplateLiteral') {
    // Interpolation can change the last token unless a whitespace boundary
    // separates it from the literal prefix.
    const prefix = expression.quasis[0].value.cooked;
    if (prefix != null) return asciiTokens(expression.expressions.length ? prefix.replace(/[^\t\n\f\r ]+$/, '') : prefix);
  }
  if (expression?.type === 'StringLiteral') return asciiTokens(expression.value);
  if (expression?.type === 'CallExpression' && expression.callee.type === 'Identifier' && CLASS_HELPER.test(expression.callee.name) && expression.arguments[0]?.type === 'StringLiteral') {
    return asciiTokens(expression.arguments[0].value);
  }
  if (file.endsWith('.svelte') && attr.value?.includes('{')) return asciiTokens(attr.value.split('{')[0].replace(/[^\t\n\f\r ]+$/, ''));
  return [];
}

const expressionShape = (node) => JSON.stringify(node, (key, value) => /^(start|end|loc|extra|comments|leadingComments|innerComments|trailingComments)$/.test(key) ? undefined : value);
const sameExpression = (left, right) => expressionShape(left) === expressionShape(right);
const staticExpression = (node) => !node || node.type === 'StringLiteral' || (node.type === 'TemplateLiteral' && !node.expressions.length);
const ordinaryClasses = (value) => asciiTokens(value).filter((token) => token && !Object.values(RRWEB_CLASS).includes(token));

// Keep the dynamic class logic when an edit adds a fixed class. Accept a
// literal prefix or a literal argument to the same class-merging helper.
function retainsClassExpression(file, prior, next) {
  const before = classExpression(prior);
  const after = classExpression(next);
  if (file.endsWith('.svelte') && prior?.value?.includes('{')) {
    return JSON.stringify(ordinaryClasses(prior.value)) === JSON.stringify(ordinaryClasses(next?.value));
  }
  if (staticExpression(before)) return staticExpression(after);
  if (sameExpression(before, after)) return true;
  if (after?.type === 'TemplateLiteral') {
    if (before.type === 'TemplateLiteral' && sameExpression(before.expressions, after.expressions)) return true;
    if (after.expressions.length !== 1) return false;
    const [added] = after.expressions;
    return sameExpression(before, added) || (added.type === 'LogicalExpression' && added.operator === '??' && added.right.type === 'StringLiteral' && added.right.value === '' && sameExpression(before, added.left));
  }
  if (before.type !== 'CallExpression' || after?.type !== 'CallExpression' || !sameExpression(before.callee, after.callee)) return false;
  const [oldLiteral, ...oldRest] = before.arguments;
  const [newLiteral, ...newRest] = after.arguments;
  if (newLiteral?.type !== 'StringLiteral') return false;
  const addedClasses = ordinaryClasses(newLiteral.value);
  return (!addedClasses.length && sameExpression(before.arguments, newRest)) || (
    oldLiteral?.type === 'StringLiteral' && JSON.stringify(ordinaryClasses(oldLiteral.value)) === JSON.stringify(addedClasses) && sameExpression(oldRest, newRest)
  );
}

// Decode the HTML references that can affect ASCII treatment tokens or their
// boundaries. Keep raw spelling for edits. Babel already decodes JSX literals.
function templatePrivacyValue(value) {
  return value.replace(/&#(?:[xX]([0-9a-fA-F]+)|([0-9]+));?|&(Tab|NewLine);/g, (reference, hex, decimal, named) => {
    if (named) return named === 'Tab' ? '\t' : '\n';
    const code = hex ? Number.parseInt(hex, 16) : Number(decimal);
    return code < 128 ? String.fromCharCode(code) : reference;
  });
}

function control(file, attrs, style) {
  if (!attrs) return { error: 'opening tag attributes could not be verified' };
  const jsx = JSX_FILE.test(file);
  const key = style === 'rrweb' ? (jsx ? 'className' : 'class') : 'data-privacy';
  const names = (name) => jsx ? name : name.toLowerCase();
  const direct = attrs.filter((attr) => names(attr.name) === key);
  if (direct.length > 1 || (style === 'data-privacy' && attrs.some(({ name }) => jsx && name !== key && name.toLowerCase() === key))) {
    return { key, error: `duplicate or ambiguous ${key} attributes need explicit review` };
  }
  if (attrs.some(({ name, spread }) => spread || OVERRIDE.test(name) || (style === 'data-privacy' && PRIVACY_BINDING.test(name)))) {
    return { key, error: 'attribute spread or binding needs explicit review because it can override privacy controls' };
  }
  const attr = direct[0];
  if (style === 'data-privacy') {
    const literal = typeof attr?.value === 'string' && (jsx || (
      !attr.value.includes('{') && (!file.endsWith('.blade.php') || !/<\?|@[A-Za-z_]/.test(attr.value))
    ));
    const bare = attr && !attr.expression && !attr.raw.includes('=');
    if (!literal && !bare) return { key, attr, values: [] };
    const value = literal && !jsx ? templatePrivacyValue(attr.value) : attr.value;
    return { key, attr, values: [asciiTokens(value).includes('block') ? 'block' : 'mask'] };
  }
  const tokens = fixedClass(file, attr);
  if (attrs.some(({ name }) => /^\[(?:attr\.class|class|className|ngClass)\]$|^(?:x-)?bind:class$/.test(name) || (!file.endsWith('.vue') && name === ':class') || (jsx && name === 'class'))) {
    return { key, error: 'the class is a binding or expression: give an edit that adds the class' };
  }
  return {
    key, attr,
    values: Object.entries(RRWEB_CLASS).filter(([, token]) => tokens.includes(token) && !attrs.some(({ name }) => name === `class:${token}`)).map(([value]) => value),
  };
}

const meets = (values, requested) => values.includes('block') || values.includes(requested);
const effective = (values) => ['block', 'mask', 'ignore'].find((value) => values.includes(value));
const sameElementShape = (before, after) => before.length === after.length && before.every((el, i) => el.slice(0, 4).every((value, k) => value === after[i][k]));
const splice = (text, start, end, value) => text.slice(0, start) + value + text.slice(end);

export function staticPrivacyTreatment(file, source, target) {
  return control(file, attributes(file, source, target), 'data-privacy').values?.[0] ?? null;
}

function upgradePrivacy(source, start, attr) {
  if (attr.offset === undefined) {
    const end = start + attr.start + attr.raw.length;
    return splice(source, end, end, '="block"');
  }
  const from = start + attr.offset;
  const to = start + attr.valueEnd;
  const raw = source.slice(from, to);
  const replaced = raw === attr.value ? raw.replace(/(^|[\t\n\f\r ])mask(?=$|[\t\n\f\r ])/u, '$1block') : raw;
  const next = replaced !== raw ? replaced : raw ? `block ${raw}` : 'block';
  return splice(source, from, to, attr.quoted || replaced !== raw ? next : `"${next}"`);
}

function applyToTarget(file, source, elements, target, a, style, inventory) {
  if (!['rrweb', 'data-privacy'].includes(style)) return { reason: 'unknown annotation style' };
  if (!['mask', 'block', 'ignore', 'unmask'].includes(a.value)) return { reason: 'unknown annotation value' };
  if (a.category === 'secret' && a.value !== 'block') return { reason: 'secrets require block' };
  if (style === 'rrweb' && !RRWEB_CLASS[a.value]) return { reason: 'rrweb has no class for this value (rrweb has no unmask)' };
  if (style === 'data-privacy' && !['mask', 'block'].includes(a.value)) return { reason: 'data-privacy supports mask and block' };
  if (!target) return { reason: `"${a.match}" not found uniquely on line ${a.line} as a complete element` };
  const priorAttrs = attributes(file, source, target);
  if (!priorAttrs) return { reason: 'opening tag attributes could not be verified' };
  const prior = control(file, priorAttrs, style);
  if (prior.error) return { reason: prior.error };
  const insertAt = target[5] + a.match.length;
  let updated;
  let replacementEnd;
  if (a.edit) {
    const at = editPosition(source.split('\n'), a, target);
    if (at == null) return { reason: `edit text not found uniquely inside the target opening tag on line ${a.line}` };
    const end = at + a.edit.from.length;
    if (typeof a.edit.to !== 'string' || /[\r\n]/.test(a.edit.to)) return { reason: 'edit replacement must stay on the recorded line' };
    if (elements.some((el) => target[5] < el[5] && at < el[6] && el[5] < end)) return { reason: 'edit must stay inside one target opening tag' };
    updated = splice(source, at, end, a.edit.to);
    replacementEnd = at + a.edit.to.length;
  } else if (meets(prior.values, a.value)) {
    return { text: source, elements };
  } else if (style === 'data-privacy') {
    if (prior.attr && !prior.values.length) return { reason: 'tag already has data-privacy; review the existing protection' };
    updated = prior.attr ? upgradePrivacy(source, target[5], prior.attr)
      : splice(source, insertAt, insertAt, ` data-privacy="${a.value}"`);
  } else {
    const cls = RRWEB_CLASS[a.value];
    if (prior.attr?.quoted && typeof prior.attr.value === 'string') {
      const at = target[5] + prior.attr.offset;
      updated = splice(source, at, at, `${cls} `);
    } else if (prior.attr || priorAttrs.some(({ name }) => CLASS_BINDING.test(name))) {
      return { reason: 'the class is a binding or expression: give an edit that adds the class' };
    } else {
      updated = splice(source, insertAt, insertAt, ` ${prior.key}="${cls}"`);
    }
  }
  const nextElements = inventory(file, updated);
  const index = elements.indexOf(target);
  if (!sameElementShape(elements, nextElements) || nextElements[index][5] !== target[5]) return { reason: 'patched source could not be verified as the same elements' };
  if (a.edit && replacementEnd > nextElements[index][7]) return { reason: 'edit replacement must stay inside the target opening tag' };
  const nextAttrs = attributes(file, updated, nextElements[index]);
  if (!nextAttrs) return { reason: 'patched opening tag attributes could not be verified' };
  const next = control(file, nextAttrs, style);
  if (next.error) return { reason: next.error };
  const otherAttrs = (attrs) => attrs.filter(({ name }) => (JSX_FILE.test(file) ? name : name.toLowerCase()) !== prior.key).map(({ raw }) => raw);
  if (JSON.stringify(otherAttrs(priorAttrs)) !== JSON.stringify(otherAttrs(nextAttrs))) return { reason: 'edit changes attributes unrelated to the requested privacy control' };
  if (!prior.values.every((value) => meets(next.values, value))) return { reason: 'edit weakens existing privacy protection' };
  if (!meets(next.values, a.value)) return { reason: 'edit does not establish the requested annotation on one element' };
  if (a.edit && style === 'data-privacy' && prior.attr && !prior.values.length && a.value !== 'block') return { reason: 'edit may weaken existing dynamic privacy protection' };
  if (a.edit && style === 'rrweb' && !retainsClassExpression(file, prior.attr, next.attr)) return { reason: 'edit changes existing dynamic class logic' };
  if (a.edit && meets(prior.values, a.value) && !next.values.some((value) => !prior.values.includes(value))) return { reason: 'edit does not establish new privacy protection on the target' };
  return { text: updated, elements: nextElements };
}

// The public single-annotation helper also accepts isolated opening tags used
// by callers to preview formatting. Batch patching requires full source spans.
function previewElements(file, source) {
  const elements = spansFor(file, source);
  if (elements.length) return elements;
  const tag = source.match(/^\s*<([A-Za-z][\w.:-]*)(?=\s|\/?>)/);
  if (!tag || !source.trimEnd().endsWith('>')) return [];
  const start = tag[0].indexOf('<');
  const lines = source.slice(0, start).split('\n');
  const end = source.trimEnd().length;
  const span = [lines.length, source.slice(0, end).split('\n').length, source.slice(0, end).split('\n').length, tag[1], lines.at(-1).length, start, end, end];
  return attributes(file, source, span) ? [span] : [];
}

export function applyAnnotation(lines, a, style) {
  const source = lines.join('\n');
  const elements = previewElements(a.file, source);
  const target = targetIn(elements, lines, a);
  const result = applyToTarget(a.file, source, elements, target, a, style, previewElements);
  if (result.reason) return result.reason;
  if (result.text !== source) lines.splice(0, lines.length, ...result.text.split('\n'));
  return null;
}

export function applyAnnotations(file, before, annotations, style) {
  const original = spansFor(file, before);
  const lines = before.split('\n');
  const failed = [];
  const applied = [];
  let elements = original;
  let text = before;
  for (const a of annotations) {
    const target = targetIn(original, lines, a);
    const index = original.indexOf(target);
    const result = applyToTarget(file, text, elements, elements[index], a, style, spansFor);
    if (result.reason) {
      failed.push({ ...a, reason: result.reason });
      continue;
    }
    text = result.text;
    elements = result.elements;
    applied.push({ annotation: a, index });
  }
  const effects = [];
  for (const { annotation, index } of applied) {
    const final = control(file, attributes(file, text, elements[index]), style);
    if (!final.error && meets(final.values, annotation.value)) effects.push({ ...annotation, file, value: effective(final.values), element: original[index] });
    else failed.push({ ...annotation, reason: 'final source does not retain the requested privacy control' });
  }
  return { text, failed, effects };
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
    const r = spawnSync('git', ['diff', '--no-index', '--no-color', '--no-ext-diff', '--no-textconv', '--src-prefix=', '--dst-prefix=', `a/${posix}`, `b/${posix}`], { cwd: tmp, encoding: 'utf8' });
    if (r.error) throw new Error(`git is needed to build the patch: ${r.error.message}`);
    if (r.status !== 0 && r.status !== 1) throw new Error(`git could not build the patch for ${posix}`);
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

// Elements passed in by the parent (children, a trigger button) are checked where they are made.
const NODE_EXPR = /^(props\.)?(children|trigger|icon|actions?)$/;

// Check each rendered value against its original element bounds. A component
// name and a nearby annotation do not establish a protected DOM destination.
// Line dismissals record an explicit review decision for unresolved values.
export function uncoveredSites(scan, decisions, spans) {
  const annotations = decisions.annotations || [];
  const dismissed = decisions.dismissed || {};
  const rrweb = (scan.annotate || (scan.sdk === 'rrweb' ? 'rrweb' : 'data-privacy')) === 'rrweb';
  const annotatedIds = new Set(annotations.flatMap((a) => a.candidates || []));
  const byFile = new Map();
  for (const a of annotations) {
    if (!byFile.has(a.file)) byFile.set(a.file, []);
    const els = a.element ? [a.element] : spans(a.file).filter(([s, open, , tag, column]) => (a.edit ? a.line >= s && a.line <= open : a.line === s)
      && (!a.match || `<${tag}` === a.match) && (a.column == null || a.column === column));
    if (els.length === 1 && (!els[0][3] || isNativeTag(els[0][3]))) byFile.get(a.file).push({ element: els[0], value: a.value });
  }
  const out = [];
  for (const c of scan.candidates) {
    if (!c.sites || c.cached) continue;
    const annotated = annotatedIds.has(c.id);
    const ranges = byFile.get(c.file) || [];
    const lines = new Set();
    const elements = spans(c.file);
    for (const site of c.sites) {
      const secret = site.category === 'secret' || isSecretOrigin(site.origin) || SECRET_NAME.test(`${site.origin} ${site.expr}`);
      if (typeof dismissed[`${c.id}:L${site.line}`] === 'string' && dismissed[`${c.id}:L${site.line}`].trim()) continue;
      if (!secret && site.kind === 'text' && NODE_EXPR.test(site.expr)) continue;
      if (site.kind === 'url') { lines.add(site.line); continue; }
      const positioned = site.element != null || site.offset != null;
      const owner = site.element != null ? elements.find((el) => el[5] === site.element)
        : site.offset != null ? elements.filter((el) => contains(el, site.offset)).sort((a, b) => b[5] - a[5])[0] : null;
      if (positioned && (!owner || (site.offset != null && !contains(owner, site.offset)))) { lines.add(site.line); continue; }
      const inputValue = (site.kind === 'input special' || /^attr (value|defaultValue)$/.test(site.kind)) && FIELD.test(owner?.[3] || site.tag);
      // A suggested rrweb configuration does not establish input masking.
      const needsBlock = secret || /^(choice|condition|html)$/.test(site.kind) || (rrweb && inputValue) || (/^attr (?!text$)/.test(site.kind) && !inputValue);
      if (ranges.some(({ element, value }) => {
        if (value !== 'block' && (needsBlock || value !== 'mask')) return false;
        if (owner && element[5] != null) {
          if (!(element[5] <= owner[5] && owner[6] <= element[6])) return false;
          // Portals and components can render outside their source parent.
          return !elements.some((el) => el[5] >= element[5] && el[5] <= owner[5] && el[6] >= owner[6] && !isNativeTag(el[3]));
        }
        // Legacy line-only plans require strict interior containment, or one
        // opening element on the line. The final line may contain a sibling.
        const [start, , end] = element;
        const sameLine = elements.filter(([s]) => s === site.line);
        return (site.line > start && site.line < end) || (sameLine.length <= 1 && site.line === start && (site.tag === element[3] || !element[3]));
      })) continue;
      lines.add(site.line);
    }
    if (lines.size) out.push({ id: c.id, file: c.file, component: c.component, lines: [...lines].sort((x, y) => x - y), dismissed: !annotated });
  }
  return out;
}
