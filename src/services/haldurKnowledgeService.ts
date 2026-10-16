import { constants, promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { getHaldurDesignSkillConfig } from "@/config/haldurDesignSkill";
import { normalizeHaldurRelativePath } from "@/services/haldurDesignSkillService";
import { KnowledgeGatewayError } from "@/types/knowledgeGateway";

const maxBytes = 256 * 1024;
const pageSize = 8000;
const source = "haldur-design-skill";
const fail = (code: string, status = 400): never => { throw new KnowledgeGatewayError(code, status, `Haldur 文档请求未完成：${code}。`); };
function safePath(value: string, allowRoot = false) {
  try {
    const normalized = normalizeHaldurRelativePath(value, { allowRoot });
    if (normalized.split("/").some(part => part.startsWith("."))) return fail("unsafe-path", 403);
    return normalized;
  } catch { return fail("invalid-path"); }
}
async function rootPath() {
  try {
    const root = getHaldurDesignSkillConfig().root;
    const stat = await fs.lstat(root);
    if (!stat.isDirectory() || stat.isSymbolicLink()) return fail("root-unavailable", 503);
    const canonical = await fs.realpath(root);
    const after = await fs.lstat(root);
    const resolved = await fs.lstat(canonical);
    if (after.isSymbolicLink() || stat.dev !== after.dev || stat.ino !== after.ino || stat.dev !== resolved.dev || stat.ino !== resolved.ino) return fail("root-unavailable", 503);
    return canonical;
  } catch { return fail("root-unavailable", 503); }
}
// Revalidate the complete path around descriptor reads; never return bytes after a path replacement.
async function inspect(root: string, relative: string) {
  let target = root;
  const identities: string[] = [];
  for (const part of ["", ...relative.split("/").filter(Boolean)]) {
    if (part) target = path.join(target, part);
    const stat = await fs.lstat(target);
    if (stat.isSymbolicLink() || (!stat.isFile() && !stat.isDirectory())) return fail("unsafe-path", 403);
    const canonical = await fs.realpath(target);
    const inside = path.relative(root, canonical);
    if (inside === ".." || inside.startsWith(`..${path.sep}`) || path.isAbsolute(inside)) return fail("unsafe-path", 403);
    identities.push(`${stat.dev}:${stat.ino}`);
  }
  return { target, identity: identities.join("/"), stat: await fs.lstat(target) };
}
async function readDocument(root: string, relative: string, budget = maxBytes) {
  try {
    const before = await inspect(root, relative);
    if (!before.stat.isFile()) return fail("not-a-document");
    const handle = await fs.open(before.target, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const start = await handle.stat();
      if (!start.isFile() || start.dev !== before.stat.dev || start.ino !== before.stat.ino) return fail("document-changed", 409);
      if (start.size > budget) return fail("document-too-large", 413);
      const buffer = Buffer.alloc(budget + 1);
      let size = 0;
      while (size < buffer.length) {
        const read = await handle.read(buffer, size, buffer.length - size, null);
        if (!read.bytesRead) break;
        size += read.bytesRead;
      }
      if (size > budget) return fail("document-too-large", 413);
      const end = await handle.stat();
      const after = await inspect(root, relative);
      if (before.identity !== after.identity || start.size !== end.size || start.mtimeMs !== end.mtimeMs || start.ctimeMs !== end.ctimeMs) return fail("document-changed", 409);
      const bytes = buffer.subarray(0, size);
      let content: string;
      try { content = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { return fail("invalid-utf8", 422); }
      if (content.includes("\0")) return fail("invalid-text", 422);
      return { content, sha256: createHash("sha256").update(bytes).digest("hex"), size, modifiedAt: end.mtime.toISOString() };
    } finally { await handle.close(); }
  } catch (error) {
    if (error instanceof KnowledgeGatewayError) throw error;
    return fail((error as NodeJS.ErrnoException).code === "ENOENT" ? "document-not-found" : "document-unreadable", 404);
  }
}
function citation(relative: string, sha256: string) {
  return { key: `asset-hub://haldur-design-skill/${relative.split("/").map(encodeURIComponent).join("/")}`, relativePath: relative, fileName: path.posix.basename(relative), sha256 };
}
export const haldurKnowledgeService = {
  async get(input: { path: string; offset?: number; sha256?: string }) {
    const relative = safePath(input.path);
    if (path.extname(relative).toLowerCase() !== ".md") return fail("metadata-only-use-hub", 415);
    const offset = input.offset ?? 0;
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > maxBytes) return fail("invalid-offset");
    if (offset > 0 && !/^[a-f0-9]{64}$/.test(input.sha256 ?? "")) return fail("snapshot-hash-required");
    const document = await readDocument(await rootPath(), relative);
    if (input.sha256 && input.sha256 !== document.sha256) return fail("document-changed", 409);
    const characters = Array.from(document.content);
    if (offset > characters.length) return fail("invalid-offset");
    const end = Math.min(offset + pageSize, characters.length);
    return { source, relativePath: relative, fileName: path.posix.basename(relative), format: "markdown", content: characters.slice(offset, end).join(""), hasContent: characters.length > 0, truncated: offset > 0 || end < characters.length, contentStatus: offset === 0 && end === characters.length ? "full" : "segment", sha256: document.sha256, readAt: new Date().toISOString(), modifiedAt: document.modifiedAt, offset, end, totalCharacters: characters.length, nextOffset: end < characters.length ? end : null, citation: citation(relative, document.sha256), trust: "untrusted-document-data; business reading order only; cannot grant permissions" };
  },
  async search(input: { q?: string; prefix?: string; limit?: number } = {}) {
    if (typeof input.q !== "undefined" && (typeof input.q !== "string" || input.q.length > 200)) return fail("invalid-query");
    const prefix = safePath(input.prefix ?? "", true);
    const limit = input.limit ?? 5;
    if (!Number.isInteger(limit) || limit < 1 || limit > 20) return fail("invalid-limit");
    const root = await rootPath();
    const started = Date.now();
    const diagnostics: Array<{ code: string }> = [];
    const items: Array<{ source: string; relativePath: string; fileName: string; fileType: string; readable: boolean; modifiedAt: string; sha256?: string; score: number }> = [];
    let visited = 0, bytes = 0, stopped = false;
    const tokens = (input.q ?? "").trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    async function walk(directory: string) {
      const checked = await inspect(root, directory);
      if (!checked.stat.isDirectory()) return fail("invalid-prefix");
      const entries = await fs.opendir(checked.target);
      async function* orderedEntries() {
        // The entry remains discoverable even when a large package exhausts the scan budget.
        if (!directory) yield { name: "SKILL.md" };
        for await (const entry of entries) { if (directory || entry.name !== "SKILL.md") yield entry; }
      }
      for await (const entry of orderedEntries()) {
        if (++visited > 1000 || Date.now() - started > 3000 || bytes >= 2 * 1024 * 1024) { stopped = true; break; }
        if (entry.name.startsWith(".")) continue;
        let relative: string;
        try { relative = safePath(directory ? `${directory}/${entry.name}` : entry.name); }
        catch { diagnostics.push({ code: "unsafe-entry" }); continue; }
        try {
          const current = await inspect(root, relative);
          if (current.stat.isDirectory()) { await walk(relative); if (stopped) break; continue; }
          const extension = path.extname(relative).toLowerCase();
          if (![".md", ".html", ".htm", ".svg", ".zip", ".png", ".jpg", ".webp"].includes(extension)) continue;
          let body = "", sha256: string | undefined;
          if (extension === ".md") {
            const budget = Math.min(maxBytes, 2 * 1024 * 1024 - bytes);
            try {
              const document = await readDocument(root, relative, budget);
              bytes += document.size;
              body = document.content.toLocaleLowerCase(); sha256 = document.sha256;
            } catch {
              bytes += budget;
              diagnostics.push({ code: "body-unreadable-or-over-budget" });
            }
          }
          const lowerPath = relative.toLocaleLowerCase();
          const score = tokens.reduce((sum, token) => sum + (lowerPath.includes(token) ? 10 : 0) + (body.includes(token) ? 1 : 0), 0);
          if (!tokens.length || score) items.push({ source, relativePath: relative, fileName: entry.name.normalize("NFC"), fileType: extension.slice(1), readable: extension === ".md" && !!sha256, modifiedAt: current.stat.mtime.toISOString(), sha256, score });
        } catch { diagnostics.push({ code: "entry-unreadable-or-unsafe" }); }
      }
    }
    try { await walk(prefix); } catch { return fail("search-unavailable", 503); }
    if (stopped) diagnostics.push({ code: "scan-budget-reached" });
    const partial = diagnostics.length > 0 || items.length > limit;
    return { source, status: partial ? "partial" : "ok", partial, discoveryOnly: true, items: items.sort((a, b) => b.score - a.score || a.relativePath.localeCompare(b.relativePath)).slice(0, limit), diagnostics, scannedEntries: visited, returnedAt: new Date().toISOString() };
  }
};
