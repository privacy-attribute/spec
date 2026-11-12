// Component pass: parses TypeScript and JSX into components, finds the values that hold data
// (from data hooks, context, fetches and record-typed props), follows them through derived values
// and child component props across files, and reports where each component renders them.
// One candidate per component replaces many line candidates. Fail closed: a hook or awaited call
// that no list names counts as a data source with low confidence, and a field that the app's schema
// declares private counts as data wherever it is shown.
import fs from 'node:fs';
import path from 'node:path';
import { parse } from '@babel/parser';
import { schemaFieldIn, schemaModel, memberFieldName, CONSTANT_OBJECT } from './schemas.mjs';
import { secretInputName, specialCategoryName } from './rules.mjs';

const PARSEABLE = /\.(tsx|jsx|ts|js|mjs)$/;

// React and UI hooks that return no application data.
export const NON_DATA_HOOKS = /^use(State|Reducer|Ref|Callback|Memo|Effect|LayoutEffect|InsertionEffect|Id|Transition|DeferredValue|ImperativeHandle|DebugValue|SyncExternalStore|Theme|Translation|Lingui|Intl|Navigate|Location|Params|SearchParams|Router|Pathname|Form|FormContext|Controller|WatchForm|Media|MediaQuery|Breakpoint|IsMobile|Hotkey\w*|ScopedHotkeys|Toast|Snackbar|Dropdown\w*|Modal\w*|Dialog\w*|Debounce\w*|Throttle\w*|Interval|Timeout|ClickOutside\w*|Hover\w*|Focus\w*|Scroll\w*|Resize\w*|Window\w*|Mounted|IsMounted|Previous|Toggle|Disclosure|Clipboard\w*|CopyToClipboard|Analytics|Track\w*|Log\w*|FeatureFlag\w*|IsFeatureEnabled|Icon\w*|Styles?|ClassNames?|Animation\w*|Spring|Transition\w*|Drag\w*|Drop\w*|Sortable|Sensors?|Set\w+|Reset\w+|Open\w+|Close\w+|Create\w+|Update\w+|Delete\w+|Remove\w+|Navigate\w+|Handle\w+|Mutation|Mutate)$/;
// Hooks whose names say they return records, people, accounts or other application data.
export const DATA_HOOK = /(Record|Field|Value|User|Member|Person|People|Contact|Customer|Patient|Account|Workspace|Profile|Session|Auth|Viewer|Me$|Query|Find|Fetch|Data|Store|Atom|Selector|Loader|Thread|Message|Comment|Email|Invoice|Billing|Subscription|ApiKey|Webhook|Context|Current)/;
export const PERSON_TYPE = /\b(User|Customer|Member|Contact|Account|Profile|Person|Patient|Client|Employee|Lead|Visitor|Recording|Session|Order|Invoice|Message|Comment|Ticket|Participant|Invitee|Record|ObjectRecord|WorkspaceMember|ApiKey|Webhook)\b/;
// Record words inside compound type names, such as TDocumentRow or EnvelopeRecipient; a name that
// ends in a word for a setting (UserAvatarColor, MemberRole) does not count.
const RECORD_WORD = /^(User|Users|Customer|Member|Contact|Account|Profile|Person|Patient|Client|Employee|Lead|Visitor|Order|Invoice|Message|Comment|Ticket|Participant|Invitee|Record|Recipient|Signer|Document|Envelope|Row|Team|Organisation|Organization|Webhook)$/;
const SETTING_WORD = /^(Color|Colour|Size|Variant|Role|Status|Type|Kind|Props|Options|Mode|Id|Ids|Enum|Filter|Sort|Column|Columns|Config|Settings|Schema|Input|Action)$/;
export const personType = (text) => PERSON_TYPE.test(text) || (text || '').split(/\s+/).some((name) => {
  const words = name.match(/[A-Z][a-z]+/g) || [];
  return words.length > 0 && words.some((w) => RECORD_WORD.test(w)) && !SETTING_WORD.test(words[words.length - 1]);
});
export const SECRET_NAME = /(secret|token|password|passwd|passphrase|apikey|api_key|privatekey|private_key|(?:recovery|backup|security|verification)_?codes?|seed_?phrase|plaintext|\bpin\b|(?:one_?time_?code)|otp|cvv|cvc|iban|card_?number|webhook_?url|invite_?(url|link)|reset_?(url|link)|signed_?(url|link))/i;
const SELF_NAME = /(currentUser|currentWorkspaceMember|viewer|\bme\b|useAuth|useCurrentUser|useSession|useProfile\(|useAccount\(|useWorkspace\(|currentWorkspace)/i;
const THIRD_PARTY = /(third-party|table row|Record|Member|Person|People|Contact|Customer|Patient|Participant|Thread|Message|Comment|Users|List|Find|Query|SearchResults|rows)/i;
export const DOM_DATA_ATTR = /^(value|defaultValue|title|alt|href|src|srcSet|srcset|placeholder|label|aria-[\w-]+|data-[\w-]+|content|name|id|poster|download|cite|action|formAction|formaction)$/;

function parseFile(file, code) {
  const ts = /\.tsx?$/.test(file);
  try {
    return parse(code, { sourceType: 'module', errorRecovery: false, plugins: ts ? ['jsx', 'typescript', 'decorators-legacy'] : ['jsx', 'decorators-legacy'] });
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
  return new Set(dataReferencesIn(node).map((id) => id.name));
}

function dataReferencesIn(node) {
  const out = [];
  walk(node, (n, p) => {
    if (n !== node && (n.type === 'JSXElement' || n.type === 'JSXFragment' || n.type === 'ArrowFunctionExpression' || n.type === 'FunctionExpression')) return false;
    if (n.type.startsWith('TS') && !/^(TSAsExpression|TSNonNullExpression|TSSatisfiesExpression)$/.test(n.type)) return false;
    if (n.type === 'Identifier' && !(p && (p.type === 'MemberExpression' || p.type === 'OptionalMemberExpression') && p.property === n && !p.computed) && !(p && p.type === 'ObjectProperty' && p.key === n && !p.computed)) out.push(n);
    return true;
  });
  return out;
}
// A name that holds a secret, which excludes flags and handlers such as hasValidToken or onTokenChange.
export const secretIdentifier = (name) => SECRET_NAME.test(name)
  && !/^(use|has|is|should|can|show|with|needs|handle|on|set|toggle|open|close|validate|regenerate|copy|generate)[A-Z_]/.test(name)
  && !/(?:ApiKeys|apiKeys|api_keys)$/.test(name)
  && !/(?:Name|Label|Description|Hint|Prefix|Suffix|Status|Type|Count|Length|Enabled|Id|CreatedAt|ExpiresAt|LastFour|_(?:name|label|description|hint|prefix|suffix|status|type|count|length|enabled|id|at))$/.test(name);

export const isSecretOrigin = (origin) => /^(secret name|schema secret field)\b/.test(origin || '');
export const isSpecialOrigin = (origin) => /^(special category\b|schema secret field .* \(special category\))/.test(origin || '');
export function originCategory(origin) {
  if (isSecretOrigin(origin)) return 'secret';
  const source = String(origin || '').split(' via ')[0];
  if (/^(?:unknown state |schema personal field )/.test(source)) return 'personal';
  if (/^special category schema field /.test(source)) return source.endsWith(' about a third-party record') ? 'third-party' : 'personal';
  return !SELF_NAME.test(source) && THIRD_PARTY.test(source) ? 'third-party' : 'personal';
}

const originRank = (origin) => !origin ? 0 : UNKNOWN_ORIGIN.test(origin) ? 1
  : isSecretOrigin(origin) ? 6 : isSpecialOrigin(origin) ? (originCategory(origin) === 'third-party' ? 5 : 4)
    : originCategory(origin) === 'third-party' ? 3 : 2;

export function fieldOrigin(field, source = null) {
  if (!field?.category || field.category === 'public') return null;
  const { name, category, special_category, ambiguous } = field;
  if (ambiguous) return `unknown schema field ${name}`;
  if (category === 'secret') return `schema secret field ${name}${special_category ? ' (special category)' : ''}`;
  if (special_category) return `special category schema field ${name}${category === 'third-party' || originCategory(source) === 'third-party' ? ' about a third-party record' : ''}`;
  return `schema ${category} field ${name}`;
}

export function strongestOrigin(origins) {
  let strongest = null;
  for (const origin of origins) if (originRank(origin) > originRank(strongest)) strongest = origin;
  return strongest;
}

export function markOrigin(taint, name, origin) {
  if (name == null || originRank(origin) <= originRank(taint.get(name))) return false;
  taint.set(name, origin);
  return true;
}

const sourceModule = (origin) => origin.split(' via source ')[1]?.split(' via ')[0];
const originIdentity = (origin) => `${origin.split(' via ')[0]}:${sourceModule(origin) || ''}`;
function mergeOrigins(...groups) {
  const merged = new Map();
  for (const origin of groups.flat()) {
    if (origin && !merged.has(originIdentity(origin))) merged.set(originIdentity(origin), origin);
  }
  return [...merged.values()];
}

function markOrigins(taint, name, origins) {
  const prior = taint.get(name) || [];
  const merged = mergeOrigins(prior, origins);
  if (merged.length === prior.length) return false;
  taint.set(name, merged);
  return true;
}

export function expressionSecret(expr) {
  let secret = false;
  walk(expr, (n) => {
    if (secret || (n !== expr && /^(JSX|ArrowFunctionExpression|FunctionExpression)/.test(n.type))) return false;
    if ((n.type === 'MemberExpression' || n.type === 'OptionalMemberExpression') &&
        ((!n.computed && secretIdentifier(n.property.name || '')) ||
         (n.computed && n.property.type === 'StringLiteral' && secretIdentifier(n.property.value)))) secret = true;
    return !secret;
  });
  return secret || [...dataIdsIn(expr)].some(secretIdentifier) ? 'secret name' : null;
}

export function browserStorageOrigin(expr) {
  let origin = null;
  walk(expr, (node) => {
    if (isSecretOrigin(origin) || (node !== expr && /^(JSX|ArrowFunctionExpression|FunctionExpression)/.test(node.type))) return false;
    if (!/^(CallExpression|OptionalCallExpression)$/.test(node.type)) return true;
    const callee = node.callee;
    if (!/^(MemberExpression|OptionalMemberExpression)$/.test(callee.type) || callee.property.name !== 'getItem') return true;
    const owner = callee.object;
    const storage = owner.type === 'Identifier' ? owner.name
      : owner.type === 'MemberExpression' && /^(window|globalThis|self)$/.test(owner.object.name || '') ? owner.property.name : null;
    if (!/^(localStorage|sessionStorage)$/.test(storage || '')) return true;
    const key = node.arguments[0]?.type === 'StringLiteral' ? node.arguments[0].value : '';
    origin = strongestOrigin([origin, secretIdentifier(key) ? 'secret name browser storage key'
      : `unknown ${storage}.getItem(${/^[\w.-]{1,48}$/.test(key) ? key : ''})`]);
    return true;
  });
  return origin;
}

export function bindingNames(pattern, out = []) {
  if (!pattern) return out;
  if (pattern.type === 'Identifier') out.push(pattern.name);
  else if (pattern.type === 'ObjectPattern') pattern.properties.forEach((p) => bindingNames(p.type === 'RestElement' ? p.argument : p.value, out));
  else if (pattern.type === 'ArrayPattern') pattern.elements.forEach((e) => bindingNames(e, out));
  else if (pattern.type === 'AssignmentPattern') bindingNames(pattern.left, out);
  else if (pattern.type === 'RestElement') bindingNames(pattern.argument, out);
  return out;
}

export function markSecretBindings(taint, pattern, fields) {
  let changed = false;
  walk(pattern, (node) => {
    if (node.type !== 'ObjectPattern') return true;
    for (const prop of node.properties) {
      const key = prop.key?.type === 'StringLiteral' ? prop.key.value : !prop.computed && prop.key?.name;
      const field = fields.get(key);
      const schemaOrigin = field?.category === 'secret' || field?.special_category || field?.conflicting
        ? fieldOrigin({ ...field, name: key, ambiguous: Boolean(field.conflicting) }) : null;
      const origin = strongestOrigin([schemaOrigin, secretIdentifier(key || '') ? `secret name ${key}` : null]);
      for (const name of bindingNames(prop.value)) changed = markOrigin(taint, name, origin) || changed;
    }
    return true;
  });
  return changed;
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
  const globals = new Map();
  for (const statement of ast.program.body) {
    const n = statement.declaration || statement;
    if (n.type === 'TSInterfaceDeclaration') types.set(n.id.name, n.body);
    if (n.type === 'TSTypeAliasDeclaration') types.set(n.id.name, n.typeAnnotation);
    if (n.type === 'VariableDeclaration' && n.kind === 'const') for (const d of n.declarations) if (d.id.type === 'Identifier') globals.set(d.id.name, d.init);
  }
  const found = [];
  const add = (name, fn, line) => {
    if (!isComponentName(name) || !fn || !hasJsx(fn.body)) return;
    const props = new Map();
    const propTypes = new Map();
    const propAnnotations = new Map();
    const stringProps = new Set();
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
        if (n.type !== 'TSPropertySignature' || n.key?.type !== 'Identifier') return true;
        propTypes.set(n.key.name, [...typeNames(n.typeAnnotation)].join(' '));
        const annotation = n.typeAnnotation?.typeAnnotation;
        propAnnotations.set(n.key.name, annotation);
        const types = annotation?.type === 'TSUnionType' ? annotation.types : [annotation];
        if (types.some((type) => type?.type === 'TSStringKeyword') &&
            types.every((type) => /^(TSStringKeyword|TSNullKeyword|TSUndefinedKeyword)$/.test(type?.type || ''))) stringProps.add(n.key.name);
        return false;
      });
    }
    found.push({ name, file, line, endLine: fn.loc.end.line, fn, props, propsObject, propTypes, propAnnotations, stringProps, types, globals });
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
  const defaultExport = ast.program.body.find((n) => n.type === 'ExportDefaultDeclaration');
  let defaultValue = defaultExport?.declaration;
  while (defaultValue?.type === 'CallExpression' && defaultValue.arguments[0]) defaultValue = defaultValue.arguments[0];
  if (defaultValue && /^(ArrowFunctionExpression|FunctionExpression|FunctionDeclaration)$/.test(defaultValue.type)
      && !found.some((c) => c.fn === defaultValue)) {
    add(defaultValue.id?.name || 'DefaultExport', defaultValue, defaultExport.loc.start.line);
    const component = found.find((c) => c.fn === defaultValue);
    if (component) component.isDefault = true;
  }
  return found;
}

function oneTimeCodeInput(attrs, component) {
  if (attrs.get('autoComplete') === 'one-time-code') return true;
  return /otp|onetimecode|twofactor|mfa|verifycode|verificationcode/i.test(component)
    && attrs.get('inputMode') === 'numeric' && Number(attrs.get('maxLength')) > 0;
}

function staticAttrs(opening) {
  const attrs = new Map();
  for (const attr of opening.attributes) {
    if (attr.type === 'JSXSpreadAttribute') { attrs.clear(); continue; }
    const name = jsxName(attr.name);
    const value = attr.value?.type === 'JSXExpressionContainer' ? attr.value.expression.value : attr.value?.value;
    attrs.set(name, value);
  }
  return attrs;
}

const NATIVE_CONTROL = /^(input|textarea|select)$/;
const NATIVE_CHOICE_TYPE = /^(checkbox|radio|range)$/i;
const CHOICE_ROLE = /^(switch|checkbox|radio|slider|option|tab|listbox|combobox)$/i;
const CHOICE_TAG = /^(Checkbox|Radio\w*|Switch|Toggle\w*|Select|Combobox|Listbox|Slider)$/;
const CHOICE_STATE = /^(checked|defaultChecked|selected|aria-checked|aria-pressed|aria-selected)$/;

export function controlDetails(attrs, tag, component) {
  const name = attrs.get('name') || attrs.get('id');
  const type = attrs.get('type');
  const choice = tag === 'select' || (tag === 'input' && NATIVE_CHOICE_TYPE.test(type || ''))
    || CHOICE_ROLE.test(attrs.get('role') || '') || CHOICE_TAG.test(tag.split('.').pop())
    || (tag === 'button' && attrs.has('aria-pressed'));
  const control = NATIVE_CONTROL.test(tag) || choice || /(?:Input|TextField|Textarea|TextArea)$/.test(tag);
  const code = tag === 'input' && oneTimeCodeInput(attrs, component);
  const password = tag === 'input' && (type === 'password' || /^(current|new)-password$/.test(attrs.get('autoComplete') || ''));
  const credential = control && (password || secretInputName(attrs.get('name')) || secretInputName(attrs.get('id')) || /^(current-password|new-password|cc-number|cc-csc|one-time-code)$/i.test(attrs.get('autoComplete') || ''));
  const special = control && (specialCategoryName(name) || specialCategoryName(attrs.get('aria-label'))
    || (/health|medical|patient|symptom|clinical/i.test(component) && /^(conditions?|answers?|mood)$/i.test(name || '')));
  return { name, choice, code, credential, special, password };
}

function togglesPassword(opening) {
  const type = opening.attributes.find((attr) => attr.type === 'JSXAttribute' && jsxName(attr.name) === 'type');
  const expr = type?.value?.expression;
  if (expr?.type !== 'ConditionalExpression') return false;
  const values = [expr.consequent, expr.alternate].filter((branch) => branch.type === 'StringLiteral').map((branch) => branch.value);
  return values.includes('text') && values.includes('password');
}

function lexicalBindings(fn) {
  const scopes = new Map();
  const isFunction = (n) => /Function|Method$/.test(n.type);
  const declare = (scope, pattern) => {
    for (const name of bindingNames(pattern)) if (!scope.bindings.has(name)) scope.bindings.set(name, { name });
  };
  walk(fn, (n, parent) => {
    const enclosing = scopes.get(parent);
    const fnScope = isFunction(n);
    const scope = fnScope || /^(BlockStatement|ForStatement|ForOfStatement|ForInStatement|CatchClause|SwitchStatement)$/.test(n.type)
      ? { parent: enclosing, bindings: new Map(), fnScope } : enclosing;
    scopes.set(n, scope);
    if (n.type === 'FunctionDeclaration' && enclosing) declare(enclosing, n.id);
    if (fnScope) for (const param of n.params || []) declare(scope, param);
    if (n.type === 'CatchClause') declare(scope, n.param);
    if (n.type === 'VariableDeclarator') {
      let owner = scope;
      if (parent.kind === 'var') while (!owner.fnScope) owner = owner.parent;
      declare(owner, n.id);
    }
  });
  return (name, node) => {
    for (let scope = scopes.get(node); scope; scope = scope.parent) {
      if (scope.bindings.has(name)) return scope.bindings.get(name);
    }
    return name;
  };
}

function modelProvenance(comp, key, schema) {
  const local = new Map();
  const types = (type, seen = new Set()) => {
    if (!type || seen.has(type)) return undefined;
    if (type.type === 'TSArrayType') return types(type.elementType, seen);
    if (type.type === 'TSParenthesizedType') return types(type.typeAnnotation, seen);
    if (type.type === 'TSUnionType') {
      const members = type.types.filter((member) => !/^(TSNullKeyword|TSUndefinedKeyword)$/.test(member.type));
      return members.length === 1 ? types(members[0], seen) : undefined;
    }
    if (type.type === 'TSTypeLiteral' || type.type === 'TSInterfaceBody') return null;
    if (type.type !== 'TSTypeReference') return undefined;
    const name = type.typeName;
    const param = type.typeParameters?.params[0];
    if (name.type === 'Identifier') {
      if (/^(Array|ReadonlyArray|Promise|Partial|Readonly|NonNullable|Pick|Omit)$/.test(name.name)) return types(param, seen);
      if (comp.types.has(name.name)) return types(comp.types.get(name.name), new Set([...seen, type]));
      const imported = comp.typeImports.get(name.name);
      if (imported) return /(?:prisma|generated[\\/]client)/i.test(imported[0]) ? schemaModel(schema, imported[1]) : undefined;
      return schemaModel(schema, name.name) || undefined;
    }
    if (name.type === 'TSQualifiedName' && name.left.type === 'Identifier') {
      const imported = comp.typeImports.get(name.left.name);
      return imported && /(?:prisma|generated[\\/]client)/i.test(imported[0]) ? schemaModel(schema, name.right.name) : null;
    }
    return undefined;
  };
  const get = (expr) => {
    if (!expr) return undefined;
    if (/^(TSAsExpression|TSSatisfiesExpression)$/.test(expr.type)) {
      const type = types(expr.typeAnnotation);
      return type === undefined ? get(expr.expression) : type;
    }
    if (/^(TSNonNullExpression|ParenthesizedExpression|AwaitExpression)$/.test(expr.type)) return get(expr.expression || expr.argument);
    if (expr.type === 'Identifier') {
      const binding = key(expr.name, expr);
      if (local.has(binding)) return local.get(binding) === MIXED_MODEL ? undefined : local.get(binding);
      const global = typeof binding === 'string' && comp.globals.get(binding);
      return /^(ObjectExpression|ArrayExpression)$/.test(global?.type || '') ? null : undefined;
    }
    if (/^(ObjectExpression|ArrayExpression)$/.test(expr.type)) return null;
    if (/^(MemberExpression|OptionalMemberExpression)$/.test(expr.type)) {
      const owner = get(expr.object);
      if (owner === undefined) return undefined;
      if (expr.computed && expr.property.type === 'NumericLiteral') return owner;
      const field = owner?.get(memberFieldName(expr));
      return field && 'relation' in field ? field.relation : null;
    }
    if (/^(CallExpression|OptionalCallExpression)$/.test(expr.type)) {
      const typed = types(expr.typeParameters?.params[0] || expr.typeArguments?.params[0]);
      if (typed !== undefined) return typed;
      const name = calleeName(expr)?.match(/^use(?:Current)?([A-Z]\w*)$/)?.[1];
      return schemaModel(schema, name) || undefined;
    }
    return undefined;
  };
  const mark = (binding, model) => {
    if (model === undefined) return false;
    const value = local.has(binding) && local.get(binding) !== model ? MIXED_MODEL : model;
    if (local.has(binding) && local.get(binding) === value) return false;
    local.set(binding, value);
    return true;
  };
  return { get, mark, types };
}

const MIXED_MODEL = Symbol('multiple model sources');

function secretNavigation(ast, code) {
  const sites = [];
  walk(ast, (node) => {
    if (node.type !== 'CallExpression') return true;
    const callee = node.callee;
    const navigation = (callee.type === 'Identifier' && /^(navigate|redirect)$/.test(callee.name))
      || (callee.type === 'MemberExpression' && callee.object.type === 'Identifier'
        && /^(router|history|location)$/.test(callee.object.name)
        && /^(push|replace|assign|navigate)$/.test(callee.property.name || ''));
    const arg = node.arguments[0];
    if (!navigation || !arg) return true;
    const field = schemaFieldIn(arg, SCHEMA);
    const origin = field?.category === 'secret' && !field.ambiguous ? fieldOrigin(field) : expressionSecret(arg);
    if (origin) sites.push({
      line: node.loc.start.line,
      tag: '',
      kind: 'url',
      expr: code.slice(arg.start, arg.end).replace(/\s+/g, ' ').slice(0, 120),
      origin,
      confidence: 'high',
    });
    return true;
  });
  return sites;
}

// Analyses one component given its tainted props. Returns render sites and edges to children.
function analyse(comp, taintedProps, incomingModels, schema) {
  const taint = new Map(); // lexical binding -> origin
  const bindingKey = lexicalBindings(comp.fn);
  const provenance = modelProvenance(comp, bindingKey, schema);
  const propModels = new Map();
  const param = comp.fn.params[0];
  const mark = (name, origins, node) => markOrigins(taint, bindingKey(name, node), origins);
  const propOrigins = new Map();
  const propModel = (prop) => {
    const annotated = provenance.types(comp.propAnnotations.get(prop));
    return annotated || incomingModels.get(prop) || annotated;
  };
  for (const [prop, local] of comp.props) {
    provenance.mark(bindingKey(local, param), propModel(prop));
  }
  for (const prop of new Set([...comp.propAnnotations.keys(), ...incomingModels.keys()])) {
    const model = propModel(prop);
    if (model !== undefined) propModels.set(prop, { relation: model === MIXED_MODEL ? undefined : model });
  }
  if (comp.propsObject && propModels.size) provenance.mark(bindingKey(comp.propsObject, param), propModels);
  for (const prop of new Set([...comp.props.keys(), ...comp.propTypes.keys(), ...taintedProps.keys()])) {
    const model = propModels.get(prop)?.relation;
    const qualification = comp.propAnnotations.get(prop)?.typeName?.type === 'TSQualifiedName';
    const origins = mergeOrigins(taintedProps.get(prop), taintedProps.get('*'), secretIdentifier(prop) ? `secret name ${prop}` : null,
      specialCategoryName(prop) ? `special category prop ${prop}${/Patient|Customer/.test(comp.propTypes.get(prop) || '') ? ' about a third-party record' : ''}` : null,
      (!qualification && personType(comp.propTypes.get(prop) || '')) || model ? `prop ${prop}: ${comp.propTypes.get(prop)}` : null);
    const fallback = (/^(loaderData|actionData)$/.test(prop) ? `prop ${prop}` : null)
      // A route module gets the URL parameters as a prop, for example a team slug.
      || (prop === 'params' && /(^|[\\/])(routes|pages|app)[\\/]/.test(comp.file) ? 'route params' : null)
      || (qualification || comp.stringProps.has(prop) || /^(?:thread|apiKeys|memberName|customer|contact|patient|record|opportunity|rows)$/.test(prop) ? `unknown prop ${comp.file}:${comp.name}.${prop}` : null);
    const evidence = origins.length ? origins : mergeOrigins(fallback);
    if (evidence.length) propOrigins.set(prop, evidence);
    if (comp.props.has(prop)) mark(comp.props.get(prop), evidence, param);
  }
  const expressionOrigins = (expr, constants) => {
    const field = schemaFieldIn(expr, SCHEMA, constants, provenance.get);
    const inputs = [];
    const propsRead = new Set();
    const sensitiveFields = [];
    walk(expr, (node) => {
      if (node !== expr && /^(JSX|ArrowFunctionExpression|FunctionExpression)/.test(node.type)) return false;
      const prop = memberFieldName(node);
      if (prop == null) return true;
      const owner = node.object;
      if (comp.propsObject && owner.type === 'Identifier' && bindingKey(owner.name, owner) === bindingKey(comp.propsObject, param)) {
        propsRead.add(owner);
        inputs.push(...mergeOrigins(propOrigins.get(prop), propOrigins.get('*')));
      }
      if (specialCategoryName(prop) || (/health|medical|patient|symptom|clinical/i.test(comp.name) && /^mood$/i.test(prop))) sensitiveFields.push(prop);
      return true;
    });
    for (const id of dataReferencesIn(expr)) {
      if (propsRead.has(id)) continue;
      const key = bindingKey(id.name, id);
      inputs.push(...(taint.get(key) || []));
      if (comp.propsObject && key === bindingKey(comp.propsObject, param)) inputs.push(...mergeOrigins(...propOrigins.values()));
    }
    const source = strongestOrigin(inputs);
    const special = sensitiveFields.length && source && (!UNKNOWN_ORIGIN.test(source) || /health|medical|patient|symptom|clinical/i.test(comp.name))
      ? `special category field ${sensitiveFields[0]}${originCategory(source) === 'third-party' ? ' about a third-party record' : ''}` : null;
    const schemaOrigin = fieldOrigin(field, source);
    // A recognized schema field or sensitive field provides classification for that property read.
    // Keep unrelated low-confidence values in composite expressions visible for review.
    const covered = (schemaOrigin && !UNKNOWN_ORIGIN.test(schemaOrigin) || special) && memberFieldName(expr) != null;
    return mergeOrigins(
      covered ? inputs.filter((origin) => !UNKNOWN_ORIGIN.test(origin)) : inputs,
      schemaOrigin,
      expressionSecret(expr),
      browserStorageOrigin(expr),
      special,
    );
  };
  const bind = (pattern, origins, model, node) => {
    if (!pattern) return false;
    if (pattern.type === 'AssignmentPattern') return bind(pattern.left, origins, model, node);
    if (pattern.type === 'ObjectPattern') {
      let changed = false;
      for (const prop of pattern.properties) {
        const name = prop.key?.type === 'StringLiteral' ? prop.key.value : !prop.computed && prop.key?.name;
        const field = model === undefined ? SCHEMA.get(name) : model?.get(name);
        const schemaOrigin = fieldOrigin(field && { ...field, name, ambiguous: model === undefined && Boolean(field.conflicting) }, strongestOrigin(origins));
        const localOrigins = mergeOrigins(origins, schemaOrigin,
          secretIdentifier(name || '') ? `secret name ${name}` : null);
        const memberModel = field?.relation ?? (model !== undefined && name !== 'data' ? null : model);
        changed = bind(prop.value || prop.argument, localOrigins, memberModel, node) || changed;
      }
      return changed;
    }
    let changed = false;
    for (const name of bindingNames(pattern)) {
      changed = mark(name, origins, node) || changed;
      changed = provenance.mark(bindingKey(name, node), model) || changed;
    }
    return changed;
  };
  // Sources and derived values, repeated until no new names are found.
  // React state and its setter: state holds whatever data its setter receives.
  const setters = new Map();
  const taintNamed = [];
  walk(comp.fn.body, (n) => {
    if (n.type === 'VariableDeclarator' && n.id.type === 'ArrayPattern' && n.init?.type === 'CallExpression' && /^use(State|Reducer)$/.test(calleeName(n.init) || '')) {
      const [state, setter] = n.id.elements;
      if (state?.type === 'Identifier' && setter?.type === 'Identifier') setters.set(bindingKey(setter.name, setter), state);
      // Fail closed: state typed as a named object type, such as useState<TConfigureFormSchema>(), may hold data.
      const named = [];
      walk(n.init.typeParameters, (t) => { if (t.type === 'TSTypeReference' && t.typeName?.type === 'Identifier') named.push(t.typeName.name); });
      // An enum or a setting type, such as FieldType or TabMode, holds no data.
      const dataType = named.find((t) => !SCHEMA_ENUMS.has(t) && !/(Type|Types|Kind|Mode|Status|Role|Step|Tab|Variant|Size|Color|Enum|Option|Options|Direction|Theme|Locale|Language|Format)$/.test(t));
      if (state?.type === 'Identifier' && dataType) taintNamed.push([state.name, `unknown state ${dataType}`, state]);
    }
  });
  for (const [nm, why, node] of taintNamed) mark(nm, why, node);
  while (true) {
    let changed = false;
    walk(comp.fn.body, (n) => {
      if (n.type === 'VariableDeclarator' && n.init) {
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
          // Route parameters hold slugs and names, such as a team URL.
          if (name === 'useParams') origin = 'route params';
          if (name && awaited && /^(fetch|load|get|query|request|retrieve|find|search|list)[A-Z]\w*$/.test(name)) origin = `${name}()`;
          // Fail closed: other hooks and awaited calls may return data.
          if (!origin && name && /^use[A-Z]/.test(name) && !NON_DATA_HOOKS.test(name) && !CONFIG_HOOK.test(name)) origin = `unknown ${name}()`;
          if (!origin && awaited) origin = `unknown await ${name || 'call'}()`;
        }
        const origins = mergeOrigins(origin, expressionOrigins(init));
        const type = provenance.types(n.id.typeAnnotation?.typeAnnotation);
        const model = type === undefined ? provenance.get(n.init) : type;
        changed = bind(n.id, origins, model, n) || changed;
      }
      if (n.type === 'AssignmentExpression' && n.operator === '=' && n.left.type === 'Identifier') {
        changed = bind(n.left, expressionOrigins(n.right), provenance.get(n.right), n) || changed;
      }
      if (n.type === 'CallExpression' && n.callee.type === 'Identifier' && n.arguments[0]) {
        const state = setters.get(bindingKey(n.callee.name, n.callee));
        if (state) changed = bind(state, expressionOrigins(n.arguments[0]), provenance.get(n.arguments[0]), state) || changed;
      }
      // Table cell renderers: { cell: ({ row }) => <span>{row.original.email}</span> }.
      if (n.type === 'ObjectProperty' && /^(cell|Cell|render|renderCell|cellRenderer|accessorFn)$/.test(n.key?.name || '') && (n.value.type === 'ArrowFunctionExpression' || n.value.type === 'FunctionExpression') && n.value.params[0]) {
        changed = bind(n.value.params[0], ['table row'], undefined, n.value.params[0]) || changed;
      }
      // Form fields: <FormField render={({ field }) => <Input {...field} />} /> shows what the person typed or chose.
      if (n.type === 'JSXAttribute' && n.name?.name === 'render' && n.value?.type === 'JSXExpressionContainer' && /^(ArrowFunctionExpression|FunctionExpression)$/.test(n.value.expression.type) && n.value.expression.params[0]) {
        changed = bind(n.value.expression.params[0], ['form field'], undefined, n.value.expression.params[0]) || changed;
      }
      // Callback parameters of iterations over tainted values: rows.map((row) => ...).
      if (n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && /^(map|flatMap|forEach|filter|find|some|reduce)$/.test(n.callee.property?.name || '')) {
        const origins = expressionOrigins(n.callee.object);
        const fn = n.arguments[0];
        if (fn && (fn.type === 'ArrowFunctionExpression' || fn.type === 'FunctionExpression') && fn.params[0]) {
          changed = bind(fn.params[0], origins, provenance.get(n.callee.object), fn.params[0]) || changed;
        }
      }
      return true;
    });
    if (!changed) break;
  }
  // Items of constant lists: FORMATS.map((format) => ...), Object.values(ROLES).map((role) => ...).
  const constants = new Set();
  walk(comp.fn.body, (n) => {
    if (n.type !== 'CallExpression' || n.callee.type !== 'MemberExpression' || !/^(map|flatMap|forEach|filter|find)$/.test(n.callee.property?.name || '')) return true;
    let list = n.callee.object;
    if (list.type === 'CallExpression' && list.arguments[0]) list = list.arguments[0];
    const root = list.type === 'MemberExpression' ? list.object : list;
    const fn = n.arguments[0];
    if (root?.type === 'Identifier' && CONSTANT_OBJECT.test(root.name) && !taint.has(bindingKey(root.name, root)) && fn?.params?.[0]) bindingNames(fn.params[0]).forEach((nm) => constants.add(nm));
    return true;
  });
  const sites = [];
  const edges = [];
  const uses = []; // each child component element: its name, and whether it gets private data
  const tainted = (expr) => expressionOrigins(expr, constants);
  walk(comp.fn.body, (n) => {
    if (n.type !== 'JSXElement') return true;
    const opening = n.openingElement;
    const tag = jsxName(opening.name);
    const line = opening.loc.start.line;
    const isComp = isComponentName(tag.split('.')[0]);
    const edgesBefore = edges.length;
    const input = controlDetails(staticAttrs(opening), tag, comp.name);
    const addSite = (site) => {
      const origins = site.origins || [site.origin];
      sites.push({ tag, element: opening.start, ...site, origins, origin: strongestOrigin(origins) });
    };
    const revealedPassword = (tag === 'input' || /(?:Input|TextField)$/.test(tag)) && togglesPassword(opening);
    if ((input.credential || input.code || revealedPassword) && !input.password) {
      const value = opening.attributes.find((attr) => attr.type === 'JSXAttribute' && /^(value|defaultValue)$/.test(jsxName(attr.name)));
      addSite({ line: value?.loc.start.line || line, kind: 'input secret', expr: input.name || (input.code ? 'one-time code' : 'credential input'), origin: 'secret name input' });
    } else if (input.special) {
      addSite({ line, kind: input.choice ? 'choice' : 'input special', expr: input.name || 'sensitive input', origin: `special category field ${input.name || 'input'}` });
    }
    for (const attr of opening.attributes) {
      if (attr.type === 'JSXSpreadAttribute') {
        const origins = tainted(attr.argument);
        if (origins.length) {
          if (isComp) edges.push({ child: tag, prop: '*', origins });
          addSite({ line: attr.loc.start.line, kind: isComp ? 'prop *' : 'attr *', expr: exprText(attr.argument), origins });
        }
        continue;
      }
      if (!attr.value || attr.value.type !== 'JSXExpressionContainer') continue;
      const attrName = jsxName(attr.name);
      if (/^on[A-Z]|^(key|ref|className|style|sx|css)$/.test(attrName) && !/^style$/.test(attrName)) continue;
      const origins = tainted(attr.value.expression);
      if (!origins.length) continue;
      if (isComp) edges.push({ child: tag, prop: attrName, origins, model: provenance.get(attr.value.expression) });
      const sensitiveChoice = origins.some(isSpecialOrigin) && (input.choice || CHOICE_STATE.test(attrName));
      if (sensitiveChoice && !isComp) addSite({ line: attr.loc.start.line, kind: 'choice', expr: exprText(attr.value.expression), origins });
      else if (!isComp && attrName === 'dangerouslySetInnerHTML') addSite({ line: attr.loc.start.line, kind: 'html', expr: exprText(attr.value.expression), origins });
      else if (!isComp && DOM_DATA_ATTR.test(attrName)) addSite({ line: attr.loc.start.line, kind: `attr ${attrName}`, expr: exprText(attr.value.expression), origins });
      // Data handed to a child component is shown there, whatever the prop is called.
      if (isComp) addSite({ line: attr.loc.start.line, kind: `prop ${attrName}`, expr: exprText(attr.value.expression), origins });
    }
    for (const child of n.children) {
      if (child.type !== 'JSXExpressionContainer' || child.expression.type === 'JSXEmptyExpression') continue;
      const parts = shownParts(child.expression);
      const predicate = child.expression.type === 'ConditionalExpression' ? child.expression.test
        : child.expression.type === 'LogicalExpression' && child.expression.operator === '&&' ? child.expression.left : null;
      const predicateOrigins = predicate ? tainted(predicate) : [];
      if (predicateOrigins.some(isSpecialOrigin)) {
        const text = child.expression.type === 'ConditionalExpression' && parts.length === 2 && parts.every((part) => part.type === 'StringLiteral');
        addSite({ line: predicate.loc.start.line, kind: text ? 'text' : 'condition', expr: exprText(predicate), origins: predicateOrigins });
      }
      for (const part of parts) {
        const origins = tainted(part);
        if (!origins.length) continue;
        addSite({ line: part.loc.start.line, kind: 'text', expr: exprText(part), origins });
        if (isComp) edges.push({ child: tag, prop: 'children', origins });
      }
    }
    if (isComp) uses.push({ child: tag, tainted: edges.length > edgesBefore, line });
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
let SCHEMA = new Map();
let SCHEMA_ENUMS = new Set();
// Origins that the pass could not name: a hook or call that no list knows. Sites from them have low confidence.
export const UNKNOWN_ORIGIN = /^unknown /;
// Hooks named for settings or UI configuration, which return no data.
export const CONFIG_HOOK = /(Types|Options|Config|Columns|Steps|Tabs|Settings?Form|Nonce|Sort|Range|Filters?|Icons?|Labels?)$/;
const exprText = (e) => (e && e.start != null ? SOURCE_TEXT.slice(e.start, e.end).replace(/\s+/g, ' ').slice(0, 120) : '');

export function categoryOf(sites) {
  const categories = new Set(sites.map((site) => site.category || originCategory(site.origin)));
  if (categories.has('secret')) return 'secret?';
  if (categories.has('third-party')) return 'third-party?';
  return 'personal?';
}

// The JSX elements of a file as [start line, last line of the start tag, end line, tag name, start
// column], for checking which lines an annotated element covers. Empty for files that are not JSX.
export function elementSpans(file, code) {
  if (!PARSEABLE.test(file)) return [];
  const ast = parseFile(file, code);
  const out = [];
  if (ast) walk(ast, (n) => { if (n.type === 'JSXElement') out.push([n.loc.start.line, n.openingElement.loc.end.line, n.loc.end.line, jsxName(n.openingElement.name), n.openingElement.loc.start.column, n.start, n.end, n.openingElement.end]); });
  return out;
}

export const componentUsageKey = (file, name) => `${file}:${name}`;

export function addComponentUse(usage, name, file, use) {
  const stats = (usage[name] ||= [0, 0, []]);
  stats[0]++;
  if (use.tainted) stats[1]++;
  if (stats[2].length < 30) stats[2].push([file, use.line, use.tainted]);
}

// Resolve explicit relative imports before considering framework or fixture auto-imports.
export function componentResolver(comps, extensions, modules = null) {
  const byName = new Map();
  const byFile = new Map();
  for (const c of comps) {
    if (!byName.has(c.name)) byName.set(c.name, []);
    if (!byFile.has(c.abs)) byFile.set(c.abs, []);
    byName.get(c.name).push(c);
    byFile.get(c.abs).push(c);
  }
  const resolveFile = (from, source) => {
    if (!source.startsWith('.')) return null;
    const base = path.resolve(path.dirname(from), source);
    const inferred = base.replace(/\.[cm]?jsx?$/, '');
    return [base, ...extensions.map((ext) => inferred + ext), ...extensions.map((ext) => path.join(base, `index${ext}`))]
      .find((file) => modules?.has(file) || byFile.has(file));
  };
  const exportedComponent = (file, exported, visited = new Set()) => {
    const key = `${file}:${exported}`;
    if (visited.has(key)) return [];
    const module = modules?.get(file);
    const known = module?.exports.get(exported);
    const local = byFile.get(file) || [];
    if (known?.length === 1) return local.filter((c) => c.name === known[0]);
    if (known) return exportedComponent(resolveFile(file, known[0]), known[1], new Set([...visited, key]));
    if (exported === 'default') return local.filter((c) => c.isDefault);
    if (!module) return local.filter((c) => c.name === exported);
    return [...new Set(module.stars.flatMap((source) => exportedComponent(resolveFile(file, source), exported, new Set([...visited, key]))))];
  };
  return (parent, tag) => {
    const [name, member, ...rest] = tag.split('.');
    if (rest.length) return [];
    const binding = parent.imports.get(name);
    if (binding) {
      const [source, exported] = binding;
      if (Boolean(member) !== (exported === '*')) return [];
      const target = resolveFile(parent.abs, source);
      const found = target ? exportedComponent(target, member || exported) : [];
      return found.length === 1 ? found : [];
    }
    if (member) return [];
    const local = (byFile.get(parent.abs) || []).filter((c) => c.name === name);
    const found = local.length ? local : byName.get(name) || [];
    return found.length === 1 ? found : [];
  };
}

export function componentImports(program, includeTypes = false) {
  const imports = new Map();
  for (const statement of program.body) {
    if (statement.type !== 'ImportDeclaration' || (!includeTypes && statement.importKind === 'type')) continue;
    for (const binding of statement.specifiers) {
      if (!includeTypes && binding.importKind === 'type') continue;
      const imported = binding.type === 'ImportDefaultSpecifier' ? 'default' : binding.type === 'ImportNamespaceSpecifier' ? '*' : binding.imported.name || binding.imported.value;
      imports.set(binding.local.name, [statement.source.value, imported]);
    }
  }
  return imports;
}

function componentExports(program, imports) {
  const exports = new Map();
  const stars = [];
  const names = (node) => node?.type === 'VariableDeclaration' ? node.declarations.flatMap((d) => bindingNames(d.id)) : bindingNames(node?.id);
  const spelling = (node) => node?.name || node?.value;
  for (const n of program.body) {
    if (n.type === 'ExportAllDeclaration' && n.exportKind !== 'type') stars.push(n.source.value);
    if (n.type === 'ExportDefaultDeclaration') {
      const name = n.declaration.name || n.declaration.id?.name;
      if (name) exports.set('default', imports.get(name) || [name]);
    }
    if (n.type !== 'ExportNamedDeclaration' || n.exportKind === 'type') continue;
    for (const name of names(n.declaration)) exports.set(name, [name]);
    for (const specifier of n.specifiers) {
      if (specifier.type !== 'ExportSpecifier' || specifier.exportKind === 'type') continue;
      const name = spelling(specifier.local);
      exports.set(spelling(specifier.exported), n.source ? [n.source.value, name] : imports.get(name) || [name]);
    }
  }
  return { exports, stars };
}

// Runs the pass over files (absolute paths). Returns one candidate per component that renders data.
// `schema` is the field map from readSchemas, when the app has one.
export function componentPass(root, files, schema = null) {
  SCHEMA = schema?.fields || new Map();
  SCHEMA_ENUMS = new Set(schema?.enums || []);
  const comps = [];
  let parsed = 0;
  let failed = 0;
  const failures = [];
  const sources = new Map();
  const modules = new Map();
  const urlCandidates = [];
  const passwordInputs = {};
  for (const file of files.filter((f) => PARSEABLE.test(f))) {
    const code = fs.readFileSync(file, 'utf8');
    const ast = parseFile(file, code);
    if (!ast) { failed++; failures.push(path.relative(root, file)); continue; }
    parsed++;
    sources.set(file, code);
    walk(ast, (node) => {
      if (node.type !== 'JSXOpeningElement' || jsxName(node.name) !== 'input') return true;
      const attrs = staticAttrs(node);
      if (attrs.get('type') !== 'password' && !/^(current|new)-password$/.test(attrs.get('autoComplete') || '')) return true;
      if (node.attributes.some((attr) => attr.type === 'JSXSpreadAttribute')) return true;
      const { start, end } = node.loc;
      const input = { line: start.line, end: end.line, column: start.column, match: '<input' };
      (passwordInputs[path.relative(root, file)] ||= []).push(input);
      return true;
    });
    for (const site of secretNavigation(ast, code)) urlCandidates.push({
      file: path.relative(root, file),
      line: site.line,
      end_line: site.line,
      component: 'Navigation',
      rules: ['component'],
      patterns: ['P-reveal-secret'],
      category_hint: 'secret?',
      confidence: 'high',
      sites: [site],
      site_lines: [site.line],
      snippet: 'Navigation puts a secret in a URL',
    });
    const imports = componentImports(ast.program);
    const typeImports = componentImports(ast.program, true);
    modules.set(file, componentExports(ast.program, imports));
    for (const c of componentsIn(ast, path.relative(root, file))) comps.push({ ...c, abs: file, imports, typeImports });
  }
  const resolve = componentResolver(comps, ['.tsx', '.jsx', '.ts', '.js', '.mjs'], modules);
  const taintedProps = new Map(comps.map((c) => [c, new Map()]));
  const propModels = new Map(comps.map((c) => [c, new Map()]));
  const results = new Map();
  // Propagate tainted props from parents to children until nothing changes.
  let queue = [...comps];
  while (queue.length) {
    const next = new Set();
    for (const c of queue) {
      SOURCE_TEXT = sources.get(c.abs);
      const r = analyse(c, taintedProps.get(c), propModels.get(c), schema);
      results.set(c, r);
      for (const e of r.edges) {
        for (const child of resolve(c, e.child)) {
          const tp = taintedProps.get(child);
          const origins = e.origins.map((origin) => {
            const source = sourceModule(origin) || c.file;
            return `${origin.split(' via ')[0]} via source ${source} via <${c.name} ${e.prop === '*' ? '{...}' : e.prop}>`;
          });
          if (markOrigins(tp, e.prop, origins)) next.add(child);
          const models = propModels.get(child);
          const previous = models.get(e.prop);
          const model = previous && previous !== e.model ? MIXED_MODEL : e.model;
          if (e.model && previous !== model) {
            models.set(e.prop, model);
            next.add(child);
          }
        }
      }
    }
    queue = [...next];
  }
  const candidates = [];
  for (const [c, r] of results) {
    if (!r.sites.length) continue;
    const lines = [...new Set(r.sites.map((s) => s.line))].sort((a, b) => a - b);
    const sites = r.sites.map((s) => ({
      ...s,
      category: originCategory(s.origin),
      special_category: s.origins.some(isSpecialOrigin),
      confidence: !isSecretOrigin(s.origin) && s.origins.some((origin) => UNKNOWN_ORIGIN.test(origin)) ? 'low' : 'high',
    }));
    candidates.push({
      file: c.file,
      line: c.line,
      end_line: c.endLine,
      component: c.name,
      rules: ['component'],
      patterns: ['P-crm-record'],
      category_hint: categoryOf(r.sites),
      confidence: sites.some((s) => s.confidence === 'high') ? 'high' : 'low',
      sites,
      site_lines: lines,
      snippet: `<${c.name}> renders ${r.sites.length} value${r.sites.length === 1 ? '' : 's'} from ${[...new Set(r.sites.map((s) => s.origin))].slice(0, 2).join('; ')}`,
    });
  }
  // Uses of each component across the app, and how many of them pass private data.
  // usage[name] = [uses, uses with private data, up to 30 locations as [file, line, private]].
  const usage = {};
  for (const [c, r] of results) {
    for (const u of r.uses) {
      const [child] = resolve(c, u.child);
      const names = child ? [child.name, componentUsageKey(child.file, child.name)] : [u.child.split('.').pop()];
      for (const name of names) addComponentUse(usage, name, c.file, u);
    }
  }
  // Where each component sits, and whether it gets data from its own hooks or typed props
  // (own data) or only from untyped props that its parents pass.
  const index = {};
  for (const [c, r] of results) {
    const own = r.sites.some((s) => !/ via /.test(s.origin) && !/^prop \w+$/.test(s.origin));
    (index[c.file] ||= []).push([c.name, c.line, c.endLine, own]);
  }
  return { candidates: [...candidates, ...urlCandidates], parsed, failed, failures, components: comps.length, usage, index, passwordInputs };
}
