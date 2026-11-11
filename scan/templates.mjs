// Template pass for Vue and Svelte single-file components: parses the script blocks, finds the
// values that hold data (props, store getters, loaded data, fetches), and reports where the
// template renders them. Data passed to child components is followed across files, as in the
// component pass for JSX. One candidate per file.
import fs from 'node:fs';
import path from 'node:path';
import { parse, parseExpression } from '@babel/parser';
import { walk, idsIn, dataIdsIn, bindingNames, calleeName, secretIdentifier, categoryOf, personType, NON_DATA_HOOKS, DATA_HOOK, SECRET_NAME, DOM_DATA_ATTR, UNKNOWN_ORIGIN, elementSpans } from './components.mjs';
import { schemaFieldIn, schemaPublicIn } from './schemas.mjs';

let SCHEMA = new Map();

const TEMPLATE_FILE = /\.(vue|svelte|blade\.php)$/;
// Prop names that say the prop holds a person, a conversation or a record.
const DATA_PROP = /^(user|users|contact|contacts|customer|member|members|person|people|profile|account|conversation|conversations|chat|message|messages|sender|author|owner|assignee|agent|agents|participant|participants|recipient|recipients|invitee|asset|assets|album|albums|partner|invoice|invoices|record|records|item|row|rows|data|lead|ticket|comment|email|phone|address)$/i;
// Store getters that hold flags and settings, not data.
const FLAG_NAME = /^(uiFlags|is[A-Z]\w*|has[A-Z]\w*|can[A-Z]\w*|should[A-Z]\w*|\w*(Flags?|Loading|Fetching|Enabled|Visible|Open|Count|Mode|Theme|Locale)$)/;
// Object and array props that hold settings or UI state, not records.
const CONFIG_PROP = /^(options?|config|settings|styles?|icons?|columns?|fields?|filters?|rules|validations?|i18n|labels?|translations?|tabs|menu\w*|actions?|buttons?|steps|sizes?|variants?|classes|theme|position|breakpoints?|items?Per\w*|pagination|meta|schema|layout|chartOptions|errors?|v\$|attrs|events|children|badges|dropdown\w*|\w*(Types|Keys|Options|Locales|Config|Settings|Columns|Filters))$/i;
const SKIP_ATTR = /^(class|style|key|ref|is|id|v-if|v-else-if|v-show|slot|transition|in|out|animate|use|this)$/;

const pascal = (s) => s.replace(/(^|[-_])(\w)/g, (_, __, c) => c.toUpperCase());
const camel = (s) => s.replace(/-(\w)/g, (_, c) => c.toUpperCase());
const isComponentTag = (tag) => /^[A-Z]/.test(tag) || (tag.includes('-') && !/^(svelte|v)-/.test(tag));
const lineAt = (text, offset) => text.slice(0, offset).split('\n').length;

