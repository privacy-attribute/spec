import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { constants as fsConstants } from 'node:fs';
import { cp, lstat, mkdir, mkdtemp, open, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, version as esbuildVersion } from '../../audit/runner/node_modules/esbuild/lib/main.js';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const workspace = resolve(repoRoot, '..', '..');
const adapters = join(repoRoot, 'scan/runtime/adapters');
const defaultSupport = join(repoRoot, 'local-evidence/runtime-twenty-build/upstream');
const twentyRepo = 'https://github.com/twentyhq/twenty';
const twentyCommit = '0036a6f7f9d3d5112d03c9c3f142f66c09224ff7';

const defaultDependencies = {
  react: join(workspace, 'enscribe'),
  'react-dom': join(workspace, 'enscribe'),
  '@emotion/is-prop-valid': join(workspace, 'rrweb/node_modules/@emotion/styled'),
  stylis: join(workspace, 'rrweb'),
  clsx: join(workspace, 'backend-privacy-annotations/node_modules/.bun/clsx@2.1.1'),
};

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const blobSha = (bytes) =>
  createHash('sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex');

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

function manifestPath(path) {
  const parts = typeof path === 'string' ? path.split('/') : [];
  if (!parts.length || parts.some((part) => !/^[a-zA-Z0-9_.@-]+$/.test(part) || part === '.' || part === '..')) {
    throw new Error('Unsafe manifest path: ' + path);
  }
  return parts;
}

