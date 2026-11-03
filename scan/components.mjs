// Component pass: parses TypeScript and JSX into components, finds the values that hold data
// (from data hooks, context, fetches and record-typed props), follows them through derived values
// and child component props across files, and reports where each component renders them.
// One candidate per component replaces many line candidates.
import fs from 'node:fs';
import path from 'node:path';
import { parse } from '@babel/parser';

const PARSEABLE = /\.(tsx|jsx|ts|js|mjs)$/;

// React and UI hooks that return no application data.
export const NON_DATA_HOOKS = /^use(State|Reducer|Ref|Callback|Memo|Effect|LayoutEffect|InsertionEffect|Id|Transition|DeferredValue|ImperativeHandle|DebugValue|SyncExternalStore|Theme|Translation|Lingui|Intl|Navigate|Location|Params|SearchParams|Router|Pathname|Form|FormContext|Controller|WatchForm|Media|MediaQuery|Breakpoint|IsMobile|Hotkey\w*|ScopedHotkeys|Toast|Snackbar|Dropdown\w*|Modal\w*|Dialog\w*|Debounce\w*|Throttle\w*|Interval|Timeout|ClickOutside\w*|Hover\w*|Focus\w*|Scroll\w*|Resize\w*|Window\w*|Mounted|IsMounted|Previous|Toggle|Disclosure|Clipboard\w*|CopyToClipboard|Analytics|Track\w*|Log\w*|FeatureFlag\w*|IsFeatureEnabled|Icon\w*|Styles?|ClassNames?|Animation\w*|Spring|Transition\w*|Drag\w*|Drop\w*|Sortable|Sensors?|Set\w+|Reset\w+|Open\w+|Close\w+|Create\w+|Update\w+|Delete\w+|Remove\w+|Navigate\w+|Handle\w+|Mutation|Mutate)$/;
// Hooks whose names say they return records, people, accounts or other application data.
export const DATA_HOOK = /(Record|Field|Value|User|Member|Person|People|Contact|Customer|Account|Workspace|Profile|Session|Auth|Viewer|Me$|Query|Find|Fetch|Data|Store|Atom|Selector|Loader|Thread|Message|Email|Invoice|Billing|Subscription|ApiKey|Webhook|Context|Current)/;
export const PERSON_TYPE = /\b(User|Customer|Member|Contact|Account|Profile|Person|Patient|Client|Employee|Lead|Visitor|Recording|Session|Order|Invoice|Message|Comment|Ticket|Participant|Invitee|Record|ObjectRecord|WorkspaceMember|ApiKey|Webhook)\b/;
// Record words inside compound type names, such as TDocumentRow or EnvelopeRecipient; a name that
// ends in a word for a setting (UserAvatarColor, MemberRole) does not count.
const RECORD_WORD = /^(User|Users|Customer|Member|Contact|Account|Profile|Person|Patient|Client|Employee|Lead|Visitor|Order|Invoice|Message|Comment|Ticket|Participant|Invitee|Record|Recipient|Signer|Document|Envelope|Row|Team|Organisation|Organization|Webhook)$/;
const SETTING_WORD = /^(Color|Colour|Size|Variant|Role|Status|Type|Kind|Props|Options|Mode|Id|Ids|Enum|Filter|Sort|Column|Columns|Config|Settings|Schema|Input|Action)$/;
export const personType = (text) => PERSON_TYPE.test(text) || (text || '').split(/\s+/).some((name) => {
  const words = name.match(/[A-Z][a-z]+/g) || [];
  return words.length > 0 && words.some((w) => RECORD_WORD.test(w)) && !SETTING_WORD.test(words[words.length - 1]);
});
export const SECRET_NAME = /(secret|token|password|passwd|apikey|api_key|privatekey|private_key|recoverycode|otp|cvv|cvc|iban|cardnumber)/i;
const SELF_NAME = /(currentUser|currentWorkspaceMember|viewer|\bme\b|useAuth|useCurrentUser|useSession|useProfile|currentWorkspace)/;
export const DOM_DATA_ATTR = /^(value|defaultValue|title|alt|href|src|srcSet|placeholder|label|aria-label|aria-valuetext|aria-description|data-[\w-]+|content|name)$/;

function parseFile(file, code) {
  const ts = /\.tsx?$/.test(file);
  try {
    return parse(code, { sourceType: 'module', errorRecovery: true, plugins: ts ? ['jsx', 'typescript', 'decorators-legacy'] : ['jsx', 'decorators-legacy'] });
  } catch {
    return null;
  }
}

