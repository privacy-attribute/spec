// Schema reader for Prisma and Rails. Keep model fields separate so a qualified property read
// uses its own model's classification.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { specialCategoryName } from './rules.mjs';

// Walks an AST without importing components.mjs, which imports this module.
function walk(node, visit) {
  if (!node || typeof node.type !== 'string') return;
  if (visit(node) === false) return;
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'start' || key === 'end' || key === 'leadingComments' || key === 'trailingComments') continue;
    const v = node[key];
    if (Array.isArray(v)) v.forEach((x) => x && typeof x.type === 'string' && walk(x, visit));
    else if (v && typeof v.type === 'string') walk(v, visit);
  }
}

export const CONSTANT_OBJECT = /^([A-Z][A-Z0-9_]*|[A-Z]\w*(Enum|Status|Type|Role|Kind|Mode|Map|s)|Math|JSON|Object|Number|String|Date|i18n|env|process|config|import)$/;

export function memberFieldName(expr) {
  if (expr?.type !== 'MemberExpression' && expr?.type !== 'OptionalMemberExpression') return null;
  if (expr.computed) return expr.property.type === 'StringLiteral' ? expr.property.value : null;
  return expr.property.type === 'Identifier' ? expr.property.name : null;
}

const CATEGORY_RANK = { public: 0, personal: 1, 'third-party': 2, secret: 3 };
const fieldRank = (field) => !field || field.category === 'public' ? 0 : field.ambiguous ? 5
  : field.category === 'secret' ? 6 : field.special_category ? 4 : CATEGORY_RANK[field.category] + 1;

// The highest-ranked schema field that an expression shows, with sensitivity and resolution metadata.
// `constants` holds names bound to items of constant lists, such as format in FORMATS.map((format) => ...).
export function schemaFieldIn(expr, fields, constants = new Set(), resolveOwner = () => undefined) {
  let found = null;
  walk(expr, (n) => {
    if (found?.category === 'secret' && !found.ambiguous) return false;
    if (n !== expr && (n.type === 'JSXElement' || n.type === 'JSXFragment' || n.type === 'ArrowFunctionExpression' || n.type === 'FunctionExpression')) return false;
    const name = memberFieldName(n);
    if (name != null) {
      const base = n.object.type === 'Identifier' ? n.object.name : null;
      const owner = resolveOwner(n.object);
      const field = owner === undefined ? fields.get(name) : owner?.get(name);
      if (field?.category && !(owner === undefined && base && (CONSTANT_OBJECT.test(base) || constants.has(base)))) {
        const { category, special_category } = field;
        const candidate = { name, category, special_category, ambiguous: owner === undefined && Boolean(field.conflicting) };
        if (fieldRank(candidate) > fieldRank(found)) found = candidate;
      }
    }
    return true;
  });
  return found;
}
// An expression that shows only a field the schema explicitly declares public.
export function schemaPublicIn(expr, fields) {
  let e = expr;
  while (e && (e.type === 'TSNonNullExpression' || e.type === 'TSAsExpression')) e = e.expression;
  // A formatter can preserve a field's category.
  if (e?.type === 'CallExpression' && e.arguments.length === 1 && /^(date|time|format\w*|toLocale\w*|relative\w*|dayjs|moment|DateTime)$/i.test(e.callee.type === 'MemberExpression' ? e.callee.property?.name || '' : e.callee.name || '')) return schemaPublicIn(e.arguments[0], fields);
  return fields.get(memberFieldName(e))?.category === 'public';
}

const SKIP_DIR = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage', 'vendor']);
const SECRET_FIELD = /(secret|token|password|passwd|passphrase|hash|salt|apikey|api_key|privatekey|private_key|backupcodes?|recoverycodes?|otp|cvv|cvc|iban|card_?number|credential)/i;
const SECRET_METADATA = /(?:name|label|description|prefix|suffix|hint|count|length|status|type|enabled|last.?four|(?:created|updated|expires|used)At|_at)$/i;
const NUMBER = new Set(['Int', 'BigInt', 'Float', 'Decimal']);
const RAILS_TYPE = { string: 'String', text: 'String', citext: 'String', json: 'Json', jsonb: 'Json', binary: 'Bytes', integer: 'Int', bigint: 'BigInt', float: 'Float', decimal: 'Decimal', boolean: 'Boolean', datetime: 'DateTime', date: 'DateTime', time: 'DateTime', timestamp: 'DateTime', uuid: 'String' };

