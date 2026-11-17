import assert from'node:assert/strict';
import fs from'node:fs/promises';import path from'node:path';import os from'node:os';import http from'node:http';import{once}from'node:events';
import{checkHtml}from'../agent-integration/dsh/html-artifacts/browser-check.mjs';
const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'ued-browser-check-')));let escaped=0;
const server=http.createServer((req,res)=>{
  res.setHeader('Content-Type','text/html; charset=utf-8');
  if(req.url==='/outside'){escaped++;res.end('must not be fetched');return;}
  if(req.url==='/broken/'){res.end('<!doctype html><html><body><button id="new">新建</button><div id="result">等待</div><script>throw Error("runtime regression")</script></body></html>');return;}
  if(req.url==='/shell/'){res.end('<!doctype html><html><body><button id="new">新建</button><div id="result">等待</div></body></html>');return;}
  if(req.url==='/network/'){res.end('<!doctype html><html><body>Network fixture<script>fetch("/outside")</script></body></html>');return;}
  res.end(`<!doctype html><html><body><h1>Fixture</h1><input id="query"><button id="search">查询</button><button id="reset">重置</button><p id="rows">A,B</p><input id="date" type="date"><button id="new">新建</button><dialog id="dialog"><h2>新建记录</h2><button id="close">关闭</button></dialog><script>document.querySelector('#search').onclick=()=>document.querySelector('#rows').textContent=document.querySelector('#query').value;document.querySelector('#reset').onclick=()=>{document.querySelector('#query').value='';document.querySelector('#rows').textContent='A,B'};document.querySelector('#new').onclick=()=>document.querySelector('#dialog').showModal();document.querySelector('#close').onclick=()=>document.querySelector('#dialog').close();</script></body></html>`);
});server.listen(0,'127.0.0.1');await once(server,'listening');const origin='http://127.0.0.1:'+server.address().port;
const interactive={intent:'interactive',missing_requirements:[],requirements:[{name:'新建打开真实界面',steps:[{action:'click',selector:'#new'}],expect:[{kind:'visible',selector:'#dialog[open]'}]}]};
const run=(route,input)=>checkHtml({entryUrl:origin+route,scopeUrl:origin+route,workRoot:root,input});
try{
 const shell=await run('/shell/',structuredClone(interactive));assert.equal(shell.status,'failed');assert.equal(shell.runtime.status,'passed');assert.ok(shell.requirements[0].error.includes('占位'));
 const broken=await run('/broken/',structuredClone(interactive));assert.equal(broken.status,'failed');assert.ok(broken.runtime.errors.some(x=>x.includes('runtime regression')));
 const network=await run('/network/',{intent:'static',static_reason:'Only fixture text requested',requirements:[{name:'正文',steps:[],expect:[{kind:'text',selector:'body',text:'Network'}]}],missing_requirements:[]});assert.equal(network.status,'failed');assert.equal(escaped,0);assert.ok(network.runtime.resourceFailures.length);
 const good=await run('/good/',{intent:'interactive',missing_requirements:[],requirements:[
  {name:'输入查询真正更新结果',steps:[{action:'fill',selector:'#query',value:'A'},{action:'click',selector:'#search'}],expect:[{kind:'text',selector:'#rows',equals:'A'}]},
  {name:'重置恢复记录和输入',steps:[{action:'click',selector:'#reset'}],expect:[{kind:'text',selector:'#rows',equals:'A,B'},{kind:'value',selector:'#query',equals:''}]},
  {name:'原生日期控件',steps:[],expect:[{kind:'attribute',selector:'#date',attribute:'type',equals:'date'}]},
  ...interactive.requirements,
  {name:'关闭新建界面',steps:[{action:'click',selector:'#close'}],expect:[{kind:'hidden',selector:'#dialog[open]'}]},
 ]});assert.equal(good.status,'passed',JSON.stringify(good));assert.equal(good.requirements.length,5);
 const wrongCount=await run('/good/',{intent:'static',static_reason:'Count assertion fixture',missing_requirements:[],requirements:[{name:'数量必须实际匹配',steps:[],expect:[Object.freeze({kind:'count',selector:'#rows',equals:'9'})]}]});assert.equal(wrongCount.status,'failed');
 await assert.rejects(run('/good/',{intent:'static',missing_requirements:[],requirements:[{name:'不能空断言',steps:[],expect:[{kind:'count',selector:'#rows'}]}]}),/数量断言/);
 const missing=await run('/good/',{...structuredClone(interactive),missing_requirements:['角色权限尚未实现']});assert.equal(missing.status,'failed');
 console.log(JSON.stringify({result:'PASS_REAL_BROWSER_VALIDATION',browserErrorsFail:true,inertShellFails:true,networkIsScoped:true,queryResetAndCreateClosePass:true,dateTypeChecked:true,missingRequirementsFail:true,profileCleanup:(await fs.readdir(root)).every(x=>!x.startsWith('browser-'))}));
}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await fs.rm(root,{recursive:true,force:true});}