export function walk(node, visit, parent = null) {
  if (!node || typeof node.type !== 'string') return;
  if (visit(node, parent) === false) return;
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'start' || key === 'end' || key === 'leadingComments' || key === 'trailingComments') continue;
    const v = node[key];
    if (Array.isArray(v)) v.forEach((c) => c && typeof c.type === 'string' && walk(c, visit, node));
    else if (v && typeof v.type === 'string') walk(v, visit, node);
  }
}

const isComponentName = (n) => /^[A-Z][\w$]*$/.test(n || '');
const hasJsx = (node) => { let found = false; walk(node, (n) => { if (n.type === 'JSXElement' || n.type === 'JSXFragment') { found = true; return false; } return !found; }); return found; };

// Names of identifiers used in an expression, without member property names.
export function idsIn(node) {
  const out = new Set();
  walk(node, (n, p) => {
    if (n.type === 'Identifier' && !(p && (p.type === 'MemberExpression' || p.type === 'OptionalMemberExpression') && p.property === n && !p.computed) && !(p && p.type === 'ObjectProperty' && p.key === n && !p.computed)) out.add(n.name);
  });
  return out;
}

// Identifiers whose values an expression shows: nested JSX elements and functions are left out,
// because handlers are not data and nested elements are checked on their own.
export function dataIdsIn(node) {
  const out = new Set();
  walk(node, (n, p) => {
    if (n !== node && (n.type === 'JSXElement' || n.type === 'JSXFragment' || n.type === 'ArrowFunctionExpression' || n.type === 'FunctionExpression')) return false;
    if (n.type === 'Identifier' && !(p && (p.type === 'MemberExpression' || p.type === 'OptionalMemberExpression') && p.property === n && !p.computed) && !(p && p.type === 'ObjectProperty' && p.key === n && !p.computed)) out.add(n.name);
    return true;
  });
  return out;
}
// A name that holds a secret, which excludes flags and handlers such as hasValidToken or onTokenChange.
export const secretIdentifier = (name) => SECRET_NAME.test(name) && !/^(has|is|should|can|show|with|needs|handle|on|set|toggle|open|close|validate|refresh|regenerate|copy|generate|reset)[A-Z_]/.test(name);

export function bindingNames(pattern, out = []) {
  if (!pattern) return out;
  if (pattern.type === 'Identifier') out.push(pattern.name);
  else if (pattern.type === 'ObjectPattern') pattern.properties.forEach((p) => bindingNames(p.type === 'RestElement' ? p.argument : p.value, out));
  else if (pattern.type === 'ArrayPattern') pattern.elements.forEach((e) => bindingNames(e, out));
  else if (pattern.type === 'AssignmentPattern') bindingNames(pattern.left, out);
  else if (pattern.type === 'RestElement') bindingNames(pattern.argument, out);
  return out;
}

export const calleeName = (call) => {
  const c = call.callee;
  if (c.type === 'Identifier') return c.name;
  if (c.type === 'MemberExpression' && c.property.type === 'Identifier') return c.property.name;
  return null;
};

export function typeNames(t, out = new Set()) {
  walk(t, (n) => { if (n.type === 'Identifier') out.add(n.name); });
  return out;
}

// Finds components in one file: name, function node, prop bindings (prop name -> local name).
function componentsIn(ast, file) {
  const types = new Map();
  walk(ast, (n) => {
    if (n.type === 'TSInterfaceDeclaration') types.set(n.id.name, n.body);
    if (n.type === 'TSTypeAliasDeclaration') types.set(n.id.name, n.typeAnnotation);
  });
  const found = [];
  const add = (name, fn, line) => {
    if (!isComponentName(name) || !fn || !hasJsx(fn.body)) return;
    const props = new Map();
    const propTypes = new Map();
    const param = fn.params[0];
    let propsObject = null;
    if (param) {
      const pattern = param.type === 'AssignmentPattern' ? param.left : param;
      if (pattern.type === 'ObjectPattern') {
        for (const p of pattern.properties) {
          if (p.type === 'ObjectProperty' && p.key.type === 'Identifier') props.set(p.key.name, bindingNames(p.value)[0] || p.key.name);
        }
      } else if (pattern.type === 'Identifier') propsObject = pattern.name;
      // Prop types from the annotation: inline literal type or a named interface in the same file.
      let ann = pattern.typeAnnotation?.typeAnnotation;
      if (ann?.type === 'TSTypeReference' && ann.typeName?.type === 'Identifier' && types.has(ann.typeName.name)) ann = types.get(ann.typeName.name);
      walk(ann, (n) => {
        if ((n.type === 'TSPropertySignature') && n.key?.type === 'Identifier') propTypes.set(n.key.name, [...typeNames(n.typeAnnotation)].join(' '));
      });
    }
    found.push({ name, file, line, endLine: fn.loc.end.line, fn, props, propsObject, propTypes });
  };
  walk(ast, (n) => {
    if (n.type === 'FunctionDeclaration' && n.id) add(n.id.name, n, n.loc.start.line);
    if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && n.init) {
      let init = n.init;
      // memo(...), forwardRef(...), observer(...) wrappers.
      while (init && init.type === 'CallExpression' && init.arguments[0]) init = init.arguments[0];
      if (init && (init.type === 'ArrowFunctionExpression' || init.type === 'FunctionExpression')) add(n.id.name, init, n.loc.start.line);
    }
  });
  return found;
}

