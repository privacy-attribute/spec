import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { inventory } from '../review/inventory.mjs';
import { proposeSourceChanges } from '../review/changes.mjs';
import { evaluateReview } from '../review/evaluate.mjs';
import { applyProposalInCopy, createReviewSession, readReviewDecisions } from '../review/workflow.mjs';

function fixture(t, source='const view = <Field value={record.email} />;\n') {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'privacy-source-proposal-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  fs.writeFileSync(path.join(root,'View.tsx'),source);
  const snapshot=inventory(root), site=snapshot.sites.find(site=>site.channel==='prop:value');
  const evidence=[{file:'View.tsx',start_line:1,end_line:1,quote:source.trim(),sha256:createHash('sha256').update(source).digest('hex')}];
  const review={schema_version:1,reviewer:{id:'test-reader',kind:'human'},decisions:snapshot.sites.map(site=>({site_id:site.id,status:'decided',category:'third-party',special_category:false,treatment:'mask',meaning:'CRM email',rationale:'The field receives the record email',evidence})),proposed_changes:[{file:'View.tsx',from:'<Field value={record.email} />',to:'<span data-privacy="mask"><Field value={record.email} /></span>',site_ids:[site.id],rationale:'A wrapper around the private field only; DOM forwarding still needs runtime verification',evidence}]};
  return {root,snapshot,review,source};
}

test('source proposal checks exact evidence, parses and applies without changing source',t=>{
  const {root,snapshot,review,source}=fixture(t);
  const result=proposeSourceChanges(root,snapshot,review);
  assert.deepEqual(result.errors,[]);assert.equal(result.status,'source-supported-proposal');assert.equal(result.runtime,'not-run');
  assert.equal(result.syntax[0].status,'parsed');
  const applied=applyProposalInCopy(root,result.patch);t.after(()=>fs.rmSync(applied.root,{recursive:true,force:true}));
  assert.equal(fs.readFileSync(path.join(applied.root,'View.tsx'),'utf8'),result.after['View.tsx']);
  assert.equal(fs.readFileSync(path.join(root,'View.tsx'),'utf8'),source);
});

test('bad evidence, overlapping edits and malformed JSX reject the entire source proposal',t=>{
  const {root,snapshot,review}=fixture(t);
  for(const mutate of [
    r=>{r.proposed_changes[0].evidence[0].sha256='0'.repeat(64);},
    r=>{r.proposed_changes.push(structuredClone(r.proposed_changes[0]));},
    r=>{r.proposed_changes[0].to='<span>'},
    r=>{r.proposed_changes[0].site_ids=['unknown']},
    r=>{r.proposed_changes[0].file='../View.tsx'},
  ]){const changed=structuredClone(review);mutate(changed);const result=proposeSourceChanges(root,snapshot,changed);assert.ok(result.errors.length);assert.equal(result.patch,'');assert.deepEqual(result.after,{});}
});

test('semantic comparison gives mixed and unresolved channels no agreement credit',t=>{
  const {root,snapshot,review}=fixture(t,'const view = <Field value={record.email} label="Email" />;\n');
  review.decisions[1].category='public';review.decisions[1].treatment='none';
  const labels={app:'sample',commit:'fixture',files:{'View.tsx':[{line:1,tag:'Field',category:'third-party',value:'mask',what:'Email field'}]}};
  assert.equal(evaluateReview(root,snapshot,review,labels).rows[0].status,'ambiguous');
  labels.files['View.tsx'][0].channel='prop:value';
  assert.equal(evaluateReview(root,snapshot,review,labels).rows[0].status,'agreement');
  review.decisions[0]={...review.decisions[0],status:'unresolved',category:null,treatment:null,reason:'Caller unknown'};
  assert.equal(evaluateReview(root,snapshot,review,labels).rows[0].status,'unresolved');
});

test('source proposal rejects malformed review records without throwing',t=>{
  const {root,snapshot,review}=fixture(t);
  for(const changed of [null,{...review,proposed_changes:{}}]) {
    const result=proposeSourceChanges(root,snapshot,changed);
    assert.equal(result.status,'rejected');assert.ok(result.errors.length);assert.equal(result.patch,'');
  }
});

test('source syntax checks respect JavaScript and TypeScript file extensions',t=>{
  const {root,snapshot,review}=fixture(t);
  const original='export const amount = 1;';
  for(const [file,replacement,accepted] of [
    ['helper.js','export const amount: number = 1;',false],
    ['helper.ts','export const amount = <number>1;',true],
  ]) {
    fs.writeFileSync(path.join(root,file),original);
    const changed=structuredClone(review);
    changed.proposed_changes=[{...changed.proposed_changes[0],file,from:original,to:replacement,
      evidence:[{file,start_line:1,end_line:1,quote:original,sha256:createHash('sha256').update(original).digest('hex')}]}];
    assert.equal(proposeSourceChanges(root,snapshot,changed).errors.length===0,accepted);
  }
});

test('label projection rejects escaping paths and does not borrow another source line',t=>{
  const {root,snapshot,review}=fixture(t,'const view = <Field value={record.email}>\n\n{record.name}\n</Field>;\n');
  // Each decision cites its actual source line.
  for(const decision of review.decisions) {
    const site=snapshot.sites.find(site=>site.id===decision.site_id);
    decision.evidence=[{file:'View.tsx',start_line:site.line,end_line:site.line,quote:site.expression,sha256:snapshot.files[0].sha256}];
  }
  const label={line:2,target_line:1,tag:'Field',channel:'text',category:'third-party',value:'mask',what:'A value absent from this line'};
  const labels={app:'sample',commit:'fixture',files:{'View.tsx':[label]}};
  assert.equal(evaluateReview(root,snapshot,review,labels).rows[0].status,'unmapped');
  delete label.channel;
  assert.equal(evaluateReview(root,snapshot,review,labels).rows[0].status,'unmapped');
  assert.throws(()=>evaluateReview(root,snapshot,review,{...labels,files:{'../View.tsx':[label]}}),/relative/);
  fs.symlinkSync(path.join(root,'View.tsx'),path.join(root,'linked.tsx'));
  assert.throws(()=>evaluateReview(root,snapshot,review,{...labels,files:{'linked.tsx':[label]}}),/symlinks/);
});

test('review decision reader rejects symlinked records',t=>{
  const {root}=fixture(t);
  const out=fs.mkdtempSync(path.join(os.tmpdir(),'privacy-review-read-'));
  t.after(()=>fs.rmSync(out,{recursive:true,force:true}));
  createReviewSession(root,out);
  fs.unlinkSync(path.join(out,'review.json'));
  fs.symlinkSync(path.join(root,'View.tsx'),path.join(out,'review.json'));
  assert.throws(()=>readReviewDecisions(out),/regular|symbolic link/);
});
