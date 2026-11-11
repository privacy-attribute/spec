// Schema reader: the fields that an application's own data schema declares, with a category for
// each field name. Reads Prisma schemas and Rails db/schema.rb. A field holds private data when the schema stores free
// text or JSON in it, and counts and limits about an account; ids, flags, dates, enums, positions
// and relations do not.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const SKIP_DIR = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage', 'vendor']);
const SECRET_FIELD = /(secret|token|password|passwd|hash|salt|apikey|api_key|privatekey|private_key|backupcodes?|recoverycodes?|otp|cvv|cvc|iban|cardnumber|credential)/i;
const ID_FIELD = /^(id|uuid|cuid|\w+Id|\w+_id|\w+Ids)$/;
const NUMBER = new Set(['Int', 'BigInt', 'Float', 'Decimal']);
const RAILS_TYPE = { string: 'String', text: 'String', citext: 'String', json: 'Json', jsonb: 'Json', binary: 'Bytes', integer: 'Int', bigint: 'BigInt', float: 'Float', decimal: 'Decimal', boolean: 'Boolean', datetime: 'DateTime', date: 'DateTime', time: 'DateTime', timestamp: 'DateTime', uuid: 'String' };
const POSITION_FIELD = /(order|index|position|page|version|counter|width|height|x|y)$/i;

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

// Returns { fields: Map(field name -> { category: 'secret' | 'private' | 'public', models: [...] }), models, files }.
// A name that is private in one model and public in another counts as private.
export function readSchemas(root) {
  const fields = new Map();
  const models = new Set();
  const enums = new Set();
  // A front-end folder inside a monorepo often has its schema in a sibling package.
  let files = prismaFiles(root);
  if (!files.length) {
    try {
      const top = execFileSync('git', ['-C', root, 'rev-parse', '--show-toplevel'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
      if (top && path.resolve(top) !== path.resolve(root)) files = prismaFiles(top);
    } catch { /* not a git checkout */ }
  }
  const blocks = [];
  for (const file of files.filter((f) => f.endsWith('.rb'))) {
    // create_table "contacts" do |t|  t.string "email" ... end
    for (const m of fs.readFileSync(file, 'utf8').matchAll(/create_table "(\w+)"[^\n]*\n([\s\S]*?)\n\s*end\b/g)) {
      models.add(m[1]);
      const body = [...m[2].matchAll(/t\.(\w+)\s+"(\w+)"/g)].map(([, type, name]) => `${name} ${RAILS_TYPE[type] || 'Unsupported'}`).join('\n');
      blocks.push([m[1], body]);
    }
  }
  for (const file of files.filter((f) => f.endsWith('.prisma'))) {
    const text = fs.readFileSync(file, 'utf8');
    for (const m of text.matchAll(/^enum\s+(\w+)\s*\{/gm)) enums.add(m[1]);
    for (const m of text.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) { models.add(m[1]); blocks.push([m[1], m[2]]); }
  }
  const rank = { public: 0, private: 1, secret: 2 };
  for (const [model, body] of blocks) {
    for (const line of body.split('\n')) {
      const f = line.replace(/\/\/.*$/, '').trim().match(/^(\w+)\s+(\w+)(\[\])?\??/);
      if (!f) continue;
      const [, name, type] = f;
      let category;
      if (models.has(type)) continue; // a relation: the related model's own fields decide
      if (SECRET_FIELD.test(name) && (type === 'String' || type === 'Json' || type === 'Bytes')) category = 'secret';
      else if (ID_FIELD.test(name) || enums.has(type) || type === 'Boolean' || type === 'DateTime') category = 'public';
      else if (type === 'String' || type === 'Json' || type === 'Bytes') category = 'private';
      else if (NUMBER.has(type)) category = POSITION_FIELD.test(name) ? 'public' : 'private';
      else continue;
      const prev = fields.get(name);
      if (!prev) fields.set(name, { category, models: [model] });
      else {
        prev.models.push(model);
        if (rank[category] > rank[prev.category]) prev.category = category;
      }
    }
  }
  return { fields, models: [...models], files: files.map((f) => path.relative(root, f)) };
}
