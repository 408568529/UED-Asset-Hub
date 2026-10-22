// Thin adapter for the explicitly approved persistent Mac demo. Never initializes data.
import {createHash} from 'node:crypto';
import {spawn,execFileSync} from 'node:child_process';
import {lstat,readFile,writeFile,unlink,realpath,open} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {startCenter,openCenter} from './competition-center.mjs';
import {portIsListening,toolPaths,readJson} from './competition-check.mjs';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const alive=pid=>{try{process.kill(pid,0);return true;}catch(e){if(e.code==='ESRCH')return false;throw e;}};
const sha=b=>createHash('sha256').update(b).digest('hex');
async function regular(file,secret=false){const s=await lstat(file);if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1||s.uid!==process.getuid()||await realpath(file)!==file||(secret&&(s.mode&0o077)))throw Error('Mac 演示配置或版本文件的归属/权限不符合要求。');return s;}
async function configuration(root){
 if(process.platform!=='darwin'||process.arch!=='arm64')throw Error('此适配器只用于已批准的 Mac Apple Silicon 3047 演示。');
 await regular(path.join(root,'mac-demo.json'));const spec=await readJson(path.join(root,'mac-demo.json'));
 if(spec.schemaVersion!==1||!path.isAbsolute(spec.runtimeRoot)||await realpath(spec.runtimeRoot)!==spec.runtimeRoot||spec.configPath!==path.join(spec.runtimeRoot,'config/host-recovered-3047.json')||spec.loginPath!==path.join(spec.runtimeRoot,'config/visual-login.json'))throw Error('Mac 演示路径身份不符；不会迁移或初始化。');
 await regular(spec.configPath);await regular(spec.loginPath,true);
 const config=await readJson(spec.configPath);
 if(config.UED_LOCAL_DEMO_MODE!=='true'||config.UED_LOCAL_DEMO_ROOT!==spec.runtimeRoot||config.PUBLIC_ORIGIN!=='http://127.0.0.1:3047'||config.HOST_BIND_HOST!=='127.0.0.1'||config.HOST_PORT!=='3047'||config.DATA_DIR!==path.join(spec.runtimeRoot,'hub-data'))throw Error('原演示本机安全边界或数据路径不符。');
 for(const key of ['ADMIN_PASSWORD','ADMIN_SESSION_SECRET','AGENT_GATEWAY_TOKEN','DEEPSEEK_API_KEY'])if(key in config)throw Error('非敏感路径配置中含受保护字段。');
 for(const key of ['DATA_DIR','TRAINING_MEDIA_DIR','HALDUR_DESIGN_SKILL_ROOT','AGENT_RUNTIME_DIR','ASSET_HUB_RUNTIME_DIR','HALDUR_DESIGN_SKILL_RUNTIME_ROOT','DSH_HOME','DSH_SOURCE_DIR','DSH_RUNTIME_SOURCE_DIR']){if(!path.isAbsolute(config[key])||await realpath(config[key])!==config[key]||!(await lstat(config[key])).isDirectory())throw Error('原演示必要目录缺失或被重定向；不会创建空目录。');}
 return {spec,config};
}
export async function checkMacDemo(root,{onProgress=()=>{}}={}){
 const {spec,config}=await configuration(root);onProgress('integrity','RUNNING','核对独立 V2.5 程序版本及文件摘要。');
 const manifest=await readJson(path.join(root,'mac-demo-version.json'));
 if(manifest.schemaVersion!==1||!manifest.source?.match(/^[a-f0-9]{40}$/)||!Array.isArray(manifest.files)||!manifest.files.length)throw Error('Mac 演示版本身份缺失。');
 const seen=new Set();for(const f of manifest.files){if(!f.path||path.isAbsolute(f.path)||f.path.split('/').some(p=>!p||p==='.'||p==='..')||seen.has(f.path))throw Error('版本清单路径非法。');seen.add(f.path);const file=path.join(root,f.path);await regular(file);if(sha(await readFile(file))!==f.sha256)throw Error('版本文件哈希不符：'+f.path);}
 for(const name of ['app/server.js','app/.next/BUILD_ID','app/scripts/start-host.mjs','tools/mac-demo-center.mjs','tools/node/bin/node'])if(!seen.has(name))throw Error('版本清单缺少必要入口。');
 onProgress('integrity','PASS','V2.5 '+manifest.source.slice(0,12)+' / '+manifest.buildId);onProgress('system','PASS',process.platform+'-'+process.arch);
 if(process.versions.node!=='22.23.2')throw Error('请使用当前版本内的固定 Node 22.23.2。');onProgress('node','PASS','Node '+process.versions.node);
 const git=execFileSync(toolPaths(root).git,['--version'],{encoding:'utf8'}).trim();
 const validation=await import(pathToFileURL(path.join(root,'app/agent-integration/scripts/dsh-source-validator.mjs')));const expected=await readJson(path.join(root,'app/agent-integration/dsh/version.json'));
 await validation.validateDshSource(config.DSH_SOURCE_DIR,expected,{readOnly:true});
 await validation.validateDshRuntimeSource(config.DSH_SOURCE_DIR,config.DSH_RUNTIME_SOURCE_DIR);
 onProgress('git','PASS',git+'；原 DSH 来源校验保留');onProgress('data','PASS','沿用 '+config.DATA_DIR+'；只检查凭据文件权限，不读取其内容。');
 const ports=['HOST_PORT','HOST_INTERNAL_PORT','DSH_PORT','AGENT_PROXY_PORT','KNOWLEDGE_GATEWAY_MCP_PORT'].map(k=>Number(config[k]));
 let record;try{record=await readJson(path.join(root,'.launch-center/demo-supervisor.json'));}catch(e){if(e.code!=='ENOENT')throw e;}
 const occupied=await Promise.all(ports.map(portIsListening));let owned=false;
 if(record&&alive(record.pid)){const lock=await readJson(path.join(config.AGENT_RUNTIME_DIR,'supervisor/supervisor-lock.json'));if(record.programRoot!==root||lock.pid!==record.pid||record.instanceId!==lock.instanceId)throw Error('运行实例身份不匹配；未控制任何进程。');owned=true;}
 if(occupied.some(Boolean)&&!owned)throw Error('3047 或关联端口存在未受本版本控制的实例；先核对旧实例归属，禁止重复启动。');
 onProgress('ports','PASS',owned?'当前版本 Supervisor 正在运行':ports.join(' / ')+' 空闲');
 return {root,configured:true,owned,dataRoot:spec.runtimeRoot,ports,source:manifest.source};
}
export async function runMacDemo(action,root,options={}){
 if(options.mode&&options.mode!=='local')throw Error('此 Mac 演示只允许原 3047 本机模式。');
 const checked=await checkMacDemo(root),{spec,config}=await configuration(root),stateFile=path.join(root,'.launch-center/demo-supervisor.json');
 const lockFile=path.join(root,'.launch-center/demo-operation.lock'),handle=await open(lockFile,'wx',0o600);
 try{
  const login=await readJson(spec.loginPath),env={};for(const k of ['HOME','USER','LOGNAME','LANG','LC_ALL','TMPDIR'])if(process.env[k])env[k]=process.env[k];
  Object.assign(env,config,{ADMIN_USERNAME:login.ADMIN_USERNAME,ADMIN_PASSWORD:login.ADMIN_PASSWORD,ADMIN_SESSION_SECRET:login.ADMIN_SESSION_SECRET,ADMIN_SESSION_SECURE:login.ADMIN_SESSION_SECURE,PATH:path.dirname(toolPaths(root).node)+':'+path.dirname(toolPaths(root).git)+':/usr/bin:/bin:/usr/sbin:/sbin',NODE_ENV:'production',UED_LOCAL_TEST_MODE:'false',UED_STAGING_SHUTDOWN_ENABLED:'true',NEXT_TELEMETRY_DISABLED:'1'});
  const {randomBytes}=await import('node:crypto');env.AGENT_GATEWAY_TOKEN=randomBytes(32).toString('base64url');
  const security=await import(pathToFileURL(path.join(root,'app/scripts/host-security-config.mjs')));security.resolveHostSecurityConfig(env);
  let record;try{record=await readJson(stateFile);}catch(e){if(e.code!=='ENOENT')throw e;}
  if(action==='Start'&&!checked.owned){
   const log=await open(path.join(root,'.launch-center/supervisor.log'),'a',0o600);
   const child=spawn(toolPaths(root).node,[path.join(root,'app/scripts/start-host.mjs')],{cwd:path.join(root,'app'),env,detached:true,stdio:['ignore',log.fd,log.fd]});child.on('error',()=>{});child.unref();await log.close();if(!child.pid)throw Error('Supervisor 未启动。');
   record={programRoot:root,pid:child.pid,instanceId:null};await writeFile(stateFile,JSON.stringify(record),{mode:0o600});
  }
  if(!record||!alive(record.pid))throw Error('本版本 Supervisor 不存在；保留诊断，未强制清理。');
  const origin=config.PUBLIC_ORIGIN,request=(url,opts={})=>fetch(origin+url,{...opts,headers:{Origin:origin,...opts.headers},signal:AbortSignal.timeout(35000),redirect:'error'});
  let cookie,runtime;const deadline=Date.now()+150000;
  while(Date.now()<deadline){
   if(!alive(record.pid))throw Error('Supervisor 启动失败；请检查本版本私有诊断日志，旧程序和数据仍保留。');
   try{const lock=await readJson(path.join(config.AGENT_RUNTIME_DIR,'supervisor/supervisor-lock.json'));if(lock.pid!==record.pid)throw Error('Supervisor PID 身份不匹配。');if(record.instanceId&&record.instanceId!==lock.instanceId)throw Error('Supervisor 实例身份不匹配。');record.instanceId=lock.instanceId;await writeFile(stateFile,JSON.stringify(record),{mode:0o600});
    if(!cookie){const r=await request('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:login.ADMIN_USERNAME,password:login.ADMIN_PASSWORD})});if(!r.ok)throw Error('原管理员鉴权未通过。');const raw=r.headers.get('set-cookie');if(!raw||!/httponly/i.test(raw)||!/samesite=lax/i.test(raw)||/;\s*secure(?:;|$)/i.test(raw))throw Error('Cookie 安全属性不符。');cookie=raw.split(';')[0];}
    const r=await request('/api/runtime/status',{headers:{Cookie:cookie}});if(!r.ok)throw Error('Runtime 状态未就绪。');runtime=(await r.json()).runtime;if(action==='Stop'||runtime?.status==='ready'||runtime?.reasonCode==='credential_missing')break;
   }catch{}await sleep(500);
  }
  if(!cookie||!runtime||(action==='Start'&&runtime.status!=='ready'&&runtime.reasonCode!=='credential_missing'))throw Error('原演示未达到就绪状态；保留诊断和数据。');
  if(action==='Start')return {result:'PASS',url:origin+'/',runtime:runtime.status};
  if(action!=='Stop')throw Error('不支持此操作。');
  const r=await request('/api/staging-shutdown',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:'{}'});if(!r.ok)throw Error('原鉴权停止接口拒绝操作。');
  const end=Date.now()+100000;while(alive(record.pid)&&Date.now()<end)await sleep(300);
  if(alive(record.pid)||(await Promise.all(checked.ports.map(portIsListening))).some(Boolean))throw Error('停止尚未收敛；不强杀、不重启。');await unlink(stateFile);return {result:'PASS',stopped:true};
 }finally{await handle.close();await unlink(lockFile);}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const [action,root]=process.argv.slice(2);process.env.PATH=path.dirname(toolPaths(root).node)+':'+path.dirname(toolPaths(root).git)+':/usr/bin:/bin:/usr/sbin:/sbin';process.env.GIT_CONFIG_NOSYSTEM='1';process.env.GIT_CONFIG_GLOBAL='/dev/null';process.env.GIT_OPTIONAL_LOCKS='0';if(action==='Check')console.log(JSON.stringify(await checkMacDemo(root)));else if(action==='Stop')console.log(JSON.stringify(await runMacDemo('Stop',root)));else if(action==='Open')await openCenter(root,{serveScript:fileURLToPath(import.meta.url)});else if(action==='Serve')await startCenter(root,{checker:checkMacDemo,runner:runMacDemo,lanSupported:false,modeReader:async()=>({mode:'local'}),initializer:()=>{throw Error('原演示数据禁止初始化。');},attacher:()=>{throw Error('原演示数据禁止迁移。');}});else throw Error('Use Open or Serve <version-root>.');}catch{console.error('Mac 3047 启动中心未完成操作；请检查原目录权限、版本身份和端口归属。未重置数据。');process.exitCode=1;}
}
