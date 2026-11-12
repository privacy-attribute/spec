import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {parseArgs} from 'node:util';
import {buildPinnedRecorder} from '../../audit/runner/adapters/rrweb.mjs';
import {buildTwentyFixture} from './twenty-build.mjs';
import {runtimeFlows,captureRuntimeFlow} from './flows.mjs';
import {scoreRuntime} from './score.mjs';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const json=(file,value)=>fs.writeFile(file,JSON.stringify(value,null,2)+'\n');
const configs={default:{},balanced:{privacyPolicy:{version:1,preset:'balanced'}}};
const escapeScript=source=>source.replace(/<\/script/gi,'<\\/script');

export async function captureInDom({fixture,recorder,flow,options,dependencies}) {
  const require=createRequire(path.resolve(dependencies,'package.json'));
  const {JSDOM,VirtualConsole}=require('jsdom');
  const diagnostics=[];
  const console=new VirtualConsole();
  console.on('jsdomError',error=>diagnostics.push(String(error.stack||error)));
  const dom=new JSDOM('<!doctype html><html><head><title>Twenty synthetic privacy fixture</title></head><body><div id="twenty-fixture"></div></body></html>',{
    url:'https://privacy-fixture.invalid/',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:console,
  });
  try {
    await new Promise(resolve=>dom.window.addEventListener('load',resolve,{once:true}));
    dom.window.eval(fixture);
    dom.window.eval(recorder);
    dom.window.__runtimeFlow=flow;
    dom.window.__runtimeOptions=options;
    const result=await dom.window.eval(`(${captureRuntimeFlow.toString()})(window.__runtimeFlow,window.__runtimeOptions)`);
    return {...result,diagnostics,environment:{kind:'DOM emulator',name:'jsdom',version:require('jsdom/package.json').version,node:process.version}};
  } finally {dom.window.close();}
}

