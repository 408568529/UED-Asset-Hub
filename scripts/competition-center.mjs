// Minimal local UI adapter. Hub lifecycle and credentials remain owned by the existing launcher/DSH.
import { inspectCompetitionLan, configureCompetitionLan, readLaunchMode } from './competition-lan.mjs';
import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { execFile, execFileSync, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { lstat, mkdir, open, readFile, realpath, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkCompetitionEnvironment, readJson, toolPaths } from './competition-check.mjs';
import { assertNoLinkedAncestors } from './competition-first-run.mjs';
import { initializeLocalAdministrator, attachCompetitionInstallation, runLocalDistribution, openBrowser } from './competition-launcher.mjs';
const exec = promisify(execFile), sleep = ms => new Promise(r => setTimeout(r, ms));
const live = pid => { if (!Number.isInteger(pid) || pid < 1) return false; try { process.kill(pid, 0); return true; } catch(e) { if(e.code === 'ESRCH') return false; throw e; } };
const equal = (a,b) => typeof a === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a),Buffer.from(b));
const safeError = error => error instanceof SyntaxError ? '配置 JSON 无效，请恢复原安装文件；不会重置或显示内容。' : error.message?.startsWith('Command failed') ? '系统权限或目录选择操作失败；请检查本机权限，未绕过安全策略。' : error.code === 'ENOENT' ? '必要组件或原路径缺失，请恢复完整程序包/原数据路径；不会自动重建。' : error.message || '操作失败，请重新检查。';
async function privateControl(root) {
  await assertNoLinkedAncestors(root);
  if(process.platform==='win32' && path.parse(root).root.slice(0,2).toLowerCase()===(process.env.SystemDrive||'C:').toLowerCase())throw Error('请将程序和数据放在 C 盘之外。');
  const directory = path.join(root,'.launch-center'); let created = false;
  try { await mkdir(directory,{mode:0o700}); created = true; } catch(e) { if(e.code !== 'EEXIST') throw e; }
  const entries = [directory,path.join(directory,'control.json')];
  for(const entry of entries) {
    let info;try { info = await lstat(entry); } catch(e) { if(e.code === 'ENOENT') continue; throw e; }
    if(info.isSymbolicLink() || (entry !== directory && (!info.isFile() || info.nlink !== 1))) throw Error('启动中心状态被重定向，操作已拒绝。');
    if(process.platform !== 'win32' && (info.uid !== process.getuid() || (info.mode & 0o077))) throw Error('启动中心控制目录必须仅限当前账户访问。');
  }
  if(process.platform === 'win32') execFileSync('powershell.exe',['-NoProfile','-File',path.join(root,'tools/competition-center-private.ps1'),'-Path',directory,...(created?['-Initialize']:[])],{stdio:['ignore','pipe','pipe']});
  return path.join(directory,'control.json');
}
export function acceptsCenterRequest(req, origin, token, mutation = false) {
  if(req.headers.host !== new URL(origin).host || !['127.0.0.1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)) return false;
  if(req.headers['sec-fetch-site'] === 'cross-site' || (req.headers.origin && req.headers.origin !== origin)) return false;
  if(!equal(req.headers.authorization,`Bearer ${token}`)) return false;
  return !mutation || (req.headers.origin === origin && req.headers['content-type'] === 'application/json');
}
async function body(req) {
  let text = ''; for await(const chunk of req) { text += chunk; if(Buffer.byteLength(text)>16384) throw Error('输入过长。'); }
  try{return JSON.parse(text);}catch{throw Error('请求必须为 JSON。');}
}
async function chooseFolder() {
  const result = process.platform === 'win32'
    ? await exec('powershell.exe',['-NoLogo','-NoProfile','-STA','-File',fileURLToPath(new URL('./competition-choose-folder.ps1',import.meta.url))],{encoding:'utf8'})
    : await exec('/usr/bin/osascript',['-l','JavaScript','-e','const a=Application.currentApplication();a.includeStandardAdditions=true;a.chooseFolder({withPrompt:"选择外部数据目录或父目录"}).toString();'],{encoding:'utf8'});
  return result.stdout.trim().replace(/[\\/]$/,'');
}
export async function startCenter(packageRoot,{checker=checkCompetitionEnvironment,runner=runLocalDistribution,initializer=initializeLocalAdministrator,attacher=attachCompetitionInstallation,folderPicker=chooseFolder,lanInspector=inspectCompetitionLan,lanConfigurer=configureCompetitionLan,modeReader=readLaunchMode,lanSupported=true,autoCheck=true}={}) {
  const root = await realpath(packageRoot), recordFile = await privateControl(root);
  const token = randomBytes(32).toString('hex'), instance = randomBytes(24).toString('hex');
  const claim = await open(recordFile,'wx',0o600);
  const record = {schemaVersion:1,packageRoot:root,pid:process.pid,token,instance,phase:'opening'};
  try{if(process.platform==='win32')execFileSync('powershell.exe',['-NoProfile','-File',path.join(root,'tools/competition-center-private.ps1'),'-Path',path.dirname(recordFile),'-ProtectState'],{stdio:['ignore','pipe','pipe']});await claim.writeFile(JSON.stringify(record));}finally{await claim.close();}
  const labels = {integrity:'Hub / DSH / GenUI 完整性',system:'系统与 CPU 架构',node:'包内 Node',git:'便携 Git 与必要权限',data:'外置数据与访问权限',ports:'端口与已有实例'};
  const state = {mode:'local',lanSupported,source:null,lan:{status:'NOT_CONFIGURED',addresses:[],message:'选择局域网共享后检测地址、证书和防火墙。'},busy:false,checked:false,configured:false,owned:false,dataRoot:null,url:null,status:'等待检测',error:null,checks:Object.entries(labels).map(([id,label])=>({id,label,status:'PENDING',detail:'尚未检测'}))};
  const progress = (id,status,detail) => {const row=state.checks.find(r=>r.id===id);if(row)Object.assign(row,{status,detail});};
  const check = async () => {state.checked=false;state.checks.forEach(r=>Object.assign(r,{status:'PENDING',detail:'尚未检测'}));const result=await checker(root,{onProgress:progress});const saved=await modeReader(root);state.mode=saved.mode||'local';if(saved.lan)state.lan={...state.lan,status:'CONFIGURED',mode:'lan',config:saved.lan};Object.assign(state,{source:result.source||null,checked:true,configured:result.configured,owned:result.owned,dataRoot:result.dataRoot,url:result.owned?(result.origin||`http://127.0.0.1:${result.ports[0]}/`):null,status:result.owned?'原实例已运行':result.configured?'可以启动':'检测通过，请配置数据目录与管理员'});return result;};
  const job = task => {state.busy=true;state.error=null;Promise.resolve().then(task).catch(e=>{state.error=safeError(e);state.status='操作未完成';for(const row of state.checks)if(row.status==='RUNNING')row.status='FAIL';}).finally(()=>{state.busy=false;});};
  const server=createServer(async(req,res)=>{
    const nonce=randomBytes(18).toString('base64');
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');res.setHeader('Content-Security-Policy',`default-src 'self'; script-src 'self'; style-src 'self' 'nonce-${nonce}'; style-src-attr 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; form-action 'none'; base-uri 'none'`);
    const json=(code,value)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value));};
    try {
      if(req.headers.host!==new URL(origin).host || !['127.0.0.1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)){json(403,{error:'Host 或监听边界不匹配。'});return;}
      if(req.method==='GET' && ['/','/center.js','/center.css','/center.js.LEGAL.txt'].includes(req.url)) {
        const name=req.url.slice(1);let content;
        if(req.url==='/')content=Buffer.from((await readFile(new URL('competition-center.html',import.meta.url),'utf8')).replace('__UED_CSP_NONCE__',nonce));
        else {try{content=await readFile(new URL('center/'+name,import.meta.url));}catch(e){if(e.code!=='ENOENT')throw e;content=await readFile(new URL('../delivery/competition/center/'+name,import.meta.url));}}
        res.writeHead(200,{'Content-Type':req.url==='/'?'text/html; charset=utf-8':req.url.endsWith('.js')?'text/javascript; charset=utf-8':req.url.endsWith('.css')?'text/css; charset=utf-8':'text/plain; charset=utf-8'});res.end(content);return;
      }
      if(!acceptsCenterRequest(req,origin,token,req.method!=='GET')){json(403,{error:'需要本机启动入口的独立授权；Origin/CSRF 校验失败。'});return;}
      if(req.method==='GET' && req.url==='/api/state'){json(200,{...state,instance,platform:`${process.platform}-${process.arch}`,packageRoot:root});return;}
      if(req.method!=='POST' || req.url!=='/api/action'){json(404,{error:'没有此操作。'});return;}
      const input=await body(req);
      if(state.busy){json(409,{error:'本实例已有操作正在执行，请等待。'});return;}
      if(input.action==='exit') {json(200,{message:'仅退出启动中心，Hub 保持原状态。'});server.close();return;}
      const actions={
        check:check,
        choose:async()=>{state.selection=await folderPicker();},
        initialize:async()=>{
          if(!state.checked || state.configured || input.confirmed!==true || input.password!==input.confirmPassword || typeof input.dataRoot!=='string' || !path.isAbsolute(input.dataRoot)) throw Error('请先通过检测，明确确认一个全新的外置数据目录，并两次输入一致的管理员密码。');
          state.checked=false;state.status='正在准备全新外置数据及管理员；不安装依赖';
          try{await initializer(root,{dataRoot:path.resolve(input.dataRoot),username:input.username,password:input.password});}finally{input.password='';input.confirmPassword='';}
          await check();
        },
        attach:async()=>{if(!state.checked || state.configured || typeof input.dataRoot!=='string'||!path.isAbsolute(input.dataRoot))throw Error('请先检测并选择原安装数据根。');state.checked=false;await attacher(root,path.resolve(input.dataRoot));await check();},
        'inspect-lan':async()=>{if(!lanSupported)throw Error('此 Mac 演示保留 3047 本机模式；局域网 HTTPS 配置用于 Windows 完整包。');if(!state.checked||!state.configured)throw Error('请先配置本安装数据目录。');state.lan=await lanInspector(root);},
        'configure-lan':async()=>{if(!lanSupported)throw Error('此 Mac 演示不修改 HTTPS、证书或防火墙配置。');if(!state.checked||!state.configured||state.owned)throw Error('请先配置数据目录，并受控停止本安装后再设置 HTTPS。');state.lan=await lanConfigurer(root,input);if(state.lan.status==='CONFIGURED')state.mode='lan';},
        start:async()=>{if(input.mode==='lan'&&!lanSupported)throw Error('此 Mac 演示只允许原 3047 本机模式。');if(!['local','lan'].includes(input.mode))throw Error('请选择支持的运行模式。');if(input.mode==='lan'&&state.lan.status!=='CONFIGURED')throw Error('LAN 尚未配置并验证 HTTPS/证书/防火墙。');if(!state.checked || !state.configured)throw Error('请先完成预检与管理员/数据目录配置。');state.status='正在通过原 Supervisor 启动 Hub / DSH / Gateway / Proxy / GenUI';const result=await runner('Start',root,{open:false,mode:input.mode});state.url=result.url;state.mode=input.mode;state.owned=true;state.status=result.runtime==='configuration_required'?'服务已就绪，请在原 DSH 后台配置模型 Key':'服务已就绪';},
        stop:async()=>{if(!state.checked||!state.configured)throw Error('请先确认本安装配置。');state.status='正在鉴权并受控停止本安装';await runner('Stop',root,{open:false});state.owned=false;state.url=null;state.status='本安装已受控停止';}
      };
      if(!Object.hasOwn(actions,input.action)){json(400,{error:'不支持此操作，不提供任意命令执行。'});return;}
      job(actions[input.action]);json(202,{accepted:true});
    }catch(e){json(400,{error:safeError(e)});}
  });
  let origin;
  try {await new Promise((resolve,reject)=>server.once('error',reject).listen(0,'127.0.0.1',resolve));origin=`http://127.0.0.1:${server.address().port}`;Object.assign(record,{phase:'ready',origin});await writeFile(recordFile,JSON.stringify(record),{mode:0o600});}
  catch(e){await unlink(recordFile);throw e;}
  server.on('close',()=>{readJson(recordFile).then(r=>r.instance===instance?unlink(recordFile):null).catch(()=>{});});
  if(autoCheck)job(async()=>{await check();const saved=await modeReader(root);if(saved.mode==='lan'&&saved.autoStart===true&&state.configured){state.status='正在复用已验证的局域网 HTTPS 配置';const result=await runner('Start',root,{open:false,mode:'lan'});state.url=result.url;state.mode='lan';state.owned=true;state.status=result.runtime==='configuration_required'?'HTTPS 服务已就绪，请由管理员配置模型 Key':'HTTPS 服务已就绪';}});
  return {server,origin,token,instance,recordFile,state};
}
export async function openCenter(packageRoot,{open:show=true,serveScript=fileURLToPath(import.meta.url)}={}) {
  const root=await realpath(packageRoot), file=await privateControl(root);
  for(let attempt=0;attempt<60;attempt++) {
    let record;
    try{record=await readJson(file);}catch(e){if(e.code!=='ENOENT' && !(e instanceof SyntaxError))throw e;}
    if(record) {
      if(record.schemaVersion!==1 || record.packageRoot!==root || !/^[a-f0-9]{64}$/.test(record.token))throw Error('控制记录身份不符，未启动第二个实例。');
      if(live(record.pid)) {
        if(record.phase!=='ready'){await sleep(100);continue;}
        const u=new URL(record.origin);if(u.protocol!=='http:'||u.hostname!=='127.0.0.1'||u.pathname!=='/'||!u.port)throw Error('控制地址必须为回环 HTTP。');
        const response=await fetch(record.origin+'/api/state',{headers:{Authorization:`Bearer ${record.token}`},signal:AbortSignal.timeout(2500)});
        if(!response.ok || (await response.json()).instance!==record.instance)throw Error('运行控制端身份不匹配；未控制或清理其他进程。');
        if(show)openBrowser(record.origin+'/#'+record.token);
        return {reused:true,origin:record.origin,pid:record.pid};
      }
      await unlink(file);
    }
    if(!record && attempt) {await sleep(100);continue;}
    const child=spawn(toolPaths(root).node,[serveScript,'Serve',root],{detached:true,stdio:'ignore',windowsHide:true});child.on('error',()=>{});child.unref();await sleep(100);
  }
  throw Error('启动中心尚未就绪，请核对包内 Node 和目录权限；未启动 Hub。');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try{const [action,root]=process.argv.slice(2);if(action==='Serve')await startCenter(root);else if(action==='Open'){await openCenter(root);console.log('启动与环境预检中心已打开。');}else throw Error('Use Open or Serve <package-root>.');}
  catch(e){console.error(safeError(e));process.exitCode=1;}
}
