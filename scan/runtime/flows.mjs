// This driver runs unchanged in the DOM emulator and the standalone browser page.
// Its synthetic values never enter fixture IDs, page URLs or recorder options.
export const runtimeFlows = [
  {id:'key-short',kind:'key',initial:'KEY_SHORT_A_71',updates:['KEY_SHORT_B_82'],copy:true,inputSignal:true,private:true},
  {id:'key-long',kind:'key',initial:'KEY_LONG_A_713589_ABCDEFGHIJKLMNOPQRSTUVWXYZ',updates:['KEY_LONG_B_824690_ABCDEFGHIJKLMNOPQRSTUVWXYZ'],copy:true,inputSignal:true,private:true},
  {id:'private-email',kind:'email',initial:'person-a-7135@private-a-7135.invalid',updates:['person-b-8246@private-b-8246.invalid','INVALID_PRIVATE_EMAIL_9357',null,'person-c-0468@private-c-0468.invalid'],props:{protectEmailAddress:true},private:true},
  {id:'public-email',kind:'email',initial:'support@public-example.invalid',updates:['help@public-example.invalid','PUBLIC_EXAMPLE_WITHOUT_AT',null,'support@public-example.invalid'],props:{},private:false},
  {id:'private-input',kind:'text',initial:'PRIVATE_INPUT_A_1357',updates:['PRIVATE_INPUT_B_2468'],edit:'PRIVATE_TYPED_C_3579',props:{label:'Public field label',hint:'Public field hint',placeholder:'Public placeholder',inputProps:{'data-privacy':'mask'}},private:true},
  {id:'public-input',kind:'text',initial:'PUBLIC_INPUT_A_4680',updates:['PUBLIC_INPUT_B_5791'],edit:'PUBLIC_TYPED_C_6802',props:{label:'Public field label',hint:'Public field hint',placeholder:'Public placeholder'},private:false},
  {id:'private-autogrow',kind:'text',initial:'PRIVATE_GROW_A_7913',updates:['PRIVATE_GROW_B_8024','','PRIVATE_GROW_RESTORED_D_1479'],edit:'PRIVATE_GROW_TYPED_C_9135',props:{autoGrow:true,label:'Public field label',hint:'Public field hint',placeholder:'Public placeholder',inputProps:{'data-privacy':'mask'}},private:true,challenge:true},
  {id:'private-autogrow-empty-attribute',kind:'text',initial:'PRIVATE_EMPTY_ATTR_A_2580',updates:['PRIVATE_EMPTY_ATTR_B_3691',''],props:{autoGrow:true,label:'Public field label',hint:'Public field hint',placeholder:'Public placeholder',inputProps:{'data-privacy':''}},private:true,challenge:true},
  {id:'private-autogrow-placeholder',kind:'text',initial:'',updates:['PRIVATE_PLACEHOLDER_VALUE_B_8135',''],props:{autoGrow:true,label:'Public field label',hint:'Public field hint',placeholder:'PRIVATE_PLACEHOLDER_TEXT_A_7024',inputProps:{'data-privacy':'mask'}},private:true,privatePlaceholder:true,challenge:true},
  {id:'public-autogrow',kind:'text',initial:'PUBLIC_GROW_A_0246',updates:['PUBLIC_GROW_B_1357',''],props:{autoGrow:true,label:'Public field label',hint:'Public field hint',placeholder:'Public placeholder'},private:false,challenge:true},
];

export async function captureRuntimeFlow(flow, options) {
  const api=window.TwentyRuntime;
  if(!api || typeof window.__auditRecord!=='function') throw new Error('Fixture or recorder was not loaded');
  const settle=()=>new Promise(resolve=>setTimeout(resolve,80));
  const events=[],steps=[];
  const component=()=>document.querySelector('[data-fixture-component]');
  const dom=()=>{
    const root=component();
    if(!root)throw new Error('Fixture component root is absent');
    const attributes=el=>Object.fromEntries([...el.attributes].map(attr=>[attr.name,attr.value]));
    const ancestors=el=>{const list=[];while(el){if(el.hasAttribute('data-privacy'))list.push({tag:el.tagName.toLowerCase(),privacy:el.getAttribute('data-privacy')});el=el.parentElement;}return list;};
    return {text:root.textContent,html:root.innerHTML,
      inputs:[...root.querySelectorAll('input')].map(el=>({value:el.value,attributes:attributes(el),privacy:ancestors(el)})),
      anchors:[...root.querySelectorAll('a')].map(el=>({text:el.textContent,attributes:attributes(el),privacy:ancestors(el)})),
      buttons:[...root.querySelectorAll('button')].map(el=>({text:el.textContent,attributes:attributes(el),privacy:ancestors(el)})),
      measurements:[...root.querySelectorAll('span')].filter(el=>getComputedStyle(el).visibility==='hidden'&&getComputedStyle(el.parentElement).visibility!=='hidden').map(el=>({text:el.textContent,attributes:attributes(el)})),
      public_controls:[...document.querySelectorAll('[data-fixture-public]')].map(el=>({text:el.textContent,attributes:attributes(el)}))};
  };
  await api.mount(flow.kind,flow.initial,flow.props||{});
  await settle();
  const before=dom();
  const stop=window.__auditRecord({...options,emit:event=>events.push(JSON.parse(JSON.stringify(event)))});
  if(typeof stop!=='function')throw new Error('Recorder did not start');
  async function step(name,action){const begin=events.length;await action();await settle();steps.push({name,event_start:begin,event_end:events.length,dom:dom()});}
  try {
    await settle();
    if(!events.some(event=>event.type===2))throw new Error('No initial full snapshot');
    steps.push({name:'initial',event_start:0,event_end:events.length,dom:before});
    if(flow.inputSignal)await step('input-signal',()=>{
      const input=component().querySelector('input');
      if(!input)throw new Error('Credential input absent');
      input.dispatchEvent(new InputEvent('input',{bubbles:true,composed:true,inputType:'insertText',data:null}));
    });
    if(flow.copy) await step('copy-initial',()=>{
      const button=[...component().querySelectorAll('button')].find(button=>button.textContent==='Copy');
      if(!button)throw new Error('Copy button absent');button.click();
    });
    for(const [index,value] of (flow.updates||[]).entries()) {
      await step(`update-${index+1}`,()=>api.update(value));
      if(flow.kind==='email'&&(value==null||!value.includes('@')))await step(`checkpoint-update-${index+1}`,()=>window.__auditRecord.takeFullSnapshot(true));
    }
    if(flow.edit!==undefined) await step('input',()=>{
      const input=component().querySelector('input');
      if(!input)throw new Error('Editable input absent');
      input.focus();
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,flow.edit);
      input.dispatchEvent(new InputEvent('input',{bubbles:true,composed:true,inputType:'insertText',data:flow.edit}));
    });
    if(flow.copy) await step('copy-updated',()=>[...component().querySelectorAll('button')].find(button=>button.textContent==='Copy').click());
    await step('final-snapshot',()=>window.__auditRecord.takeFullSnapshot(true));
  } finally {stop();}
  const observations=JSON.parse(JSON.stringify(api.observations||{}));
  const result={flow:flow.id,kind:flow.kind,options,events,steps,observations,input:'scripted DOM events',browser:navigator.userAgent};
  await api.unmount();
  return result;
}
