import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { TextDecoder } from 'node:util';
import { parse } from '@babel/parser';
import { walk } from '../components.mjs';
import { templateSpans } from '../templates.mjs';

const SCRIPT = /\.(?:[cm]?[jt]s|[jt]sx)$/i;
const TEMPLATE = /\.(?:vue|svelte|blade\.php|html?)$/i;
const OTHER_VIEW = /\.(?:astro|hbs|handlebars|erb|cshtml|razor|php|twig|liquid|ejs|eta|pug|jade|njk|nunjucks|mustache|haml|slim|mdx|jsp|jspx|xhtml)$/i;
const IMPORT_EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.mts', '.cts', '.vue', '.svelte', '.json', '.html'];
const EXCLUDED_DIRECTORIES = new Set(['.git', 'node_modules', 'vendor', 'dist', 'build', '.next', '.nuxt', '.output', '.svelte-kit', 'coverage']);
const NATIVE_CONTROLS = new Set(['input', 'textarea', 'select']);
const LAYOUT_ATTRIBUTE = /^(?:class|className|style)$/i;
const RAW_TEXT = /^(?:textarea|title|xmp|iframe|noembed|noframes)$/i;
const HTML_TAGS = new Set((
  'a abbr acronym address area article aside audio b base bdi bdo big blockquote body br button canvas caption center cite code col colgroup ' +
  'data datalist dd del details dfn dialog dir div dl dt em embed fieldset figcaption figure font footer form frame frameset h1 h2 h3 h4 h5 h6 ' +
  'head header hgroup hr html i iframe img input ins kbd label legend li link main map mark menu meta meter nav nobr noembed noframes noscript ' +
  'object ol optgroup option output p param picture plaintext pre progress q rp rt ruby s samp script search section select small source span ' +
  'strike strong style sub summary sup table tbody td textarea tfoot th thead time title tr track tt u ul var video wbr xmp ' +
  'svg animate animateMotion animateTransform circle clipPath defs desc ellipse feBlend feColorMatrix feComponentTransfer feComposite ' +
  'feConvolveMatrix feDiffuseLighting feDisplacementMap feDistantLight feDropShadow feFlood feFuncA feFuncB feFuncG feFuncR feGaussianBlur ' +
  'feImage feMerge feMergeNode feMorphology feOffset fePointLight feSpecularLighting feSpotLight feTile feTurbulence filter foreignObject ' +
  'g image line linearGradient marker mask mpath path pattern polygon polyline radialGradient rect set stop switch symbol text textPath tspan use view ' +
  'math maction annotation annotation-xml menclose merror mfenced mfrac mi mmultiscripts mn mo mover mpadded mphantom mprescripts mroot mrow ms ' +
  'mspace msqrt mstyle msub msubsup msup mtable mtd mtext mtr munder munderover semantics'
).split(' '));

const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const slash = (file) => file.split(path.sep).join('/');
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const inside = (rel) => rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel);
const below = (file, dir) => file === dir || file.startsWith(`${dir}${path.sep}`);
const lower = (value) => value.toLowerCase();

function language(file) {
  if (/\.blade\.php$/i.test(file)) return 'blade';
  if (/\.html?$/i.test(file)) return 'html';
  return lower(path.extname(file).slice(1)) || 'unknown';
}

function positionIndex(source) {
  const lines = [0];
  for (const match of source.matchAll(/\n/g)) lines.push(match.index + 1);
  return (offset) => {
    let low = 0;
    let high = lines.length;
    while (low + 1 < high) {
      const mid = (low + high) >> 1;
      if (lines[mid] <= offset) low = mid;
      else high = mid;
    }
    return { line: low + 1, column: offset - lines[low] };
  };
}

function scopePaths(root, include) {
  if (include == null) return [];
  if (!Array.isArray(include) || include.some((file) => typeof file !== 'string' || !file.trim())) {
    throw new TypeError('include must contain source paths.');
  }
  const prefixes = [...new Set(include.map((file) => path.relative(root, path.resolve(root, file))))];
  if (prefixes.some((file) => !inside(file))) throw new Error('Included paths must be inside the source root.');
  return prefixes.includes('') ? [] : prefixes;
}

