import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { applyAnswers, buildQuestions } from '../residue.mjs';
import { validateSession, writeSessionFile } from '../session.mjs';

test('same expression in different modules requires qualified answers', () => {
  const scan = { candidates: ['A.tsx', 'B.tsx'].map((file, i) => ({ id: `C${i}`, file, sites: [{ origin: 'unknown useData()', confidence: 'low', expr: 'data.value', line: 1 }] })) };
  assert.throws(() => applyAnswers(structuredClone(scan), { 'useData()': 'public' }), /Ambiguous/);
  applyAnswers(scan, { 'A.tsx::useData()': { category: 'public', evidence: 'Static product catalogue' }, 'B.tsx::useData()': { category: 'secret', evidence: 'API credentials response' } });
  assert.equal(scan.candidates[0].sites.length, 0);
  assert.equal(scan.candidates[1].sites[0].category, 'secret');
});

test('structured answers require valid categories and evidence', () => {
  assert.throws(() => applyAnswers({ candidates: [] }, { source: { category: 'public' } }), /evidence/);
  assert.throws(() => applyAnswers({ candidates: [] }, { source: 'yes' }), /Invalid category/);
});

test('session output rejects a planted file link without changing its target', (t) => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'privacy-session-')));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const out = path.join(dir, 'session'); fs.mkdirSync(out);
  const target = path.join(dir, 'source.txt'); fs.writeFileSync(target, 'preserve');
  fs.symlinkSync(target, path.join(out, 'candidates.json'));
  assert.throws(() => writeSessionFile(out, 'candidates.json', 'replace'), /symbolic link/);
  assert.equal(fs.readFileSync(target, 'utf8'), 'preserve');
  assert.throws(() => validateSession(out, dir), /outside/);
});

test('static reuse matches cold decisions and rejects changed dependencies', async (t) => {
  const { spawnSync } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'privacy-reuse-')));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const app = path.join(dir, 'app'); fs.mkdirSync(app);
  const cold = path.join(dir, 'cold'); const warm = path.join(dir, 'warm');
  fs.writeFileSync(path.join(app, 'Page.tsx'), 'export const Page = () => <input type="password" />;\n');
  const cli = fileURLToPath(new URL('../cli.mjs', import.meta.url));
  const run = (...args) => spawnSync(process.execPath, [cli, 'find', app, ...args], { encoding: 'utf8' });
  let result = run('--out', cold); assert.equal(result.status, 0, result.stderr);
  result = run('--out', warm, '--reuse', cold); assert.equal(result.status, 0, result.stderr);
  const read = (out, file) => JSON.parse(fs.readFileSync(path.join(out, file), 'utf8'));
  assert.deepEqual(read(warm, 'annotations.json'), read(cold, 'annotations.json'));
  assert.equal(read(warm, 'candidates.json').performance.static_cache_hit, true);
  fs.writeFileSync(path.join(app, 'data.json'), '{"kind":"private"}');
  result = run('--out', path.join(dir, 'changed'), '--reuse', cold);
  assert.equal(result.status, 1); assert.match(result.stderr, /stale/);
});

test('a public source answer cannot erase another origin of the rendered value', () => {
  const scan = { candidates: [{id: 'C1', file: 'Child.tsx', sites: [{origin:'unknown usePublic() via source Parent.tsx',origins:['unknown usePublic() via source Parent.tsx','unknown useCredentials() via source Parent.tsx'],confidence:'low',expr:'value',line:1}]}] };
  applyAnswers(scan, {'Parent.tsx::usePublic()': {category:'public',evidence:'Static help text'}});
  assert.equal(scan.candidates[0].sites.length, 1);
  assert.equal(scan.candidates[0].sites[0].confidence, 'low');
  applyAnswers(scan, {'Parent.tsx::useCredentials()': {category:'secret',evidence:'Account credentials'}});
  assert.equal(scan.candidates[0].sites[0].category, 'secret');
  assert.equal(scan.candidates[0].category_hint, 'secret?');
});

test('patch rejects edited scanner evidence instead of trusting a removed credential candidate', async (t) => {
  const { spawnSync } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'privacy-facts-')));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const app = path.join(dir, 'app'); fs.mkdirSync(app); const out=path.join(dir,'out');
  fs.writeFileSync(path.join(app, 'Login.tsx'), 'export const Login = () => <input type="password"/>;\n');
  const cli = fileURLToPath(new URL('../cli.mjs', import.meta.url));
  const run=(...args)=>spawnSync(process.execPath,[cli,...args],{encoding:'utf8'});
  assert.equal(run('find',app,'--out',out).status,0);
  const file=path.join(out,'candidates.json'); const scan=JSON.parse(fs.readFileSync(file,'utf8')); scan.candidates=[];fs.writeFileSync(file,JSON.stringify(scan));
  const decisions=path.join(out,'annotations.json');fs.writeFileSync(decisions,JSON.stringify({annotations:[],answers:{},dismissed:{}}));
  const result=run('patch','--out',out);
  assert.equal(result.status,1,result.stdout+result.stderr);
  assert.equal(fs.existsSync(path.join(out,'privacy.patch')),false);
});

test('source metadata inspection never executes a repository-configured filesystem monitor', async (t) => {
  const { spawnSync } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  if (process.platform === 'win32') return t.skip('POSIX executable fixture; confinement is also tested separately');
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'privacy-git-read-')));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const app=path.join(dir,'app'); fs.mkdirSync(app); const marker=path.join(dir,'executed');
  fs.writeFileSync(path.join(app,'Page.tsx'),'export const Page=()=> <p>Public</p>;\n');
  const git=(...args)=>{const r=spawnSync('git',['-C',app,...args],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);};
  git('init','-q');git('add','.');
  const hook=path.join(dir,'monitor');fs.writeFileSync(hook,`#!/bin/sh\nprintf invoked > '${marker.replaceAll("'", "'\\''")}'\n`,{mode:0o700});
  git('config','core.fsmonitor',hook);
  const cli=fileURLToPath(new URL('../cli.mjs',import.meta.url));
  const result=spawnSync(process.execPath,[cli,'find',app,'--out',path.join(dir,'out')],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  assert.equal(fs.existsSync(marker),false,'read-only metadata must not run repository commands');
});
