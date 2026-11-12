// Stage 5, decide and place: turns the high-confidence sites of each unit into annotations on the
// element that shows the value, without a model. A site with low confidence, or one that cannot be
// placed safely, stays for review. Rules:
// - Secrets get block. A value in an attribute (title, alt, href, src, aria-label, data-*) gets block,
//   because recorders do not mask attributes. Text gets mask.
// - Personal native input values can use the recorder's input masking (rrweb maskAllInputs).
// - Component props remain for review when the scanner cannot prove where the component renders
//   the value or whether it forwards the privacy control.
// - A translation wrapper (<Trans>) is not an element; its parent element is annotated.
import fs from 'node:fs';
import path from 'node:path';
import { spansFor } from './templates.mjs';
import { componentUsageKey, isSpecialOrigin, originCategory } from './components.mjs';
import { applyAnnotation } from './patch.mjs';

// Text fields whose value rrweb's maskAllInputs masks. A component Select (Radix, Headless UI) shows its
// value in a trigger element instead, so it is not one of them.
const INPUT_TAG = /^(input|textarea|select)$/;
// Roots that render no element of their own; their value shows in a trigger or value element inside.
const ROOT_WITH_TRIGGER = /^(Select|Combobox|MultiSelect\w*|Popover|DropdownMenu|Command|Listbox|RadioGroup)$/;
const NOT_AN_ELEMENT = /^(Trans|Plural|Select\.Value|FormattedMessage|T|Fragment|React\.Fragment|template|slot|i18n-t|Translate|Suspense|Show|For|Match|Switch)$/;
const COMPONENT_TAG = /^(?:[A-Z]|.*-)/;

// A shared component with both private and public callers needs review of the private call sites.
const sharedWithPublic = (usage, unit) => {
  const u = usage[componentUsageKey(unit.file, unit.component)];
  return Boolean(u && u[0] > u[1]);
};

function siteCategory(site) {
  return site.category || originCategory(site.origin);
}

// The element that owns the value in the original source.
export function elementAt(spans, site, inStartTag = /^(prop|attr) /.test(site.kind)) {
  let owner;
  if (site.element != null) owner = spans.find((el) => el[5] === site.element);
  else if (site.offset != null) {
    owner = spans.filter((el) => el[5] <= site.offset && site.offset < el[inStartTag ? 7 : 6])
      .sort((a, b) => b[5] - a[5])[0];
  } else {
    // Older plans only have a line and a tag. Require a single possible owner.
    const holds = spans.filter(([start, open, end, tag]) => site.tag === tag && site.line >= start && site.line <= (inStartTag ? open : end));
    if (holds.length === 1) owner = holds[0];
  }
  while (owner && NOT_AN_ELEMENT.test(owner[3])) {
    const inner = owner;
    owner = spans.filter((el) => el[5] < inner[5] && el[6] >= inner[6]).sort((a, b) => b[5] - a[5])[0];
  }
  return owner;
}