function sourceFiles(root, prefixes) {
  const files = [];
  const failures = [];
  const seenPrefixes = new Set();
  function visit(dir) {
    let entries;
    try {
      entries = fs.readdirSync(path.join(root, dir), { withFileTypes: true });
    } catch (error) {
      failures.push({ file: slash(dir) || '.', status: 'failed', error: `Directory read failed (${error.code || 'unknown error'}).` });
      return;
    }
    for (const entry of entries) {
      const file = path.join(dir, entry.name);
      const explicit = prefixes.some((prefix) => below(prefix, file));
      if (prefixes.length && !explicit && !prefixes.some((prefix) => below(file, prefix))) continue;
      if (prefixes.includes(file)) seenPrefixes.add(file);
      if (entry.isDirectory()) {
        if (entry.name !== '.git' && (explicit || !EXCLUDED_DIRECTORIES.has(entry.name))) visit(file);
      } else if (entry.isFile() && (SCRIPT.test(file) || TEMPLATE.test(file) || OTHER_VIEW.test(file) || prefixes.includes(file))) {
        files.push(file);
      } else if (entry.isSymbolicLink() && (explicit || SCRIPT.test(file) || TEMPLATE.test(file) || OTHER_VIEW.test(file))) {
        failures.push({ file: slash(file), status: 'unsupported', error: 'Symbolic link has no reviewed source.' });
      }
    }
  }
  visit('');
  for (const file of prefixes) {
    if (!seenPrefixes.has(file)) failures.push({ file: slash(file), status: 'failed', error: 'Included source path was not found.' });
  }
  return { files: files.sort((a, b) => compare(slash(a), slash(b))), failures };
}

