// Decisions cache: .privacy-scan/decisions.json in the scanned repository. It records, for each
// reviewed file, the file's hash after the patch and the decision for each unit. A later scan skips
// files whose hash is unchanged, so only new and changed code costs review time.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

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

// Marks units in unchanged files as cached, and attaches earlier decisions to units in changed files.
export function applyCache(result, cache, root, top) {
  const stats = { files_skipped: 0, units_skipped: 0 };
  if (!cache?.files) return stats;
  const byFile = new Map();
  for (const c of result.candidates) {
    if (!byFile.has(c.file)) byFile.set(c.file, []);
    byFile.get(c.file).push(c);
  }
  for (const [file, units] of byFile) {
    const entry = cache.files[posix(path.relative(top, path.join(root, file)))];
    if (!entry) continue;
    const current = hash(fs.readFileSync(path.join(root, file), 'utf8'));
    const earlier = new Map(entry.units.map((u) => [u.fingerprint, u]));
    if (current === entry.hash) {
      stats.files_skipped++;
      for (const c of units) { c.cached = earlier.get(fingerprint(c)) || { decision: 'dismiss', reason: 'file unchanged since the last scan' }; stats.units_skipped++; }
    } else {
      for (const c of units) if (earlier.has(fingerprint(c))) c.earlier = earlier.get(fingerprint(c));
    }
  }
  return stats;
}

// Builds the new cache from the earlier one, this scan and its decisions. `after` maps absolute
// paths of patched files to their content after the patch.
export function buildCache({ cache, scan, decisions, after, root, top, version }) {
  const files = { ...(cache?.files || {}) };
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
        if (c.settled) return { fingerprint: fingerprint(c), decision: 'dismiss', reason: c.settled };
        const a = annotatedBy.get(c.id);
        if (a) return { fingerprint: fingerprint(c), decision: 'annotate', value: a.value, category: a.category, reason: (a.data || '').slice(0, 160) };
        return { fingerprint: fingerprint(c), decision: 'dismiss', reason: (dismissed[c.id] || 'not reviewed').slice(0, 160) };
      }),
    };
  }
  // Answers about unknown sources hold for the whole app, so a later scan does not ask again.
  const answers = { ...(cache?.answers || {}), ...(decisions.answers || {}) };
  return { version: 1, scan_version: version, ...(Object.keys(answers).length ? { answers } : {}), files };
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
