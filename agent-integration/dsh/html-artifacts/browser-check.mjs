import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let queue=Promise.resolve();
export async function checkHtml(options) {
  const previous=queue;let release;queue=new Promise(resolve=>release=resolve);await previous;
  try{return await run(options);}finally{release();}
}
function plan(input) {
  if(!['interactive','static'].includes(input.intent))throw Error('请根据任务说明成果是交互原型还是明确要求的静态展示。');
  if(!Array.isArray(input.requirements)||!input.requirements.length||input.requirements.length>16||!Array.isArray(input.missing_requirements)||input.missing_requirements.length>30)throw Error('请列出任务的关键验收项和未实现需求；不要只检查文件存在。');
  for(const requirement of input.requirements){
    if(typeof requirement.name!=='string'||!requirement.name.trim()||requirement.name.length>200||!Array.isArray(requirement.steps)||requirement.steps.length>20||!Array.isArray(requirement.expect)||!requirement.expect.length||requirement.expect.length>12)throw Error('每项验收应有名称、操作步骤和可观察结果。');
    for(const step of requirement.steps)if(!['click','fill','select','press','check'].includes(step.action)||typeof step.selector!=='string'||step.selector.length>500||typeof step.value==='string'&&step.value.length>2000||step.text?.length>300)throw Error('验收仅支持有界的 DOM 操作，不接受脚本或服务器命令。');
    for(const check of requirement.expect){
      if(!['visible','hidden','text','value','count','attribute','checked','url'].includes(check.kind)||check.selector?.length>500||check.text?.length>2000||check.equals?.length>2000||check.attribute?.length>100)throw Error('页面断言参数无效。');
      if(check.kind==='count'){
        if(check.equals!==undefined){if(!/^\d+$/.test(check.equals))throw Error('数量 equals 应为非负整数。');check.count=Number(check.equals);}
        if([check.count,check.min,check.max].every(x=>x===undefined)||[check.count,check.min,check.max].some(x=>x!==undefined&&(!Number.isSafeInteger(x)||x<0)))throw Error('数量断言需要 count、min、max 或整数 equals。');
      }
      if(check.kind==='url'&&!(check.text??check.equals))throw Error('URL 断言需要实际匹配内容。');
    }
  }
  if(input.missing_requirements.some(x=>typeof x!=='string'||x.length>300))throw Error('未实现需求应为简短文字。');
}
async function executable() {
  const candidates=process.env.UED_HTML_BROWSER_PATH?[process.env.UED_HTML_BROWSER_PATH]:process.platform==='win32'?[
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'
  ]:process.platform==='darwin'?['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge']:['/usr/bin/chromium','/usr/bin/chromium-browser','/usr/bin/google-chrome'];
  for(const candidate of candidates){try{if((await fs.stat(candidate)).isFile())return candidate;}catch{}}
  throw Error('未找到可用的 Edge/Chrome，页面尚未验证。');
}
// Chromium's private inherited pipes avoid exposing an unauthenticated CDP TCP port.
function cdp(child) {
  let seq=0,buffer=Buffer.alloc(0),sessionId;const pending=new Map(),listeners=new Map();
  const rejectAll=()=>{for(const item of pending.values()){clearTimeout(item.timer);item.reject(Error('验证浏览器已退出。'));}pending.clear();};
  child.once('exit',rejectAll);child.once('error',rejectAll);child.stdio[3].on('error',rejectAll);
  child.stdio[4].on('data',chunk=>{buffer=Buffer.concat([buffer,chunk]);let at;while((at=buffer.indexOf(0))>=0){const line=buffer.subarray(0,at);buffer=buffer.subarray(at+1);if(!line.length)continue;try{const message=JSON.parse(line.toString());if(message.id){const item=pending.get(message.id);if(!item)continue;pending.delete(message.id);clearTimeout(item.timer);message.error?item.reject(Error(message.error.message)):item.resolve(message.result??{});}else for(const callback of listeners.get(message.method)??[])callback(message.params??{});}catch{}}if(buffer.length>16*1024*1024)child.kill();});
  return {on(method,callback){const rows=listeners.get(method)??[];rows.push(callback);listeners.set(method,rows);},setSession(id){sessionId=id;},send(method,params={},browser=false){return new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error('浏览器操作超时：'+method));},10000);pending.set(id,{resolve,reject,timer});child.stdio[3].write(JSON.stringify({id,method,params,...(!browser&&sessionId?{sessionId}:{})})+'\0');});}};
}
// Only this fixed function is evaluated in the disposable artifact renderer.
// Tool arguments are data: no model-authored JavaScript is accepted.
function dom(command) {
  const visible=el=>!!el&&!!(el.getBoundingClientRect().width&&el.getBoundingClientRect().height)&&getComputedStyle(el).visibility!=='hidden';
  const pick=(selector,text)=>Array.from(document.querySelectorAll(selector)).filter(el=>visible(el)&&(text===undefined||(el.innerText||el.textContent||'').trim()===text));
  const hash=value=>{let result=2166136261;for(let n=0;n<value.length;n++)result=Math.imul(result^value.charCodeAt(n),16777619);return value.length+':'+(result>>>0);};
  const view=()=>JSON.stringify({url:location.href,body:(document.body?.innerText??'').slice(0,200000),dialogs:Array.from(document.querySelectorAll('dialog')).map(el=>el.open)});
  const signature=()=>hash(view()+JSON.stringify(Array.from(document.querySelectorAll('input,select,textarea')).slice(0,300).map(el=>[el.id,el.value,el.checked])));
  if(command.kind==='snapshot')return {signature:signature(),viewSignature:hash(view()),bodyText:(document.body?.innerText??'').slice(0,1200),controls:Array.from(document.querySelectorAll('button,input,select,textarea,a[href],[role=button],[role=tab]')).filter(visible).slice(0,100).map(el=>({tag:el.tagName.toLowerCase(),id:el.id,name:el.getAttribute('name'),type:el.getAttribute('type'),role:el.getAttribute('role'),label:el.getAttribute('aria-label')||(el.innerText||el.textContent||'').trim().slice(0,100)}))};
  if(command.kind==='action'){
    const action=command.value,all=pick(action.selector,action.text);if(all.length!==1)throw Error('操作目标应唯一且可见，实际匹配 '+all.length+' 项：'+action.selector);const el=all[0];
    if(el.disabled||el.closest('[inert]'))throw Error('控件不可操作：'+action.selector);el.scrollIntoView({block:'center'});
    if(action.action==='click')el.click();
    if(action.action==='press')el.focus();
    if(action.action==='check'){if(!('checked'in el))throw Error('目标不是勾选控件');if(el.checked!==(action.value!=='false'))el.click();}
    if(action.action==='fill'){if(!['INPUT','TEXTAREA'].includes(el.tagName))throw Error('目标不是输入框');const prototype=el.tagName==='INPUT'?HTMLInputElement.prototype:HTMLTextAreaElement.prototype;Object.getOwnPropertyDescriptor(prototype,'value').set.call(el,String(action.value??''));el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));}
    if(action.action==='select'){if(el.tagName!=='SELECT')throw Error('自定义选择器请按真实操作点击触发器和选项');if(!Array.from(el.options).some(option=>option.value===action.value))throw Error('选项不存在');el.value=action.value;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));}
    return {signature:signature()};
  }
  const check=command.value;if(check.kind==='url')return {passed:location.href.includes(check.text??check.equals??''),actual:location.href};
  const all=pick(check.selector??'body',check.element_text),el=all[0];let passed=false,actual;
  if(check.kind==='visible'){actual=all.length;passed=all.length>0;}
  if(check.kind==='hidden'){actual=all.length;passed=all.length===0;}
  if(check.kind==='count'){actual=all.length;passed=(check.min===undefined||actual>=check.min)&&(check.max===undefined||actual<=check.max)&&(check.count===undefined||actual===check.count);}
  if(['text','value','attribute','checked'].includes(check.kind)){
    if(all.length!==1)return {passed:false,actual:'目标应唯一，实际 '+all.length+' 项'};
    actual=check.kind==='value'?el.value:check.kind==='attribute'?el.getAttribute(check.attribute):check.kind==='checked'?String(el.checked):(el.innerText||el.textContent||'');
    passed=check.equals!==undefined?String(actual)===check.equals:check.text!==undefined?String(actual).includes(check.text):false;
  }
  return {passed,actual:typeof actual==='string'?actual.slice(0,500):actual};
}
async function run({entryUrl,scopeUrl,input,workRoot,signal}) {
  input=structuredClone(input);plan(input);const browser=await executable(),profile=await fs.mkdtemp(path.join(workRoot,'browser-'));
  const report={status:'failed',runtime:{status:'pending',errors:[],resourceFailures:[]},requirements:[],missingRequirements:[...input.missing_requirements],controls:[],browser:'chromium'};
  let child,protocol,stderr='',aborted=false;const errors=[],failures=[],dialogs=[],requests=new Map();
  const clean=text=>String(text).replaceAll(scopeUrl,'artifact:/').slice(0,1600);
  try{
    child=spawn(browser,['--headless=new','--remote-debugging-pipe','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update','--disable-extensions','--disable-sync','--mute-audio','--disable-gpu','--user-data-dir='+profile],{stdio:['ignore','ignore','pipe','pipe','pipe'],windowsHide:true});
    child.stderr.on('data',chunk=>{stderr=(stderr+chunk).slice(-3000);});protocol=cdp(child);
    const abort=()=>{aborted=true;void protocol.send('Browser.close',{},true).catch(()=>{});};signal?.addEventListener('abort',abort,{once:true});
    const timer=setTimeout(abort,60000);
    try{
      await protocol.send('Browser.getVersion',{},true);
      const target=await protocol.send('Target.createTarget',{url:'about:blank'},true),attached=await protocol.send('Target.attachToTarget',{targetId:target.targetId,flatten:true},true);protocol.setSession(attached.sessionId);
      await protocol.send('Page.enable');await protocol.send('Runtime.enable');await protocol.send('Network.enable');
      protocol.on('Runtime.exceptionThrown',({exceptionDetails:e})=>errors.push(clean(e.exception?.description??e.text)));
      protocol.on('Runtime.consoleAPICalled',event=>{if(event.type==='error')errors.push(clean(event.args.map(x=>x.value??x.description??'').join(' ')));});
      protocol.on('Network.requestWillBeSent',event=>requests.set(event.requestId,event.request.url));
      protocol.on('Network.loadingFinished',event=>requests.delete(event.requestId));
      protocol.on('Network.loadingFailed',event=>{if(!event.canceled)failures.push(clean([event.type,event.errorText||event.blockedReason||'resource-load-failed',event.corsErrorStatus?.corsError,requests.get(event.requestId)].filter(Boolean).join(' ')));requests.delete(event.requestId);});
      protocol.on('Network.responseReceived',event=>{if(event.response.status>=400)failures.push(clean(event.response.status+' '+event.response.url));});
      protocol.on('Page.javascriptDialogOpening',event=>{dialogs.push({message:event.message.slice(0,300)});void protocol.send('Page.handleJavaScriptDialog',{accept:false}).catch(()=>{});});
      protocol.on('Fetch.requestPaused',event=>{
        const url=event.request.url;if(event.resourceType==='Other'&&new URL(url).pathname==='/favicon.ico'){void protocol.send('Fetch.fulfillRequest',{requestId:event.requestId,responseCode:204}).catch(()=>{});return;}const allowed=url.startsWith(scopeUrl)||/^(data:|blob:|about:blank|about:srcdoc)/.test(url);
        if(!allowed)failures.push(clean('阻止超出成果范围的请求：'+url));
        void protocol.send(allowed?'Fetch.continueRequest':'Fetch.failRequest',allowed?{requestId:event.requestId}:{requestId:event.requestId,errorReason:'BlockedByClient'}).catch(()=>{});
      });
      await protocol.send('Fetch.enable',{patterns:[{urlPattern:'*',requestStage:'Request'}]});
      const evaluate=async command=>{const result=await protocol.send('Runtime.evaluate',{expression:'('+dom.toString()+')('+JSON.stringify(command)+')',returnByValue:true,awaitPromise:true,userGesture:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description??result.exceptionDetails.text);return result.result.value;};
      await protocol.send('Page.navigate',{url:entryUrl});
      for(let n=0;n<60;n++){try{const ready=await protocol.send('Runtime.evaluate',{expression:'document.readyState',returnByValue:true});if(ready.result.value==='complete')break;}catch{}await delay(100);}
      await delay(350);const initial=await evaluate({kind:'snapshot'});report.controls=initial.controls;
      if(!initial.bodyText.trim())errors.push('页面没有可见正文。');
      report.runtime.status=errors.length||failures.length?'failed':'passed';
      for(const requirement of input.requirements){
        const result={name:requirement.name,status:'failed',steps:[],assertions:[]};report.requirements.push(result);
        try{
          let effectiveAction=false;
          for(const step of requirement.steps){
            const old=await evaluate({kind:'snapshot'}),oldDialogs=dialogs.length;
            if(step.action==='press'){
              await evaluate({kind:'action',value:step});
              if(!['Enter','Escape','Tab','ArrowDown','ArrowUp','ArrowLeft','ArrowRight','Space'].includes(step.value))throw Error('press 仅支持常用界面交互按键。');
              const key=step.value==='Space'?' ':step.value,virtual={Enter:13,Escape:27,Tab:9,ArrowDown:40,ArrowUp:38,ArrowLeft:37,ArrowRight:39,Space:32}[step.value];await protocol.send('Input.dispatchKeyEvent',{type:'keyDown',key,windowsVirtualKeyCode:virtual});await protocol.send('Input.dispatchKeyEvent',{type:'keyUp',key,windowsVirtualKeyCode:virtual});
            }else await evaluate({kind:'action',value:step});
            await delay(150);const after=await evaluate({kind:'snapshot'}),changed=old.signature!==after.signature||dialogs.length>oldDialogs;
            if(changed&&(['click','select','check','press'].includes(step.action)||old.viewSignature!==after.viewSignature))effectiveAction=true;
            result.steps.push({action:step.action,selector:step.selector,changed});
          }
          for(const expected of requirement.expect){let value;for(let n=0;n<8;n++){value=await evaluate({kind:'assert',value:expected});if(value.passed)break;await delay(100);}result.assertions.push({kind:expected.kind,selector:expected.selector,status:value.passed?'passed':'failed',actual:clean(value.actual)});}
          const interactive=requirement.steps.length>0;
          if(interactive&&!effectiveAction)result.error='操作没有产生可观察的交互结果，请检查是否只剩占位事件或空壳。';
          result.status=result.assertions.every(x=>x.status==='passed')&&(!interactive||effectiveAction)?'passed':'failed';
        }catch(error){result.error=clean(error.message);}
      }
      const hasInteraction=report.requirements.some(x=>x.steps.length>0);
      if(!hasInteraction&&input.intent!=='static')report.missingRequirements.push('页面包含交互控件，尚未验证关键交互。');
      if(input.intent==='static'&&!input.static_reason)report.missingRequirements.push('静态成果应说明用户要求的静态范围。');
      const shot=await protocol.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await fs.writeFile(path.join(profile,'result.png'),Buffer.from(shot.data,'base64'));
      report.runtime.errors=[...new Set(errors)].slice(0,15);report.runtime.resourceFailures=[...new Set(failures)].slice(0,15);report.runtime.status=errors.length||failures.length?'failed':'passed';
      report.status=!aborted&&report.runtime.status==='passed'&&report.requirements.every(x=>x.status==='passed')&&!report.missingRequirements.length?'passed':'failed';
      if(aborted)report.runtime.errors.push('检查已取消或超时。');
    }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
  }catch(error){report.status='blocked';report.runtime.status='failed';report.runtime.errors.push(clean('浏览器检查未完成：'+error.message));}
  finally{
    if(protocol)await protocol.send('Browser.close',{},true).catch(()=>{});
    if(child){for(let n=0;n<30&&child.exitCode===null&&child.signalCode===null;n++)await delay(100);if(child.exitCode===null&&child.signalCode===null){if(process.platform==='win32')await promisify(execFile)('C:/Windows/System32/taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true}).catch(()=>{});else child.kill('SIGKILL');}}
    // Keep only the result screenshot; the browser profile never joins a download.
    try{await fs.rename(path.join(profile,'result.png'),path.join(workRoot,'last-check.png'));}catch{}
    await fs.rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:100}).catch(()=>{});
  }
  return report;
}