async function readRegularFile(root, path) {
  const parts = manifestPath(path);
  let current = root;
  for (const part of parts.slice(0, -1)) {
    current = join(current, part);
    if (!(await lstat(current)).isDirectory()) throw new Error('Expected a source directory: ' + current);
  }
  const file = join(current, parts.at(-1));
  if (!(await lstat(file)).isFile()) throw new Error('Expected a regular source file: ' + file);
  const handle = await open(file, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  try {
    if (!(await handle.stat()).isFile()) throw new Error('Expected a regular source file: ' + file);
    return await handle.readFile();
  } finally {
    await handle.close();
  }
}

async function verifyBlob(root, path, expected) {
  const bytes = await readRegularFile(root, path);
  if (blobSha(bytes) !== expected) throw new Error('Pinned Git blob mismatch for ' + path);
  return { bytes, sha256: sha256(bytes) };
}

function validateSupplement({ repo, ref, path, local }) {
  const source = {
    'twentyhq/twenty': { prefix: 'twenty', refs: [twentyCommit] },
    'mui/base-ui': { prefix: 'base-ui', refs: ['v1.9.0'] },
    'callstack/linaria': { prefix: 'linaria', refs: ['@linaria/react@7.0.1', '@linaria/core@7.0.0'] },
  }[repo];
  manifestPath(path);
  if (!source?.refs.includes(ref) || local !== source.prefix + '/' + path) {
    throw new Error('Invalid supplemental source pin for ' + path);
  }
}

async function stageFile(root, path, bytes) {
  const target = join(root, path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, bytes, { flag: 'wx' });
}

async function requireAbsent(file) {
  try {
    await lstat(file);
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  throw new Error('Fixture output already exists: ' + file);
}

async function writeOutput(entries) {
  const created = [];
  try {
    for (const [file, content] of entries) {
      const handle = await open(file, 'wx');
      created.push(file);
      try {
        await handle.writeFile(content);
      } finally {
        await handle.close();
      }
    }
  } catch (error) {
    await Promise.all(created.map((file) => rm(file, { force: true })));
    throw error;
  }
}

async function readPatch(review) {
  const patch = review.startsWith('diff --git ') ? review : await readFile(review, 'utf8');
  if (!patch.startsWith('diff --git ')) throw new Error('Expected a raw Twenty source patch.');
  return patch;
}

function applyPatch(root, patch, check = false) {
  const result = spawnSync('git', ['apply', '--whitespace=nowarn', ...(check ? ['--check'] : []), '-'], {
    cwd: root,
    input: patch,
    encoding: 'utf8',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr.trim() || 'git apply failed');
}

const platformImports = [
  '@base-ui/react/field',
  '@base-ui/react/use-render',
  '@lingui/react/macro',
  '@sniptt/guards',
  'ts-key-enum',
  'twenty-ui/components/feedback',
  'twenty-ui/icon',
  'twenty-ui/theme',
  '@/ui/utilities/focus/hooks/usePushFocusItemToFocusStack',
  '@/ui/utilities/focus/hooks/useRemoveFocusItemFromFocusStackById',
  '@/ui/utilities/hotkey/hooks/useHotkeysOnFocusedElement',
];

function resolvePlugin(tree, support, dependencies) {
  const ui = join(tree, 'packages/twenty-ui/src');
  const shared = join(tree, 'packages/twenty-shared/src');
  const front = join(tree, 'packages/twenty-front/src');
  const mappings = {
    '@base-ui/react/merge-props': join(support, 'base-ui/packages/react/src/merge-props/mergeProps.ts'),
    '@base-ui/utils/mergeObjects': join(support, 'base-ui/packages/utils/src/mergeObjects.ts'),
    'fixture:linaria-styled': join(support, 'linaria/packages/react/src/styled.ts'),
    'fixture:linaria-cx': join(support, 'linaria/packages/core/src/cx.ts'),
    '@linaria/core': join(adapters, 'linaria.ts'),
    '@linaria/react': join(adapters, 'linaria.ts'),
    ...Object.fromEntries(platformImports.map((name) => [name, join(adapters, 'platform.tsx')])),
  };
  const barrels = {
    'twenty-shared/utils': [
      ['isDefined', join(shared, 'utils/validation/isDefined.ts')],
      ['getSafeUrl', join(shared, 'utils/url/getSafeUrl.ts')],
    ],
    'twenty-ui/primitives/input': [
      ['Field', join(ui, 'primitives/input/Field/Field.tsx')],
      ['Button', join(adapters, 'platform.tsx')],
    ],
    'twenty-ui/primitives/typography': [['Text', join(ui, 'primitives/typography/Text/Text.tsx')]],
  };
  const prefixes = { '@/': join(front, 'modules'), '~/': front, '@ui/': ui };

  return {
    name: 'pinned-twenty-fixture',
    setup(builder) {
      builder.onResolve({ filter: /.*/ }, async ({ path, kind, pluginData }) => {
        if (pluginData?.resolving) return;
        if (barrels[path]) return { path, namespace: 'twenty-fixture' };
        if (mappings[path]) return { path: mappings[path] };

        const prefix = Object.keys(prefixes).find((key) => path.startsWith(key));
        if (prefix) {
          return builder.resolve(join(prefixes[prefix], path.slice(prefix.length)), {
            resolveDir: tree,
            kind,
            pluginData: { resolving: true },
          });
        }

        const packageName = Object.keys(dependencies).find(
          (name) => path === name || path.startsWith(name + '/'),
        );
        if (packageName) {
          return builder.resolve(path, {
            resolveDir: dependencies[packageName],
            kind,
            pluginData: { resolving: true },
          });
        }
      });

      builder.onLoad({ filter: /.*/, namespace: 'twenty-fixture' }, ({ path }) => ({
        contents: barrels[path]
          .map(([name, file]) => 'export { ' + name + ' } from ' + JSON.stringify(file) + ';')
          .join('\n'),
        loader: 'js',
        resolveDir: tree,
      }));

      builder.onLoad({ filter: /\.module\.scss$/ }, async ({ path }) => {
        const classes = {};
        const name = basename(path, '.module.scss');
        const source = (await readFile(path, 'utf8')).replace(/\.([a-zA-Z][\w-]*)/g, (_, className) => {
          classes[className] = 'fixture-' + name + '-' + className;
          return '.' + classes[className];
        });
        return {
          contents: [
            'import { installCss } from ' + JSON.stringify(join(adapters, 'linaria.ts')) + ';',
            'installCss(' + JSON.stringify(source) + ');',
            'export default ' + JSON.stringify(classes) + ';',
          ].join('\n'),
          loader: 'js',
          resolveDir: dirname(path),
        };
      });
    },
  };
}

async function bundle(tree, support, dependencies, out, variant) {
  const file = join(out, variant + '.js');
  const result = await build({
    absWorkingDir: tree,
    entryPoints: [join(adapters, 'entry.tsx')],
    outfile: file,
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"' },
    legalComments: 'inline',
    metafile: true,
    minify: true,
    plugins: [resolvePlugin(tree, support, dependencies)],
  });
  const output = result.outputFiles[0];
  const imports = new Set(
    Object.keys(result.metafile.inputs).map((path) => resolve(tree, path)),
  );
  return { file, script: output.text, sha256: sha256(output.contents), imports };
}

const adapterNotes = {
  'entry.tsx': 'Mounts the pinned components with synthetic props and a public control. Installs a synthetic clipboard sink and reports input and toast observations separately from DOM content.',
  'linaria.ts': 'Compiles upstream CSS templates into fixture classes and metadata for the pinned Linaria 7.0.1 runtime. That runtime creates native DOM tags and filters props using its installed @emotion/is-prop-valid dependency. Stylis emits CSS for the templates and simple upstream Sass modules. The production Linaria compiler and full Twenty theme are outside this fixture.',
  'platform.tsx': 'Provides focus-stack and hotkey no-ops, basic theme tokens, untranslated English templates, guard helpers, placeholder icons, a native public Copy button, toast observation, and basic Base UI field/render wrappers. No adapter selects which rendered values receive privacy annotations.',
  'barrel aliases': 'Resolve imported exports directly to their pinned modules or named adapter. Base UI mergeProps and mergeObjects, Linaria styled and Linaria cx are vendored verbatim from their pinned releases, including upstream licenses.',
};

export async function buildTwentyFixture({
  source,
  review,
  followupPatch,
  out,
  support = defaultSupport,
  dependencies: dependencyOverrides = {},
}) {
  const sourcePath = resolve(source);
  const sourceRoot = basename(sourcePath) === 'files' ? dirname(sourcePath) : sourcePath;
  const outPath = resolve(out);
  const supportPath = resolve(support);
  const dependencies = { ...defaultDependencies, ...dependencyOverrides };
  const sourceFiles = join(sourceRoot, 'files');
  for (const root of [sourceRoot, sourceFiles, supportPath]) {
    if (!(await lstat(root)).isDirectory()) throw new Error('Expected a source directory: ' + root);
  }
  const sourceManifest = JSON.parse(await readRegularFile(sourceRoot, 'manifest.json'));
  if (sourceManifest.repo !== twentyRepo || sourceManifest.commit !== twentyCommit) {
    throw new Error('Twenty source manifest does not identify the reviewed repository revision.');
  }
  const supportManifest = JSON.parse(await readRegularFile(supportPath, 'manifest.json'));
  const patch = await readPatch(review);
  const followup = followupPatch == null ? undefined : await readPatch(followupPatch);
  const manifestFile = join(outPath, 'manifest.json');
  await Promise.all(['baseline.js', 'patched.js', 'manifest.json'].map((file) => requireAbsent(join(outPath, file))));

  const temp = await mkdtemp(join(tmpdir(), 'twenty-runtime-'));
  try {
    const baselineTree = join(temp, 'baseline');
    const patchedTree = join(temp, 'patched');
    const supportTree = join(temp, 'support');

    const sources = [];
    for (const { repo, commit, path, blob_sha } of sourceManifest.files) {
      if (repo !== twentyRepo || commit !== twentyCommit) throw new Error('Source entry does not match the pin: ' + path);
      const file = await verifyBlob(sourceFiles, path, blob_sha);
      await stageFile(baselineTree, path, file.bytes);
      sources.push({ path, blobSha: blob_sha, sha256: file.sha256 });
    }
    const supplement = [];
    for (const entry of supportManifest) {
      validateSupplement(entry);
      const file = await verifyBlob(supportPath, entry.local, entry.blobSha);
      if (entry.repo === 'twentyhq/twenty') {
        await stageFile(baselineTree, entry.path, file.bytes);
      } else {
        await stageFile(supportTree, entry.local, file.bytes);
      }
      supplement.push({ ...entry, sha256: file.sha256 });
    }
    await cp(baselineTree, patchedTree, { recursive: true, errorOnExist: true });
    applyPatch(patchedTree, patch, true);
    applyPatch(patchedTree, patch);
    if (followup) {
      applyPatch(patchedTree, followup, true);
      applyPatch(patchedTree, followup);
    }
    const [baseline, patched] = await Promise.all([
      bundle(baselineTree, supportTree, dependencies, outPath, 'baseline'),
      bundle(patchedTree, supportTree, dependencies, outPath, 'patched'),
    ]);
    const bundled = (tree, variant, path) => variant.imports.has(join(tree, path));
    const annotateSource = async ({ path, ...entry }) => ({
      path,
      ...entry,
      patchedSha256: sha256(await readFile(join(patchedTree, path))),
      baselineRuntimeImport: bundled(baselineTree, baseline, path),
      patchedRuntimeImport: bundled(patchedTree, patched, path),
    });
    const manifest = {
      source: { repo: sourceManifest.repo, commit: sourceManifest.commit },
      reviewPatch: { sha256: sha256(patch), checkApplied: true },
      ...(followup ? { followupPatch: { sha256: sha256(followup), checkApplied: true } } : {}),
      bundles: Object.fromEntries(
        [baseline, patched].map(({ file, sha256: digest }) => [
          basename(file, '.js'),
          { file: relative(outPath, file), sha256: digest },
        ]),
      ),
      sourceFiles: await Promise.all(sources.map(annotateSource)),
      supplementalSources: await Promise.all(supplement.map(async (entry) => (
        entry.repo === 'twentyhq/twenty'
          ? { ...entry, ...await annotateSource({ path: entry.path }) }
          : {
              ...entry,
              baselineRuntimeImport: bundled(supportTree, baseline, entry.local),
              patchedRuntimeImport: bundled(supportTree, patched, entry.local),
            }
      ))),
      adapters: Object.fromEntries(await Promise.all(
        Object.entries(adapterNotes).map(async ([file, description]) => [
          file,
          file === 'barrel aliases'
            ? { description, sha256: sha256(await readFile(fileURLToPath(import.meta.url))) }
            : { description, sha256: sha256(await readFile(join(adapters, file))) },
        ]),
      )),
      dependencies: {
        esbuild: esbuildVersion,
        ...Object.fromEntries(await Promise.all(
          Object.entries(dependencies).map(async ([name, root]) => [
            name,
            (await readJson(join(root, 'node_modules', name, 'package.json'))).version,
          ]),
        )),
      },
      scope: [
        'ApiKeyInput → SettingsTextInput → TextInput → native input and adjacent Copy control',
        'EmailDisplay → ContactLink → native anchor, with EllipsisDisplay for valid addresses',
        'TextInput → AutogrowWrapper → hidden sizing text and native input',
        'Unprotected ContactLink and an independent public button as controls',
      ],
    };
    await mkdir(outPath, { recursive: true });
    if (!(await lstat(outPath)).isDirectory()) throw new Error('Expected an output directory: ' + outPath);
    await writeOutput([
      [baseline.file, baseline.script],
      [patched.file, patched.script],
      [manifestFile, JSON.stringify(manifest, null, 2) + '\n'],
    ]);
    delete baseline.imports;
    delete patched.imports;
    return { baseline, patched, manifest, manifestFile };
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}