// Analyses one component given its tainted props. Returns render sites and edges to children.
function analyse(comp, taintedProps) {
  const taint = new Map(); // local name -> origin
  const mark = (name, origin) => { if (!taint.has(name)) { taint.set(name, origin); return true; } return false; };
  for (const [prop, local] of comp.props) {
    const why = taintedProps.get(prop) || taintedProps.get('*')
      || (personType(comp.propTypes.get(prop) || '') ? `prop ${prop}: ${comp.propTypes.get(prop)}` : null)
      || (/^(loaderData|actionData)$/.test(prop) ? `prop ${prop}` : null)
      || (SECRET_NAME.test(prop) ? `prop ${prop}` : null);
    if (why) mark(local, why);
  }
  if (comp.propsObject && (taintedProps.size || [...comp.propTypes.values()].some(personType))) mark(comp.propsObject, [...taintedProps.values()][0] || 'props');
  // Sources and derived values, repeated until no new names are found.
  // React state and its setter: state holds whatever data its setter receives.
  const setters = new Map();
  walk(comp.fn.body, (n) => {
    if (n.type === 'VariableDeclarator' && n.id.type === 'ArrayPattern' && n.init?.type === 'CallExpression' && /^use(State|Reducer)$/.test(calleeName(n.init) || '')) {
      const [state, setter] = n.id.elements;
      if (state?.type === 'Identifier' && setter?.type === 'Identifier') setters.set(setter.name, state.name);
    }
  });
  for (let pass = 0; pass < 5; pass++) {
    let changed = false;
    walk(comp.fn.body, (n) => {
      if (n.type === 'VariableDeclarator' && n.init) {
        const names = bindingNames(n.id);
        let origin = null;
        const awaited = n.init.type === 'AwaitExpression';
        let init = awaited ? n.init.argument : n.init;
        if (init.type === 'TSAsExpression' || init.type === 'TSNonNullExpression') init = init.expression;
        if (init.type === 'ArrowFunctionExpression' || init.type === 'FunctionExpression') return true;
        if (init.type === 'CallExpression') {
          const name = calleeName(init);
          if (name && /^use(Callback|Ref)$/.test(name)) return true;
          if (name && /^use[A-Z]/.test(name) && !NON_DATA_HOOKS.test(name) && DATA_HOOK.test(name)) origin = `${name}()`;
          if (name && /^(useRecoilValue|useAtomValue|useRecoilState|useAtom|useSelector|useStore|useContext)$/.test(name)) origin = `${name}(${init.arguments[0] ? [...idsIn(init.arguments[0])][0] || '' : ''})`;
          if (name && /^(fetch|get|post|request|query)$/.test(name)) origin = `${name}()`;
          if (name && awaited && /^(fetch|load|get|query|request|retrieve|find|search|list)[A-Z]\w*$/.test(name)) origin = `${name}()`;
        }
        if (!origin) {
          const used = [...dataIdsIn(init)].find((id) => taint.has(id));
          if (used) origin = taint.get(used);
        }
        if (origin) names.forEach((nm) => { changed = mark(nm, origin) || changed; });
      }
      if (n.type === 'CallExpression' && n.callee.type === 'Identifier' && setters.has(n.callee.name) && n.arguments[0]) {
        const used = [...dataIdsIn(n.arguments[0])].find((id) => taint.has(id));
        if (used) changed = mark(setters.get(n.callee.name), taint.get(used)) || changed;
      }
      // Table cell renderers: { cell: ({ row }) => <span>{row.original.email}</span> }.
      if (n.type === 'ObjectProperty' && /^(cell|Cell|render|renderCell|cellRenderer|accessorFn)$/.test(n.key?.name || '') && (n.value.type === 'ArrowFunctionExpression' || n.value.type === 'FunctionExpression') && n.value.params[0]) {
        bindingNames(n.value.params[0]).forEach((nm) => { changed = mark(nm, 'table row') || changed; });
      }
      // Callback parameters of iterations over tainted values: rows.map((row) => ...).
      if (n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && /^(map|flatMap|forEach|filter|find|some|reduce)$/.test(n.callee.property?.name || '')) {
        const used = [...idsIn(n.callee.object)].find((id) => taint.has(id));
        const fn = n.arguments[0];
        if (used && fn && (fn.type === 'ArrowFunctionExpression' || fn.type === 'FunctionExpression') && fn.params[0]) {
          bindingNames(fn.params[0]).forEach((nm) => { changed = mark(nm, taint.get(used)) || changed; });
        }
      }
      return true;
    });
    if (!changed) break;
  }
  const sites = [];
  const edges = [];
  const uses = []; // each child component element: its name, and whether it gets private data
  const tainted = (expr) => {
    const ids = [...dataIdsIn(expr)];
    return ids.find((id) => taint.has(id)) || (ids.some(secretIdentifier) || /\.(\w*(secret|token|password|apiKey|privateKey)\w*)\b/i.test(exprText(expr)) && !/\b(has|is|show)\w*(Token|Secret|Password)/.test(exprText(expr)) ? '#secret' : null);
  };
  walk(comp.fn.body, (n) => {
    if (n.type !== 'JSXElement') return true;
    const opening = n.openingElement;
    const tag = jsxName(opening.name);
    const line = opening.loc.start.line;
    const isComp = isComponentName(tag.split('.')[0]);
    const edgesBefore = edges.length;
    for (const attr of opening.attributes) {
      if (attr.type === 'JSXSpreadAttribute') {
        const id = tainted(attr.argument);
        if (id && isComp) edges.push({ child: tag, prop: '*', origin: taint.get(id) || 'secret name' });
        continue;
      }
      if (!attr.value || attr.value.type !== 'JSXExpressionContainer') continue;
      const attrName = jsxName(attr.name);
      if (/^on[A-Z]|^(key|ref|className|style|sx|css|id)$/.test(attrName) && !/^style$/.test(attrName)) continue;
      const id = tainted(attr.value.expression);
      if (!id) continue;
      const origin = taint.get(id) || 'secret name';
      if (isComp) edges.push({ child: tag, prop: attrName, origin });
      if (!isComp && DOM_DATA_ATTR.test(attrName)) sites.push({ line, tag, kind: `attr ${attrName}`, expr: exprText(attr.value.expression), origin });
      // Data handed to a child component is shown there, whatever the prop is called.
      if (isComp) sites.push({ line, tag, kind: `prop ${attrName}`, expr: exprText(attr.value.expression), origin });
    }
    for (const child of n.children) {
      if (child.type !== 'JSXExpressionContainer' || child.expression.type === 'JSXEmptyExpression') continue;
      const part = shownParts(child.expression).find((e) => tainted(e));
      if (!part) continue;
      const id = tainted(part);
      const origin = taint.get(id) || 'secret name';
      sites.push({ line: part.loc.start.line, tag, kind: 'text', expr: exprText(part), origin });
      if (isComp) edges.push({ child: tag, prop: 'children', origin });
    }
    if (isComp) uses.push({ child: tag.split('.').pop(), tainted: edges.length > edgesBefore, line });
    return true;
  });
  return { sites, edges, uses };
}

