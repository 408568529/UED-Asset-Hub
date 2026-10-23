import { hasHaldurCapability } from "@/lib/haldurPermissions";
import { normalizeHaldurRelativePath } from "@/services/haldurDesignSkillService";
export const runtime = "nodejs";
export async function GET(request: Request) {
  if (!hasHaldurCapability(request, "haldur.read")) return new Response("无预览权限。", { status: 403 });
  try { normalizeHaldurRelativePath(new URL(request.url).searchParams.get("path") ?? ""); }
  catch { return new Response("文件标识无效。", { status: 400 }); }
  // This policy belongs only to this trusted viewer document. In particular frame-src
  // also restricts the untrusted child's self-navigation, not just fetch()/images.
  const policy = "default-src 'none'; script-src 'self' 'unsafe-inline' blob: data:; style-src 'unsafe-inline' blob:; img-src blob: data:; font-src blob: data:; connect-src 'self'; frame-src blob:; worker-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors 'self'";
  return new Response(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Haldur 文件预览</title><style>
*{box-sizing:border-box}html,body{margin:0;height:100%;font:14px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#141414;background:#f7f8fa}body{display:flex;flex-direction:column}header{display:flex;align-items:center;gap:16px;min-height:56px;padding:12px 20px;background:#fff;border-bottom:1px solid #1414141a}header strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1}a{color:inherit}#status{padding:12px 20px;white-space:pre-wrap;max-height:140px;overflow:auto;background:#fff9e8}#status:empty{display:none}main{flex:1;min-height:0;display:flex;align-items:center;justify-content:center;overflow:auto}iframe{width:100%;height:100%;border:0;background:#fff}img{max-width:100%;max-height:100%;object-fit:contain;background:repeating-conic-gradient(#eef0f2 0% 25%,#fff 0% 50%) 0/20px 20px}body[data-embedded] header{display:none}
</style><header><strong id="name">正在读取文件…</strong><a id="download" rel="noopener noreferrer">下载原文件</a></header><div id="status" role="status">正在准备预览…</div><main id="preview"></main><script src="/haldur-preview.js" defer></script></html>`, { headers: { "content-type": "text/html; charset=utf-8", "content-security-policy": policy, "cache-control": "no-store", "referrer-policy": "no-referrer", "x-content-type-options": "nosniff", "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()" } });
}