function prismaFiles(root) {
  const out = [];
  const walk = (dir, depth) => {
    if (depth > 6) return;
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) { if (!SKIP_DIR.has(e.name) && !e.name.startsWith('.')) walk(abs, depth + 1); }
      else if (e.name.endsWith('.prisma') || (e.name === 'schema.rb' && path.basename(dir) === 'db')) out.push(abs);
    }
  };
  walk(root, 0);
  return out;
}

// Resolve a name only when the schema declares a unique model with that name.
export function schemaModel(schema, name, file) {
  if (!name) return null;
  const models = schema?.modelFields?.get(name.toLowerCase()) || [];
  const matches = file ? models.filter((model) => model.file === file) : models;
  return matches.length === 1 ? matches[0].fields : null;
}

// `fields` remains the name index for unqualified reads. `modelFields` preserves identity and
// relates nested records without merging fields with the same spelling from unrelated models.
export function readSchemas(root) {
  const fields = new Map();
  const models = new Set();
  const enums = new Set();
  const modelFields = new Map();
  // A front-end folder inside a monorepo often has its schema in a sibling package.
  let files = prismaFiles(root);
  if (!files.length) {
    try {
      const top = execFileSync('git', ['--no-optional-locks', '-c', 'core.fsmonitor=false', '-C', root, 'rev-parse', '--show-toplevel'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
      if (top && path.resolve(top) !== path.resolve(root)) files = prismaFiles(top);
    } catch { /* not a git checkout */ }
  }
  const blocks = [];
  for (const file of files.filter((f) => f.endsWith('.rb'))) {
    // create_table "contacts" do |t|  t.string "email" ... end
    for (const m of fs.readFileSync(file, 'utf8').matchAll(/create_table "(\w+)"[^\n]*\n([\s\S]*?)\n\s*end\b/g)) {
      models.add(m[1]);
      const body = [...m[2].matchAll(/t\.(\w+)\s+"(\w+)"/g)].map(([, type, name]) => `${name} ${RAILS_TYPE[type] || 'Unsupported'}`).join('\n');
      blocks.push({ name: m[1], body, file, fields: new Map() });
    }
  }
  for (const file of files.filter((f) => f.endsWith('.prisma'))) {
    const text = fs.readFileSync(file, 'utf8');
    for (const m of text.matchAll(/^enum\s+(\w+)\s*\{/gm)) enums.add(m[1]);
    for (const m of text.matchAll(/^\s*model\s+(\w+)\s*\{([\s\S]*?)\}/gm)) {
      models.add(m[1]);
      blocks.push({ name: m[1], body: m[2], file, fields: new Map() });
    }
  }
  for (const model of blocks) {
    const name = model.name.toLowerCase();
    if (!modelFields.has(name)) modelFields.set(name, []);
    modelFields.get(name).push(model);
  }
  for (const model of blocks) {
    for (const line of model.body.split('\n')) {
      const f = line.replace(/\/\/.*$/, '').trim().match(/^(\w+)\s+(\w+)(\[\])?\??/);
      if (!f) continue;
      const [, name, type, array] = f;
      if (models.has(type)) {
        const sameFile = modelFields.get(type.toLowerCase()).filter((related) => related.file === model.file);
        const related = sameFile.length ? sameFile : modelFields.get(type.toLowerCase());
        model.fields.set(name, { relation: related.length === 1 ? related[0].fields : null, array: Boolean(array) });
        continue;
      }
      if (!enums.has(type) && !NUMBER.has(type) && !['String', 'Json', 'Bytes', 'Boolean', 'DateTime'].includes(type)) continue;
      const category = SECRET_FIELD.test(name) && !SECRET_METADATA.test(name) && type !== 'Boolean' ? 'secret' : 'personal';
      const special_category = specialCategoryName(name);
      model.fields.set(name, { category, special_category });
      const prev = fields.get(name);
      if (!prev) fields.set(name, { category, special_category, models: [model.name] });
      else {
        prev.models.push(model.name);
        if (prev.category !== category || prev.special_category !== special_category) prev.conflicting = true;
        if (CATEGORY_RANK[category] > CATEGORY_RANK[prev.category]) prev.category = category;
        prev.special_category ||= special_category;
      }
    }
  }
  return { fields, models: [...models], modelFields, enums: [...enums], files: files.map((f) => path.relative(root, f)) };
}
