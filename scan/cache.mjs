// Reuse completed decisions only when the scanner, policy and full source
// snapshot agree. Source changes invalidate dependent decisions conservatively.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { files as sourceFiles } from './find.mjs';

export const CACHE_PATH = path.join('.privacy-scan', 'decisions.json');
const hash = (text) => crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);
const posix = (p) => p.split(path.sep).join('/');

// The key that identifies a unit across scans: a component name, or the rules and code of a line.
export const fingerprint = (c) => (c.sites ? `component:${c.component}` : `line:${c.rules.join('+')}:${c.snippet.trim().slice(0, 80)}`);

export function loadCache(top) {
  try {
    return JSON.parse(fs.readFileSync(path.join(top, CACHE_PATH), 'utf8'));
  } catch {
    return null;
  }
}

// Until symbol dependencies are resolved, invalidate on any source/schema change.
// This trades some repeat-review cost for correct dependency invalidation.
export function sourceSnapshot(root, top, after = new Map()) {
  const paths = new Set(sourceFiles(top));
  const dataFiles = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || /^(node_modules|vendor|dist|build|coverage)$/.test(entry.name)) continue;
      const abs = path.join(directory, entry.name);
      if (entry.isDirectory()) dataFiles(abs);
      else if (entry.isFile() && /\.(json|ya?ml|graphql|gql|mdx|prisma|rb)$/.test(entry.name)) paths.add(abs);
    }
  };
  dataFiles(top);
  for (const name of ['package.json', 'package-lock.json', 'bun.lock', 'pnpm-lock.yaml', 'yarn.lock', 'tsconfig.json', 'jsconfig.json']) {
    const abs = path.join(top, name);
    if (fs.existsSync(abs)) paths.add(abs);
  }
  return Object.fromEntries([...paths].sort().map((abs) => [posix(path.relative(top, abs)), hash(after.get(abs) ?? fs.readFileSync(abs))]));
}

export function scannerRevision() {
  const names = fs.readdirSync(new URL('.', import.meta.url)).filter((f) => /\.(mjs|md)$/.test(f));
  for (const file of fs.readdirSync(new URL('./recorders/', import.meta.url))) if (file.endsWith('.md')) names.push(`recorders/${file}`);
  names.push('../package.json', '../npm-shrinkwrap.json');
  if (fs.existsSync(new URL('../spec/core.md', import.meta.url))) names.push('../spec/core.md');
  return hash(JSON.stringify(names.sort().map((f) => [f, hash(fs.readFileSync(new URL(f, import.meta.url)))])));
}

export function cacheContext(scan, snapshot = scan.source_hashes) {
  return hash(JSON.stringify({ implementation: scannerRevision(), version: scan.scan_version, sdk: scan.sdk, annotate: scan.annotate, root: scan.target?.root, include: scan.include, snapshot }));
}

export function applyCache(result, cache, root, top) {
  const stats = { files_skipped: 0, units_skipped: 0, valid: false };
  if (!cache?.files) return stats;
  stats.valid = cache.version === 2 && cache.scan_version === result.scan_version && Boolean(result.source_hashes) && cache.context === cacheContext(result);
  for (const file of new Set(result.candidates.map((c) => c.file))) {
    const units = result.candidates.filter((c) => c.file === file);
    const entry = cache.files[posix(path.relative(top, path.join(root, file)))];
    if (!entry) continue;
    const current = hash(fs.readFileSync(path.join(root, file), 'utf8'));
    const earlier = new Map(entry.units.map((u) => [u.fingerprint, u]));
    const counts = new Map();
    for (const unit of units) counts.set(fingerprint(unit), (counts.get(fingerprint(unit)) || 0) + 1);
    let skipped = 0;
    for (const c of units) {
      if (counts.get(fingerprint(c)) !== 1 || entry.units.filter((u) => u.fingerprint === fingerprint(c)).length !== 1) continue;
      const decision = earlier.get(fingerprint(c));
      if (!decision || !['annotate', 'dismiss', 'settled'].includes(decision.decision) || decision.reason === 'not reviewed') continue;
      if (stats.valid && current === entry.hash) { c.cached = decision; stats.units_skipped++; skipped++; }
      else c.earlier = decision;
    }
    if (skipped === units.length) stats.files_skipped++;
  }
  return stats;
}

// Builds the new cache from the earlier one, this scan and its decisions. `after` maps absolute
// paths of patched files to their content after the patch.
export function buildCache({ cache, scan, decisions, after, root, top, version }) {
  const files = {};
  const annotatedBy = new Map();
  for (const a of decisions.annotations || []) for (const id of a.candidates || []) annotatedBy.set(id, a);
  const dismissed = decisions.dismissed || {};
  const byFile = new Map();
  for (const c of scan.candidates) {
    if (!byFile.has(c.file)) byFile.set(c.file, []);
    byFile.get(c.file).push(c);
  }
  for (const [file, units] of byFile) {
    const abs = path.join(root, file);
    const text = after.get(abs) ?? fs.readFileSync(abs, 'utf8');
    files[posix(path.relative(top, abs))] = {
      hash: hash(text),
      units: units.map((c) => {
        if (c.cached) return { fingerprint: fingerprint(c), ...c.cached };
        const a = annotatedBy.get(c.id);
        if (a) return { fingerprint: fingerprint(c), decision: 'annotate', value: a.value, category: a.category, reason: (a.data || '').slice(0, 160) };
        if (dismissed[c.id]) return { fingerprint: fingerprint(c), decision: 'dismiss', reason: dismissed[c.id].slice(0, 160) };
        if (c.settled) return { fingerprint: fingerprint(c), decision: 'settled', reason: c.settled };
        return null;
      }).filter(Boolean),
    };
  }
  // Answers are reusable only for the matching dependency snapshot and policy.
  const answers = { ...(scan.cache?.valid ? cache?.answers : {}), ...(decisions.answers || {}) };
  return { version: 2, context: cacheContext({ ...scan, scan_version: version }, sourceSnapshot(root, top, after)), scan_version: version, ...(Object.keys(answers).length ? { answers } : {}), files };
}

// A diff that creates or replaces the cache file.
export function cacheDiff(before, afterText) {
  const lines = afterText.replace(/\n$/, '').split('\n');
  const rel = posix(CACHE_PATH);
  if (before === null) {
    return [`diff --git a/${rel} b/${rel}`, 'new file mode 100644', '--- /dev/null', `+++ b/${rel}`, `@@ -0,0 +1,${lines.length} @@`, ...lines.map((l) => `+${l}`), ''].join('\n');
  }
  return null;
}
