import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { find } from '../find.mjs';
import { applyAnnotation } from '../patch.mjs';
import { placeAnnotations } from '../place.mjs';

function scanApp(t, files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'privacy-correctness-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const [file, text] of Object.entries(files)) {
    const target = path.join(root, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, text);
  }
  const scan = find(root);
  return { scan, ...placeAnnotations(scan, root, { sdk: 'rrweb' }) };
}

test('a schema secret beats earlier schema fields and known data origins', (t) => {
  const { annotations } = scanApp(t, {
    'schema.prisma': 'model Account {\n  displayName String\n  accessHash String\n}\n',
    'Page.tsx': 'export function Page() {\n  const account = useAccount();\n  return <p>{account.displayName + account.accessHash}</p>;\n}\n',
  });
  assert.equal(annotations.find((a) => a.match === '<p')?.value, 'block');
});

test('a later secret use upgrades a child prop already reached by personal data', (t) => {
  const { annotations } = scanApp(t, {
    'Child.tsx': 'export function Child({ label }) {\n  return <p>{label}</p>;\n}\n',
    'Page.tsx': 'import { Child } from "./Child";\nexport function Page() {\n  const account = useAccount();\n  const value = account.displayName + account.apiKey;\n  return <section>\n    <Child label={account.displayName} />\n    <Child label={value} />\n  </section>;\n}\n',
  });
  assert.equal(annotations.find((a) => a.file === 'Child.tsx')?.value, 'block');
});

test('an annotation on the child does not cover an unrelated prop', (t) => {
  const { scan, annotations, review } = scanApp(t, {
    'Child.tsx': 'export function Child({ description }) {\n  const account = useAccount();\n  return <p>{account.displayName}</p>;\n}\n',
    'Page.tsx': 'import { Child } from "./Child";\nexport function Page() {\n  const account = useAccount();\n  return <Child description={account.displayName} />;\n}\n',
  });
  assert.equal(annotations.find((a) => a.file === 'Child.tsx')?.value, 'mask');
  const parent = scan.candidates.find((c) => c.component === 'Page');
  assert.deepEqual(review.get(parent.id), [4]);
});

test('same-line JSX targets use the expression owner when tag names repeat', (t) => {
  const repeated = 'export function Repeated() {\n  const account = useAccount();\n  return <div><p>Public</p><p>{account.displayName}</p></div>;\n}\n';
  const { scan, annotations, review } = scanApp(t, {
    'Page.tsx': 'export function Page() {\n  const account = useAccount();\n  return <div>{account.displayName}<i>Public</i></div>;\n}\n',
    'Repeated.tsx': repeated,
  });
  assert.equal(annotations.find((a) => a.file === 'Page.tsx')?.match, '<div');
  const annotation = annotations.find((a) => a.file === 'Repeated.tsx');
  const lines = repeated.split('\n');
  assert.equal(annotation.column, lines[2].lastIndexOf('<p>'));
  assert.equal(applyAnnotation(lines, annotation, 'rrweb'), null);
  assert.match(lines[2], /<p>Public<\/p><p className="rr-mask">\{account\.displayName\}/);
  assert.equal(review.has(scan.candidates.find((c) => c.component === 'Repeated').id), false);
});

test('relative aliased imports propagate only into the imported component', (t) => {
  const child = 'export function Badge({ label }) {\n  return <p>{label}</p>;\n}\n';
  const { scan, annotations } = scanApp(t, {
    'auth/Badge.tsx': child,
    'help/Badge.tsx': child,
    'Page.tsx': 'import { Badge as AuthBadge } from "./auth/Badge";\nexport function Page() {\n  const account = useAccount();\n  return <AuthBadge label={account.apiKey} />;\n}\n',
  });
  assert.equal(annotations.find((a) => a.file === 'auth/Badge.tsx')?.value, 'block');
  assert.equal(scan.candidates.some((c) => c.file === 'help/Badge.tsx'), false);
});

test('Vue aliases carry the strongest origin and select the owning element on the same line', (t) => {
  const child = '<script setup>\nconst { label } = defineProps({ label: String });\n</script>\n<template><p>{{ label }}<i>Public</i></p></template>\n';
  const { scan, annotations } = scanApp(t, {
    'auth/Badge.vue': child,
    'help/Badge.vue': child,
    'Page.vue': '<script setup>\nimport AuthBadge from "./auth/Badge.vue";\nconst account = useAccount();\nconst value = account.name + account.apiKey;\n</script>\n<template><AuthBadge :label="account.name" /><AuthBadge :label="value" /></template>',
  });
  const annotation = annotations.find((a) => a.file === 'auth/Badge.vue');
  assert.equal(annotation?.value, 'block');
  assert.equal(annotation?.match, '<p');
  assert.equal(scan.candidates.some((c) => c.file === 'help/Badge.vue'), false);
});

test('a block on one element cannot suppress a separate same-line mask', (t) => {
  const { annotations } = scanApp(t, {
    'Page.tsx': 'export function Page() {\n  const account = useAccount();\n  return <main><code>{account.apiKey}</code><p>{account.name}</p></main>;\n}\n',
  });
  assert.deepEqual(annotations.map(({ match, value }) => [match, value]), [['<code', 'block'], ['<p', 'mask']]);
});

test('the input shortcut applies only to personal values on native controls', (t) => {
  const { scan, annotations, review } = scanApp(t, {
    'Page.tsx': 'export function Page() {\n  const account = useAccount();\n  return <main>\n    <input value={account.apiKey} />\n    <textarea value={account.notes} />\n    <CustomInput value={account.notes} />\n    <meter value={account.score} />\n  </main>;\n}\n',
  });
  assert.deepEqual(annotations.map(({ match, value }) => [match, value]), [['<input', 'block'], ['<meter', 'block']]);
  assert.deepEqual(review.get(scan.candidates.find((c) => c.component === 'Page').id), [6]);
});