// Script blocks with their content and language.
function scripts(text) {
  return [...text.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)].map((m) => ({ ts: /lang=["']ts/.test(m[1]), code: m[2], start: m.index, end: m.index + m[0].length }));
}

// The template region: the outer <template> in Vue, everything outside script and style in Svelte.
function templateRegion(text, file) {
  if (file.endsWith('.vue')) {
    const open = text.search(/<template\b[^>]*>/);
    const close = text.lastIndexOf('</template>');
    if (open < 0 || close < open) return null;
    return { start: text.indexOf('>', open) + 1, end: close };
  }
  return { start: 0, end: text.length, blank: [...text.matchAll(/<(script|style)\b[\s\S]*?<\/\1>/g)].map((m) => [m.index, m.index + m[0].length]) };
}

function parseExpr(code) {
  try {
    return parseExpression(code, { plugins: ['typescript'] });
  } catch {
    return null;
  }
}

// Reads a balanced {...} or quoted value starting at text[i] (the opening character). Returns the end index.
function balanced(text, i) {
  const open = text[i];
  if (open === '"' || open === "'") {
    const end = text.indexOf(open, i + 1);
    return end < 0 ? text.length : end;
  }
  let depth = 0;
  let quote = null;
  for (let k = i; k < text.length; k++) {
    const ch = text[k];
    if (quote) {
      if (ch === '\\') k++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') quote = ch;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return k;
  }
  return text.length;
}

// Lists the bindings of a template: text interpolations, bound attributes, loops and local constants.
// Each binding: { kind: 'text'|'attr'|'each'|'const', tag, attr, expr, alias, offset }.
function bindings(text, region, svelte) {
  const out = [];
  const blank = region.blank || [];
  let i = region.start;
  let tag = null; // the tag that is open, while inside its start tag
  let parent = null; // the last start tag, for text
  let tagAt = 0; // where the open tag starts
  let lastComp = -1; // where the last component tag starts, for slot scopes
  while (i < region.end) {
    const skip = blank.find(([s, e]) => i >= s && i < e);
    if (skip) { i = skip[1]; continue; }
    const ch = text[i];
    if (!tag) {
      if (text.startsWith('<!--', i)) { const e = text.indexOf('-->', i); i = e < 0 ? region.end : e + 3; continue; }
      const t = text.slice(i, i + 80).match(/^<([A-Za-z][\w.:-]*)/);
      if (t) { tag = t[1]; parent = t[1]; tagAt = i; if (isComponentTag(t[1])) lastComp = i; i += t[0].length; continue; }
      if (!svelte && text.startsWith('{{', i)) {
        const e = text.indexOf('}}', i);
        out.push({ kind: 'text', tag: parent, expr: text.slice(i + 2, e), offset: i });
        i = e < 0 ? region.end : e + 2;
        continue;
      }
      if (svelte && ch === '{') {
        const e = balanced(text, i);
        const body = text.slice(i + 1, e).trim();
        let m;
        if ((m = body.match(/^#each\s+([\s\S]+?)\s+as\s+([\s\S]+?)(\s*,\s*\w+)?(\s*\([\s\S]*\))?$/))) out.push({ kind: 'each', expr: m[1], alias: m[2], offset: i });
        else if ((m = body.match(/^#await\s+([\s\S]+?)(\s+then\s+([\s\S]+))?$/))) out.push({ kind: 'each', expr: m[1], alias: m[3] || null, offset: i });
        else if ((m = body.match(/^@const\s+([\s\S]+?)\s*=\s*([\s\S]+)$/))) out.push({ kind: 'const', alias: m[1], expr: m[2], offset: i });
        else if ((m = body.match(/^@html\s+([\s\S]+)$/))) out.push({ kind: 'text', tag: parent, expr: m[1], offset: i });
        else if (!/^[#:/@]/.test(body)) out.push({ kind: 'text', tag: parent, expr: body, offset: i });
        i = e + 1;
        continue;
      }
      i++;
      continue;
    }
    // Inside a start tag.
    if (ch === '>') { tag = null; i++; continue; }
    if (svelte && ch === '{') {
      const e = balanced(text, i);
      const body = text.slice(i + 1, e).trim();
      const spread = body.startsWith('...');
      out.push({ kind: 'attr', tagAt, tag, attr: spread ? '*' : body, expr: spread ? body.slice(3) : body, offset: i });
      i = e + 1;
      continue;
    }
    const a = text.slice(i, i + 120).match(/^([:@#]?[\w.:-]+)(\s*=\s*)?/);
    if (!a) { i++; continue; }
    const name = a[1];
    i += a[0].length;
    if (!a[2]) continue;
    const q = text[i];
    const end = q === '"' || q === "'" || q === '{' ? balanced(text, i) : i;
    const value = q === '{' ? text.slice(i + 1, end) : text.slice(i + 1, end);
    const at = i;
    i = end + 1;
    if (name.startsWith('@') || /^(v-on:|on:)/.test(name) || /^on[a-z]/.test(name)) continue;
    if (svelte) {
      if (q === '{') out.push({ kind: 'attr', tagAt, tag, attr: name.replace(/^bind:/, ''), expr: value, offset: at });
      // Quoted values with interpolations: title="{user.name} ({user.email})".
      else for (const m of value.matchAll(/\{([^{}]+)\}/g)) out.push({ kind: 'attr', tag, attr: name, expr: m[1], offset: at });
      continue;
    }
    // Slot scopes: <template #item="{ element }"> gets the data of the component that renders it.
    if (/^(v-slot(:[\w-]+)?|#[\w-]+)$/.test(name)) {
      out.push({ kind: 'slot', alias: value, comp: lastComp, offset: at });
      continue;
    }
    if (name === 'v-for') {
      const m = value.match(/^\s*\(?\s*([\s\S]+?)\s*\)?\s+(in|of)\s+([\s\S]+)$/);
      if (m) out.push({ kind: 'each', expr: m[3], alias: m[1].split(',')[0].trim(), offset: at });
      continue;
    }
    // v-html, v-text and custom HTML directives such as v-dompurify-html render text.
    const bound = name.match(/^(?::|v-bind:)([\w.-]+)$/) || name.match(/^(v-model|v-text|v-[\w-]*html)(?::[\w-]+)?$/);
    if (bound) out.push({ kind: 'attr', tagAt, tag, attr: bound[1] === 'v-model' ? 'value' : /^v-/.test(bound[1]) ? 'text' : bound[1], expr: value, offset: at });
  }
  return out;
}

// Names in the script that hold data, before the template adds loop aliases.
function scriptTaint(blocks, taintedProps) {
  const taint = new Map();
  const mark = (name, why) => { if (name && !taint.has(name)) { taint.set(name, why); return true; } return false; };
  const props = new Map(); // prop name -> local name
  const propTypes = new Map();
  const asts = blocks.map((b) => {
    try {
      return parse(b.code, { sourceType: 'module', errorRecovery: true, plugins: b.ts ? ['typescript', 'decorators-legacy'] : ['decorators-legacy'] });
    } catch {
      return null;
    }
  }).filter(Boolean);
  const types = new Map();
  for (const ast of asts) {
    walk(ast, (n) => {
      if (n.type === 'TSInterfaceDeclaration') types.set(n.id.name, n.body);
      if (n.type === 'TSTypeAliasDeclaration') types.set(n.id.name, n.typeAnnotation);
    });
  }
  const typeOf = (ann) => {
    const names = new Set();
    walk(ann, (n) => { if (n.type === 'Identifier') names.add(n.name); });
    return [...names].join(' ');
  };
  const propsFromType = (ann) => {
    if (ann?.type === 'TSTypeReference' && ann.typeName?.type === 'Identifier' && types.has(ann.typeName.name)) ann = types.get(ann.typeName.name);
    walk(ann, (n) => { if (n.type === 'TSPropertySignature' && n.key?.type === 'Identifier') { props.set(n.key.name, props.get(n.key.name) || n.key.name); propTypes.set(n.key.name, typeOf(n.typeAnnotation)); } });
  };
  // Vue runtime prop declarations: { contact: { type: Object }, rows: Array, title: String }.
  const runtimeProps = (obj) => {
    for (const p of obj.properties) {
      const k = p.key?.name || p.key?.value;
      if (!k) continue;
      props.set(k, props.get(k) || k);
      const v = p.value;
      const t = v?.type === 'Identifier' ? v.name : v?.type === 'ObjectExpression' ? v.properties.find((q) => q.key?.name === 'type')?.value?.name : null;
      if (/^(Object|Array)$/.test(t || '') && !propTypes.has(k)) propTypes.set(k, `runtime ${t}`);
    }
  };
  const computedFns = []; // [name, function body] of Vue computed properties and methods
  for (const ast of asts) {
    walk(ast, (n) => {
      // Svelte 4: export let user.
      if (n.type === 'ExportNamedDeclaration' && n.declaration?.type === 'VariableDeclaration') {
        for (const d of n.declaration.declarations) for (const nm of bindingNames(d.id)) { props.set(nm, nm); if (d.id.typeAnnotation) propTypes.set(nm, typeOf(d.id.typeAnnotation)); }
      }
      if (n.type === 'VariableDeclarator' && n.init) {
        const call = n.init.type === 'CallExpression' ? n.init : null;
        const name = call && calleeName(call);
        // Svelte 5: let { user, size } = $props(). Vue: const props = defineProps<{...}>().
        if (name === '$props' || name === 'defineProps' || name === 'withDefaults') {
          if (n.id.type === 'ObjectPattern') {
            for (const p of n.id.properties) if (p.type === 'ObjectProperty' && p.key.type === 'Identifier') props.set(p.key.name, bindingNames(p.value)[0] || p.key.name);
          } else if (n.id.type === 'Identifier') props.set('*', n.id.name);
          propsFromType(n.id.typeAnnotation?.typeAnnotation);
        }
      }
      // defineProps(...) with or without a variable, and inside withDefaults(...).
      if (n.type === 'CallExpression' && calleeName(n) === 'defineProps') {
        propsFromType(n.typeParameters?.params?.[0]);
        if (n.arguments[0]?.type === 'ObjectExpression') runtimeProps(n.arguments[0]);
        if (n.arguments[0]?.type === 'ArrayExpression') for (const e of n.arguments[0].elements) if (e?.type === 'StringLiteral') props.set(e.value, e.value);
      }
      // Vue Options API: export default { props, computed, methods }.
      if (n.type === 'ObjectProperty' && n.key?.type === 'Identifier' && n.key.name === 'props') {
        if (n.value.type === 'ObjectExpression') runtimeProps(n.value);
        if (n.value.type === 'ArrayExpression') for (const e of n.value.elements) if (e?.type === 'StringLiteral') props.set(e.value, e.value);
      }
      if (n.type === 'ObjectProperty' && n.key?.type === 'Identifier' && /^(computed|methods)$/.test(n.key.name) && n.value.type === 'ObjectExpression') {
        for (const p of n.value.properties) {
          if ((p.type === 'ObjectMethod' || p.type === 'ObjectProperty') && p.key?.type === 'Identifier') computedFns.push([p.key.name, p.type === 'ObjectMethod' ? p.body : p.value, n.key.name]);
          // ...mapGetters({ currentChat: 'getSelectedChat' }) and mapGetters(['getCurrentUser']).
          if (p.type === 'SpreadElement' && p.argument.type === 'CallExpression' && /^map(Getters|State)$/.test(calleeName(p.argument) || '')) {
            const arg = p.argument.arguments[p.argument.arguments.length - 1];
            const entries = arg?.type === 'ObjectExpression' ? arg.properties.map((q) => [q.key?.name || q.key?.value, q.value?.value || '']) : arg?.type === 'ArrayExpression' ? arg.elements.map((e) => [e?.value, e?.value]) : [];
            for (const [local, getter] of entries) if (local && !FLAG_NAME.test(local) && !FLAG_NAME.test(String(getter).split('/').pop())) mark(local, `${calleeName(p.argument)}(${getter})`);
          }
        }
      }
      return true;
    });
  }
  for (const [prop, local] of props) {
    if (prop === '*') continue;
    const why = taintedProps.get(prop) || taintedProps.get('*')
      || (personType(propTypes.get(prop) || '') ? `prop ${prop}: ${propTypes.get(prop)}` : null)
      || (DATA_PROP.test(prop) ? `prop ${prop}` : null)
      || (/^runtime /.test(propTypes.get(prop) || '') && !CONFIG_PROP.test(prop) ? `prop ${prop}: ${propTypes.get(prop).slice(8)}` : null)
      || (SECRET_NAME.test(prop) && secretIdentifier(prop) ? `prop ${prop}` : null);
    if (why) mark(local, why);
  }
  if (props.has('*') && (taintedProps.size || [...propTypes.values()].some(personType) || taint.size)) mark(props.get('*'), [...taintedProps.values()][0] || [...taint.values()][0] || 'props');
  // Sources and derived values, repeated until no new names are found.
  // computed(() => ...), $derived.by(() => ...) and similar calls: the callback body is the value.
  const usedIn = (node) => {
    const ids = [...(node.type === 'CallExpression' ? idsIn(node) : dataIdsIn(node))].map((id) => id.replace(/^\$/, ''));
    walk(node, (m) => { if (m.type === 'MemberExpression' && m.object.type === 'ThisExpression' && m.property.type === 'Identifier') ids.push(m.property.name); });
    return ids.find((id) => taint.has(id));
  };
  for (let pass = 0; pass < 5; pass++) {
    let changed = false;
    for (const ast of asts) {
      walk(ast, (n) => {
        if (n.type === 'VariableDeclarator' && n.init) {
          const names = bindingNames(n.id);
          const awaited = n.init.type === 'AwaitExpression';
          let init = awaited ? n.init.argument : n.init;
          if (init.type === 'TSAsExpression' || init.type === 'TSNonNullExpression') init = init.expression;
          let origin = null;
          if (init.type === 'CallExpression') {
            const name = calleeName(init) || '';
            if (name === '$props' || name === 'defineProps' || name === 'withDefaults') return true;
            if (/^use[A-Z]/.test(name) && !NON_DATA_HOOKS.test(name) && DATA_HOOK.test(name)) origin = `${name}()`;
            // Fail closed: other composables may return data.
            else if (/^use[A-Z]/.test(name) && !NON_DATA_HOOKS.test(name) && !/^use(MapGetter|StoreGetters?|MapState|I18n|Router|Route|Head|Slots|Attrs|Vuelidate|Emitter|Alert|Track|Keyboard\w*|Event\w*|Element\w*|Window\w*|Mouse\w*|Media\w*|Breakpoints|Dark|Toggle|Clipboard|Debounce\w*|Throttle\w*|Intersection\w*|Resize\w*|Policy|Branding|Ui\w*)$/.test(name)) origin = `unknown ${name}()`;
            if (/^(useMapGetter|useStoreGetters?|useMapState)$/.test(name) && !FLAG_NAME.test(String(init.arguments[0]?.value || '').split('/').pop())) origin = `${name}(${init.arguments[0]?.value || ''})`;
            if (/^(fetch|get|post|request|query)$/.test(name)) origin = `${name}()`;
            // In a component script, an awaited call almost always returns data from the server.
            if (awaited && !/^(nextTick|tick|sleep|delay|wait|confirm|validate|\$validate|writeText|copy\w*|open\w*|close\w*|navigate|goto|push|replace|invalidate\w*)$/.test(name)) origin = `${name}()`;
          }
          // A getter such as const count = (key) => props.metrics[key] returns the data it reads.
          // Handlers such as () => emit('close', props.id) are left out.
          if (!origin && init.type === 'ArrowFunctionExpression' && init.body.type !== 'BlockStatement' && !(init.body.type === 'CallExpression' && /^(\$?emit|push|replace|navigate|router|dispatch|commit|track|on[A-Z]\w*|handle\w*|set\w*|toggle\w*|open\w*|close\w*|copy\w*)$/.test(calleeName(init.body) || ''))) {
            const used = [...idsIn(init.body)].find((x) => taint.has(x));
            if (used) origin = taint.get(used);
          }
          if (!origin && init.type !== 'ArrowFunctionExpression' && init.type !== 'FunctionExpression') {
            const used = usedIn(init);
            if (used) origin = taint.get(used);
          }
          if (origin) names.forEach((nm) => { changed = mark(nm, origin) || changed; });
        }
        // Assignments: summary.value = response.data (Vue refs), user = await getMyUser() (Svelte).
        if (n.type === 'AssignmentExpression' && n.operator === '=') {
          const left = n.left.type === 'MemberExpression' && n.left.property?.name === 'value' ? n.left.object : n.left;
          if (left.type === 'Identifier' && !taint.has(left.name)) {
            const right = n.right.type === 'AwaitExpression' ? n.right.argument : n.right;
            const used = usedIn(right);
            if (used) changed = mark(left.name, taint.get(used)) || changed;
            else if (n.right.type === 'AwaitExpression' && right.type === 'CallExpression') changed = mark(left.name, `${calleeName(right) || 'call'}()`) || changed;
          }
        }
        // Svelte 4 reactive statements: $: title = `${user.name}`.
        if (n.type === 'LabeledStatement' && n.label.name === '$' && n.body.type === 'ExpressionStatement' && n.body.expression.type === 'AssignmentExpression' && n.body.expression.left.type === 'Identifier') {
          const used = usedIn(n.body.expression.right);
          if (used) changed = mark(n.body.expression.left.name, taint.get(used)) || changed;
        }
        return true;
      });
    }
    for (const [name, body, kind] of computedFns) {
      if (kind !== 'computed' || taint.has(name)) continue;
      const used = usedIn(body);
      if (used) changed = mark(name, taint.get(used)) || changed;
    }
    if (!changed) break;
  }
  // Stores read in the template with $name: an imported store whose name says it holds data.
  for (const ast of asts) {
    walk(ast, (n) => {
      if (n.type === 'ImportDeclaration' && /stores?\b|state|session|auth|user/i.test(n.source.value)) {
        for (const s of n.specifiers) if (/(user|session|auth|profile|account|member|current|preferences)/i.test(s.local.name) && !FLAG_NAME.test(s.local.name)) mark(s.local.name, `store ${s.local.name}`);
      }
      return true;
    });
  }
  return taint;
}

// Analyses one file given the props its parents pass with data.
function analyse(file, text, taintedProps) {
  const svelte = file.endsWith('.svelte');
  const region = templateRegion(text, file);
  if (!region) return null;
  const taint = scriptTaint(scripts(text), taintedProps);
  // SvelteKit pages get their data from the load function.
  if (svelte && /\+(page|layout)\.svelte$/.test(file)) taint.set('data', taint.get('data') || 'page data');
  const list = bindings(text, region, svelte);
  const exprIds = (b) => {
    const ast = parseExpr(b.expr);
    if (!ast) return [...b.expr.matchAll(/(^|[^\w$.])\$?([A-Za-z_][\w$]*)/g)].map((m) => m[2]);
    return [...dataIdsIn(ast)].map((id) => id.replace(/^\$/, ''));
  };
  const hit = (b) => {
    let ast = parseExpr(b.expr);
    // $t('KEY', { value }) shows a translated label; only the values passed after the key can hold data.
    if (ast?.type === 'CallExpression' && /^(\$t|t|\$tc|tc|\$te)$/.test(calleeName(ast) || '')) {
      if (ast.arguments.length < 2) return null;
      ast = ast.arguments[1];
      b = { ...b, expr: b.expr.slice(ast.start, ast.end) };
    }
    if (ast && schemaPublicIn(ast, SCHEMA)) return null;
    const ids = exprIds(b);
    const id = ids.find((x) => taint.has(x));
    const field = ast && schemaFieldIn(ast, SCHEMA);
    // A schema field beats an unknown origin: it names the data.
    if (field && (!id || UNKNOWN_ORIGIN.test(taint.get(id)))) return `schema ${field[1]} field ${field[0]}`;
    if (id) return taint.get(id);
    if (ids.some(secretIdentifier) || (/\.(\w*(secret|token|password|apiKey|privateKey)\w*)\b/i.test(b.expr.replace(/(["'`])(?:\\.|(?!\1).)*\1/g, '""')) && !/\b(has|is|show)\w*(Token|Secret|Password)/.test(b.expr))) return 'secret name';
    return null;
  };
  // Loop aliases and local constants, until no new names are found.
  for (let pass = 0; pass < 4; pass++) {
    let changed = false;
    const fed = new Map();
    for (const b of list) if (b.kind === 'attr' && b.tagAt != null && !fed.has(b.tagAt)) { const why = hit(b); if (why) fed.set(b.tagAt, why); }
    for (const b of list) {
      if (b.kind === 'slot' && b.alias && fed.has(b.comp)) {
        const alias = parseExpr(`(${b.alias}) => 0`);
        for (const nm of alias ? alias.params.flatMap((p) => bindingNames(p)) : []) if (!taint.has(nm)) { taint.set(nm, `${fed.get(b.comp)} via slot`); changed = true; }
        continue;
      }
      if ((b.kind === 'each' || b.kind === 'const') && b.alias) {
        const why = hit(b);
        if (!why) continue;
        const alias = parseExpr(`(${b.alias}) => 0`);
        const names = alias ? alias.params.flatMap((p) => bindingNames(p)) : [b.alias.replace(/\W/g, '')];
        for (const nm of names) if (nm && !taint.has(nm)) { taint.set(nm, why); changed = true; }
      }
    }
    if (!changed) break;
  }
  const sites = [];
  const edges = [];
  const uses = [];
  const usesByOffset = new Map();
  for (const b of list) {
    if (b.kind === 'each' || b.kind === 'const' || b.kind === 'slot') continue;
    const tag = b.tag || '';
    const isComp = isComponentTag(tag);
    const line = lineAt(text, b.offset);
    if (b.kind === 'attr' && (SKIP_ATTR.test(b.attr) || /^(class|style|transition|use|in|out):/.test(b.attr))) continue;
    const why = hit(b);
    if (isComp && b.kind === 'attr') {
      const key = `${tag}@${lineAt(text, text.lastIndexOf(`<${tag}`, b.offset))}`;
      if (!usesByOffset.has(key)) { const u = { child: pascal(tag.split('.').pop()), tainted: false, line: Number(key.split('@')[1]) }; usesByOffset.set(key, u); uses.push(u); }
      if (why) usesByOffset.get(key).tainted = true;
    }
    if (!why) continue;
    const expr = b.expr.replace(/\s+/g, ' ').trim().slice(0, 120);
    if (b.kind === 'text') { sites.push({ line, tag, kind: 'text', expr, origin: why }); continue; }
    if (isComp) {
      edges.push({ child: pascal(tag.split('.').pop()), prop: b.attr === '*' ? '*' : camel(b.attr), origin: why });
      sites.push({ line, tag, kind: `prop ${b.attr}`, expr, origin: why });
    } else if (DOM_DATA_ATTR.test(b.attr) || b.attr === 'text') sites.push({ line, tag, kind: `attr ${b.attr}`, expr, origin: why });
  }
  // Component tags without bound attributes also count as uses.
  return { sites, edges, uses, lines: text.split('\n').length };
}

// Blade views get their data from controllers, so every variable holds data unless its name says
// it is a view or form parameter. Helper calls that return labels, routes and assets are removed first.
const BLADE_PUBLIC_VAR = /^\$(attributes|slot|loop|errors|id|name|label|labels|placeholder|icon|title|type|route|url|href|method|text|color|size|key|config|options|checked|disabled|required|readonly|hidden|group|permission|prefix|suffix|target|active|override|button\w*|form\w*|kind|variant|position|width|height|show\w*|hide\w*|is\w*|has\w*|can\w*|with\w*|limit|page|tab\w*|status|currency_code|__env|__data|component|message)$/i;
// Inside Blade components the variables are the component's parameters; only these names hold data.
const BLADE_DATA_VAR = /^\$(value|model|item|items|record|records|contacts?|customers?|vendors?|employees?|users?|documents?|invoices?|bills?|transactions?|payments?|accounts?|company|file|files|attachments?|email|phone|address|tax_number|amount|totals?|balance|notes?|reference|transfer|reconciliation|member|members|owner|country|address)$/i;
// Lists of choices and view settings, in pages and components alike.
const BLADE_SETTING_VAR = /^\$(actions?|\w*(_options|_formats|_separators|_types|_digits|_list_types|classes|timezones|roles|landing_pages|locales|languages|currencies|categories|countries|scripts|styles|head|foot|content|rows|rounded|border|accordion\w*|text_\w+|first\w*|second\w*|modelTable|version|alias|installed))$/i;
const BLADE_SKIP_ATTR = /^(class|style|id|key|rows|rounded|border|open|status|background-color|text-color|color|icon|data-action|click|selected|type|size|route|method|permission|checked|disabled|required)$/;
const BLADE_HELPER = /\b(route|url|asset|config|mix|vite|csrf_token|old|request|now|count|e|json_encode)\s*\(/;
const BLADE_DATA = /\bsetting\(\s*['"](company|invoice|bill|contact|wizard)\.|\b(auth\(\)->user\(\)|user\(\)|company\(\))/;

// Removes helper calls with their arguments: trans('general.name', ['x' => $y]) is a label.
function stripHelpers(expr) {
  let out = expr;
  for (let guard = 0; guard < 20; guard++) {
    const m = out.match(BLADE_HELPER);
    if (!m) break;
    const open = m.index + m[0].length - 1;
    let depth = 0;
    let end = open;
    for (; end < out.length; end++) {
      if (out[end] === '(') depth++;
      else if (out[end] === ')' && --depth === 0) break;
    }
    out = `${out.slice(0, m.index)}''${out.slice(end + 1)}`;
  }
  return out.replace(/(['"])(?:\\.|(?!\1).)*\1/g, "''");
}

function analyseBlade(text, file) {
  const component = /(^|[\\/])components[\\/]/.test(file);
  const publicAlias = new Set();
  for (const m of text.matchAll(/@(?:foreach|forelse)\s*\(\s*([\s\S]+?)\s+as\s+(?:\$\w+\s*=>\s*)?(\$\w+)\s*\)/g)) {
    if (!bladeHit(m[1], publicAlias, component)) publicAlias.add(m[2]);
  }
  const sites = [];
  const tagAt = (offset) => {
    const before = text.slice(Math.max(0, offset - 2000), offset);
    const open = [...before.matchAll(/<([A-Za-z][\w.:-]*)/g)].pop();
    return open ? open[1] : '';
  };
  const add = (offset, expr, attr) => {
    if (attr && BLADE_SKIP_ATTR.test(attr)) return;
    const why = bladeHit(expr, publicAlias, component);
    if (!why) return;
    const tag = tagAt(offset);
    const comp = tag.startsWith('x-');
    sites.push({ line: lineAt(text, offset), tag, kind: attr ? `${comp ? 'prop' : 'attr'} ${attr}` : 'text', expr: expr.replace(/\s+/g, ' ').trim().slice(0, 120), origin: why });
  };
  for (const m of text.matchAll(/(@?)\{\{(?!--)([\s\S]*?)\}\}|\{!!([\s\S]*?)!!\}/g)) {
    if (m[1] === '@') continue; // @{{ }} is a Vue expression, left to the line rules.
    const lineStart = text.lastIndexOf('\n', m.index) + 1;
    const attr = text.slice(lineStart, m.index).match(/([\w:.-]+)="[^"]*$/)?.[1];
    if (attr && /^(class|style|id|wire:\w+|x-\w+|key)$/.test(attr)) continue;
    add(m.index, m[2] ?? m[3], attr);
  }
  // Bound props on Blade components: <x-show.contact :value="$customer->email" />. The tag ends at
  // the first > outside quotes, so PHP's -> stays inside it.
  for (const m of text.matchAll(/<x-[\w.:-]+/g)) {
    let end = m.index;
    for (let quote = null; end < text.length; end++) {
      const ch = text[end];
      if (quote) { if (ch === quote) quote = null; } else if (ch === '"' || ch === "'") quote = ch; else if (ch === '>') break;
    }
    const tagText = text.slice(m.index, end);
    for (const a of tagText.matchAll(/\s:([\w-]+)="([^"]*)"/g)) add(m.index + a.index, a[2], a[1]);
  }
  // Directives that print a value: @date($document->issued_at), @money($total).
  for (const m of text.matchAll(/@(date|datetime|money|currency|price)\(/g)) {
    let depth = 0;
    let end = m.index + m[0].length - 1;
    for (; end < text.length; end++) { if (text[end] === '(') depth++; else if (text[end] === ')' && --depth === 0) break; }
    add(m.index, text.slice(m.index + m[0].length, end));
  }
  return { sites, edges: [], uses: [], lines: text.split('\n').length };
}

function bladeHit(expr, publicAlias, component) {
  if (/\bcsrf_token\(|\bcsrf_field\(/.test(expr)) return 'secret name csrf_token';
  if (BLADE_DATA.test(expr)) return 'account data';
  const rest = stripHelpers(expr);
  const vars = [...rest.matchAll(/\$[A-Za-z_]\w*/g)].map((v) => v[0]).filter((v) => !BLADE_PUBLIC_VAR.test(v) && !BLADE_SETTING_VAR.test(v) && !publicAlias.has(v) && (!component || BLADE_DATA_VAR.test(v)));
  if (!vars.length) return null;
  const secret = vars.find((v) => secretIdentifier(v.slice(1))) || (/->\w*(password|token|secret|api_key)\w*/i.test(rest) ? vars[0] : null);
  return secret ? `secret name ${secret}` : `view data ${vars[0]}`;
}

// Runs the pass over files (absolute paths). Returns one candidate per file that renders data,
// in the same form as the component pass.
// `schema` is the field map from readSchemas, when the app has one.
const VOID_TAG = /^(area|base|br|col|embed|hr|img|input|link|meta|source|track|wbr)$/i;
// The elements of a Vue, Svelte or Blade template as [start line, last line of the start tag, end
// line, tag name, start column], like elementSpans for JSX. Attribute values are skipped with their quotes, so `a > b` in a
// binding does not end a tag.
export function templateSpans(file, text) {
  const region = file.endsWith('.blade.php') ? { start: 0, end: text.length } : templateRegion(text, file);
  if (!region) return [];
  const out = [];
  const stack = [];
  let i = region.start;
  while (i < region.end) {
    const lt = text.indexOf('<', i);
    if (lt < 0 || lt >= region.end) break;
    if (text.startsWith('<!--', lt)) { i = text.indexOf('-->', lt) + 3 || region.end; continue; }
    const close = text.slice(lt).match(/^<\/([\w.:-]+)\s*>/);
    if (close) {
      const k = stack.map((e) => e.name).lastIndexOf(close[1]);
      if (k >= 0) { for (const e of stack.splice(k)) out.push([e.start, e.openEnd, lineAt(text, lt), e.name, e.column]); }
      i = lt + close[0].length;
      continue;
    }
    const open = text.slice(lt).match(/^<([A-Za-z][\w.:-]*)/);
    if (!open) { i = lt + 1; continue; }
    let j = lt + open[0].length;
    let quote = null;
    while (j < region.end) {
      const ch = text[j];
      if (quote) { if (ch === quote) quote = null; } else if (ch === '"' || ch === "'") quote = ch; else if (ch === '>') break;
      j++;
    }
    const start = lineAt(text, lt);
    const openEnd = lineAt(text, j);
    const column = lt - text.lastIndexOf('\n', lt - 1) - 1;
    if (text[j - 1] === '/' || VOID_TAG.test(open[1])) out.push([start, openEnd, openEnd, open[1], column]);
    else stack.push({ name: open[1], start, openEnd, column });
    i = j + 1;
  }
  return out;
}

// Element spans for any file the passes read.
export const spansFor = (file, text) => (TEMPLATE_FILE.test(file) ? templateSpans(file, text) : elementSpans(file, text));

export function templatePass(root, files, schema = null) {
  SCHEMA = schema?.fields || new Map();
  const comps = files.filter((f) => TEMPLATE_FILE.test(f)).map((abs) => ({ abs, file: path.relative(root, abs), name: pascal(path.basename(abs).replace(TEMPLATE_FILE, '')), text: fs.readFileSync(abs, 'utf8') }));
  const byName = new Map();
  for (const c of comps) {
    if (!byName.has(c.name)) byName.set(c.name, []);
    byName.get(c.name).push(c);
  }
  const taintedProps = new Map(comps.map((c) => [c, new Map()]));
  const results = new Map();
  let failed = 0;
  let queue = [...comps];
  for (let round = 0; round < 12 && queue.length; round++) {
    const next = new Set();
    for (const c of queue) {
      let r;
      try {
        r = c.file.endsWith('.blade.php') ? analyseBlade(c.text, c.file) : analyse(c.file, c.text, taintedProps.get(c));
      } catch {
        r = null;
      }
      if (!r) { if (round === 0) failed++; continue; }
      results.set(c, r);
      for (const e of r.edges) {
        for (const child of byName.get(e.child) || []) {
          const tp = taintedProps.get(child);
          if (!tp.has(e.prop)) { tp.set(e.prop, `${e.origin} via <${c.name} ${e.prop === '*' ? '{...}' : e.prop}>`); next.add(child); }
        }
      }
    }
    queue = [...next];
  }
  const candidates = [];
  const usage = {};
  const index = {};
  for (const [c, r] of results) {
    for (const u of r.uses) {
      const k = (usage[u.child] ||= [0, 0, []]);
      k[0]++;
      if (u.tainted) k[1]++;
      if (k[2].length < 30) k[2].push([c.file, u.line, u.tainted]);
    }
    const own = r.sites.some((s) => !/ via /.test(s.origin) && !/^prop \w+$/.test(s.origin));
    (index[c.file] ||= []).push([c.name, 1, r.lines, own]);
    if (!r.sites.length) continue;
    const lines = [...new Set(r.sites.map((s) => s.line))].sort((a, b) => a - b);
    candidates.push({
      file: c.file,
      line: 1,
      end_line: r.lines,
      component: c.name,
      rules: ['component'],
      patterns: ['P-crm-record'],
      category_hint: categoryOf(r.sites),
      confidence: r.sites.some((s) => !UNKNOWN_ORIGIN.test(s.origin)) ? 'high' : 'low',
      sites: r.sites.map((s) => ({ ...s, confidence: UNKNOWN_ORIGIN.test(s.origin) ? 'low' : 'high' })),
      site_lines: lines,
      snippet: `<${c.name}> renders ${r.sites.length} value${r.sites.length === 1 ? '' : 's'} from ${[...new Set(r.sites.map((s) => s.origin))].slice(0, 2).join('; ')}`,
    });
  }
  return { candidates, parsed: results.size, failed, components: comps.length, usage, index };
}
