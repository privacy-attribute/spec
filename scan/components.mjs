// Component pass: parses TypeScript and JSX into components, finds the values that hold data
// (from data hooks, context, fetches and record-typed props), follows them through derived values
// and child component props across files, and reports where each component renders them.
// One candidate per component replaces many line candidates.
import fs from 'node:fs';
import path from 'node:path';
import { parse } from '@babel/parser';

const PARSEABLE = /\.(tsx|jsx|ts|js|mjs)$/;

// React and UI hooks that return no application data.
const NON_DATA_HOOKS = /^use(State|Reducer|Ref|Callback|Memo|Effect|LayoutEffect|InsertionEffect|Id|Transition|DeferredValue|ImperativeHandle|DebugValue|SyncExternalStore|Theme|Translation|Lingui|Intl|Navigate|Location|Params|SearchParams|Router|Pathname|Form|FormContext|Controller|WatchForm|Media|MediaQuery|Breakpoint|IsMobile|Hotkey\w*|ScopedHotkeys|Toast|Snackbar|Dropdown\w*|Modal\w*|Dialog\w*|Debounce\w*|Throttle\w*|Interval|Timeout|ClickOutside\w*|Hover\w*|Focus\w*|Scroll\w*|Resize\w*|Window\w*|Mounted|IsMounted|Previous|Toggle|Disclosure|Clipboard\w*|CopyToClipboard|Analytics|Track\w*|Log\w*|FeatureFlag\w*|IsFeatureEnabled|Icon\w*|Styles?|ClassNames?|Animation\w*|Spring|Transition\w*|Drag\w*|Drop\w*|Sortable|Sensors?|Set\w+|Reset\w+|Open\w+|Close\w+|Create\w+|Update\w+|Delete\w+|Remove\w+|Navigate\w+|Handle\w+|Mutation|Mutate)$/;
// Hooks whose names say they return records, people, accounts or other application data.
const DATA_HOOK = /(Record|Field|Value|User|Member|Person|People|Contact|Customer|Account|Workspace|Profile|Session|Auth|Viewer|Me$|Query|Find|Fetch|Data|Store|Atom|Selector|Loader|Thread|Message|Email|Invoice|Billing|Subscription|ApiKey|Webhook|Context|Current)/;
const PERSON_TYPE = /\b(User|Customer|Member|Contact|Account|Profile|Person|Patient|Client|Employee|Lead|Visitor|Recording|Session|Order|Invoice|Message|Comment|Ticket|Participant|Invitee|Record|ObjectRecord|WorkspaceMember|ApiKey|Webhook)\b/;
const SECRET_NAME = /(secret|token|password|passwd|apikey|api_key|privatekey|private_key|recoverycode|otp|cvv|cvc|iban|cardnumber)/i;
const SELF_NAME = /(currentUser|currentWorkspaceMember|viewer|\bme\b|useAuth|useCurrentUser|useSession|useProfile|currentWorkspace)/;
const DOM_DATA_ATTR = /^(value|defaultValue|title|alt|href|src|srcSet|placeholder|label|aria-label|aria-valuetext|aria-description|data-[\w-]+|content|name)$/;

function parseFile(file, code) {
  const ts = /\.tsx?$/.test(file);
  try {
    return parse(code, { sourceType: 'module', errorRecovery: true, plugins: ts ? ['jsx', 'typescript', 'decorators-legacy'] : ['jsx', 'decorators-legacy'] });
  } catch {
    return null;
  }
}