test('a failed Svelte script parse is surfaced as an analysis failure', (t) => {
  const { scan } = scanApp(t, { 'Page.svelte': '<script>\nconst a = ;\n</script>\n<p>{a}</p>' });
  assert.deepEqual(scan.analysis_failures, ['Page.svelte']);
});

test('destructured schema secrets and bracket property reads survive aliasing', (t) => {
  const { annotations } = scanApp(t, {
    'schema.prisma': 'model Account {\n  accessHash String\n}\n',
    'Page.tsx': 'export function Page() {\n  const account = useAccount();\n  const { accessHash: first } = account;\n  const second = account["accessHash"];\n  return <main><p>{first}</p><code>{second}</code></main>;\n}\n',
  });
  assert.deepEqual(annotations.map(({ match, value }) => [match, value]), [['<p', 'block'], ['<code', 'block']]);
});

test('Vue usage counts include public static props passed through the imported alias', (t) => {
  const { scan, annotations, review } = scanApp(t, {
    'Badge.vue': '<script setup>\nconst { label } = defineProps({ label: String });\n</script>\n<template><p>{{ label }}</p></template>',
    'Page.vue': '<script setup>\nimport Alias from "./Badge.vue";\nconst account = useAccount();\n</script>\n<template><main><Alias label="One" /><Alias label="Two" /><Alias :label="account.name" /></main></template>',
  });
  const badge = scan.candidates.find((c) => c.file === 'Badge.vue');
  assert.equal(annotations.some((a) => a.file === 'Badge.vue'), false);
  assert.deepEqual(review.get(badge.id), [4]);
});

test('native spread attributes require review and injected HTML is blocked', (t) => {
  const { scan, annotations, review } = scanApp(t, {
    'Page.tsx': 'export function Page() {\n  const account = useAccount();\n  return <p {...account.attrs} />;\n}\n',
    'Page.svelte': '<script>\nconst account = useAccount();\n</script>\n<p>{@html account.bio}</p>',
  });
  assert.deepEqual(annotations.map(({ file, value }) => [file, value]), [['Page.svelte', 'block']]);
  assert.deepEqual(review.get(scan.candidates.find((c) => c.file === 'Page.tsx' && c.sites).id), [3]);
});

test('routing with a credential is reported for review even outside a rendering component', (t) => {
  const { scan, annotations, review } = scanApp(t, {
    'redirect.ts': 'export function go(router: { push: (u: string) => void }, token: string) {\n  router.push("/verify?" + new URLSearchParams({ token }).toString());\n}\n',
  });
  const candidate = scan.candidates.find((c) => c.sites?.some((site) => site.kind === 'url'));
  assert.equal(candidate?.category_hint, 'secret?');
  assert.deepEqual(review.get(candidate?.id), [2]);
  assert.equal(annotations.length, 0);
});

test('numeric single-character inputs in a one-time code UI block aliased digits', (t) => {
  const { scan, annotations } = scanApp(t, {
    'Verify.tsx': 'export function VerifyOneTimeCode() {\n  const [parts] = useState(["", ""]);\n  return <div>{parts.map((part) => <input\n    inputMode="numeric"\n    maxLength={1}\n    value={part}\n  />)}</div>;\n}\n',
  });
  const site = scan.candidates.find((c) => c.component === 'VerifyOneTimeCode')?.sites[0];
  assert.equal(site?.line, 6);
  assert.equal(annotations.find((a) => a.match === '<input')?.value, 'block');
});

test('browser storage reaching markup stays in review until its data is classified', (t) => {
  const { scan, annotations, review } = scanApp(t, {
    'Page.tsx': 'export function Page() {\n  const saved = window.sessionStorage.getItem("profileHint");\n  return <main><p>{saved}</p><i>{localStorage.getItem("accessToken")}</i></main>;\n}\n',
  });
  const candidate = scan.candidates.find((c) => c.component === 'Page');
  assert.equal(candidate.sites.find((s) => s.tag === 'p')?.confidence, 'low');
  assert.deepEqual(review.get(candidate.id), [3]);
  assert.deepEqual(annotations.map(({ match, value }) => [match, value]), [['<i', 'block']]);
});

test('a rendered typed string prop is visible for review without a resolved caller', (t) => {
  const { scan, annotations, review } = scanApp(t, {
    'Page.tsx': 'export function Page({ note, ready }: { note: string; ready: boolean }) {\n  return <main>{ready && <p>{note}</p>}</main>;\n}\n',
  });
  const candidate = scan.candidates.find((c) => c.component === 'Page');
  assert.deepEqual(candidate?.sites.map(({ expr, confidence }) => [expr, confidence]), [['note', 'low']]);
  assert.deepEqual(review.get(candidate.id), [2]);
  assert.equal(annotations.length, 0);
});

test('a dynamic HTML DOM write identifies its unique static target for review', (t) => {
  const { scan, annotations, review } = scanApp(t, {
    'page.html': '<main>\n  <ul id="entries"></ul>\n  <script>\n    fetch("/api/account").then((r) => r.json()).then((record) => {\n      document.getElementById("entries").innerHTML = record.purchases.map(format).join("");\n    });\n  </script>\n</main>',
  });
  const candidate = scan.candidates.find((c) => c.sites?.some((s) => s.tag === 'ul'));
  assert.equal(candidate?.sites[0].kind, 'html');
  assert.deepEqual(review.get(candidate.id), [2]);
  assert.equal(annotations.length, 0);
});
