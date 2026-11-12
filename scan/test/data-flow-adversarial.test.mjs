import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { find, planMarkdown } from '../find.mjs';
import { placeAnnotations } from '../place.mjs';
import { applyAnswers, buildQuestions } from '../residue.mjs';

function fixture(t, files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'privacy-data-flow-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const [file, contents] of Object.entries(files)) {
    const target = path.join(root, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, contents);
  }
  return { root, scan: find(root) };
}

test('native API credentials and reveal inputs block, while API key labels stay personal', (t) => {
  const { root, scan } = fixture(t, {
    'Keys.tsx': `export function Keys({ visible }: { visible: boolean }) {
      const keys = useApiKeys();
      return <form>
        <input name="credentials.apiKey" />
        <input name="apiKeyName" />
        <input type={visible ? 'text' : 'password'} />
        {keys.map((key) => <p>{key.name}</p>)}
        <RemoteInput name="privateKey" />
      </form>;
    }`,
  });
  const { annotations, review } = placeAnnotations(scan, root, { sdk: 'rrweb' });
  assert.deepEqual(annotations.map(({ line, value, category }) => [line, value, category]), [
    [4, 'block', 'secret'], [6, 'block', 'secret'], [7, 'mask', 'personal'],
  ]);
  const component = scan.candidates.find((c) => c.component === 'Keys' && c.sites);
  assert.deepEqual(review.get(component.id), [8]);
});

test('dates and health flags carry the patient category, with different treatments for text and choices', (t) => {
  const { root, scan } = fixture(t, {
    'schema.prisma': `model Patient {
      dateOfBirth DateTime
      hasDiabetes Boolean
    }`,
    'PatientPage.tsx': `export function PatientPage() {
      const patient = usePatient();
      return <section>
        <time>{formatDate(patient.dateOfBirth)}</time>
        <p>{patient.hasDiabetes ? 'Yes' : 'No'}</p>
        <input type="checkbox" checked={patient.hasDiabetes} />
        {patient.hasDiabetes && <Referral />}
      </section>;
    }`,
  });
  const { annotations, review } = placeAnnotations(scan, root, { sdk: 'rrweb' });
  assert.deepEqual(annotations.map(({ line, value, category, special_category }) => [line, value, category, special_category]), [
    [4, 'mask', 'third-party', false], [5, 'mask', 'third-party', true], [6, 'block', 'third-party', true],
  ]);
  const component = scan.candidates.find((c) => c.component === 'PatientPage' && c.sites);
  assert.deepEqual(review.get(component.id), [7]);
});

test('qualified schema models and scoped public literals keep same-named fields separate', (t) => {
  const { root, scan } = fixture(t, {
    'schema.prisma': `model Account {
      accessHash String
    }
    model Audit {
      accessHash Boolean
    }`,
    'Page.tsx': `import type * as DB from '@prisma/client';
    namespace Docs { export type Account = { accessHash: string }; }
    export function Page({ account, audit, ambiguous }: { account: DB.Account; audit: DB.Audit; ambiguous: object }) {
      const local: Docs.Account = { accessHash: 'Demo checksum' };
      const { accessHash: digest } = account;
      return <section>
        <code>{digest}</code>
        <span>{String(audit.accessHash)}</span>
        <em>{local.accessHash}</em>
        <div>{ambiguous.accessHash}</div>
        {['Example'].map((digest) => <i>{digest}</i>)}
      </section>;
    }`,
  });
  const { annotations, review } = placeAnnotations(scan, root);
  assert.deepEqual(annotations.map(({ line, value }) => [line, value]), [[7, 'block'], [8, 'mask']]);
  assert.deepEqual(review.get(scan.candidates.find((c) => c.component === 'Page').id), [10]);
});