function localImport(root, file, specifier) {
  if (!/^\.\.?\//.test(specifier)) return null;
  const base = path.resolve(root, path.dirname(file), specifier);
  const stem = base.replace(/\.[cm]?jsx?$/i, '');
  const candidates = [base, ...IMPORT_EXTENSIONS.map((ext) => stem + ext), ...IMPORT_EXTENSIONS.map((ext) => path.join(base, `index${ext}`))];
  for (const candidate of candidates) {
    if (!inside(path.relative(root, candidate))) continue;
    try {
      const real = fs.realpathSync(candidate);
      const relative = path.relative(root, real);
      if (inside(relative) && fs.statSync(real).isFile()) return slash(relative);
    } catch {
      // Try the next source extension.
    }
  }
  return null;
}

function sourceContext(root, file, source) {
  const relative = slash(file);
  const position = positionIndex(source);
  const sites = [];
  const failures = [];
  const imports = new Set();
  const target = (tag, start, end, open_end, native) => ({ tag, native, start, end, open_end });
  const fail = (error, start, end, channel, status = 'unsupported') => {
    failures.push({ file: relative, status, ...(start == null ? {} : { ...position(start), start, end, channel }), error });
  };
  const add = (owner, channel, start, end) => {
    if (start >= end) return;
    if (!owner) {
      fail('Rendered source has no exact opening element.', start, end, channel);
      return;
    }
    const { tag, native, start: targetStart, end: targetEnd, open_end } = owner;
    const expression = source.slice(start, end);
    const id = `S-${sha256(JSON.stringify([relative, start, end, channel, tag, targetStart, targetEnd, expression]))}`;
    const target = { ...position(targetStart), start: targetStart, end: targetEnd, open_end };
    sites.push({ id, file: relative, ...position(start), start, end, tag, channel, expression, target, native });
  };
  const trimmed = (owner, channel, start, end) => {
    const value = source.slice(start, end);
    const leading = value.length - value.trimStart().length;
    const trailing = value.length - value.trimEnd().length;
    add(owner, channel, start + leading, end - trailing);
  };
  const importPath = (specifier) => {
    const resolved = localImport(root, file, specifier);
    if (resolved) imports.add(resolved);
  };
  return { source, target, sites, failures, imports, fail, add, trimmed, importPath };
}

function attributeChannel(owner, name) {
  if (!owner.native) return `prop:${name}`;
  if (name === 'dangerouslySetInnerHTML' || name === 'innerHTML') return 'html';
  if (NATIVE_CONTROLS.has(lower(owner.tag)) && /^(?:value|defaultValue|checked|defaultChecked)$/i.test(name)) return `input:${name}`;
  return `attribute:${name}`;
}

function controlSlot(context, owner, attributes, nameStart) {
  if (!owner.native) return;
  const tag = lower(owner.tag);
  const type = lower(attributes.get('type') || '');
  const editable = attributes.has('contenteditable') && lower(attributes.get('contenteditable') || '') !== 'false';
  if (!editable && (!NATIVE_CONTROLS.has(tag) || type === 'hidden')) return;
  const choice = tag === 'input' && /^(?:checkbox|radio)$/.test(type);
  const bound = choice ? attributes.has('checked') : attributes.has('value');
  if (!bound) context.add(owner, choice ? 'input:checked' : 'input', nameStart, nameStart + owner.tag.length);
}

function staticValue(node) {
  if (!node || /^(?:String|Numeric|Boolean|Null|BigInt)Literal$/.test(node.type)) return true;
  if (node.type === 'TemplateLiteral') return node.expressions.length === 0;
  if (node.type === 'ArrayExpression') return node.elements.every(staticValue);
  if (node.type === 'ObjectExpression') {
    return node.properties.every((prop) => prop.type === 'ObjectProperty' && !prop.computed && staticValue(prop.value));
  }
  return false;
}

function scriptInventory(context, start, end, { typescript, jsx }) {
  const { source, target, add, trimmed, fail, importPath } = context;
  let ast;
  try {
    const plugins = ['decorators-legacy'];
    if (typescript) plugins.push('typescript');
    if (jsx) plugins.push('jsx');
    ast = parse(source.slice(start, end), { sourceType: 'unambiguous', plugins });
  } catch (error) {
    const at = start + (error.pos ?? 0);
    fail(`Script parse failed (${error.reasonCode || error.code || 'syntax error'}).`, at, at, 'syntax', 'failed');
    return;
  }

  const name = (node) => source.slice(start + node.start, start + node.end);
  const nodes = [];
  const parents = new WeakMap();
  const owners = new WeakMap();
  const createElementImports = new Set();
  const reactImports = new Set(['React']);
  walk(ast, (node, parent) => {
    nodes.push(node);
    parents.set(node, parent);
    if (node.type === 'JSXElement') {
      const open = node.openingElement;
      const tag = name(open.name);
      owners.set(node, target(tag, start + open.start, start + node.end, start + open.end, HTML_TAGS.has(tag)));
    }
    if (/^(?:ImportDeclaration|ExportAllDeclaration|ExportNamedDeclaration)$/.test(node.type) && node.source?.value) {
      importPath(node.source.value);
      if (node.type === 'ImportDeclaration' && /^(?:react|preact)$/.test(node.source.value)) {
        for (const specifier of node.specifiers) {
          if (specifier.imported?.name === 'createElement' || specifier.imported?.name === 'h') createElementImports.add(specifier.local.name);
          if (/^Import(?:Default|Namespace)Specifier$/.test(specifier.type)) reactImports.add(specifier.local.name);
        }
      }
    }
  });

  const addNode = (owner, channel, node) => add(owner, channel, start + node.start, start + node.end);
  const handled = new WeakSet();
  const unwrap = (node) => {
    while (node && /^(?:TSAsExpression|TSSatisfiesExpression|TSTypeAssertion|TSNonNullExpression|ParenthesizedExpression)$/.test(node.type)) node = node.expression;
    return node;
  };
  function childrenExpression(node, owner) {
    node = unwrap(node);
    if (!node || /^(?:JSXEmptyExpression|JSXElement|JSXFragment|NullLiteral|BooleanLiteral)$/.test(node.type)) return;
    if (node.type === 'StringLiteral' && !node.value.trim()) return;
    if (node.type === 'ConditionalExpression' || node.type === 'LogicalExpression') {
      const valueFallback = node.operator === '||' || node.operator === '??';
      const branches = valueFallback || !owner ? branchOwners(node) : [];
      if (owner && (!valueFallback || branches.length)) {
        handled.add(node);
        addNode(owner, 'conditional', node.test || node.left);
      } else if (!owner && !valueFallback && !branches.length) {
        addNode(owner, 'conditional', node.test || node.left);
      }
      if (valueFallback) childrenExpression(node.left, owner);
      childrenExpression(node.consequent || node.right, owner);
      childrenExpression(node.alternate, owner);
      return;
    }
    if (node.type === 'ArrayExpression') {
      for (const element of node.elements) childrenExpression(element, owner);
      return;
    }
    if (node.type === 'SpreadElement') addNode(owner, 'spread', node.argument);
    else addNode(owner, 'text', node);
  }

  function fragmentOwner(node) {
    let parent = parents.get(node);
    while (parent) {
      if (owners.has(parent)) return owners.get(parent);
      if (!/^(?:JSXFragment|JSXExpressionContainer|ConditionalExpression|LogicalExpression|ArrayExpression|TSAsExpression|TSSatisfiesExpression|TSNonNullExpression|ParenthesizedExpression)$/.test(parent.type)) break;
      parent = parents.get(parent);
    }
    return null;
  }

  for (const node of nodes) {
    if (node.type !== 'JSXElement' && node.type !== 'JSXFragment') continue;
    const owner = owners.get(node) || fragmentOwner(node);
    if (node.type === 'JSXElement') {
      const { name: tagName, attributes: attrs } = node.openingElement;
      const attributes = new Map();
      const initialSites = context.sites.length;
      for (const attribute of attrs) {
        if (attribute.type === 'JSXSpreadAttribute') {
          addNode(owner, 'spread', attribute.argument);
          continue;
        }
        const attrName = name(attribute.name);
        const value = attribute.value?.type === 'JSXExpressionContainer' ? attribute.value.expression : attribute.value;
        attributes.set(lower(attrName), value?.type === 'StringLiteral' ? value.value : '');
        if (attrName === 'key' || attrName === 'ref') continue;
        if (/^on[A-Z]/.test(attrName) && (owner.native || /^(?:Arrow)?FunctionExpression$/.test(value?.type))) continue;
        if (LAYOUT_ATTRIBUTE.test(attrName) && staticValue(value)) continue;
        if (/^JSX(?:Element|Fragment)$/.test(value?.type)) continue;
        addNode(owner, attributeChannel(owner, attrName), value || attribute.name);
      }
      controlSlot(context, owner, attributes, start + tagName.start);
      if (owner.native && !node.children.length && context.sites.length === initialSites) addNode(owner, 'element', tagName);
    }
    for (const child of node.children) {
      if (child.type === 'JSXText') trimmed(owner, 'text', start + child.start, start + child.end);
      if (child.type === 'JSXExpressionContainer') childrenExpression(child.expression, owner);
      if (child.type === 'JSXSpreadChild') addNode(owner, 'spread', child.expression);
    }
  }

  function branchOwners(branch) {
    const node = unwrap(branch);
    if (!node) return [];
    if (owners.has(node)) return [owners.get(node)];
    if (node.type === 'JSXFragment' || node.type === 'ArrayExpression') return (node.children || node.elements).flatMap(branchOwners);
    if (node.type === 'ConditionalExpression') return [node.consequent, node.alternate].flatMap(branchOwners);
    if (node.type === 'LogicalExpression') return [node.left, node.right].flatMap(branchOwners);
    return [];
  }

  function member(node) {
    if (!/^(?:Optional)?MemberExpression$/.test(node?.type)) return null;
    return node.computed ? node.property.value : node.property.name;
  }

  function markUnbound(node, channel) {
    fail('Script destination has no exact opening element.', start + node.start, start + node.end, channel);
  }

  for (const node of nodes) {
    if ((node.type === 'ConditionalExpression' || node.type === 'LogicalExpression') && !handled.has(node)) {
      const predicate = node.test || node.left;
      for (const owner of new Set(branchOwners(node))) addNode(owner, 'conditional', predicate);
    }
    if (node.type === 'ImportExpression' && node.source.type === 'StringLiteral') importPath(node.source.value);
    if (node.type === 'AssignmentExpression') {
      const key = member(node.left);
      const object = node.left.object?.name;
      if (/^(?:innerHTML|outerHTML|innerText|textContent)$/.test(key)) markUnbound(node.right, 'dom-write');
      if (object === 'document' && key === 'title') markUnbound(node.right, 'title');
      if ((object === 'location' && /^(?:href|hash|search|pathname)$/.test(key))
        || ((object === 'window' || object === 'document') && key === 'location')) markUnbound(node.right, 'url');
    }
    if (/^(?:Optional)?CallExpression$/.test(node.type)) {
      const { callee, arguments: args } = node;
      const key = member(callee);
      const object = callee.object?.name;
      if ((callee.type === 'Import' || callee.name === 'require') && args[0]?.type === 'StringLiteral') importPath(args[0].value);
      if (createElementImports.has(callee.name) || (reactImports.has(object) && /^(?:createElement|h)$/.test(key))) markUnbound(node, 'render-call');
      if ((object === 'document' && /^(?:write|writeln|createElement)$/.test(key)) || key === 'insertAdjacentHTML') markUnbound(node, 'dom-write');
      if ((object === 'location' && /^(?:assign|replace)$/.test(key))
        || (object === 'history' && /^(?:pushState|replaceState)$/.test(key))) markUnbound(node, 'url');
    }
  }
}

function expressionEnd(source, from, limit, delimiter, javascript = false) {
  const stack = [];
  let previous = '';
  for (let i = from; i < limit; i++) {
    if (!stack.length && source.startsWith(delimiter, i)) return i;
    const c = source[i];
    const next = source[i + 1];
    if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      while (++i < limit) {
        if (source[i] === '\\') i++;
        else if (source[i] === quote) break;
        else if (quote === '`' && source.startsWith('${', i)) {
          i = expressionEnd(source, i + 2, limit, '}', javascript);
          if (i < 0) return -1;
        }
      }
      previous = quote;
      continue;
    }
    if (c === '/' && (next === '/' || next === '*')) {
      const end = source.indexOf(next === '/' ? '\n' : '*/', i + 2);
      i = end < 0 ? limit : end + Number(next === '*');
      continue;
    }
    if (javascript && c === '/' && (!previous || /[([{=,:?!;&|]/.test(previous))) {
      let characterClass = false;
      while (++i < limit) {
        if (source[i] === '\\') i++;
        else if (source[i] === '[') characterClass = true;
        else if (source[i] === ']') characterClass = false;
        else if (source[i] === '/' && !characterClass) break;
        else if (source[i] === '\n') return -1;
      }
      previous = '/';
      continue;
    }
    if (c === '(' || c === '[' || c === '{') stack.push({ '(': ')', '[': ']', '{': '}' }[c]);
    else if (c === ')' || c === ']' || c === '}') {
      if (stack.pop() !== c) return -1;
    }
    if (!/\s/.test(c)) previous = c;
  }
  return -1;
}

function templateInventory(context, mode) {
  const { source, target, add, trimmed, fail, importPath } = context;
  const vue = mode === 'vue';
  const blade = mode === 'blade';
  const svelte = mode === 'svelte';
  const structuralFile = `view.${blade ? 'blade.php' : vue ? 'vue' : svelte ? 'svelte' : 'html'}`;
  const spans = templateSpans(structuralFile, source, { unscoped: true });
  const views = spans.map(([, , , tag, , start, end, openEnd]) => ({
    ...target(tag, start, end, openEnd, HTML_TAGS.has(tag) || (!vue && !svelte && HTML_TAGS.has(lower(tag)))),
    closeStart: end === openEnd ? end : source.lastIndexOf('</', end - 1),
  })).sort((a, b) => a.start - b.start);
  const top = views.filter((view) => !views.some((parent) => parent.start < view.start && parent.end >= view.end));
  const template = vue ? top.find((view) => view.tag === 'template') : null;
  const scopeStart = template?.open_end ?? 0;
  const scopeEnd = template?.closeStart ?? source.length;
  const ignored = new Map();
  const viewByStart = new Map();
  const bladeConditions = /^(?:if|elseif|unless|isset|empty|switch|case|for|foreach|forelse|while|auth|guest|can|cannot|canany|elsecan|elsecannot|env|production|hasSection|sectionMissing|once|checked|selected|disabled|readonly|required|class|style)$/;
  const bladeStructure = /^(?:else|break|continue|default|end\w+|stop|show|parent|overwrite|append|verbatim)$/;

  for (const view of views) {
    if (/^(?:script|style)$/i.test(view.tag)) {
      ignored.set(view.start, view);
      continue;
    }
    if (view.start >= scopeStart && view.end <= scopeEnd) viewByStart.set(view.start, view);
  }

  function echo(at, limit) {
    if (blade && source.startsWith('{{--', at)) {
      const end = source.indexOf('--}}', at + 4);
      return end < 0 || end + 4 > limit ? null : { end: end + 4 };
    }
    const raw = blade && source.startsWith('{!!', at);
    const open = at + (raw ? 3 : 2);
    const delimiter = raw ? '!!}' : '}}';
    const close = expressionEnd(source, open, limit, delimiter, vue);
    if (close < 0) return null;
    return { start: open, close, end: close + delimiter.length, channel: raw ? 'html' : 'text' };
  }

  function braced(at, limit) {
    const open = at + 1;
    const special = source.slice(open, open + 50).match(/^(?:#(?:if|each|await|key|snippet)|:(?:else(?:\s+if)?|then|catch)|\/(?:if|each|await|key|snippet)|@(?:html|render|const|debug))\b/);
    const start = open + (special?.[0].length ?? 0);
    const close = expressionEnd(source, start, limit, '}', true);
    if (close < 0) return null;
    const channel = special?.[0];
    return { start, close, end: close + 1, channel };
  }

  function bladeDirective(at, limit) {
    const match = source.slice(at, at + 80).match(/^@([a-zA-Z_]\w*)/);
    if (!match || source[at - 1] === '@' || source[at + match[0].length] === '.') return null;
    const name = match[1];
    const afterName = at + match[0].length;
    const open = afterName + (source.slice(afterName).match(/^\s*/)?.[0].length ?? 0);
    if (source[open] !== '(') {
      if (name === 'php' || name === 'verbatim') {
        const close = source.indexOf(`@end${name}`, afterName);
        if (close >= 0 && close < limit) return { name, start: at, close: close + 4 + name.length, end: close + 4 + name.length };
      }
      if (!bladeStructure.test(name) && !/^(?:csrf|auth|guest)$/.test(name)) return null;
      return { name, start: at, close: afterName, end: afterName };
    }
    const close = expressionEnd(source, open + 1, limit, ')');
    return close < 0 ? { name, malformed: true, end: afterName } : { name, start: open + 1, close, end: close + 1 };
  }

  function directiveSlot(owner, directive, at) {
    const { name, start, close, end } = directive;
    if (directive.malformed) {
      fail('Malformed Blade directive.', at, end, `directive:@${name}`, 'failed');
    } else if (name === 'php' || name === 'verbatim') {
      fail('Blade block requires direct source review.', start, close, `directive:@${name}`);
    } else if (!bladeStructure.test(name) || start !== at) {
      const channel = bladeConditions.test(name) ? 'conditional' : `directive:@${name}`;
      trimmed(owner, channel, start === close ? at : start, start === close ? end : close);
    }
  }

  function dynamicMarker(at, limit) {
    if ((vue || blade) && (source.startsWith('{{', at) || (blade && source.startsWith('{!!', at)))) return echo(at, limit);
    if (svelte && source[at] === '{') return braced(at, limit);
    return undefined;
  }

  function emitTemplateExpression(owner, token) {
    const { start, close, channel } = token;
    if (start == null) return;
    if (!svelte || !channel) {
      trimmed(owner, channel || 'text', start, close);
    } else if (channel === '@html') {
      trimmed(owner, 'html', start, close);
    } else if (channel === '@render') {
      trimmed(owner, 'directive:@render', start, close);
    } else if (/^(?:#(?:if|each|await|key)|:else\s+if)$/.test(channel)) {
      trimmed(owner, 'conditional', start, close);
    } else if (!/^(?:\/|:(?:else|then|catch)$|@(?:const|debug)$|#snippet$)/.test(channel)) {
      fail('Unsupported Svelte template expression.', start, close, `directive:${channel}`);
    }
  }

  function attributeName(owner, name) {
    if (vue) {
      if (/^(?:v-bind|v-on)$/.test(name)) return 'spread';
      if (/^(?:v-if|v-else-if|v-for|v-show)$/.test(name)) return 'conditional';
      if (/^v-model(?:[:.]|$)/.test(name)) return attributeChannel(owner, name.match(/^v-model:([^.]*)/)?.[1] || 'value');
      if (/^v-(?:text|html)$/.test(name)) return name === 'v-text' ? 'text' : 'html';
      if (/^(?:v-bind:|:)/.test(name)) return attributeChannel(owner, name.replace(/^(?:v-bind:|:)/, ''));
      if (/^(?:v-|@|#)/.test(name)) return `directive:${name}`;
    }
    if (svelte) {
      if (name.startsWith('bind:')) return attributeChannel(owner, name.slice('bind:'.length));
      if (/^(?:on|use|class|style|transition|in|out|animate|let):/.test(name)) return `directive:${name}`;
    }
    if (blade && name.startsWith(':')) return attributeChannel(owner, name.replace(/^::?\$?/, ''));
    return attributeChannel(owner, name);
  }

  function rendersAttribute(name) {
    if (vue) return !/^(?:@|#|v-on(?::|$)|v-slot(?::|$)|v-(?:else|once|pre|cloak|memo)$|key$|ref$)/.test(name);
    if (svelte) return !/^(?:on:|let:|use:|bind:this$|ref$)/.test(name);
    return true;
  }

  function attributeSites(owner, nameEnd, { emit = true } = {}) {
    const attributes = new Map();
    const limit = owner.open_end - 1;
    let i = nameEnd;
    while (i < limit) {
      if (/\s/.test(source[i]) || source[i] === '/') { i++; continue; }
      if (blade && source[i] === '@') {
        const directive = bladeDirective(i, limit);
        if (directive) {
          if (emit) directiveSlot(owner, directive, i);
          i = directive.end;
          continue;
        }
      }
      const shorthand = dynamicMarker(i, limit);
      if (shorthand) {
        if (shorthand.start != null && emit) {
          if (svelte && source.startsWith('...', shorthand.start)) trimmed(owner, 'spread', shorthand.start + 3, shorthand.close);
          else if (svelte) {
            const name = source.slice(shorthand.start, shorthand.close).trim();
            trimmed(owner, attributeChannel(owner, name), shorthand.start, shorthand.close);
            attributes.set(lower(name), '');
          } else trimmed(owner, 'spread', shorthand.start, shorthand.close);
        }
        i = shorthand.end;
        continue;
      }
      const at = i;
      const match = source.slice(i, limit).match(/^[^\s=/>{"'<>]+/);
      if (!match) {
        if (emit) fail('Opening tag attributes could not be bounded.', i, limit, 'syntax', 'failed');
        break;
      }
      const name = match[0];
      const nameLast = i + name.length;
      i = nameLast;
      while (i < limit && /\s/.test(source[i])) i++;
      const channel = attributeName(owner, name);
      const canonical = lower(name.replace(/^(?:v-bind:|bind:|:)/, ''));
      const render = emit && rendersAttribute(name);
      if (source[i] !== '=') {
        attributes.set(canonical, '');
        if (render && !LAYOUT_ATTRIBUTE.test(name)) add(owner, channel, at, nameLast);
        continue;
      }
      i++;
      while (i < limit && /\s/.test(source[i])) i++;
      const quote = source[i] === '"' || source[i] === "'" ? source[i++] : null;
      const valueStart = i;
      let segment = i;
      let dynamic = false;
      let malformed = false;
      while (i < limit && (quote ? source[i] !== quote : !/[\s>]/.test(source[i]) && !(source[i] === '/' && i === limit - 1))) {
        const marker = dynamicMarker(i, limit);
        if (marker === null) {
          malformed = true;
          if (emit) fail('Template attribute expression is not closed.', i, limit, channel, 'failed');
          break;
        }
        if (marker) {
          if (render) {
            trimmed(owner, channel, segment, i);
            if (marker.start != null) trimmed(owner, channel, marker.start, marker.close);
          }
          dynamic = true;
          i = marker.end;
          segment = i;
        } else i++;
      }
      if (malformed || (quote && source[i] !== quote)) {
        if (!malformed && emit) fail('Quoted attribute value is not closed.', valueStart, limit, channel, 'failed');
        break;
      }
      const valueEnd = i;
      const bound = vue && /^(?:v-|:|@|#)/.test(name) || blade && name.startsWith(':') || svelte && /^(?:bind|on|use|class|style):/.test(name);
      attributes.set(canonical, dynamic || bound ? '' : source.slice(valueStart, valueEnd));
      if (vue && /^v-model(?:[:.]|$)/.test(name)) attributes.set('value', '');
      if (render && (dynamic || bound || !LAYOUT_ATTRIBUTE.test(name))) {
        if (segment < valueEnd) trimmed(owner, channel, segment, valueEnd);
        else if (!dynamic) add(owner, channel, at, nameLast);
      }
      if (quote) i++;
    }
    return attributes;
  }

  function openingNameEnd(owner) {
    return owner.start + 1 + owner.tag.length;
  }

  for (const view of ignored.values()) {
    if (lower(view.tag) !== 'script') continue;
    const attributes = attributeSites(view, openingNameEnd(view), { emit: false });
    if (attributes.has('src')) importPath(attributes.get('src'));
    const lang = attributes.get('lang') || 'js';
    const type = attributes.get('type');
    if (type && !/^(?:module|text\/(?:java|ecma)script|application\/(?:java|ecma)script)$/i.test(type)) {
      if (!vue && !svelte) trimmed(view, 'text', view.open_end, view.closeStart);
      continue;
    }
    if (!/^(?:[jt]sx?|typescript|javascript)$/.test(lang)) {
      fail('Embedded script language is unsupported.', view.start, view.open_end, 'syntax');
      continue;
    }
    scriptInventory(context, view.open_end, view.closeStart, { typescript: /^(?:ts|typescript)/.test(lang), jsx: lang !== 'ts' && lang !== 'typescript' });
  }

  if (vue) {
    if (!template) {
      if (/<template(?:\s|>)/i.test(source)) fail('Vue template has no complete outer element.', 0, source.length, 'syntax', 'failed');
      return;
    }
    const attributes = attributeSites(template, openingNameEnd(template), { emit: false });
    if (attributes.get('src')) {
      importPath(attributes.get('src'));
      fail('External Vue template requires direct source review.', template.start, template.open_end, 'template');
      return;
    }
    if (attributes.get('lang') && attributes.get('lang') !== 'html') {
      fail('Vue template language is unsupported.', template.start, template.open_end, 'template');
      return;
    }
  }

  const stack = [];
  let i = scopeStart;
  let literalStart = i;
  const literal = () => trimmed(stack.at(-1), 'text', literalStart, i);
  while (i < scopeEnd) {
    const owner = stack.at(-1);
    const view = viewByStart.get(i);
    const skip = ignored.get(i);
    const htmlComment = source.startsWith('<!--', i);
    const declaration = /^<!doctype\b/i.test(source.slice(i, i + 12));
    const php = blade && source.startsWith('<?', i);
    const directive = blade && source[i] === '@' ? bladeDirective(i, scopeEnd) : null;
    const expression = dynamicMarker(i, scopeEnd);
    if (owner && i === owner.closeStart) {
      literal();
      stack.pop();
      i = owner.end;
    } else if (skip) {
      literal();
      i = skip.end;
    } else if (view) {
      literal();
      const opening = openingNameEnd(view);
      if (vue && /\bis\s*=\s*(['"])vue:/.test(source.slice(opening, view.open_end))) view.native = false;
      const initialSites = context.sites.length;
      const attributes = attributeSites(view, opening);
      controlSlot(context, view, attributes, view.start + 1);
      if (view.native && view.open_end === view.closeStart && context.sites.length === initialSites) add(view, 'element', view.start + 1, opening);
      if (view.end !== view.open_end) stack.push(view);
      i = view.open_end;
    } else if (htmlComment || declaration || php) {
      literal();
      const delimiter = htmlComment ? '-->' : php ? '?>' : '>';
      const close = source.indexOf(delimiter, i + 2);
      const end = close < 0 || close + delimiter.length > scopeEnd ? scopeEnd : close + delimiter.length;
      if (php) fail('Inline PHP requires direct source review.', i, end, 'directive:php');
      if (close < 0) fail('Unclosed markup declaration.', i, end, 'syntax', 'failed');
      i = end;
    } else if (directive) {
      literal();
      directiveSlot(owner, directive, i);
      i = directive.end;
    } else if (expression !== undefined) {
      literal();
      if (expression === null) {
        fail('Template expression is not closed.', i, scopeEnd, 'syntax', 'failed');
        i = scopeEnd;
      } else {
        emitTemplateExpression(owner, expression);
        i = expression.end;
      }
    } else if (source[i] === '<' && !RAW_TEXT.test(owner?.tag || '') && /^<\/?[A-Za-z]/.test(source.slice(i, i + 4))) {
      literal();
      const close = source.indexOf('>', i + 1);
      const end = close < 0 || close >= scopeEnd ? scopeEnd : close + 1;
      fail('Markup has no complete, exact element span.', i, end, 'syntax', 'failed');
      i = end;
    } else {
      i++;
      continue;
    }
    literalStart = i;
  }
  literal();
}

export function inventory(root, { include } = {}) {
  root = fs.realpathSync(path.resolve(root));
  const { files, failures } = sourceFiles(root, scopePaths(root, include));
  const entries = [];
  const sites = [];
  for (const file of files) {
    const entry = { file: slash(file), sha256: null, language: language(file), status: 'parsed' };
    entries.push(entry);
    let source;
    try {
      const bytes = fs.readFileSync(path.join(root, file));
      entry.sha256 = sha256(bytes);
      source = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    } catch (error) {
      entry.status = 'failed';
      entry.error = `Source read failed (${error.code || 'invalid UTF-8'}).`;
      failures.push({ file: entry.file, status: entry.status, error: entry.error });
      continue;
    }

    const context = sourceContext(root, file, source);
    try {
      if (SCRIPT.test(file)) {
        const typescript = /\.[cm]?tsx?$/i.test(file);
        scriptInventory(context, 0, source.length, { typescript, jsx: !typescript || /\.tsx$/i.test(file) });
      } else if (TEMPLATE.test(file)) {
        templateInventory(context, entry.language);
      } else {
        context.fail('No structural parser for this source language.');
      }
    } catch (error) {
      context.fail(`Structural parser failed (${error.code || error.name || 'unknown error'}).`, undefined, undefined, undefined, 'failed');
    }
    if (context.failures.length) {
      entry.status = context.failures.some((failure) => failure.status === 'failed') ? 'failed' : 'unsupported';
      entry.error = context.failures[0].error;
      failures.push(...context.failures);
    }
    if (context.imports.size) entry.imports = [...context.imports].sort(compare);
    sites.push(...context.sites);
  }
  const sourceOrder = (a, b) => compare(a.file, b.file) || (a.start ?? -1) - (b.start ?? -1) || (a.end ?? -1) - (b.end ?? -1)
    || (a.target?.start ?? -1) - (b.target?.start ?? -1) || compare(a.channel || '', b.channel || '');
  return { schema_version: 1, root, files: entries, sites: sites.sort(sourceOrder), failures: failures.sort(sourceOrder) };
}
