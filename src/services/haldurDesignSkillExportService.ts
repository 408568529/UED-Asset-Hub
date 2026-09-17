import archiver from "archiver";
import { randomUUID } from "node:crypto";
import { constants, createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import { getHaldurDesignSkillConfig } from "@/config/haldurDesignSkill";
import { getHaldurWritableRoots, hasHaldurRecoveryRequired } from "@/services/haldurDesignSkillDirectoryService";
import { haldurDesignSkillService, normalizeHaldurRelativePath } from "@/services/haldurDesignSkillService";
import type { HaldurDesignSkillManifestEntry, HaldurDesignSkillSnapshot } from "@/types/haldurDesignSkill";

type ExportCode = "ROOT_UNAVAILABLE" | "RECOVERY_REQUIRED" | "SNAPSHOT_CONFLICT" | "EXPORT_SCAN_FAILED" | "EXPORT_READ_FAILED" | "EXPORT_WRITE_FAILED" | "EXPORT_VERIFY_FAILED" | "EXPORT_DISK_SPACE_INSUFFICIENT" | "EXPORT_BUSY" | "EXPORT_CLEANUP_FAILED" | "PATH_UNSAFE";
export class HaldurSkillExportError extends Error { constructor(public readonly code: ExportCode, message: string, public readonly status: number) { super(message); this.name = "HaldurSkillExportError"; } }
const topLevel = "Haldur-Design-Skill";
let activeExports = 0;

function inside(root: string, target: string) { const relative = path.relative(root, target); return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative)); }
function sameManifest(left: HaldurDesignSkillSnapshot, right: HaldurDesignSkillSnapshot) { return left.revision === right.revision && JSON.stringify(left.manifest) === JSON.stringify(right.manifest); }
function exportLimit() { const value = Number(process.env.HALDUR_DESIGN_SKILL_EXPORT_CONCURRENCY ?? "2"); return Number.isSafeInteger(value) && value > 0 ? value : 2; }

async function snapshot() {
  const value = await haldurDesignSkillService.getSnapshot();
  if (!value.rootAvailable || !value.revision) throw new HaldurSkillExportError("ROOT_UNAVAILABLE", "Haldur Skill Root 不可用。", 503);
  if (value.diagnostics.some((item) => item.code === "unsafe-entry" || item.code === "scan-failed")) throw new HaldurSkillExportError("EXPORT_SCAN_FAILED", "Root 存在无法安全导出的条目。", 500);
  return value;
}

async function requireSpace(runtimeRoot: string, manifest: HaldurDesignSkillManifestEntry[]) {
  const bytes = manifest.filter((item) => item.type === "file").reduce((sum, item) => sum + item.size, 0);
  const reserve = Math.max(10 * 1024 * 1024, Math.ceil(bytes * 0.1), Number(process.env.HALDUR_DESIGN_SKILL_EXPORT_MIN_FREE_BYTES ?? "0"));
  try { const info = await fs.statfs(runtimeRoot); if (Number(info.bavail) * Number(info.bsize) < bytes + reserve) throw new HaldurSkillExportError("EXPORT_DISK_SPACE_INSUFFICIENT", "Runtime 磁盘空间不足，未开始生成下载包。", 507); }
  catch (error) { if (error instanceof HaldurSkillExportError) throw error; throw new HaldurSkillExportError("EXPORT_DISK_SPACE_INSUFFICIENT", "无法确认 Runtime 磁盘空间。", 507); }
}

async function safeFileHandle(root: string, entry: HaldurDesignSkillManifestEntry) {
  try { normalizeHaldurRelativePath(entry.relativePath); } catch { throw new HaldurSkillExportError("PATH_UNSAFE", "ZIP Entry 路径不安全。", 500); }
  const candidate = path.resolve(root, ...entry.relativePath.split("/"));
  if (!inside(root, candidate)) throw new HaldurSkillExportError("PATH_UNSAFE", "ZIP Entry 越出 Root。", 500);
  try {
    const initial = await fs.lstat(candidate);
    if (!initial.isFile() || initial.isSymbolicLink()) throw new HaldurSkillExportError("PATH_UNSAFE", "发现不安全文件 Entry。", 500);
    const canonical = await fs.realpath(candidate);
    if (!inside(root, canonical)) throw new HaldurSkillExportError("PATH_UNSAFE", "文件真实路径越出 Root。", 500);
    const handle = await fs.open(canonical, constants.O_RDONLY | constants.O_NOFOLLOW);
    const opened = await handle.stat();
    if (!opened.isFile() || opened.size !== entry.size) { await handle.close(); throw new HaldurSkillExportError("EXPORT_READ_FAILED", "文件在导出期间发生变化。", 500); }
    return handle;
  } catch (error) { if (error instanceof HaldurSkillExportError) throw error; throw new HaldurSkillExportError("EXPORT_READ_FAILED", error instanceof Error ? error.message : "读取导出文件失败。", 500); }
}

async function writeZip(root: string, output: string, manifest: HaldurDesignSkillManifestEntry[]) {
  await fs.mkdir(path.dirname(output), { recursive: true });
  const archive = archiver("zip", { zlib: { level: 9 } });
  const writer = (await import("node:fs")).createWriteStream(output, { flags: "wx" });
  const done = new Promise<void>((resolve, reject) => { writer.once("close", resolve); writer.once("error", reject); archive.once("error", reject); });
  archive.pipe(writer);
  archive.append("", { name: `${topLevel}/` });
  for (const entry of manifest) {
    const name = `${topLevel}/${entry.relativePath.split(path.sep).join("/")}${entry.type === "directory" ? "/" : ""}`;
    if (entry.type === "directory") { archive.append("", { name }); continue; }
    const handle = await safeFileHandle(root, entry);
    archive.append(handle.createReadStream(), { name });
  }
  try { await archive.finalize(); await done; }
  catch (error) { archive.abort(); throw new HaldurSkillExportError("EXPORT_WRITE_FAILED", error instanceof Error ? error.message : "ZIP 写入失败。", 500); }
}

export const haldurDesignSkillExportService = {
  async create(options: { afterPackaged?: (attempt: number) => Promise<void> } = {}) {
    if (activeExports >= exportLimit()) throw new HaldurSkillExportError("EXPORT_BUSY", "导出任务繁忙，请稍后重试。", 429);
    activeExports += 1;
    let directory = "";
    try {
      const { root, runtimeRoot } = await getHaldurWritableRoots();
      if (await hasHaldurRecoveryRequired(runtimeRoot)) throw new HaldurSkillExportError("RECOVERY_REQUIRED", "当前 Skill 处于只读恢复状态，暂时无法生成完整下载包。", 423);
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const before = await snapshot();
        await requireSpace(runtimeRoot, before.manifest);
        directory = path.join(runtimeRoot, "staging", `export-${randomUUID()}`);
        const zipPath = path.join(directory, `${topLevel}.zip`);
        try { await writeZip(root, zipPath, before.manifest); }
        catch (error) { await fs.rm(directory, { recursive: true, force: true }).catch(() => undefined); throw error; }
        await options.afterPackaged?.(attempt);
        const after = await snapshot();
        if (sameManifest(before, after)) {
          const size = (await fs.stat(zipPath)).size;
          return { revision: after.revision!, zipPath, size, async cleanup() { await fs.rm(directory, { recursive: true, force: true }); } };
        }
        await fs.rm(directory, { recursive: true, force: true }); directory = "";
      }
      throw new HaldurSkillExportError("SNAPSHOT_CONFLICT", "生成下载包期间检测到 Skill 持续变化，请稍后重新下载。", 409);
    } finally { activeExports -= 1; }
  }
};