function walk(node, visit, parent = null) {
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
function idsIn(node) {
  const out = new Set();
  walk(node, (n, p) => {
    if (n.type === 'Identifier' && !(p && (p.type === 'MemberExpression' || p.type === 'OptionalMemberExpression') && p.property === n && !p.computed) && !(p && p.type === 'ObjectProperty' && p.key === n && !p.computed)) out.add(n.name);
  });
  return out;
}

function bindingNames(pattern, out = []) {
  if (!pattern) return out;
  if (pattern.type === 'Identifier') out.push(pattern.name);
  else if (pattern.type === 'ObjectPattern') pattern.properties.forEach((p) => bindingNames(p.type === 'RestElement' ? p.argument : p.value, out));
  else if (pattern.type === 'ArrayPattern') pattern.elements.forEach((e) => bindingNames(e, out));
  else if (pattern.type === 'AssignmentPattern') bindingNames(pattern.left, out);
  else if (pattern.type === 'RestElement') bindingNames(pattern.argument, out);
  return out;
}

const calleeName = (call) => {
  const c = call.callee;
  if (c.type === 'Identifier') return c.name;
  if (c.type === 'MemberExpression' && c.property.type === 'Identifier') return c.property.name;
  return null;
};

function typeNames(t, out = new Set()) {
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
      || (PERSON_TYPE.test(comp.propTypes.get(prop) || '') ? `prop ${prop}: ${comp.propTypes.get(prop)}` : null)
      || (SECRET_NAME.test(prop) ? `prop ${prop}` : null);
    if (why) mark(local, why);
  }
  if (comp.propsObject && (taintedProps.size || [...comp.propTypes.values()].some((t) => PERSON_TYPE.test(t)))) mark(comp.propsObject, [...taintedProps.values()][0] || 'props');
  // Sources and derived values, repeated until no new names are found.
  for (let pass = 0; pass < 4; pass++) {
    let changed = false;
    walk(comp.fn.body, (n) => {
      if (n.type === 'VariableDeclarator' && n.init) {
        const names = bindingNames(n.id);
        let origin = null;
        let init = n.init.type === 'AwaitExpression' ? n.init.argument : n.init;
        if (init.type === 'TSAsExpression' || init.type === 'TSNonNullExpression') init = init.expression;
        if (init.type === 'CallExpression') {
          const name = calleeName(init);
          if (name && /^use[A-Z]/.test(name) && !NON_DATA_HOOKS.test(name) && DATA_HOOK.test(name)) origin = `${name}()`;
          if (name && /^(useRecoilValue|useAtomValue|useRecoilState|useAtom|useSelector|useStore|useContext)$/.test(name)) origin = `${name}(${init.arguments[0] ? [...idsIn(init.arguments[0])][0] || '' : ''})`;
          if (name && /^(fetch|get|post|request|query)$/.test(name)) origin = `${name}()`;
        }
        if (!origin) {
          const used = [...idsIn(init)].find((id) => taint.has(id));
          if (used) origin = taint.get(used);
        }
        if (origin) names.forEach((nm) => { changed = mark(nm, origin) || changed; });
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
  const tainted = (expr) => [...idsIn(expr)].find((id) => taint.has(id)) || (SECRET_NAME.test(exprText(expr)) ? '#secret' : null);
  walk(comp.fn.body, (n) => {
    if (n.type !== 'JSXElement') return true;
    const opening = n.openingElement;
    const tag = jsxName(opening.name);
    const line = opening.loc.start.line;
    const isComp = isComponentName(tag.split('.')[0]);
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
      if (isComp && /^(value|label|title|text|name|email|phone|children|content|description|placeholder|src|href|avatarUrl|url)$/.test(attrName)) sites.push({ line, tag, kind: `prop ${attrName}`, expr: exprText(attr.value.expression), origin });
    }
    for (const child of n.children) {
      if (child.type !== 'JSXExpressionContainer' || child.expression.type === 'JSXEmptyExpression') continue;
      const id = tainted(child.expression);
      if (!id) continue;
      const origin = taint.get(id) || 'secret name';
      sites.push({ line: child.loc.start.line, tag, kind: 'text', expr: exprText(child.expression), origin });
      if (isComp) edges.push({ child: tag, prop: 'children', origin });
    }
    return true;
  });
  return { sites, edges };
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

function categoryOf(sites) {
  const text = sites.map((s) => `${s.origin} ${s.expr}`).join(' ');
  if (SECRET_NAME.test(text)) return 'secret?';
  if (SELF_NAME.test(text)) return 'personal?';
  if (/(Record|Member|Person|People|Contact|Customer|Participant|Thread|Message|Email|List|Find|Query|rows|records|members|participants)/i.test(text)) return 'third-party?';
  return 'personal?';
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
  return { candidates, parsed, failed, components: comps.length };
}
