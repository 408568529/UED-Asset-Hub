// Adapted from the existing Windows staging HTTPS edge: HTTPS -> loopback Supervisor edge.
import https from 'node:https';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url),httpProxy=require('http-proxy');
export async function createHostHttpsEdge(config,upstreamPort) {
  const proxy=httpProxy.createProxyServer({target:`http://127.0.0.1:${upstreamPort}`,ws:true,xfwd:true});const sockets=new Set();const host=new URL(config.origin).host;
  const accepted=req=>req.headers.host===host&&(!req.headers.origin||req.headers.origin===config.origin||req.headers.origin==='null'&&['GET','HEAD'].includes(req.method));
  const prepare=req=>{for(const key of Object.keys(req.headers))if(key.startsWith('x-forwarded-')||key==='forwarded')delete req.headers[key];};
  const forwarded=proxyReq=>{proxyReq.setHeader('X-Forwarded-Proto','https');proxyReq.setHeader('X-Forwarded-Host',host);proxyReq.setHeader('X-Forwarded-Port',String(config.port));};
  proxy.on('proxyReq',forwarded);proxy.on('proxyReqWs',forwarded);
  proxy.on('error',(_error,_req,res)=>{if(res?.writeHead&&!res.headersSent)res.writeHead(502);res?.end?.('HTTPS upstream unavailable.');});
  const server=https.createServer({cert:await readFile(config.certPath),key:await readFile(config.keyPath),minVersion:'TLSv1.2'},(req,res)=>{if(!accepted(req)){res.writeHead(req.headers.host===host?403:421);res.end('Forbidden');return;}prepare(req);proxy.web(req,res);});
  server.on('connection',s=>{sockets.add(s);s.once('close',()=>sockets.delete(s));});
  server.on('upgrade',(req,socket,head)=>{if(!accepted(req)){socket.destroy();return;}prepare(req);proxy.ws(req,socket,head);});
  return {start:()=>new Promise((resolve,reject)=>server.once('error',reject).listen(config.port,config.bindHost,resolve)),stop:()=>new Promise(resolve=>{server.close(resolve);for(const s of sockets)s.destroy();proxy.close();})};
}
