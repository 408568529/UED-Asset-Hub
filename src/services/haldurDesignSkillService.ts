import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { getHaldurDesignSkillConfig, HaldurDesignSkillConfigError } from "@/config/haldurDesignSkill";
import { readJsonFileReadonly } from "@/lib/storage/jsonStorage";
import type { HaldurDesignSkillDiagnostic, HaldurDesignSkillManifestEntry, HaldurDesignSkillMetadataStore, HaldurDesignSkillNode, HaldurDesignSkillNodeMetadata, HaldurDesignSkillSnapshot } from "@/types/haldurDesignSkill";

const metadataFile = "haldur-design-skill.json";
const windowsReservedName = /^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\..*)?$/i;
const unsafeName = /[<>:"\\|?*\u0000-\u001f]/;

export class HaldurDesignSkillPathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HaldurDesignSkillPathError";
  }
}

function isInside(parentPath: string, candidatePath: string) {
  const relative = path.relative(parentPath, candidatePath);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function isMissing(error: unknown) {
  return (error as NodeJS.ErrnoException).code === "ENOENT";
}

function validateSegment(segment: string) {
  const normalized = segment.normalize("NFC");
  if (!normalized || normalized === "." || normalized === "..") throw new HaldurDesignSkillPathError("Haldur 路径段非法。");
  if (unsafeName.test(normalized) || normalized.endsWith(".") || normalized.endsWith(" ") || windowsReservedName.test(normalized)) {
    throw new HaldurDesignSkillPathError("Haldur 路径包含 Windows 不安全名称。");
  }
  if (normalized.length > 255) throw new HaldurDesignSkillPathError("Haldur 路径段过长。");
  return normalized;
}

export function normalizeHaldurRelativePath(value: string, options: { allowRoot?: boolean } = {}) {
  if (typeof value !== "string") throw new HaldurDesignSkillPathError("Haldur 路径必须是字符串。");
  if (value === "" && options.allowRoot) return "";
  if (!value || value.includes("\\") || value.includes("%") || path.isAbsolute(value) || path.posix.isAbsolute(value) || path.win32.isAbsolute(value)) {
    throw new HaldurDesignSkillPathError("Haldur 路径必须是未编码的相对路径。");
  }
  try {
    if (decodeURIComponent(value) !== value) throw new HaldurDesignSkillPathError("Haldur 路径不允许编码形式。");
  } catch (error) {
    if (error instanceof HaldurDesignSkillPathError) throw error;
    throw new HaldurDesignSkillPathError("Haldur 路径包含无效编码。");
  }
  const normalized = value.split("/").map(validateSegment).join("/");
  if (normalized.length > 240) throw new HaldurDesignSkillPathError("Haldur 相对路径过长。");
  return normalized;
}

async function readMetadata() {
  const value = await readJsonFileReadonly<unknown>(metadataFile, { schemaVersion: 1, entries: {} });
  if (!value || typeof value !== "object" || Array.isArray(value)) return { entries: {}, diagnostic: { code: "metadata-invalid", message: "Haldur Metadata 格式无效，已忽略增强信息。" } as HaldurDesignSkillDiagnostic };
  const candidate = value as Partial<HaldurDesignSkillMetadataStore>;
  if (candidate.schemaVersion !== 1 || !candidate.entries || typeof candidate.entries !== "object" || Array.isArray(candidate.entries)) {
    return { entries: {}, diagnostic: { code: "metadata-invalid", message: "Haldur Metadata Schema 无效，已忽略增强信息。" } as HaldurDesignSkillDiagnostic };
  }
  const entries: Record<string, HaldurDesignSkillNodeMetadata> = {};
  for (const [relativePath, metadata] of Object.entries(candidate.entries)) {
    try {
      const normalized = normalizeHaldurRelativePath(relativePath);
      if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) entries[normalized] = metadata as HaldurDesignSkillNodeMetadata;
    } catch {
      // Invalid metadata never changes the disk-derived structure.
    }
  }
  return { entries, diagnostic: undefined };
}

async function inspectRoot(root: string) {
  try {
    const entry = await fs.lstat(root);
    if (!entry.isDirectory() || entry.isSymbolicLink()) return null;
    return await fs.realpath(root);
  } catch (error) {
    if (isMissing(error)) return undefined;
    throw error;
  }
}