// The parts of a child expression that render as text. Conditions only choose what to show, and
// nested elements and mapped callbacks are checked on their own.
function shownParts(e) {
  if (!e) return [];
  if (e.type === 'JSXElement' || e.type === 'JSXFragment') return [];
  if (e.type === 'ConditionalExpression') return [...shownParts(e.consequent), ...shownParts(e.alternate)];
  if (e.type === 'LogicalExpression') return e.operator === '&&' ? shownParts(e.right) : [...shownParts(e.left), ...shownParts(e.right)];
  if (e.type === 'ParenthesizedExpression' || e.type === 'TSAsExpression' || e.type === 'TSNonNullExpression') return shownParts(e.expression);
  if (e.type === 'CallExpression' && e.callee.type === 'MemberExpression' && /^(map|flatMap)$/.test(e.callee.property?.name || '') && hasJsx(e)) return [];
  // Translation calls show a label; only the values passed after the message can hold data.
  if (e.type === 'CallExpression' && /^(_|t|formatMessage)$/.test(calleeName(e) || '')) return e.arguments.slice(1).flatMap(shownParts);
  return [e];
}

function jsxName(n) {
  if (!n) return '';
  if (n.type === 'JSXIdentifier') return n.name;
  if (n.type === 'JSXMemberExpression') return `${jsxName(n.object)}.${jsxName(n.property)}`;
  if (n.type === 'JSXNamespacedName') return `${n.namespace.name}:${n.name.name}`;
  return '';
}