export function browserArtifact({baseline,patched,recorder,manifest}) {
  // The user can run this local artifact. Preparation does not constitute a
  // browser result. Each capture gets its own iframe and recorder instance.
  const payload=JSON.stringify({fixtures:{baseline,patched},recorder,flows:runtimeFlows,configs,manifest});
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; frame-src 'self' about: blob:; img-src data:; connect-src 'none'">
<title>Twenty privacy runtime check</title><style>body{font:16px system-ui;max-width:1000px;margin:40px auto}iframe{width:100%;height:280px;border:1px solid #ddd}button,a{display:inline-block;padding:12px;margin:8px 0}pre{white-space:pre-wrap}</style></head>
<body><h1>Twenty privacy runtime check</h1><p>This self-contained test uses synthetic values and makes no network requests. It runs pinned component code with the adapters listed in the downloaded manifest. Input events are scripted. It does not exercise the full Twenty application or the operating-system clipboard.</p><button id="run">Run browser checks</button><p id="status">Ready</p><div id="frame"></div><pre id="detail"></pre>
<script>${escapeScript(`
const payload=${payload};
const capture=${captureRuntimeFlow.toString()};
document.getElementById('run').addEventListener('click',async()=>{
  document.getElementById('run').disabled=true;
  const runs=[];let failure=null;let currentRun=null;
  const timeout=(promise,ms)=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Test phase timed out')),ms);promise.then(value=>{clearTimeout(timer);resolve(value);},error=>{clearTimeout(timer);reject(error);});});
  try {
    for(const [variant,fixture] of Object.entries(payload.fixtures))for(const [config,options] of Object.entries(payload.configs))for(const flow of payload.flows){
      currentRun={variant,config,flow:flow.id};
      document.getElementById('status').textContent=variant+' / '+config+' / '+flow.id;
      const frame=document.createElement('iframe');
      frame.srcdoc='<!doctype html><html><head><title>Isolated synthetic component</title></head><body><div id="twenty-fixture"></div></body></html>';
      const ready=new Promise(resolve=>frame.addEventListener('load',resolve,{once:true}));document.getElementById('frame').replaceChildren(frame);
      try {
        await timeout(ready,15000);
        const win=frame.contentWindow;const diagnostics=[];
        win.addEventListener('error',event=>diagnostics.push(String(event.error?.stack||event.message)));
        win.addEventListener('unhandledrejection',event=>diagnostics.push(String(event.reason?.stack||event.reason)));
        win.eval(fixture);win.eval(payload.recorder);win.__flow=flow;win.__options=options;
        const result=await timeout(win.eval('('+capture.toString()+')(window.__flow,window.__options)'),45000);
        runs.push({...result,variant,config,diagnostics,environment:{kind:'browser',userAgent:navigator.userAgent}});
      }finally{frame.remove();}
    }
  }catch(error){failure={run:currentRun,error:String(error.stack||error)};}
  finally{document.getElementById('run').disabled=false;document.getElementById('frame').replaceChildren();}
    const result={schema_version:1,complete:failure===null,failure,manifest:payload.manifest,runs};
    const link=document.createElement('a');link.textContent='Download recording results';link.download='twenty-browser-recordings.json';link.href=URL.createObjectURL(new Blob([JSON.stringify(result)],{type:'application/json'}));document.getElementById('detail').replaceWith(link);
    link.id='detail';
    document.getElementById('status').textContent=failure?'Test stopped after '+runs.length+' runs: '+failure.error+' Download partial evidence or retry.':'Recording complete: '+runs.length+' runs. Download the results for scoring.';
});
`)}</script></body></html>`;
}

export async function runTwentyRuntime({source,review,out,sdk,ref,dependencies,followupPatch,expectProtectedChallenges=[],prepareOnly=false,support,uiDependencies}) {
  out=path.resolve(out);
  await fs.mkdir(out,{recursive:false});
  const built=await buildTwentyFixture({source,review,out:path.join(out,'build'),...(followupPatch?{followupPatch}:{}),...(support?{support}:{}),...(uiDependencies?{dependencies:uiDependencies}:{})});
  const recorder=await buildPinnedRecorder(sdk,ref);
  const manifest={schema_version:1,source:built.manifest,recorder:recorder.target,flows:runtimeFlows,configs,expectProtectedChallenges,
    driver_sha256:hash(captureRuntimeFlow.toString()),node:process.version,
    responsibility:'The recorder operator remains responsible for recording contents. This bounded test does not establish legal compliance.',
    scope:'Pinned components with declared adapters. Preparation is not a browser result.'};
  await fs.writeFile(path.join(out,'recorder.js'),recorder.script);
  await json(path.join(out,'manifest.json'),manifest);
  const html=browserArtifact({baseline:built.baseline.script,patched:built.patched.script,recorder:recorder.script,manifest});
  await fs.writeFile(path.join(out,'browser.html'),html);
  if(prepareOnly)return {out,browser:'prepared, not run'};
  const runs=[];
  for(const variant of ['baseline','patched'])for(const [config,options] of Object.entries(configs))for(const flow of runtimeFlows) {
    const result=await captureInDom({fixture:built[variant].script,recorder:recorder.script,flow,options,dependencies});
    runs.push({...result,variant,config});
    // Retain complete partial evidence if a subsequent fixture fails.
    await json(path.join(out,'recordings.json'),{schema_version:1,manifest,runs});
  }
  const score=scoreRuntime({flows:runtimeFlows,runs,expectProtectedChallenges});
  await json(path.join(out,'score.json'),score);
  return {out,runs:runs.length,passed:score.passed,failed:score.failed,findings:score.findings,browser:'prepared, not run'};
}

if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url) {
  const {values:args}=parseArgs({options:{source:{type:'string'},review:{type:'string'},out:{type:'string'},sdk:{type:'string'},ref:{type:'string'},dependencies:{type:'string'},support:{type:'string'},'ui-dependencies':{type:'string'},'expect-protected':{type:'string'},'followup-patch':{type:'string'},'prepare-only':{type:'boolean'},recording:{type:'string'}}});
  if(args.recording) {
    const saved=JSON.parse(await fs.readFile(args.recording,'utf8'));
    if(saved.complete===false)throw new Error('The browser run is incomplete. Retain its partial evidence and rerun the failed phase before scoring.');
    const result=scoreRuntime({flows:saved.manifest.flows,runs:saved.runs,expectProtectedChallenges:saved.manifest.expectProtectedChallenges||[]});
    if(args.out)await json(args.out,result);
    console.log(JSON.stringify(result,null,2));if(result.failed)process.exitCode=2;
  } else {
    for(const key of ['source','review','out','sdk','ref'])if(!args[key])throw new Error(`Missing --${key}`);
    if(!args.dependencies&&!args['prepare-only'])throw new Error('DOM execution requires --dependencies <installed jsdom project>');
    const result=await runTwentyRuntime({...args,prepareOnly:args['prepare-only'],followupPatch:args['followup-patch'],expectProtectedChallenges:args['expect-protected']?.split(',')||[],uiDependencies:args['ui-dependencies']?JSON.parse(await fs.readFile(args['ui-dependencies'],'utf8')):undefined});
    console.log(JSON.stringify(result,null,2));if(result.failed)process.exitCode=2;
  }
}