test('namespace aliases and barrel re-exports follow the imported component identity', (t) => {
  const badge = 'export function Badge({ label }) { return <p>{label}</p>; }';
  const { root, scan } = fixture(t, {
    'private/Badge.tsx': badge,
    'public/Badge.tsx': badge,
    'barrel.ts': 'export { Badge as Credential } from "./private/Badge.js";',
    'Page.tsx': `import * as Widgets from './barrel';
    import { Badge as HelpBadge } from './public/Badge';
    export function Page() {
      const account = useAccount();
      return <section><HelpBadge label="Help" /><Widgets.Credential label={account.apiKey} /></section>;
    }`,
  });
  const { annotations } = placeAnnotations(scan, root);
  assert.deepEqual(annotations.map(({ file, value }) => [file, value]), [['private/Badge.tsx', 'block']]);
  assert.equal(scan.candidates.some((c) => c.file === 'public/Badge.tsx'), false);
});

test('later third-party origins upgrade their prop without spreading a different secret prop', (t) => {
  const { root, scan } = fixture(t, {
    'Child.tsx': `export function Child(props) {
      return <article><p>{props.label}</p><code>{props.code}</code></article>;
    }`,
    'A.tsx': `import { Child } from './Child';
    export function A() {
      const account = useAccount();
      return <Child label={account.name} code={account.apiKey} />;
    }`,
    'B.tsx': `import { Child } from './Child';
    export function B() {
      const customer = useCustomer();
      const account = useAccount();
      return <Child label={customer.name} code={account.apiKey} />;
    }`,
  });
  const { annotations } = placeAnnotations(scan, root);
  assert.deepEqual(annotations.map(({ file, match, value, category }) => [file, match, value, category]), [
    ['Child.tsx', '<p', 'mask', 'third-party'], ['Child.tsx', '<code', 'block', 'secret'],
  ]);
  const label = scan.candidates.find((c) => c.file === 'Child.tsx').sites.find((s) => s.tag === 'p');
  assert.deepEqual(label.origins.map((origin) => origin.split(' via ')[0]), ['useAccount()', 'useCustomer()']);
});

test('a public answer removes only its alternative from a value passed across modules', (t) => {
  const { root, scan } = fixture(t, {
    'Child.tsx': 'export function Child({ label }) { return <p>{label}</p>; }',
    'Page.tsx': `import { Child } from './Child';
    export function Page() {
      const first = useMysteryA();
      const second = useMysteryB();
      let label = first;
      label = second;
      return <Child label={label} />;
    }`,
  });
  assert.deepEqual(buildQuestions(scan, root).map((q) => q.key).sort(), ['Page.tsx::useMysteryA()', 'Page.tsx::useMysteryB()']);
  applyAnswers(scan, { 'Page.tsx::useMysteryA()': { category: 'public', evidence: 'fixed copy' } });
  const child = scan.candidates.find((c) => c.file === 'Child.tsx');
  assert.equal(child.sites[0].confidence, 'low');
  assert.deepEqual(child.sites[0].origins.map((origin) => origin.split(' via ')[0]), ['unknown useMysteryB()']);
  applyAnswers(scan, { 'Page.tsx::useMysteryB()': { category: 'secret', evidence: 'access credential' } });
  assert.deepEqual(placeAnnotations(scan, root).annotations.map(({ file, value }) => [file, value]), [['Child.tsx', 'block']]);
});

test('parse failures appear in the plan and leave only review candidates', (t) => {
  const { scan } = fixture(t, {
    'Broken.tsx': `export function Broken() {
      const broken = ;
      return <input type="password" />;
    }`,
  });
  assert.deepEqual(scan.analysis_failures, ['Broken.tsx']);
  assert.match(planMarkdown(scan), /Files requiring manual analysis\n\n- `Broken\.tsx`/);
  assert.ok(scan.candidates.some((c) => c.rules.includes('secret-input-password')));
  assert.ok(scan.candidates.every((c) => c.requires_review && !c.auto));
});

test('JSX outside a recognized component still reaches line-based review', (t) => {
  const { scan } = fixture(t, {
    'render.tsx': 'export const render = (customer) => <p>{customer.email}</p>;',
  });
  assert.deepEqual(scan.analysis_failures, []);
  assert.ok(scan.candidates.some((c) => c.file === 'render.tsx' && !c.auto && c.rules.includes('person-field')));
});
