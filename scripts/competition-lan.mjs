// Non-secret LAN setup adapter. Uses the existing Supervisor and HTTPS reverse-proxy topology.
import { networkInterfaces } from 'node:os';
import { createHash, createPrivateKey, X509Certificate } from 'node:crypto';
import { createSecureContext, checkServerIdentity, rootCertificates, createServer as tlsServer, connect as tlsConnect } from 'node:tls';
import { request as httpsRequest } from 'node:https';
import { createServer, isIP } from 'node:net';
import { lookup } from 'node:dns/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { lstat, readFile, realpath, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJson } from './competition-check.mjs';
import { assertNoLinkedAncestors } from './competition-first-run.mjs';
const exec = promisify(execFile);
export const lanRuleName = (root, port) => `UED V25 LAN ${createHash('sha256').update(root.toLowerCase()).digest('hex').slice(0,12)} HTTPS ${port}`;
export function privateIPv4(ip) { const p=ip.split('.').map(Number); return isIP(ip)===4 && (p[0]===10 || p[0]===172&&p[1]>=16&&p[1]<=31 || p[0]===192&&p[1]===168); }
export function lanAddresses() { return [...new Set(Object.values(networkInterfaces()).flat().filter(a=>a&&!a.internal&&a.family==='IPv4'&&privateIPv4(a.address)).map(a=>a.address))]; }
async function location(root) {
  root=await realpath(root);const locator=await readJson(path.join(root,'installation.json'));const configPath=locator.configPath;
  if(typeof configPath!=='string'||!path.isAbsolute(configPath)||path.basename(configPath)!=='runtime.json'||path.basename(path.dirname(configPath))!=='config')throw Error('请先配置本安装的外置数据目录。');
  await assertNoLinkedAncestors(configPath);const marker=await readJson(path.join(path.dirname(configPath),'installation.json'));
  if(marker.packageRoot!==root||marker.configPath!==configPath)throw Error('数据目录不属于当前安装；不会沿用其他实例的 HTTPS 配置。');
  return {root,configPath,dataRoot:path.dirname(path.dirname(configPath)),file:path.join(path.dirname(configPath),'launch-mode.json')};
}
export async function readLaunchMode(root) {
  let l;
  try { l=await location(root); } catch(e) { if(e.code==='ENOENT'&&e.path===path.join(root,'installation.json'))return {mode:'local'};throw e; }
  try {await assertNoLinkedAncestors(l.file);const v=await readJson(l.file);if(v.schemaVersion!==1||!['local','lan'].includes(v.mode)||v.packageRoot!==l.root)throw Error('运行模式记录身份不匹配，请检查本安装配置。');return v;}
  catch(e){if(e.code==='ENOENT'&&e.path===l.file)return {mode:'local'};throw e;}
}
export async function writeLaunchMode(root, value) {
  const l=await location(root);await assertNoLinkedAncestors(l.file);const tmp=l.file+'.tmp';await writeFile(tmp,JSON.stringify({schemaVersion:1,packageRoot:l.root,...value},null,2)+'\n',{flag:'wx',mode:0o600});await rename(tmp,l.file);
}
export async function validateLanCertificate(root, input) {
  const l=await location(root),port=Number(input.port),host=String(input.host||'').trim().toLowerCase(),bindHost=String(input.bindHost||'');
  if(!privateIPv4(bindHost)||!Number.isInteger(port)||port<1024||port>65535)throw Error('请选择当前主机的内网 IPv4 和 1024–65535 范围的独立 HTTPS 端口。');
  if(!host||!/^([a-z0-9-]+\.)*[a-z0-9-]+$/.test(host)||host==='localhost'||isIP(host)&&!privateIPv4(host))throw Error('访问地址必须为内网 IP 或不含协议/路径的主机域名。');
  const readOwned=async(file,secret=false)=>{
    if(typeof file!=='string'||!path.isAbsolute(file))throw Error('请填写当前实例数据目录内的证书/密钥绝对路径。');
    const rel=path.relative(l.dataRoot,file);if(!rel||rel.startsWith('..')||path.isAbsolute(rel))throw Error('证书与密钥必须由管理员放在当前实例数据目录内；不读取其他实例的私钥。');
    await assertNoLinkedAncestors(file);const s=await lstat(file);if(!s.isFile()||s.nlink!==1||s.size>1024*1024)throw Error('证书文件无效、过大或被重定向。');
    if(secret&&process.platform!=='win32'&&(s.uid!==process.getuid()||(s.mode&0o077)))throw Error('私钥必须由当前账户持有且仅当前账户可读。');
    return readFile(file);
  };
  const cert=await readOwned(input.certPath),key=await readOwned(input.keyPath,true),ca=input.caPath?await readOwned(input.caPath):undefined;
  let leaf;
  try {leaf=new X509Certificate(cert);if(!leaf.checkPrivateKey(createPrivateKey(key)))throw Error();createSecureContext({cert,key,ca,minVersion:'TLSv1.2'});}catch{throw Error('PEM 证书与私钥不匹配，或密钥格式不受支持；请使用当前实例的受保护服务私钥。');}
  if(Date.now()<Date.parse(leaf.validFrom)||Date.now()>=Date.parse(leaf.validTo))throw Error('证书尚未生效或已过期。');
  if(!leaf.subjectAltName||(isIP(host)?!leaf.checkIP(host):!leaf.checkHost(host,{subject:'never'})))throw Error('证书 SAN 与访问 IP/域名不匹配；请重新申请包含该地址的服务器证书。');
  if(leaf.keyUsage&&!leaf.keyUsage.includes('1.3.6.1.5.5.7.3.1'))throw Error('证书不允许服务器身份验证。');
  if(ca)try{new X509Certificate(ca);}catch{throw Error('信任链文件不是有效 PEM CA 证书。');}
  const probe=tlsServer({cert,key,minVersion:'TLSv1.2'},socket=>socket.end());const sockets=new Set();
  probe.on('connection',s=>{sockets.add(s);s.once('close',()=>sockets.delete(s));});probe.on('tlsClientError',()=>{});
  try {
    await new Promise((resolve,reject)=>probe.once('error',reject).listen(0,'127.0.0.1',resolve));
    await new Promise((resolve,reject)=>{const client=tlsConnect({host:'127.0.0.1',port:probe.address().port,servername:isIP(host)?undefined:host,ca:ca||rootCertificates,rejectUnauthorized:true,checkServerIdentity:(_h,c)=>checkServerIdentity(host,c)},()=>{client.destroy();resolve();});client.setTimeout(5000,()=>client.destroy(Error('TLS timeout')));client.on('error',()=>reject(Error('证书信任链验证失败，请提供完整服务器证书链和匹配的 CA 公共证书；不会跳过校验。')));});
  } finally {for(const socket of sockets)socket.destroy();await new Promise(resolve=>probe.close(resolve));}
  return {mode:'lan',host,bindHost,port,origin:`https://${host}:${port}`,certPath:input.certPath,keyPath:input.keyPath,caPath:input.caPath||'',fingerprint:leaf.fingerprint256,validTo:leaf.validTo};
}
export async function availableLanPort(bindHost, internalPorts=[]) {
  for(const port of [4443,4453,4463,4473,4483,4493]){if(internalPorts.map(Number).includes(port))continue;try{await probeLanPort(bindHost,port);return port;}catch{}}
  throw Error('候选 HTTPS 端口均被占用；请指定其他独立端口，不会停止已有服务。');
}
export async function probeLanPort(bindHost,port) {await new Promise((resolve,reject)=>{const s=createServer();s.once('error',()=>reject(Error(`HTTPS 地址 ${bindHost}:${port} 已占用或无法绑定。`)));s.listen(port,bindHost,()=>s.close(resolve));});}
export async function windowsLanCheck(root, config, {apply=false}={}) {
  if(process.platform!=='win32')throw Error('局域网配置仅供 Windows 完整包使用；本机 HTTP 模式保持不变。');
  const args=['-NoProfile','-File',fileURLToPath(new URL('./competition-lan-windows.ps1',import.meta.url)),'-Action',apply?'Apply':'Inspect','-BindAddress',config.bindHost,'-Port',String(config.port),'-RuleName',lanRuleName(root,config.port),'-Program',path.join(root,'tools/node/node.exe')];
  if(config.keyPath)args.push('-KeyPath',config.keyPath);
  const result=await exec('powershell.exe',args,{encoding:'utf8',timeout:30000,windowsHide:true,maxBuffer:65536}).catch(error=>{const detail=String(error.stderr||'');if(detail.includes('Public or unknown'))throw Error('当前网络为 Public 或未知网络，禁止共享；请在可信的 Domain/Private 局域网重试，不会更改网络类型。');if(/Private key/.test(detail))throw Error('当前实例私钥所有权/ACL 不合规；仅允许当前账户、SYSTEM 和 Administrators，且不得为链接。');if(detail.includes('differs from'))throw Error('同名防火墙规则与本安装计划不一致；不会覆盖，请由管理员核对。');throw Error(apply?'防火墙配置未完成。需要管理员权限，请先退出启动中心（不停止 Hub），再右键以管理员身份运行本安装的 02 启动入口并重新确认；不会修改其他规则。':'网络/私钥权限检查失败，请检查当前账户权限、网络配置及私钥 ACL。');});
  return JSON.parse(result.stdout.replace(/^\uFEFF/,''));
}
export async function inspectCompetitionLan(root) {
  const saved=await readLaunchMode(root);const addresses=lanAddresses();if(!addresses.length)throw Error('未检测到本机可用的内网 IPv4，请连接可信局域网后重新检测。');let config=saved.lan||null;
  if(!config){const bindHost=addresses[0];config=bindHost?{host:bindHost,bindHost,port:await availableLanPort(bindHost)}:null;}
  return {status:saved.lan?'CONFIGURED':'NOT_CONFIGURED',mode:saved.mode,addresses,config,message:'使用本安装的 PEM 证书及私钥；私有 CA 仅分发公共证书给客户端，不分发私钥。客户端必须信任签发 CA，启动器不会绕过 TLS 校验或自动导入根证书。'};
}
export async function configureCompetitionLan(root,input) {
  const lan=await validateLanCertificate(root,input);const addresses=lanAddresses();if(!addresses.includes(lan.bindHost))throw Error('监听 IP 不属于当前主机；请重新检测网络地址。');
  if(!isIP(lan.host)){const resolved=await lookup(lan.host,{all:true,family:4});if(!resolved.some(a=>a.address===lan.bindHost))throw Error('域名当前未解析到选中的内网地址，请先配置局域网 DNS。');}
  const l=await location(root),runtime=await readJson(l.configPath);if(Object.keys(runtime).some(k=>/^(HOST_PORT|HOST_INTERNAL_PORT|DSH_PORT|AGENT_PROXY_PORT|KNOWLEDGE_GATEWAY_MCP_PORT)$/.test(k)&&Number(runtime[k])===lan.port))throw Error('HTTPS 端口不能与本安装内部端口相同。');
  await probeLanPort(lan.bindHost,lan.port);
  let firewall=await windowsLanCheck(root,lan);
  if(!firewall.ready&&input.firewallConfirmed===true){if(input.clientsTrustConfirmed!==true)throw Error('请先确认客户端证书信任要求，再授权添加防火墙规则。');firewall=await windowsLanCheck(root,lan,{apply:true});}
  if(!firewall.ready)return {status:'FIREWALL_REQUIRED',addresses,config:lan,firewall,message:'证书校验通过。尚无本安装专属防火墙规则；确认后仅允许 Domain/Private 网络的 LocalSubnet 访问此 IP/端口。Public 网络不开放。'};
  if(input.clientsTrustConfirmed!==true)throw Error('请确认客户端信任签发 CA 并使用上述匹配的 IP/域名；不会自动导入或信任证书。');
  await writeLaunchMode(root,{mode:'lan',lan});return {status:'CONFIGURED',mode:'lan',addresses,config:lan,firewall,message:'地址、证书与当前实例防火墙已验证。客户端仍须信任签发 CA；跨电脑连接在启动后验证。'};
}
export async function validateSavedLan(root, saved) {
  if(saved?.mode!=='lan'||!saved.lan)throw Error('尚未完成局域网 HTTPS 首次配置。');
  const validated=await validateLanCertificate(root,saved.lan);if(validated.fingerprint!==saved.lan.fingerprint)throw Error('证书已更换，请在启动中心重新验证并确认。');
  if(!lanAddresses().includes(validated.bindHost))throw Error('已保存的监听 IP 不再属于本机，请重新配置。');
  if(!isIP(validated.host)&&!(await lookup(validated.host,{all:true,family:4})).some(a=>a.address===validated.bindHost))throw Error('已保存的域名不再解析到本机地址，请重新检查 DNS。');
  const firewall=await windowsLanCheck(root,validated);if(!firewall.ready)throw Error('已保存的防火墙或网络配置不再满足要求，请重新检查。');return validated;
}
export async function lanRequest(lan, route, init={}) {
  const ca=lan.caPath?await readFile(lan.caPath):rootCertificates;
  return new Promise((resolve,reject)=>{
    const req=httpsRequest({hostname:lan.bindHost,port:lan.port,path:route,servername:isIP(lan.host)?undefined:lan.host,ca,rejectUnauthorized:true,checkServerIdentity:(_h,cert)=>checkServerIdentity(lan.host,cert),method:init.method||'GET',headers:{Host:new URL(lan.origin).host,Origin:lan.origin,...init.headers},timeout:route==='/api/runtime/status'?35000:5000},res=>{const chunks=[];res.on('data',b=>chunks.push(b));res.on('end',()=>resolve({ok:res.statusCode>=200&&res.statusCode<300,status:res.statusCode,headers:{get:key=>{const v=res.headers[key.toLowerCase()];return Array.isArray(v)?v.join(', '):v??null;}},json:async()=>JSON.parse(Buffer.concat(chunks).toString())}));});
    req.on('error',()=>reject(Error('HTTPS 验证失败：请检查证书信任链、地址 SAN、端口和网络；不会降级为 HTTP。')));req.on('timeout',()=>req.destroy());req.end(init.body);
  });
}
