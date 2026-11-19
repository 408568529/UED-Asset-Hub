import { constants, promises as fs } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { getHaldurDesignSkillConfig } from "@/config/haldurDesignSkill";
import { normalizeHaldurRelativePath, haldurDesignSkillService } from "@/services/haldurDesignSkillService";
import { KnowledgeGatewayError } from "@/types/knowledgeGateway";

const listPage = "2、典型页面/列表页-preview.html";
const maxFile = 4 * 1024 * 1024;
const maxBundle = 16 * 1024 * 1024;
const extensions = new Set([".html", ".htm", ".css", ".js", ".mjs", ".json", ".txt", ".ico", ".avif", ".png", ".jpg", ".jpeg", ".svg", ".webp", ".gif", ".woff", ".woff2", ".ttf", ".otf"]);
const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const fail = (message: string, status = 409): never => { throw new KnowledgeGatewayError("html-template-unavailable", status, message); };
type File = { path: string; content: string; sha256: string; bytes: number; source: string };

export async function listHtmlTemplates({ q = "", offset = 0, limit = 50 } = {}) {
  if (q.length > 200 || !Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 50) return fail("模板检索参数无效。", 400);
  const snapshot = await haldurDesignSkillService.getSnapshot();
  if (!snapshot.rootAvailable || snapshot.recoveryRequired) return fail("Skill 资料暂不可用。", 503);
  const items = snapshot.manifest.filter(file => file.type === "file" && /\.html?$/i.test(file.relativePath) && (!q || file.relativePath.toLocaleLowerCase().includes(q.toLocaleLowerCase()))).sort((a, b) => a.relativePath.localeCompare(b.relativePath, "zh-CN"));
  return { sourceRevision: snapshot.revision, total: items.length, items: items.slice(offset, offset + limit).map(file => ({ path: file.relativePath, bytes: file.size, modifiedAt: file.modifiedAt, readable: file.size <= maxFile })), nextOffset: offset + limit < items.length ? offset + limit : null };
}

