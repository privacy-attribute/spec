import fs from 'node:fs';
import path from 'node:path';

// Session artifacts must never follow links supplied by a scanned repository.
export function validateSession(directory, sourceTop) {
  let out = path.resolve(directory);
  let ancestor = out;
  while (!fs.existsSync(ancestor)) ancestor = path.dirname(ancestor);
  out = path.join(fs.realpathSync(ancestor), path.relative(ancestor, out));
  if (sourceTop) {
    const rel = path.relative(fs.realpathSync(sourceTop), out);
    if (rel === '' || (!rel.startsWith(`..${path.sep}`) && rel !== '..' && !path.isAbsolute(rel))) throw new Error('Session folder must be outside the application repository.');
  }
  const inspect = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const child = path.join(dir, e.name);
      if (e.isSymbolicLink()) throw new Error(`Session contains a symbolic link: ${e.name}`);
      if (e.isDirectory()) inspect(child);
    }
  };
  inspect(out);
  return out;
}

export function writeSessionFile(directory, name, value) {
  directory = validateSession(directory);
  const file = path.resolve(directory, name);
  const rel = path.relative(path.resolve(directory), file);
  if (rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) throw new Error('Session filename escapes its directory.');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const fd = fs.openSync(file, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_TRUNC | (fs.constants.O_NOFOLLOW || 0), 0o600);
  try { fs.writeFileSync(fd, value); } finally { fs.closeSync(fd); }
}
