// Synthetic control-protocol test; never starts the persistent 3047 runtime.
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {startCenter} from './competition-center.mjs';
import {runMacDemo} from './mac-demo-center.mjs';
const root=await mkdtemp(path.join(os.tmpdir(),'ued-mac-center-mode-'));
await mkdir(path.join(root,'tools'));
let starts=0,lanCalls=0;
const center=await startCenter(root,{autoCheck:false,lanSupported:false,modeReader:async()=>({mode:'local'}),checker:async()=>({configured:true,owned:false,dataRoot:'/synthetic-only',ports:[3047],source:'a'.repeat(40)}),lanInspector:async()=>{lanCalls++;},lanConfigurer:async()=>{lanCalls++;},runner:async(_action,_root,options)=>{assert.equal(options.mode,'local');starts++;return{url:'http://127.0.0.1:3047/',runtime:'ready'};}});
const call=async(action,extra={})=>{const r=await fetch(center.origin+'/api/action',{method:'POST',headers:{Authorization:'Bearer '+center.token,Origin:center.origin,'Content-Type':'application/json'},body:JSON.stringify({action,...extra})});assert.equal(r.status,202);for(let n=0;n<100&&center.state.busy;n++)await new Promise(r=>setTimeout(r,10));assert.equal(center.state.busy,false);};
try{
 await assert.rejects(runMacDemo('Start','/synthetic-only',{mode:'lan'}),/本机模式/);
 await call('check');assert.equal(center.state.lanSupported,false);assert.equal(center.state.source,'a'.repeat(40));
 await call('inspect-lan');assert.match(center.state.error,/Mac/);
 await call('configure-lan');assert.match(center.state.error,/Mac/);
 await call('start',{mode:'lan'});assert.match(center.state.error,/本机模式/);assert.equal(starts,0);assert.equal(lanCalls,0);
 await call('start',{mode:'local'});assert.equal(starts,1);assert.equal(center.state.url,'http://127.0.0.1:3047/');
 console.log('PASS: Mac center exposes source identity, rejects LAN inspect/configure/start before adapters run, and preserves local start. Synthetic protocol only.');
}finally{await new Promise(r=>center.server.close(r));await rm(root,{recursive:true});}