// Extract real HTML tags without interpreting markup embedded in script strings.
// Script bodies are raw text; inline styles contribute their CSS dependencies.
function htmlReferences(text: string) {
  const refs: string[] = [], css: string[] = [];
  const tags = /<!--[\s\S]*?-->|<(script|style)\b((?:[^"'<>]|"[^"]*"|'[^']*')*)>([\s\S]*?)<\/\1\s*>|<([a-z][\w:-]*)\b((?:[^"'<>]|"[^"]*"|'[^']*')*)>/gi;
  for (const tag of text.matchAll(tags)) {
    const name = (tag[1] || tag[4] || "").toLowerCase(), attrs = tag[2] ?? tag[5] ?? "";
    if (name === "style") css.push(tag[3]);
    if (name === "script") refs.push(...jsReferences(tag[3]));
    for (const attr of attrs.matchAll(/([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g)) {
      const key = attr[1].toLowerCase(), value = attr[2] ?? attr[3] ?? attr[4];
      if (key === "style") css.push(value);
      if ((key === "src" && ["script", "img", "source", "iframe", "audio", "video"].includes(name)) || (key === "href" && name === "link") || (key === "poster" && name === "video")) refs.push(value.replace(/&amp;/g, "&"));
      if (key === "srcset" && ["img", "source"].includes(name) && !value.startsWith("data:")) refs.push(...value.split(",").map(part => part.trim().split(/\s+/)[0]));
    }
  }
  return [...refs, ...css.flatMap(cssReferences)];
}
function jsReferences(text: string) { return [...text.matchAll(/(?:\bfrom\s*|\bimport\s*(?:\(\s*)?|\bfetch\s*\(\s*|\bnew\s+URL\s*\(\s*)["'](\.{1,2}\/[^"']+)["']/g)].map(match => match[1]); }
function cssReferences(text: string) { return [...text.matchAll(/(?:url\(\s*["']?|@import\s+["'])([^\s"')]+)["']?\s*\)?/gi)].map(match => match[1]); }

// User-selected paths remain relative to the current physical Skill, which is read-only.
export async function getHtmlTemplateBundle(templatePath: string, resourcePaths: string[] = []) {
  const entry = normalizeHaldurRelativePath(templatePath);
  if (!/\.html?$/i.test(entry) || resourcePaths.length > 20) return fail("请选择 Skill 中的 HTML 模板。", 400);
  const before = await haldurDesignSkillService.getSnapshot();
  if (!before.rootAvailable || before.recoveryRequired) return fail("Skill 资料暂不可用。", 503);
  if (!before.manifest.some(file => file.type === "file" && file.relativePath === entry)) return fail("所选 HTML 模板已不存在，请重新检索 Skill。", 404);
  const configured = getHaldurDesignSkillConfig().root;
  const rootStat = await fs.lstat(configured);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) return fail("模板根目录不可用。", 503);
  const root = await fs.realpath(configured);
  const files = new Map<string, File>();
  const warnings = new Set<string>();
  let total = 0, entrySha256 = "";
  async function read(relative: string) {
    relative = normalizeHaldurRelativePath(relative);
    if (relative.split("/").some(part => part.startsWith(".")) || !extensions.has(path.posix.extname(relative).toLowerCase())) return fail("模板引用了不受支持的资源。", 400);
    let target = root;
    for (const part of relative.split("/")) {
      target = path.join(target, part);
      if ((await fs.lstat(target)).isSymbolicLink()) return fail("模板资源不能使用符号链接。", 403);
    }
    const canonical = await fs.realpath(target);
    const inside = path.relative(root, canonical);
    if (inside === ".." || inside.startsWith(`..${path.sep}`) || path.isAbsolute(inside)) return fail("模板资源越出 Skill 目录。", 403);
    const start = await fs.lstat(target);
    const handle = await fs.open(target, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const opened = await handle.stat();
      if (!opened.isFile() || opened.size > maxFile || opened.dev !== start.dev || opened.ino !== start.ino) return fail("模板资源过大或已改变。", 413);
      const bytes = Buffer.alloc(opened.size + 1);
      let size = 0;
      while (size < bytes.length) { const part = await handle.read(bytes, size, bytes.length - size, null); if (!part.bytesRead) break; size += part.bytesRead; }
      const end = await handle.stat(), current = await fs.lstat(target);
      if (size !== opened.size || opened.size !== end.size || opened.mtimeMs !== end.mtimeMs || opened.ctimeMs !== end.ctimeMs || current.isSymbolicLink() || current.ino !== opened.ino || current.dev !== opened.dev) return fail("模板在复制前发生改变，请重试。");
      return bytes.subarray(0, size);
    } finally { await handle.close(); }
  }
  function add(relative: string, bytes: Buffer, source: string) {
    total += bytes.length;
    if (total > maxBundle || files.size >= 47) return fail("模板资源超过首版复制预算。", 413);
    files.set(relative, { path: relative, content: bytes.toString("base64"), sha256: hash(bytes), bytes: bytes.length, source });
  }
  async function collect(relative: string) {
    if (files.has(relative)) return;
    const bytes = await read(relative);
    if (relative === entry) entrySha256 = hash(bytes);
    add(relative, bytes, `asset-hub://haldur-design-skill/${relative.split("/").map(encodeURIComponent).join("/")}`);
    const ext = path.posix.extname(relative).toLowerCase();
    if (![".html", ".htm", ".css", ".js", ".mjs"].includes(ext)) return;
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const refs = /\.html?$/.test(ext) ? htmlReferences(text) : ext === ".css" ? cssReferences(text) : jsReferences(text);
    for (const raw of [...new Set(refs)]) {
      if (!raw || /^(?:data:|blob:|#)/i.test(raw)) continue;
      const url = new URL(raw, `https://skill.invalid/${relative.split("/").map(encodeURIComponent).join("/")}`);
      if (url.origin !== "https://skill.invalid") {
        // The existing list template uses this iconfont script. Mirror only this
        // fixed CDN resource class; never offer arbitrary network fetching.
        if (!/^https:\/\/at\.alicdn\.com\/t\/c\/font_[a-z0-9_]+\.js$/i.test(url.href)) return fail("模板包含未支持的外部运行依赖。", 400);
        const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(8000), cache: "no-store" });
        if (!response.ok) return fail("图标资源暂时无法取得，请稍后重试。", 503);
        const reader = response.body!.getReader(); const chunks: Uint8Array[] = []; let count = 0;
        try { for (;;) { const chunk = await reader.read(); if (chunk.done) break; count += chunk.value.length; if (count > maxFile) return fail("外部资源超过复制预算。", 413); chunks.push(chunk.value); } }
        finally { await reader.cancel(); }
        const body = Buffer.concat(chunks); const vendor = `__resources/${path.posix.basename(url.pathname)}`;
        if (!files.has(vendor)) add(vendor, body, url.href);
        // Replacing the external source URL is the only dependency adaptation;
        // DOM, styles and template JavaScript are otherwise copied as text.
        const copied = Buffer.from(files.get(relative)!.content, "base64").toString("utf8");
        const replaced = Buffer.from(copied.split(raw).join(path.posix.relative(path.posix.dirname(relative), vendor)));
        total += replaced.length - Buffer.byteLength(copied);
        files.set(relative, { ...files.get(relative)!, content: replaced.toString("base64"), sha256: hash(replaced), bytes: replaced.length });
      } else {
        const dependency = normalizeHaldurRelativePath(decodeURIComponent(url.pathname.slice(1)));
        await collect(dependency);
      }
    }
  }
  try { await collect(entry); for (const resource of resourcePaths) await collect(normalizeHaldurRelativePath(resource)); } catch (error) {
    if (error instanceof KnowledgeGatewayError) throw error;
    return fail("无法完整读取所选 HTML 模板及资源，请检查 Skill 内容。", 503);
  }
  const after = await haldurDesignSkillService.getSnapshot();
  if (before.revision !== after.revision || after.recoveryRequired) return fail("Skill 在复制过程中已改变，请重试。");
  warnings.add("文档说明链接不作为运行依赖复制；动态生成的资源路径需通过 resource_paths 补充。成果不连接真实业务接口。");
  return { templateId: "skill-html", templatePath: entry, entry, sourceRevision: before.revision, sourceEntrySha256: entrySha256, files: [...files.values()], totalBytes: total, warnings: [...warnings] };
}

// Compatibility endpoint for existing callers; new Agent calls select a current Skill path.
export const getListPageTemplateBundle = () => getHtmlTemplateBundle(listPage);
