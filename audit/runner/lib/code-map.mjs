// Resolves an adapter's channel-to-code map against the audited source tree, so the agent gets
// file:line starting points for every channel. Symbols are looked up at run time, so the map
// keeps working when line numbers move between versions.
import fs from 'node:fs';
import path from 'node:path';

function sourceFiles(root, dirs) {
  const out = [];
  const walk = (d) => {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (!['node_modules', 'dist', 'test', '__tests__'].includes(e.name)) walk(p); }
      else if (/\.(ts|tsx|js|mjs)$/.test(e.name) && !/\.(test|spec|d)\./.test(e.name)) out.push(p);
    }
  };
  dirs.forEach((d) => walk(path.join(root, d)));
  return out;
}

// A definition: function, class, const or let binding, object or class method.
const definition = (symbol) => new RegExp(
  `(function\\*?\\s+${symbol}\\b|class\\s+${symbol}\\b|(const|let|var)\\s+${symbol}\\s*[=:]|^\\s*(private\\s+|public\\s+|protected\\s+|static\\s+|async\\s+)*${symbol}\\s*(<[^>]*>)?\\s*\\(|^\\s*(private\\s+|public\\s+|protected\\s+|static\\s+|readonly\\s+)*${symbol}\\s*=\\s*(async\\s*)?\\()`,
);

export function resolveCodeMap(sdk, map) {
  if (!sdk || !map) return {};
  const files = sourceFiles(sdk, map.dirs);
  const cache = new Map(files.map((f) => [f, null]));
  const read = (f) => cache.get(f) ?? cache.set(f, fs.readFileSync(f, 'utf8').split('\n')).get(f);
  const find = (symbol) => {
    const re = definition(symbol);
    for (const f of files) {
      const i = read(f).findIndex((l) => re.test(l));
      if (i !== -1) return { symbol, file: path.relative(sdk, f), line: i + 1 };
    }
    return { symbol, file: null, line: null };
  };
  const out = {};
  for (const [channel, entry] of Object.entries(map.channels)) {
    out[channel] = { note: entry.note, code: entry.symbols.map(find) };
  }
  return out;
}
