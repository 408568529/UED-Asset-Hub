import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
export const name = 'html-artifacts-client';
export const inject = ['webServer','clientModules'];
const id = '@ued/html-artifacts-client', url = '/plugins/ued-html-artifacts/client.js';
export function apply(ctx) {
  const bytes = readFileSync(fileURLToPath(new URL('./client.js',import.meta.url)));
  const rev = createHash('sha256').update(bytes).digest('hex').slice(0,12);
  ctx.effect(()=>ctx.webServer.register({kind:'exact',path:url,handler(req,res){if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}res.writeHead(200,{'content-type':'text/javascript; charset=utf-8','cache-control':'no-store','content-length':bytes.length});res.end(req.method==='HEAD'?undefined:bytes);}}),'HTML artifact client');
  ctx.on('webserver/index-inject',table=>{const boot=table.find(row=>row.kind==='global'&&row.name==='__DSH_BOOT__');if(!boot||boot.value.entries.some(row=>row.id===id))return;const entries=[...boot.value.entries,{id,url,rev,inject:['slots'],external:['react'],immediately:false}];boot.value={...boot.value,entries,rev:createHash('sha256').update(JSON.stringify(entries)).digest('hex').slice(0,12)};});
}