let SOURCE_TEXT = '';
const exprText = (e) => (e && e.start != null ? SOURCE_TEXT.slice(e.start, e.end).replace(/\s+/g, ' ').slice(0, 120) : '');

export function categoryOf(sites) {
  const text = sites.map((s) => `${s.origin} ${s.expr}`).join(' ');
  if (SECRET_NAME.test(text)) return 'secret?';
  if (SELF_NAME.test(text)) return 'personal?';
  if (/(Record|Member|Person|People|Contact|Customer|Participant|Thread|Message|Email|List|Find|Query|rows|records|members|participants)/i.test(text)) return 'third-party?';
  return 'personal?';
}

// The JSX elements of a file as [start line, last line of the start tag, end line], for checking
// which lines an annotated element covers. Empty for files that are not JSX.
export function elementSpans(file, code) {
  if (!PARSEABLE.test(file)) return [];
  const ast = parseFile(file, code);
  const out = [];
  if (ast) walk(ast, (n) => { if (n.type === 'JSXElement') out.push([n.loc.start.line, n.openingElement.loc.end.line, n.loc.end.line]); });
  return out;
}

// Runs the pass over files (absolute paths). Returns one candidate per component that renders data.
export function componentPass(root, files) {
  const comps = [];
  let parsed = 0;
  let failed = 0;
  const sources = new Map();
  for (const file of files.filter((f) => PARSEABLE.test(f))) {
    const code = fs.readFileSync(file, 'utf8');
    const ast = parseFile(file, code);
    if (!ast) { failed++; continue; }
    parsed++;
    sources.set(file, code);
    for (const c of componentsIn(ast, path.relative(root, file))) comps.push({ ...c, abs: file });
  }
  const byName = new Map();
  for (const c of comps) {
    if (!byName.has(c.name)) byName.set(c.name, []);
    byName.get(c.name).push(c);
  }
  const taintedProps = new Map(comps.map((c) => [c, new Map()]));
  const results = new Map();
  // Propagate tainted props from parents to children until nothing changes.
  let queue = [...comps];
  for (let round = 0; round < 12 && queue.length; round++) {
    const next = new Set();
    for (const c of queue) {
      SOURCE_TEXT = sources.get(c.abs);
      const r = analyse(c, taintedProps.get(c));
      results.set(c, r);
      for (const e of r.edges) {
        for (const child of byName.get(e.child.split('.').pop()) || []) {
          const tp = taintedProps.get(child);
          if (!tp.has(e.prop)) { tp.set(e.prop, `${e.origin} via <${c.name} ${e.prop === '*' ? '{...}' : e.prop}>`); next.add(child); }
        }
      }
    }
    queue = [...next];
  }
  const candidates = [];
  for (const [c, r] of results) {
    if (!r.sites.length) continue;
    const lines = [...new Set(r.sites.map((s) => s.line))].sort((a, b) => a - b);
    candidates.push({
      file: c.file,
      line: c.line,
      end_line: c.endLine,
      component: c.name,
      rules: ['component'],
      patterns: ['P-crm-record'],
      category_hint: categoryOf(r.sites),
      sites: r.sites.slice(0, 12).map((s) => ({ line: s.line, tag: s.tag, kind: s.kind, expr: s.expr, origin: s.origin })),
      site_lines: lines,
      snippet: `<${c.name}> renders ${r.sites.length} value${r.sites.length === 1 ? '' : 's'} from ${[...new Set(r.sites.map((s) => s.origin))].slice(0, 2).join('; ')}`,
    });
  }
  // Uses of each component across the app, and how many of them pass private data.
  // usage[name] = [uses, uses with private data, up to 30 locations as [file, line, private]].
  const usage = {};
  for (const [c, r] of results) {
    for (const u of r.uses) {
      const k = (usage[u.child] ||= [0, 0, []]);
      k[0]++;
      if (u.tainted) k[1]++;
      if (k[2].length < 30) k[2].push([c.file, u.line, u.tainted]);
    }
  }
  // Where each component sits, and whether it gets data from its own hooks or typed props
  // (own data) or only from untyped props that its parents pass.
  const index = {};
  for (const [c, r] of results) {
    const own = r.sites.some((s) => !/ via /.test(s.origin) && !/^prop \w+$/.test(s.origin));
    (index[c.file] ||= []).push([c.name, c.line, c.endLine, own]);
  }
  return { candidates, parsed, failed, components: comps.length, usage, index };
}