// The class edit for an element whose class is an expression, or null when there is a static class or
// none (the patch command adds the class then), or 'review' when no safe edit exists.
function classEdit(text, el, cls, jsx) {
  const [start, , , tag, , fromOffset, , openOffset] = el;
  const tagText = text.slice(fromOffset, openOffset);
  const lines = tagText.split('\n');
  if (jsx) {
    const m = tagText.match(/\bclassName=\{/);
    if (!m) return null;
    // className={expr} on one line: wrap the expression in a template string.
    for (let k = 0; k < lines.length; k++) {
      const at = lines[k].indexOf('className={');
      if (at < 0) continue;
      let depth = 0;
      for (let j = at + 10; j < lines[k].length; j++) {
        if (lines[k][j] === '{') depth++;
        else if (lines[k][j] === '}' && --depth === 0) {
          const from = lines[k].slice(at, j + 1);
          const expr = from.slice(11, -1);
          if (/^\s*["'`]/.test(expr)) return null; // className={"a"} is static
          return { line: start + k, from, to: `className={\`${cls} \${${expr} ?? ''}\`}` };
        }
      }
      // className={cn(\n ... )} over several lines: add the class as the first argument.
      const call = lines[k].slice(at).match(/^className=\{(cn|clsx|classNames|classnames|twMerge|cx|tw)\(/);
      // At the end of the line, the next argument is on the next line: no trailing space.
      if (call) return { line: start + k, from: call[0], to: `${call[0]}'${cls}',${lines[k].slice(at + call[0].length).trim() ? ' ' : ''}` };
      return 'review';
    }
    return 'review';
  }
  // Vue and Svelte merge a static class with a bound one: add class="..." after the tag name.
  if (/(^|\s)(:class|v-bind:class|class:[\w-]+)=/.test(tagText) && !/(^|\s)class="/.test(tagText)) {
    return { line: start, from: `<${tag}`, to: `<${tag} class="${cls}"` };
  }
  return null;
}

// Returns { annotations, placed: Map(unit id -> number of annotations), review: Map(unit id -> lines) }.
export function placeAnnotations(scan, root, { sdk = null, annotate = 'rrweb' } = {}) {
  const usage = scan.component_usage || {};
  const units = scan.candidates.filter((c) => c.sites && !c.cached);
  const byElement = new Map();
  const review = new Map();
  const touched = new Map();
  const fileCache = new Map();
  const load = (file) => {
    if (!fileCache.has(file)) {
      const text = fs.readFileSync(path.join(root, file), 'utf8');
      fileCache.set(file, { text, lines: text.split('\n'), spans: spansFor(file, text) });
    }
    return fileCache.get(file);
  };
  const reasons = {};
  const later = (unit, line, why = 'other') => { reasons[why] = (reasons[why] || 0) + 1; if (!review.has(unit.id)) review.set(unit.id, new Set()); review.get(unit.id).add(line); };
  const placeSite = (unit, site) => {
    if (site.kind === 'url') { later(unit, site.line, 'secret in navigation URL'); return; }
    if (site.kind === 'condition') { later(unit, site.line, 'sensitive conditional rendering'); return; }
    const { spans } = load(unit.file);
    const prop = site.kind.match(/^prop (.+)$/)?.[1];
    const attr = site.kind.match(/^attr (.+)$/)?.[1];
    const category = siteCategory(site);
    const special = site.special_category || isSpecialOrigin(site.origin);
    if (site.confidence !== 'high') { later(unit, site.line, 'low confidence'); return; }
    let el = elementAt(spans, site);
    if (!el) { later(unit, site.line, 'no unique element'); return; }
    if (category !== 'secret' && site.kind !== 'choice' && sdk === 'rrweb' && INPUT_TAG.test(el[3])) {
      if (special && (site.kind === 'input special' || /^(value|defaultValue)$/.test(attr || ''))) {
        later(unit, site.line, 'sensitive input events'); return;
      }
      if (/^(value|defaultValue)$/.test(attr || '')) return;
    }
    // Shared components need a review of the individual use, including where the prop is rendered.
    if (sharedWithPublic(usage, unit) && / via </.test(site.origin)) {
      later(unit, site.line, 'shared component'); return;
    }
    if (COMPONENT_TAG.test(el[3]) && (site.kind === 'choice' || site.kind === 'input secret' || site.kind === 'input special' || !ROOT_WITH_TRIGGER.test(el[3].split('.').pop()))) {
      later(unit, site.line, 'component rendering needs review'); return;
    }
    if (ROOT_WITH_TRIGGER.test(el[3].split('.').pop())) {
      const triggers = spans.filter((inner) => inner[5] > el[5] && inner[6] < el[6] && /Trigger$/.test(inner[3]));
      const inner = triggers.length === 1 ? triggers[0] : null;
      if (!inner) { later(unit, site.line, 'no element'); return; }
      el = inner;
    }
    const isInputValue = INPUT_TAG.test(el[3]) && /^(value|defaultValue)$/.test(attr || '');
    const value = category === 'secret' || /^(html|choice)$/.test(site.kind) || (attr && attr !== 'text' && !isInputValue) || (prop && !/^(children|label|text|value|modelValue|model-value)$/.test(prop)) ? 'block' : 'mask';
    const key = `${unit.file}:${el[0]}:${el[4]}`;
    const prev = byElement.get(key);
    const rank = { personal: 0, 'third-party': 1, secret: 2 };
    if (!prev) byElement.set(key, { unit, el, value, category, special, sites: [[unit, site.line]], candidates: new Set([unit.id]), data: new Set([site.expr.slice(0, 60)]) });
    else {
      if (value === 'block') prev.value = 'block';
      if (rank[category] > rank[prev.category]) prev.category = category;
      prev.special ||= special;
      prev.sites.push([unit, site.line]);
      prev.candidates.add(unit.id);
      prev.data.add(site.expr.slice(0, 60));
    }
  };
  for (const unit of units) for (const site of unit.sites) placeSite(unit, site);
  const annotations = [];
  const jsxFile = /\.(tsx|jsx|ts|js|mjs)$/;
  const blocks = [];
  for (const a of [...byElement.values()].sort((first, second) => first.el[5] - second.el[5])) {
    const [start, , , tag, column, begin, end] = a.el;
    if (blocks.some((b) => b.unit.file === a.unit.file && b.el[5] < begin && b.el[6] >= end)) {
      for (const id of a.candidates) touched.set(id, (touched.get(id) || 0) + 1);
      continue;
    }
    const { text, lines } = load(a.unit.file);
    const match = `<${tag}`;
    const sourceLine = lines[start - 1];
    if (sourceLine.slice(column, column + match.length) !== match) {
      for (const [unit, line] of a.sites) later(unit, line, 'ambiguous annotation target');
      continue;
    }
    const cls = annotate === 'rrweb' ? (a.value === 'block' ? 'rr-block' : 'rr-mask') : null;
    const edit = cls ? classEdit(text, a.el, cls, jsxFile.test(a.unit.file)) : null;
    if (edit === 'review') {
      for (const [unit, line] of a.sites) later(unit, line, 'class expression over several lines');
      continue;
    }
    const annotation = {
      file: a.unit.file,
      line: edit ? edit.line : start,
      column,
      match,
      value: a.value,
      category: a.category,
      special_category: Boolean(a.special),
      data: `placed from the scan: ${[...a.data].slice(0, 3).join('; ')}`,
      candidates: [...a.candidates],
      auto: true,
      ...(edit ? { edit: { from: edit.from, to: edit.to } } : {}),
    };
    if (applyAnnotation([...lines], annotation, annotate)) {
      for (const [unit, line] of a.sites) later(unit, line, 'annotation cannot be applied');
      continue;
    }
    annotations.push(annotation);
    if (a.value === 'block') blocks.push(a);
    for (const id of a.candidates) touched.set(id, (touched.get(id) || 0) + 1);
  }
  return { reasons, annotations, placed: touched, review: new Map([...review].map(([id, s]) => [id, [...s].sort((x, y) => x - y)])) };
}