async function scanDirectory(root: string, directory: string, metadata: Record<string, HaldurDesignSkillNodeMetadata>, diagnostics: HaldurDesignSkillDiagnostic[]): Promise<{ nodes: HaldurDesignSkillNode[]; manifest: HaldurDesignSkillManifestEntry[] }> {
  const nodes: HaldurDesignSkillNode[] = [];
  const manifest: HaldurDesignSkillManifestEntry[] = [];
  const entries = await fs.readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name, "zh-CN"));

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    const relativePath = path.relative(root, absolutePath).split(path.sep).join("/").normalize("NFC");
    try {
      normalizeHaldurRelativePath(relativePath);
      const stats = await fs.lstat(absolutePath);
      if (stats.isSymbolicLink()) {
        diagnostics.push({ code: "unsafe-entry", relativePath, message: "已跳过 symbolic link 或 junction 条目。" });
        continue;
      }
      const canonicalPath = await fs.realpath(absolutePath);
      if (!isInside(root, canonicalPath)) {
        diagnostics.push({ code: "unsafe-entry", relativePath, message: "已跳过越出 Haldur Root 的条目。" });
        continue;
      }
      const base = { relativePath, name: entry.name.normalize("NFC"), size: stats.size, modifiedAt: stats.mtime.toISOString(), metadata: metadata[relativePath] };
      if (stats.isDirectory()) {
        const nested = await scanDirectory(root, canonicalPath, metadata, diagnostics);
        const node: HaldurDesignSkillNode = { ...base, type: "directory", children: nested.nodes };
        nodes.push(node);
        manifest.push({ relativePath, type: "directory", size: stats.size, modifiedAt: stats.mtime.toISOString() }, ...nested.manifest);
        continue;
      }
      if (!stats.isFile()) {
        diagnostics.push({ code: "unsafe-entry", relativePath, message: "已跳过非普通文件或目录条目。" });
        continue;
      }
      const checksum = createHash("sha256").update(await fs.readFile(canonicalPath)).digest("hex");
      const node: HaldurDesignSkillNode = { ...base, type: "file", checksum };
      nodes.push(node);
      manifest.push({ relativePath, type: "file", size: stats.size, modifiedAt: stats.mtime.toISOString(), checksum });
    } catch (error) {
      diagnostics.push({ code: "unsafe-entry", relativePath, message: error instanceof Error ? `已跳过不安全条目：${error.message}` : "已跳过不安全条目。" });
    }
  }
  return { nodes, manifest };
}

function revisionFor(manifest: HaldurDesignSkillManifestEntry[]) {
  return createHash("sha256").update(JSON.stringify([...manifest].sort((left, right) => left.relativePath.localeCompare(right.relativePath, "zh-CN")))).digest("hex");
}

export const haldurDesignSkillService = {
  async getSnapshot(): Promise<HaldurDesignSkillSnapshot> {
    const generatedAt = new Date().toISOString();
    let config;
    try {
      config = getHaldurDesignSkillConfig();
    } catch (error) {
      if (!(error instanceof HaldurDesignSkillConfigError)) throw error;
      return { rootName: "Haldur-Design-Skill", rootAvailable: false, generatedAt, revision: null, manifest: [], nodes: [], diagnostics: [{ code: "root-missing", message: error.message }] };
    }
    const diagnostics: HaldurDesignSkillDiagnostic[] = [];
    const root = await inspectRoot(config.root);
    if (root === undefined) return { rootName: config.rootName, rootAvailable: false, generatedAt, revision: null, manifest: [], nodes: [], diagnostics: [{ code: "root-missing", message: "Haldur Skill Root 不存在；读取不会自动创建目录。" }] };
    if (root === null) return { rootName: config.rootName, rootAvailable: false, generatedAt, revision: null, manifest: [], nodes: [], diagnostics: [{ code: "root-unsafe", message: "Haldur Skill Root 必须是非符号链接目录。" }] };
    const metadata = await readMetadata();
    if (metadata.diagnostic) diagnostics.push(metadata.diagnostic);
    try {
      const scanned = await scanDirectory(root, root, metadata.entries, diagnostics);
      if (!scanned.manifest.some((entry) => entry.relativePath === "SKILL.md" && entry.type === "file")) {
        diagnostics.push({ code: "missing-skill-md", message: "Root 中暂未发现 SKILL.md。" });
      }
      return { rootName: config.rootName, rootAvailable: true, generatedAt, revision: revisionFor(scanned.manifest), manifest: scanned.manifest, nodes: scanned.nodes, diagnostics };
    } catch (error) {
      return { rootName: config.rootName, rootAvailable: true, generatedAt, revision: null, manifest: [], nodes: [], diagnostics: [...diagnostics, { code: "scan-failed", message: error instanceof Error ? error.message : "Haldur Root 扫描失败。" }] };
    }
  }
};
