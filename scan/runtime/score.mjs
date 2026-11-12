import {inspectPayload} from '../../audit/runner/lib/payload.mjs';

const slice=(run,step)=>run.events.slice(step.event_start,step.event_end);
const values=flow=>[flow.initial,...flow.updates,flow.edit].filter(value=>typeof value==='string'&&value.length);
export function privateMarkers(flow) {
  return [...new Set([...values(flow),...(flow.privatePlaceholder?[flow.props.placeholder]:[])].flatMap(value=>value.includes('@')?[value,...value.split('@')]:[value]))];
}
const hits=(events,markers)=>Object.fromEntries(inspectPayload(events,markers).matches);
const exposed=matches=>Object.values(matches).some(list=>list.length);
const treeText=node=>(node.textContent??'')+(node.childNodes??[]).map(treeText).join('');
function nodes(root,predicate) {
  if(!root)return [];
  return [...(predicate(root)?[root]:[]),...(root.childNodes??[]).flatMap(node=>nodes(node,predicate))];
}
function componentTrees(run) {
  return run.events.filter(event=>event.type===2).flatMap(event=>nodes(event.data.node,node=>node.attributes?.['data-fixture-component']!==undefined));
}
const phase=(run,name)=>slice(run,run.steps.find(step=>step.name===name));
const hasOwn=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
const textHit=matches=>Object.values(matches).some(list=>list.some(hit=>!hit.key&&((hit.channel==='snapshot-text'||hit.channel==='mutation-add')&&hit.path.endsWith('/textContent')||hit.channel==='mutation-text'&&/^\/data\/texts\/\d+\/value$/.test(hit.path))));
const hrefHit=matches=>Object.values(matches).some(list=>list.some(hit=>!hit.key&&['snapshot-attribute','mutation-attribute','mutation-add'].includes(hit.channel)&&hit.path.endsWith('/attributes/href')));
const valuePhases=flow=>[['initial',flow.initial],...flow.updates.map((value,index)=>[`update-${index+1}`,value]),...(flow.edit!==undefined?[['input',flow.edit]]:[])];

// Match emitted text to the actual measurement span observed in application
// DOM. Track recorder node identities across snapshots and mutation additions.
function measurementTextHit(run,name,value) {
  const step=run.steps.find(step=>step.name===name);
  const classes=new Set(step.dom.measurements.map(node=>node.attributes.class).filter(Boolean));
  const registry=new Map(),parents=new Map();
  const register=(node,parent)=>{registry.set(node.id,{...node,attributes:{...node.attributes}});parents.set(node.id,parent);for(const child of node.childNodes??[])register(child,node.id);};
  const remove=id=>{for(const [child,parent] of [...parents])if(parent===id)remove(child);registry.delete(id);parents.delete(id);};
  const inMeasurement=id=>{const visited=new Set();while(registry.has(id)&&!visited.has(id)){visited.add(id);const node=registry.get(id);if(node.tagName==='span'&&classes.has(node.attributes?.class))return true;id=parents.get(id);}return false;};
  let found=false;
  for(let index=0;index<step.event_end;index++) {
    const event=run.events[index],current=index>=step.event_start;
    if(event.type===2) {
      registry.clear();parents.clear();register(event.data.node,null);
      if(current&&[...registry.values()].some(node=>node.type===3&&node.textContent===value&&inMeasurement(node.id)))found=true;
    } else if(event.type===3&&event.data?.source===0) {
      for(const entry of event.data.removes??[])remove(entry.id);
      for(const entry of event.data.adds??[])register(entry.node,entry.parentId);
      for(const entry of event.data.attributes??[]) {
        const node=registry.get(entry.id);if(node)node.attributes={...node.attributes,...entry.attributes};
      }
      if(current) {
        if((event.data.texts??[]).some(entry=>entry.value===value&&registry.get(entry.id)?.type===3&&inMeasurement(entry.id)))found=true;
        if((event.data.adds??[]).some(entry=>nodes(entry.node,node=>node.type===3&&node.textContent===value&&inMeasurement(node.id)).length))found=true;
      }
    }
  }
  return found;
}

