// Stage 5, decide and place: turns the high-confidence sites of each unit into annotations on the
// element that shows the value, without a model. A site with low confidence, or one that cannot be
// placed safely, stays for review. Rules:
// - Secrets get block. A value in an attribute (title, alt, href, src, aria-label, data-*) gets block,
//   because recorders do not mask attributes. Text gets mask.
// - Input values are left to the recorder's input masking (rrweb maskAllInputs).
// - Data passed to a child component is annotated in the child when the child is a unit of its own.
//   When the child is shared with public uses, or is not in the app (a library component), the
//   element is annotated where the parent passes the value.
// - A translation wrapper (<Trans>) is not an element; its parent element is annotated.
import fs from 'node:fs';
import path from 'node:path';
import { spansFor } from './templates.mjs';
import { SECRET_NAME } from './components.mjs';

// Text fields whose value rrweb's maskAllInputs masks. A component Select (Radix, Headless UI) shows its
// value in a trigger element instead, so it is not one of them.
const INPUT_TAG = /^(input|textarea|select|Input|Textarea|TextArea|PasswordInput|PinInput\w*|InputOTP\w*|[\w-]*-input|[\w.]*Input)$/;
// Roots that render no element of their own; their value shows in a trigger or value element inside.
const ROOT_WITH_TRIGGER = /^(Select|Combobox|MultiSelect\w*|Popover|DropdownMenu|Command|Listbox|RadioGroup)$/;
const ATTR_BLOCK = /^(title|alt|href|src|srcSet|srcset|aria-label|aria-description|aria-valuetext|placeholder|data-[\w-]+|to|poster|content)$/;
const NOT_AN_ELEMENT = /^(Trans|Plural|Select\.Value|FormattedMessage|T|Fragment|React\.Fragment|template|slot|i18n-t|Translate|Suspense|Show|For|Match|Switch)$/;
const SECRET_ORIGIN = /secret name|#secret|schema secret field/;
// Components that render no element of their own, and props that carry state rather than shown values.
const NO_ELEMENT = /(Provider|Consumer|Context|Slot|Portal|Boundary)$|^(Form|FormProvider|Controller|ElementVisible)$/;
const DATA_PROP = /^(data|items|rows|records|results|options|list|entries|members|recipients|users|contacts|people|documents|values|selected\w*|current\w*|initial\w*|default\w*)$/;
const SHOWN_PROP = /^(children|label|title|subtitle|description|text|name|value|placeholder|src|href|to|alt|email|avatar\w*|\w*(Name|Title|Text|Label|Email|Url|URL|Src|Message|Description))$/;
const stripStrings = (expr) => expr.replace(/(["'`])(?:\\.|(?!\1).)*\1/g, '""');

// Components that hold private data in some uses and public content in at least two other uses
// (and a quarter of all uses) get their annotations at the parents that pass the private data.
const sharedWithPublic = (usage, name) => {
  const u = usage[name];
  return Boolean(u && u[0] - u[1] >= 2 && (u[0] - u[1]) / u[0] >= 0.25);
};

function siteCategory(site, unit) {
  const expr = stripStrings(site.expr);
  if (SECRET_ORIGIN.test(site.origin) || (SECRET_NAME.test(expr) && !/\b(is|has|show|can)\w*(Token|Secret|Password)/i.test(expr))) return 'secret';
  const hint = String(unit.category_hint || '').replace('?', '');
  return hint === 'third-party' ? 'third-party' : 'personal';
}

// The innermost element whose start tag holds the line (attributes), or that holds the line at all (text).
function elementAt(spans, line, inStartTag) {
  const holds = spans.filter(([s, open, e]) => (inStartTag ? line >= s && line <= open : line >= s && line <= e));
  return holds.sort((a, b) => (a[2] - a[0]) - (b[2] - b[0]) || b[0] - a[0]);
}

// The class edit for an element whose class is an expression, or null when there is a static class or
// none (the patch command adds the class then), or 'review' when no safe edit exists.
function classEdit(lines, el, cls, jsx) {
  const [start, open, , tag] = el;
  const tagText = lines.slice(start - 1, open).join('\n');
  if (jsx) {
    const m = tagText.match(/\bclassName=\{/);
    if (!m) return null;
    // className={expr} on one line: wrap the expression in a template string.
    for (let k = start - 1; k < open; k++) {
      const at = lines[k].indexOf('className={');
      if (at < 0) continue;
      let depth = 0;
      for (let j = at + 10; j < lines[k].length; j++) {
        if (lines[k][j] === '{') depth++;
        else if (lines[k][j] === '}' && --depth === 0) {
          const from = lines[k].slice(at, j + 1);
          const expr = from.slice(11, -1);
          if (/^\s*["'`]/.test(expr)) return null; // className={"a"} is static
          return { line: k + 1, from, to: `className={\`${cls} \${${expr} ?? ''}\`}` };
        }
      }
      // className={cn(\n ... )} over several lines: add the class as the first argument.
      const call = lines[k].slice(at).match(/^className=\{(cn|clsx|classNames|classnames|twMerge|cx|tw)\(/);
      if (call) return { line: k + 1, from: call[0], to: `${call[0]}'${cls}', ` };
      return 'review';
    }
    return 'review';
  }
  // Vue and Svelte merge a static class with a bound one: add class="..." after the tag name.
  if (/(^|\s)(:class|v-bind:class|class:[\w-]+)=/.test(tagText) && !/(^|\s)class="/.test(tagText)) {
    const k = start - 1;
    return { line: k + 1, from: `<${tag}`, to: `<${tag} class="${cls}"` };
  }
  return null;
}

// Returns { annotations, placed: Map(unit id -> number of annotations), review: Map(unit id -> lines) }.
// A unit that an earlier scan dismissed (c.earlier.decision) is left for review, so placement never
// overrides a decision made by a person or an agent.
export function placeAnnotations(scan, root, { sdk = null, annotate = 'rrweb' } = {}) {
  const usage = scan.component_usage || {};
  const units = scan.candidates.filter((c) => c.sites && !c.cached && c.earlier?.decision !== 'dismiss');
  const unitComponents = new Set(scan.candidates.filter((c) => c.sites).map((c) => c.component));
  const known = new Set([...unitComponents, ...Object.values(scan.component_index || {}).flat().map((e) => e[0])]);
  const byElement = new Map();
  const review = new Map();
  const touched = new Map();
  const fileCache = new Map();
  const load = (file) => {
    if (!fileCache.has(file)) {
      const text = fs.readFileSync(path.join(root, file), 'utf8');
      fileCache.set(file, { lines: text.split('\n'), spans: spansFor(file, text) });
    }
    return fileCache.get(file);
  };
  const reasons = {};
  const later = (unit, line, why = 'other') => { reasons[why] = (reasons[why] || 0) + 1; if (!review.has(unit.id)) review.set(unit.id, new Set()); review.get(unit.id).add(line); };
  // Prop sites skipped because the child annotates the value; placed here after all if the child ends
  // up with nothing to annotate (it only passes the value on, or renders it where no rule reaches).
  const deferred = [];
  const inputMasked = new Set();
  const childOf = (site) => site.tag.split('.').pop().replace(/(^|-)(\w)/g, (m, d, ch) => ch.toUpperCase());
  const placeSite = (unit, site, force) => {
    const { spans } = load(unit.file);
    const prop = site.kind.match(/^prop (.+)$/)?.[1];
    const attr = site.kind.match(/^attr (.+)$/)?.[1];
    if (!force) {
      if (site.confidence !== 'high') { later(unit, site.line, 'low confidence'); return; }
      if (sdk === 'rrweb' && (attr === 'value' || attr === 'defaultValue' || (prop && /^(value|modelValue|model-value|defaultValue)$/.test(prop))) && INPUT_TAG.test(site.tag.split('.').pop())) { inputMasked.add(unit.id); return; }
      // Data that a parent passes in: the parents annotate it when this component is shared with public uses.
      if (sharedWithPublic(usage, unit.component) && / via </.test(site.origin) && !SECRET_ORIGIN.test(site.origin)) return;
      if (prop) {
        const child = childOf(site);
        if (NO_ELEMENT.test(child)) return;
        // Handlers, layout and keys passed to a component are not shown.
        if (/^(on[A-Z]\w*|key|ref|class(Name)?|style|variant|size|color|icon|loading|disabled|open|type|id|testId|render|control|register|formState|methods|form|isInherited|status|max|min|step|target|rel|colSpan|rowSpan|aria-[\w-]+|data-[\w-]+|error|readOnly|required|align|side|asChild|is[A-Z]\w*|has[A-Z]\w*|can[A-Z]\w*|show[A-Z]\w*)$/.test(prop)) return;
        // {...field} or value on a text field: the recorder's input masking covers it.
        if (sdk === 'rrweb' && (prop === '*' || prop === 'value') && INPUT_TAG.test(site.tag.split('.').pop())) { inputMasked.add(unit.id); return; }
        // The child shows the value and is annotated there, unless it also shows public content.
        if (unitComponents.has(child) && !sharedWithPublic(usage, child)) { deferred.push({ unit, site, child }); return; }
        const secret = siteCategory(site, unit) === 'secret';
        // Records handed to a component that is not a unit (a data table, a combobox): it shows them, so the
        // element is masked where the parent passes them. Other state goes to review.
        if (!secret && !sharedWithPublic(usage, child) && !SHOWN_PROP.test(prop) && !DATA_PROP.test(prop)) { if (known.has(child)) { later(unit, site.line, 'prop to a component that is not a unit'); return; } }
      }
    }
    const holding = elementAt(spans, site.line, Boolean(prop || attr));
    let el = holding[0];
    // Translation wrappers render no element: use the element around them.
    for (let k = 1; el && NOT_AN_ELEMENT.test(el[3]) && k < holding.length; k++) el = holding[k];
    // A Select root renders no element: annotate its trigger or value element.
    if (el && ROOT_WITH_TRIGGER.test(el[3].split('.').pop())) {
      const inner = spans.filter(([st, , e, tag]) => st > el[0] && e <= el[2] && /(Trigger|Value|Input|Button)$/.test(tag)).sort((a, b) => a[0] - b[0])[0];
      if (!inner) { later(unit, site.line, 'no element'); return; }
      el = inner;
    }
    if (!el || NOT_AN_ELEMENT.test(el[3])) { later(unit, site.line, 'no element'); return; }
    const category = siteCategory(site, unit);
    // A component prop named title or label is shown as text; only URL props end up in an attribute.
    const value = category === 'secret' || (attr && ATTR_BLOCK.test(attr)) || (prop && /^(src|srcSet|href|to|poster|avatar\w*|\w*(Url|URL|Src))$/.test(prop)) ? 'block' : 'mask';
    const key = `${unit.file}:${el[0]}:${el[4]}`;
    const prev = byElement.get(key);
    const rank = { personal: 0, 'third-party': 1, secret: 2 };
    if (!prev) byElement.set(key, { unit, el, value, category, candidates: new Set([unit.id]), data: new Set([site.expr.slice(0, 60)]) });
    else {
      if (value === 'block') prev.value = 'block';
      if (rank[category] > rank[prev.category]) prev.category = category;
      prev.candidates.add(unit.id);
      prev.data.add(site.expr.slice(0, 60));
    }
  };
  for (const unit of units) for (const site of unit.sites) placeSite(unit, site, false);
  // A child "annotates" when one of its elements is placed or it has lines for review.
  const unitOf = new Map(scan.candidates.filter((c) => c.sites).map((c) => [c.component, c.id]));
  // A child handles a value when it places an annotation, has lines for review, leaves an input to the
  // recorder's input masking, or passes the value on to a child that handles it.
  const handled = new Map();
  const annotatesItself = (child, seen = new Set()) => {
    const id = unitOf.get(child);
    if (handled.has(id)) return handled.get(id);
    if (seen.has(id)) return false;
    seen.add(id);
    const own = review.has(id) || inputMasked.has(id) || [...byElement.values()].some((a) => a.candidates.has(id))
      || deferred.some((d) => d.unit.id === id && !d.done && annotatesItself(d.child, seen));
    return own;
  };
  for (let round = 0; round < 6; round++) {
    const now = deferred.filter((d) => !d.done && !annotatesItself(d.child));
    if (!now.length) break;
    for (const d of now) {
      d.done = true;
      const prop = d.site.kind.slice(5);
      // Only a shown value is placed at the parent; state handed down (form, field) goes to review.
      if (SHOWN_PROP.test(prop) || siteCategory(d.site, d.unit) === 'secret') placeSite(d.unit, d.site, true);
      else later(d.unit, d.site.line, 'state passed to a child that annotates nothing');
    }
  }
  const annotations = [];
  const jsxFile = /\.(tsx|jsx|ts|js|mjs)$/;
  // An element inside a blocked element needs no annotation of its own.
  const blocked = [...byElement.values()].filter((a) => a.value === 'block');
  for (const a of byElement.values()) {
    const [start, , end, tag] = a.el;
    if (blocked.some((b) => b !== a && b.unit.file === a.unit.file && b.el[0] <= start && b.el[2] >= end && (b.el[0] !== start || b.el[4] !== a.el[4]))) {
      for (const id of a.candidates) touched.set(id, (touched.get(id) || 0) + 1);
      continue;
    }
    const { lines } = load(a.unit.file);
    const cls = annotate === 'rrweb' ? (a.value === 'block' ? 'rr-block' : 'rr-mask') : null;
    const edit = cls ? classEdit(lines, a.el, cls, jsxFile.test(a.unit.file)) : null;
    if (edit === 'review') { for (const id of a.candidates) later(scan.candidates.find((c) => c.id === id), start, 'class expression over several lines'); continue; }
    annotations.push({
      file: a.unit.file,
      line: edit ? edit.line : start,
      match: `<${tag}`,
      value: a.value,
      category: a.category,
      special_category: false,
      data: `placed from the scan: ${[...a.data].slice(0, 3).join('; ')}`,
      candidates: [...a.candidates],
      auto: true,
      ...(edit ? { edit: { from: edit.from, to: edit.to } } : {}),
    });
    for (const id of a.candidates) touched.set(id, (touched.get(id) || 0) + 1);
  }
  return { reasons, annotations, placed: touched, review: new Map([...review].map(([id, s]) => [id, [...s].sort((x, y) => x - y)])) };
}
