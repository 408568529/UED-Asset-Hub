import path from 'node:path';
import { createRequire } from 'node:module';
const encode = path => path.split('/').map(encodeURIComponent).join('/');
const escape = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const common = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' };
const mime = { '.html':'text/html; charset=utf-8', '.htm':'text/html; charset=utf-8', '.mjs':'text/javascript; charset=utf-8', '.ico':'image/x-icon', '.avif':'image/avif', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.json':'application/json', '.txt':'text/plain; charset=utf-8', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp', '.gif':'image/gif', '.woff':'font/woff', '.woff2':'font/woff2', '.ttf':'font/ttf', '.otf':'font/otf' };
function json(res, status, data) { res.writeHead(status, { ...common, 'content-type':'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); }
async function input(req) {
  if (req.headers['content-type']?.split(';')[0] !== 'application/json') throw Error('需要 JSON 请求。');
  const parts = []; let total = 0;
  for await (const bytes of req) { total += bytes.length; if (total > 16 * 1024) throw Error('请求过大。'); parts.push(bytes); }
  return JSON.parse(Buffer.concat(parts).toString('utf8'));
}
function sameOrigin(req) {
  if (req.headers['sec-fetch-site'] !== 'same-origin' || typeof req.headers.origin !== 'string') return false;
  try { const url = new URL(req.headers.origin); return ['http:','https:'].includes(url.protocol) && url.origin === req.headers.origin && url.host === req.headers.host; } catch { return false; }
}
export function urls(manifest, grant) {
  const tail = `${encodeURIComponent(manifest.id)}/${encodeURIComponent(manifest.version)}/${grant}`;
  return { preview_url: `/html-artifacts/files/${tail}/${encode(manifest.entry)}${/list-page|列表页/.test(manifest.entry)?'#composition':''}`, app_url: `/html-artifacts/app/${tail}`, download_url: `/html-artifacts/download/${tail}` };
}
function wrapper(manifest, access) {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escape(manifest.title)}</title><style>html,body{height:100%;margin:0;background:#f5f5f5;font:14px system-ui}body{display:flex;flex-direction:column}header{display:flex;align-items:center;gap:16px;padding:10px 16px;background:white;border-bottom:1px solid #ddd}strong{flex:1}a,button{color:#1677ff;border:0;background:none;font:inherit;cursor:pointer}iframe{border:0;width:100%;flex:1;min-height:0}</style></head><body><header><strong>${escape(manifest.title)}</strong><button id="full">全屏查看</button><a href="${escape(access.download_url)}" download>下载完整成果</a></header><iframe title="HTML 成果预览" src="${escape(access.preview_url)}" sandbox="allow-scripts allow-downloads allow-modals allow-forms" allow="fullscreen *" referrerpolicy="no-referrer"></iframe><script>document.getElementById('full').onclick=()=>document.documentElement.requestFullscreen?.();</script></body></html>`;
}
export function createHtmlHttp({ store, resolveSession, publicOrigin, archiveModule }) {
  const origin = new URL(publicOrigin).origin;
  return async function handle(req, res) {
    try {
      const url = new URL(req.url, origin), parts = url.pathname.split('/').filter(Boolean);
      if (url.pathname === '/html-artifacts/host-control/access') {
        if (req.method !== 'POST' || !sameOrigin(req)) return json(res, 403, { error: '需要从当前 Harness 会话打开成果。' });
        const value = await input(req);
        if (Object.keys(value).some(key => !['artifact_id','version_id','session_id'].includes(key)) || typeof value.session_id !== 'string' || value.session_id.length > 512) return json(res, 400, { error: '成果访问参数无效。' });
        const agent = resolveSession(value.session_id);
        if (!agent || String(agent.id) !== value.session_id) return json(res, 403, { error: '会话尚未就绪，请重新打开会话。' });
        const version = await store.version(value.artifact_id, value.version_id, String(agent.id));
        return json(res, 200, { ...store.receipt(version.manifest), validation: await store.validation(version), ...urls(version.manifest, store.grant(version.manifest.id, version.manifest.version)) });
      }
      if (!['GET','HEAD'].includes(req.method) || parts.length < 5 || parts[0] !== 'html-artifacts' || !['files','app','download'].includes(parts[1])) return json(res, 404, { error:'成果地址不存在。' });
      const [, kind, id, versionId, grant, ...rest] = parts;
      if (!store.accepts(id, versionId, grant)) return json(res, 403, { error:'成果访问链接已失效，请从卡片重新打开。' });
      const version = await store.version(id, versionId);
      const access = urls(version.manifest, grant);
      if (kind === 'app' && !rest.length) {
        const html = Buffer.from(wrapper(version.manifest, access));
        res.writeHead(200, { ...common, 'content-type':'text/html; charset=utf-8', 'content-length':html.length, 'content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; frame-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'self'" }); res.end(req.method === 'HEAD' ? undefined : html); return;
      }
      if (kind === 'download' && !rest.length) {
        res.writeHead(200, { ...common, 'content-type':'application/zip', 'content-disposition':`attachment; filename="html-artifact-${id}.zip"` });
        if (req.method === 'HEAD') { res.end(); return; }
        const require = createRequire(import.meta.url), archive = require(archiveModule)('zip', { zlib: { level: 6 } });
        archive.on('error', () => res.destroy()); res.on('close', () => archive.abort()); archive.pipe(res);
        for (const file of version.manifest.files) archive.append(await store.bytes(version, file.path), { name: file.path });
        archive.append(JSON.stringify({ title:version.manifest.title, version:versionId, entry:version.manifest.entry, files:version.manifest.files, provenance:version.manifest.provenance }, null, 2), { name:'artifact-manifest.json' });
        await archive.finalize(); return;
      }
      if (kind !== 'files' || !rest.length) return json(res, 404, { error:'成果地址不存在。' });
      const relative = rest.map(decodeURIComponent).join('/'), contentType = mime[path.posix.extname(relative).toLowerCase()];
      if (!contentType) return json(res, 415, { error:'不支持该预览类型。' });
      const bytes = await store.bytes(version, relative);
      const scope = `${origin}/html-artifacts/files/${id}/${versionId}/${grant}/`;
      // A nested copied HTML frame has an opaque sandbox origin; keep ancestor
      // restriction on the entry, while every child still requires the same version grant.
      const ancestors = relative === version.manifest.entry || relative === "index.html" ? `; frame-ancestors ${origin}` : "";
      const policy = `sandbox allow-scripts allow-downloads allow-modals allow-forms; default-src 'none'; script-src 'unsafe-inline' ${scope}; style-src 'unsafe-inline' ${scope}; img-src data: blob: ${scope}; font-src data: ${scope}; connect-src ${scope}; frame-src ${scope}; object-src 'none'; base-uri 'none'; form-action 'none'${ancestors}`;
      res.writeHead(200, { ...common, 'content-type':contentType, 'content-length':bytes.length, 'content-security-policy':policy, 'access-control-allow-origin':'*', 'cross-origin-resource-policy':'cross-origin' }); res.end(req.method === 'HEAD' ? undefined : bytes);
    } catch { if (!res.headersSent) json(res, 400, { error:'无法访问该成果或版本，请从所属会话重新打开。' }); else res.destroy(); }
  };
}
