import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const source=await readFile(new URL('./competition-center-ui.tsx',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,esModuleInterop:true,target:ts.ScriptTarget.ES2020}}).outputText;
const ready={mode:'local',lanSupported:false,busy:false,checked:true,configured:true,owned:true,url:'http://127.0.0.1:3047/',checks:[],lan:{status:'NOT_CONFIGURED',addresses:[],message:''}};
function harness({states=[],rejectAction=false,pendingAction=false}={}){
 const values=[{...ready},'','local',3,false,false],refs=[],timers=[],redirects=[];let hook=0,ref=0,root,actions=0,accept;
 const React={createElement:(type,props,...children)=>({type,props:props||{},children}),useState(initial){const i=hook++;if(!(i in values))values[i]=initial;return[values[i],value=>{values[i]=typeof value==='function'?value(values[i]):value;}];},useRef(initial){const i=ref++;return refs[i]||(refs[i]={current:initial});},useEffect(){}};
 const form={setFieldsValue(){},setFieldValue(){}};
 const antd=new Proxy({Form:Object.assign('Form',{useForm:()=>[form],useWatch:()=>false}),Typography:{Text:'Text',Title:'Title',Paragraph:'Paragraph'}},{get:(object,key)=>object[key]||key});
 // Form has static hooks in Ant Design; a callable stub keeps those properties.
 antd.Form=Object.assign(()=>null,{useForm:()=>[form],useWatch:()=>false,Item:'Form.Item'});
 vm.runInNewContext(compiled,{exports:{},require:name=>name==='react'?React:name==='react-dom/client'?{createRoot:()=>({render:element=>{root=element;}})}:name==='antd'?antd:name.includes('KnowledgeThemeProvider')?{KnowledgeThemeProvider:'Theme'}:{},location:{origin:'http://127.0.0.1:52602',hash:''},history:{replaceState(){}},sessionStorage:{getItem:()=> 'synthetic-capability',setItem(){},removeItem(){}},document:{querySelector:()=>null,getElementById:()=>({})},window:{location:{assign:url=>redirects.push(url)}},URL,Date,Promise,setInterval(){},clearInterval(){},setTimeout:resolve=>timers.push(resolve),fetch:async(_route,options)=>{
  if(options.method==='POST'){
   actions++;if(pendingAction)await new Promise(resolve=>{accept=resolve;});
   if(rejectAction)return{ok:false,json:async()=>({error:'Synthetic startup rejected'})};
   return{ok:true,json:async()=>({accepted:true})};
  }
  assert(states.length,'Unexpected state request');return{ok:true,json:async()=>states.shift()};
 }});
 function find(element,predicate){if(!element||typeof element!=='object')return; if(predicate(element))return element;for(const child of (element.children||[]).flat(Infinity)){const result=find(child,predicate);if(result)return result;}}
 const Center=find(root,element=>typeof element.type==='function'&&element.type.name==='Center').type;
 function render(){hook=0;ref=0;return Center();}
 const button=()=>find(render(),element=>element.type==='Button'&&element.children.some(x=>typeof x==='string'&&(x==='启动 UED Asset Hub'||x==='正在启动，成功后自动跳转')));
 return{values,redirects,timers,button,get actions(){return actions;},accept:()=>accept(),tick:()=>timers.shift()()};
}
const flush=async()=>{for(let n=0;n<20;n++)await Promise.resolve();};
{
 const h=harness({pendingAction:true,states:[{...ready,busy:true},{...ready,busy:false}]});
 h.button().props.onClick();h.button().props.onClick();
 assert.equal(h.actions,1);assert.equal(h.button().props.loading,true);assert.equal(h.button().props.disabled,true);assert.deepEqual(h.redirects,[]);
 h.accept();await flush();assert.deepEqual(h.redirects,[],'Old URL must not redirect while startup is busy');
 h.tick();await flush();assert.deepEqual(h.redirects,[ready.url]);assert.equal(h.values[5],false);
}
for(const state of [{...ready,error:'Synthetic startup failed'},{...ready,owned:false},{...ready,url:'https://untrusted.test/'}]){
 const h=harness({states:[state]});h.button().props.onClick();await flush();assert.deepEqual(h.redirects,[]);assert(h.values[1]);assert.equal(h.values[5],false);
}
{
 const h=harness({rejectAction:true});h.button().props.onClick();await flush();assert.deepEqual(h.redirects,[]);assert.equal(h.values[5],false);assert.match(h.values[1],/rejected/);
}
{
 const h=harness({states:[ready]});h.button().props.onClick();await flush();assert.deepEqual(h.redirects,[ready.url],'Fast successful startup also redirects');
}
console.log('PASS: immediate loading, duplicate-click guard, stale URL during delayed startup, failure stays in center, fast success, and redirect URL boundary. No services or business data used.');
