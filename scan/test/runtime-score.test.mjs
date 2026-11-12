import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import {scoreRuntime} from '../runtime/score.mjs';

const original=JSON.parse(fs.readFileSync(new URL('../fixtures/runtime/twenty-score.json',import.meta.url),'utf8'));
const fixture=()=>structuredClone(original);
const target=(data,flow='key-short',variant='patched',config='balanced')=>data.runs.find(run=>run.flow===flow&&run.variant===variant&&run.config===config);
const failed=(data,part)=>scoreRuntime(data).checks.some(check=>check.status==='failed'&&check.id.includes(part));
function removeNodes(node,predicate){node.childNodes=node.childNodes?.filter(child=>!predicate(child));for(const child of node.childNodes??[])removeNodes(child,predicate);}

test('actual reduced runtime evidence satisfies the bounded scorer',()=>{
  assert.equal(scoreRuntime(fixture()).failed,0);
});

test('missing, duplicate and mislabeled recorder arms cannot receive a score',()=>{
  const missing=fixture();missing.runs=missing.runs.filter(run=>run.variant!=='patched'||run.config!=='default');
  assert.throws(()=>scoreRuntime(missing),/Missing comparison/);
  const duplicate=fixture();duplicate.runs.push(structuredClone(duplicate.runs[0]));
  assert.throws(()=>scoreRuntime(duplicate),/duplicate run/);
  const config=fixture();target(config).options={};
  assert.throws(()=>scoreRuntime(config),/Recorder options/);
});

test('missing fixture roots fail protection checks instead of passing empty every calls',()=>{
  const data=fixture();
  for(const event of target(data).events)if(event.type===2)removeNodes(event.data.node,node=>node.attributes?.['data-fixture-component']!==undefined);
  assert.ok(failed(data,'key-short/initial/recorded-root'));
});

test('clipboard callback must equal the displayed values and contain no extra writes',()=>{
  const data=fixture();target(data).observations.clipboard=target(data).observations.clipboard.map(value=>`corrupted:${value}:corrupted`);
  assert.ok(failed(data,'copy-callback'));
});

test('a blocked input-event claim requires the same input channel in the baseline',()=>{
  const data=fixture(),run=target(data,'key-short','baseline');
  const step=run.steps.find(step=>step.name==='input-signal');
  for(let index=step.event_start;index<step.event_end;index++)run.events[index]={type:5,data:{tag:'unrelated',payload:{}}};
  assert.ok(failed(data,'key-short/input-signal-positive'));
});

test('a vanished public control fails even if it is also absent from live observations',()=>{
  const data=fixture(),run=target(data);
  for(const step of run.steps)step.dom.public_controls=[];
  for(const event of run.events)if(event.type===2)removeNodes(event.data.node,node=>node.attributes?.['data-fixture-public']!==undefined);
  assert.ok(failed(data,'public-control'));
});

test('a raw positive from an earlier phase cannot substitute for a missing update',()=>{
  const data=fixture(),run=target(data,'private-input','baseline','default');
  const step=run.steps.find(step=>step.name==='update-1');
  for(let index=step.event_start;index<step.event_end;index++)run.events[index]=JSON.parse(JSON.stringify(run.events[index]).replaceAll('PRIVATE_INPUT_B_2468','********************'));
  assert.ok(failed(data,'private-input/update-1/raw-positive'));
});

test('a public email href appearing as text does not satisfy the href channel',()=>{
  const data=fixture(),run=target(data,'public-email');
  const step=run.steps.find(step=>step.name==='update-1');
  for(let index=step.event_start;index<step.event_end;index++) {
    const event=run.events[index];
    if(event.type===3&&event.data.source===0) {
      for(const entry of event.data.attributes??[])delete entry.attributes.href;
      event.data.texts.push({id:99999,value:'mailto:help@public-example.invalid'});
    }
  }
  assert.ok(failed(data,'public-email/update-1/retained-href'));
});

test('an unrelated payload value cannot stand in for public measurement text',()=>{
  const data=fixture(),run=target(data,'public-autogrow');
  const step=run.steps.find(step=>step.name==='update-1');
  for(let index=step.event_start;index<step.event_end;index++) {
    const event=run.events[index];
    if(event.type===3&&event.data.source===0) {
      event.data.texts=[];
      event.data.unrelated={value:'PUBLIC_GROW_B_1357'};
    }
  }
  assert.ok(failed(data,'public-autogrow/update-1/public-measurement-retained'));
});

test('a text mutation on another node cannot stand in for measurement text',()=>{
  const data=fixture(),run=target(data,'public-autogrow');
  const step=run.steps.find(step=>step.name==='update-1');
  for(let index=step.event_start;index<step.event_end;index++) {
    const event=run.events[index];
    if(event.type===3&&event.data.source===0)event.data.texts=[{id:99999,value:'PUBLIC_GROW_B_1357'}];
  }
  assert.ok(failed(data,'public-autogrow/update-1/public-measurement-retained'));
});
