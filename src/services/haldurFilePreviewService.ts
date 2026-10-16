import { constants, promises as fs } from "node:fs";
import path from "node:path";
import { getHaldurDesignSkillConfig } from "@/config/haldurDesignSkill";
import { normalizeHaldurRelativePath } from "@/services/haldurDesignSkillService";

export class HaldurPreviewError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); }
}
const imageTypes: Record<string, string> = { ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif" };
const textTypes: Record<string, string> = { ".html": "text/html", ".htm": "text/html", ".css": "text/css", ".js": "text/javascript" };
export async function readHaldurPreview(entryValue: string, fileValue = entryValue) {
  let entry: string, file: string;
  try { entry = normalizeHaldurRelativePath(entryValue); file = normalizeHaldurRelativePath(fileValue); }
  catch { throw new HaldurPreviewError("INVALID_PATH", "预览路径无效。"); }
  const entryExt = path.extname(entry).toLowerCase();
  if (![".html", ".htm", ...Object.keys(imageTypes)].includes(entryExt)) throw new HaldurPreviewError("PREVIEW_UNSUPPORTED", "此格式暂不支持预览，请下载原文件。", 415);
  const directory = path.posix.dirname(entry);
  if (file !== entry && directory !== "." && !file.startsWith(`${directory}/`)) throw new HaldurPreviewError("RESOURCE_OUTSIDE_SCOPE", "资源超出入口所在目录。", 403);
  if (file.split("/").some(part => part.startsWith("."))) throw new HaldurPreviewError("RESOURCE_UNSAFE", "不能预览隐藏文件。", 403);
  const extension = path.extname(file).toLowerCase();
  const mime = imageTypes[extension] ?? textTypes[extension];
  if (!mime || (file !== entry && [".html", ".htm"].includes(extension))) throw new HaldurPreviewError("PREVIEW_UNSUPPORTED", "资源类型不受支持。", 415);
  const configured = getHaldurDesignSkillConfig().root;
  try {
    const rootStat = await fs.lstat(configured);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new HaldurPreviewError("ROOT_UNAVAILABLE", "预览目录不可用。", 503);
    const root = await fs.realpath(configured);
    // Check each segment, not only the leaf, including symlinks back inside Root.
    let target = root;
    for (const part of file.split("/")) {
      target = path.join(target, part);
      if ((await fs.lstat(target)).isSymbolicLink()) throw new HaldurPreviewError("RESOURCE_UNSAFE", "预览不允许符号链接。", 403);
    }
    const canonical = await fs.realpath(target);
    const relative = path.relative(root, canonical);
    if (relative.startsWith("..") || path.isAbsolute(relative)) throw new HaldurPreviewError("RESOURCE_UNSAFE", "资源越出预览目录。", 403);
    // A resource request also verifies the entry still exists and is not an alias.
    if (file !== entry) await verifyEntry(root, entry);
    const handle = await fs.open(canonical, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const limit = file === entry ? 2 * 1024 * 1024 : 4 * 1024 * 1024;
      const stat = await handle.stat();
      if (!stat.isFile()) throw new HaldurPreviewError("RESOURCE_UNSAFE", "目标不是文件。", 400);
      if (stat.size > limit) throw new HaldurPreviewError("PREVIEW_TOO_LARGE", "文件超出在线预览读取预算，请下载原文件。", 413);
      const buffer = Buffer.alloc(limit + 1);
      let size = 0;
      while (size < buffer.length) { const part = await handle.read(buffer, size, buffer.length - size, null); if (!part.bytesRead) break; size += part.bytesRead; }
      if (size > limit) throw new HaldurPreviewError("PREVIEW_TOO_LARGE", "文件超出在线预览读取预算。", 413);
      const bytes = buffer.subarray(0, size);
      if (imageTypes[extension]) return { path: file, name: path.basename(file), mime, size, base64: bytes.toString("base64") };
      try { return { path: file, name: path.basename(file), mime, size, content: new TextDecoder("utf-8", { fatal: true }).decode(bytes) }; }
      catch { throw new HaldurPreviewError("PREVIEW_ENCODING", "仅支持 UTF-8 文本预览。", 422); }
    } finally { await handle.close(); }
  } catch (error) {
    if (error instanceof HaldurPreviewError) throw error;
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new HaldurPreviewError("FILE_NOT_FOUND", "文件或资源已删除、重命名或不存在。", 404);
    throw new HaldurPreviewError("PREVIEW_READ_FAILED", "读取预览失败，请下载或稍后重试。", 500);
  }
}
async function verifyEntry(root: string, entry: string) {
  let current = root;
  for (const part of entry.split("/")) { current = path.join(current, part); if ((await fs.lstat(current)).isSymbolicLink()) throw new HaldurPreviewError("RESOURCE_UNSAFE", "入口不允许符号链接。", 403); }
  if (!(await fs.stat(current)).isFile()) throw new HaldurPreviewError("FILE_NOT_FOUND", "入口文件不存在。", 404);
}