export function validateRuntimeRuns(flows,runs) {
  if(!Array.isArray(flows)||!flows.length||new Set(flows.map(flow=>flow.id)).size!==flows.length)throw new Error('Invalid or duplicate flow definitions');
  const expected=new Set(flows.flatMap(flow=>['baseline','patched'].flatMap(variant=>['default','balanced'].map(config=>`${variant}/${config}/${flow.id}`))));
  const seen=new Set();
  for(const run of runs) {
    const key=`${run.variant}/${run.config}/${run.flow}`;
    if(!expected.has(key)||seen.has(key))throw new Error(`Unexpected or duplicate run: ${key}`);
    const expectedOptions=run.config==='balanced'?{privacyPolicy:{version:1,preset:'balanced'}}:{};
    if(JSON.stringify(run.options)!==JSON.stringify(expectedOptions))throw new Error(`Recorder options do not match comparison arm: ${key}`);
    seen.add(key);
    const flow=flows.find(flow=>flow.id===run.flow);
    const required=[...valuePhases(flow).map(([name])=>name),'final-snapshot',...(flow.copy?['copy-initial','copy-updated']:[]),...(flow.inputSignal?['input-signal']:[]),...flow.updates.flatMap((value,index)=>flow.kind==='email'&&(value==null||!value.includes('@'))?[`checkpoint-update-${index+1}`]:[])];
    if(!Array.isArray(run.events)||!Array.isArray(run.steps)||new Set(run.steps.map(step=>step.name)).size!==run.steps.length)throw new Error(`Invalid events or steps: ${key}`);
    for(const name of required)if(!run.steps.some(step=>step.name===name))throw new Error(`Missing step: ${key}/${name}`);
    for(const step of run.steps)if(!Number.isInteger(step.event_start)||!Number.isInteger(step.event_end)||step.event_start<0||step.event_end<step.event_start||step.event_end>run.events.length||!step.dom)throw new Error(`Invalid step range: ${key}/${step.name}`);
    if(!['DOM emulator','browser'].includes(run.environment?.kind))throw new Error(`Unknown runtime: ${key}`);
  }
  for(const key of expected)if(!seen.has(key))throw new Error(`Missing comparison run: ${key}`);
}
function normalize(value) {
  if(Array.isArray(value))return value.map(normalize);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>key!=='timestamp').map(([key,child])=>[key,normalize(child)]));
  return value;
}

export function scoreRuntime({flows,runs,expectProtectedChallenges=[]}) {
  validateRuntimeRuns(flows,runs);
  for(const id of expectProtectedChallenges)if(!flows.some(flow=>flow.id===id&&flow.private&&flow.challenge))throw new Error(`Unknown protected challenge: ${id}`);
  const checks=[],findings=[];
  const add=(id,pass,detail)=>checks.push({id,status:pass?'passed':'failed',detail});
  const get=(variant,config,id)=>runs.find(run=>run.variant===variant&&run.config===config&&run.flow===id);
  for(const run of runs) {
    const flow=flows.find(flow=>flow.id===run.flow);
    add(`${run.variant}/${run.config}/${run.flow}/snapshots`,run.events.filter(event=>event.type===2).length>=2,'Initial and final snapshots must both exist.');
    add(`${run.variant}/${run.config}/${run.flow}/runtime-errors`,!run.diagnostics?.length,'No unhandled DOM-runtime errors occurred.');
    const desired=valuePhases(flow);
    for(const [name,value] of desired) {
      const step=run.steps.find(step=>step.name===name);
      const live=step?.dom;
      add(`${run.variant}/${run.config}/${run.flow}/${name}/live-value`,Boolean(live)&&(value==null?live.anchors.some(anchor=>anchor.text===''):flow.kind==='email'?live.anchors.some(anchor=>anchor.text===value):live.inputs.some(input=>input.value===value)),'Verify the raw synthetic value reached the actual component DOM.');
    }
    if(flow.copy) {
      const copied=JSON.stringify(run.observations.clipboard??[]);
      add(`${run.variant}/${run.config}/${run.flow}/copy-callback`,copied===JSON.stringify([flow.initial,flow.updates.at(-1)]),'Synthetic clipboard sink received exactly the two displayed keys, in order; the operating-system clipboard is not tested.');
      add(`${run.variant}/${run.config}/${run.flow}/copy-fidelity`,componentTrees(run).every(root=>nodes(root,node=>node.tagName==='button'&&treeText(node)==='Copy').length===1),'The actual Copy button survives in every full snapshot.');
    }
    if(flow.edit!==undefined) {
      const step=run.steps.find(step=>step.name==='input');
      add(`${run.variant}/${run.config}/${run.flow}/input-callback`,JSON.stringify(run.observations.inputChanges??[])===JSON.stringify([flow.edit]),'The component onChange callback received exactly the synthetic edited value.');
      add(`${run.variant}/${run.config}/${run.flow}/input-event`,slice(run,step).some(event=>event.type===3&&event.data?.source===5),'Require an incremental input event in the edit phase.');
    }
    for(const step of run.steps.filter(step=>step.name==='initial'||step.name==='final-snapshot'||step.name.startsWith('checkpoint-'))) {
      const snapshots=slice(run,step).filter(event=>event.type===2);
      add(`${run.variant}/${run.config}/${run.flow}/${step.name}/recorded-root`,snapshots.length===1&&nodes(snapshots[0].data.node,node=>node.attributes?.['data-fixture-component']===flow.kind).length===1,'Require exactly one serialized fixture root in each required full snapshot.');
      add(`${run.variant}/${run.config}/${run.flow}/${step.name}/public-control`,step.dom.public_controls.some(control=>control.text==='TWENTY_PUBLIC_CONTROL')&&snapshots.some(event=>nodes(event.data.node,node=>node.tagName==='button'&&node.attributes?.['data-fixture-public']!==undefined&&treeText(node)==='TWENTY_PUBLIC_CONTROL').length===1),'Require the fixed public button in both application DOM and its recorded element.');
    }
  }
  for(const flow of flows) {
    const before=get('baseline','balanced',flow.id),after=get('patched','balanced',flow.id),raw=get('baseline','default',flow.id);
    if(!before||!after||!raw)throw new Error(`Missing comparison run: ${flow.id}`);
    for(const [name,value] of valuePhases(flow)) {
      if(typeof value!=='string'||!value)continue;
      const phase=raw.steps.find(step=>step.name===name);
      add(`${flow.id}/${name}/raw-positive`,exposed(hits(slice(raw,phase),[value])),'Default recorder configuration must observe the marker in this exact action phase.');
    }
    if(flow.private) {
      const matches=hits(after.events,privateMarkers(flow));
      if(flow.challenge) {
        findings.push({id:`${flow.id}/unprotected-copy`,kind:'privacy',observed:exposed(matches),matches,scope:'Shared autogrow challenge in the declared runtime; the sampled API-key caller does not enable autogrow.'});
        if(expectProtectedChallenges.includes(flow.id))add(`${flow.id}/fixed-private-copy`,!exposed(matches),{scope:'Every recorded channel after the explicit follow-up fix',matches});
      } else add(`${flow.id}/private-payload`,!exposed(matches),{scope:'Full balanced recording, including attributes, mutation and input events',matches});
    }
    if(flow.kind==='key') {
      add(`${flow.id}/native-block`,after.steps.every(step=>step.dom.inputs.length===1&&step.dom.inputs[0].privacy.some(entry=>entry.privacy==='block')),'The credential reaches a native input underneath a block in application DOM.');
      add(`${flow.id}/blocked-snapshots`,componentTrees(before).every(root=>nodes(root,node=>node.tagName==='input').length===1)&&componentTrees(after).every(root=>nodes(root,node=>node.tagName==='input').length===0),'The same balanced configuration records a masked input before the patch and no descendant input after it.');
      const inputId=nodes(componentTrees(before)[0],node=>node.tagName==='input')[0]?.id;
      add(`${flow.id}/input-signal-positive`,inputId!==undefined&&phase(before,'input-signal').some(event=>event.type===3&&event.data?.source===5&&event.data.id===inputId),'The baseline emits an input event for this credential input when the same scripted event is dispatched.');
      add(`${flow.id}/blocked-incremental-input`,!after.events.some(event=>event.type===3&&event.data?.source===5),'No credential input event escapes after block.');
    }
    if(flow.id==='private-email') {
      for(const [name,value] of valuePhases(flow)) {
        const anchor=after.steps.find(step=>step.name===name).dom.anchors[0];
        const valid=typeof value==='string'&&value.includes('@');
        add(`${flow.id}/${name}/native-placement`,Boolean(anchor)&&(valid?anchor.attributes.href===`mailto:${value}`&&anchor.attributes['data-privacy']==='block':!hasOwn(anchor.attributes,'href')&&(value==null?!hasOwn(anchor.attributes,'data-privacy'):anchor.attributes['data-privacy']==='mask')),'Exact native href and treatment, including malformed and null states.');
        if(value) {
          const matches=hits(phase(before,name),[value]);
          add(`${flow.id}/${name}/balanced-text-positive`,textHit(matches),'Original balanced recording contains the actual email text in this phase.');
          if(valid)add(`${flow.id}/${name}/balanced-href-positive`,hrefHit(hits(phase(before,name),[`mailto:${value}`])),'Original balanced recording contains the exact href in this phase.');
        }
      }
      for(const [index,value] of flow.updates.entries())if(value==null||!value.includes('@')) {
        const trees=componentTrees({...after,events:phase(after,`checkpoint-update-${index+1}`)});
        add(`${flow.id}/fallback-${index+1}/retained-anchor`,trees.length===1&&nodes(trees[0],node=>node.tagName==='a'&&!hasOwn(node.attributes,'href')&&(value==null?treeText(node)==='':treeText(node)==='*'.repeat(value.length))).length===1,'Malformed text remains as a masked anchor; the null anchor remains empty, both without href.');
      }
    }
    if(flow.id==='public-email') {
      for(const [name,value] of valuePhases(flow))if(value) {
        add(`${flow.id}/${name}/retained-text`,textHit(hits(phase(after,name),[value])),'Public caller text is retained in its own action phase and text channel.');
        if(value.includes('@'))add(`${flow.id}/${name}/retained-href`,hrefHit(hits(phase(after,name),[`mailto:${value}`])),'Public mailto remains in a recorded href in its own phase.');
      }
    }
    if(flow.kind==='text') {
      add(`${flow.id}/native-input-treatment`,after.steps.every(step=>step.dom.inputs.length===1&&(flow.private?step.dom.inputs[0].attributes['data-privacy']===flow.props.inputProps['data-privacy']:step.dom.inputs[0].privacy.length===0)),'Exact native input receives the supplied annotation; public input remains unannotated.');
      add(`${flow.id}/recorded-input-retained`,componentTrees(after).every(root=>nodes(root,node=>node.tagName==='input').length===1),'Masked text inputs retain their native input structure.');
      add(`${flow.id}/labels-hints`,componentTrees(after).every(root=>treeText(root).includes('Public field label')&&treeText(root).includes('Public field hint')),'Visible field labels and hints remain in recorded component snapshots.');
      const lost=run=>run.events.filter(event=>event.type===2).some(event=>nodes(event.data.node,node=>node.tagName==='input'&&node.attributes?.placeholder&&node.attributes.placeholder!==flow.props.placeholder).length);
      const placeholderLost=lost(after),baselineLost=lost(before);
      if(!flow.privatePlaceholder)findings.push({id:`${flow.id}/global-placeholder-policy`,kind:'fidelity',observed:placeholderLost,baseline_observed:baselineLost,attribution:baselineLost?'balanced recorder configuration, also observed before the source patch':'requires investigation'});
      if(flow.props.autoGrow)for(const [name,value] of valuePhases(flow)) {
        const selected=value||flow.props.placeholder;
        const step=after.steps.find(step=>step.name===name);
        add(`${flow.id}/${name}/measurement-live`,step.dom.measurements?.some(node=>node.text===selected),'The actual CSS-hidden measurement span contains the selected value or placeholder.');
        if(flow.private) {
          add(`${flow.id}/${name}/measurement-positive`,measurementTextHit(before,name,selected),'The original source exposes text in the recorded measurement span during this phase under balanced recording.');
          if(!value&&!flow.privatePlaceholder&&expectProtectedChallenges.includes(flow.id))findings.push({id:`${flow.id}/${name}/annotated-placeholder-cost`,kind:'fidelity',observed:!measurementTextHit(after,name,selected),attribution:'The explicit input annotation now also applies to its measurement copy, including this public placeholder.'});
        } else add(`${flow.id}/${name}/public-measurement-retained`,measurementTextHit(after,name,selected),'Unannotated public text is retained in the recorded measurement span during this action phase.');
      }
    }
  }
  const short=get('patched','balanced','key-short'),long=get('patched','balanced','key-long');
  const shortBefore=get('baseline','balanced','key-short'),longBefore=get('baseline','balanced','key-long');
  const inputValues=run=>componentTrees(run).flatMap(root=>nodes(root,node=>node.tagName==='input').map(node=>node.attributes.value));
  add('key-length/baseline-sensitive',JSON.stringify(inputValues(shortBefore))!==JSON.stringify(inputValues(longBefore)),'The balanced baseline preserves different mask lengths, establishing a positive length comparison.');
  add('key-length/patched-recordings',JSON.stringify(normalize(short.events))===JSON.stringify(normalize(long.events)),'Compare all captured fields and counts after removing timestamps. This scripted test does not establish timing or layout independence.');
  return {checks,findings,passed:checks.filter(check=>check.status==='passed').length,failed:checks.filter(check=>check.status==='failed').length,
    environment:[...new Set(runs.map(run=>run.environment.kind))],
    scope:'Real pinned component bodies and recorder in the declared runtime with adapters. Trusted keyboard/pointer input, full Twenty pages, overflow portals, clipboard integration and replay rendering are unverified. A DOM emulator supplies no real layout evidence.'};
}
