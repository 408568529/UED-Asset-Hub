import { createHash, randomUUID } from "node:crypto";
import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { getHaldurDesignSkillConfig } from "@/config/haldurDesignSkill";
import { haldurDesignSkillService, normalizeHaldurRelativePath } from "@/services/haldurDesignSkillService";
import {
  HaldurDirectoryOperationError,
  assertHaldurNoRecovery,
  getHaldurWritableRoots,
  hasHaldurRecoveryRequired,
  migrateHaldurMetadata,
  requireHaldurRevision,
  restoreHaldurMetadata,
  updateHaldurFileMetadata,
  withHaldurRootWriteLock,
  writeHaldurAudit,
  writeHaldurJournal,
  type HaldurMetadataChange,
  type HaldurTransactionContext
} from "@/services/haldurDesignSkillDirectoryService";
import type { HaldurDesignSkillSnapshot, HaldurDirectoryJournal, HaldurDirectoryOperationResult, HaldurDirectoryOperationType } from "@/types/haldurDesignSkill";

type FileErrorCode = "FILE_NOT_FOUND" | "TARGET_NOT_FOUND" | "FILE_TOO_LARGE" | "STAGING_FAILED" | "HASH_MISMATCH" | "DISK_SPACE_INSUFFICIENT" | "REPLACE_FAILED" | "DOWNLOAD_UNSAFE" | "MARKDOWN_REQUIRED" | "MARKDOWN_TOO_LARGE" | "MARKDOWN_ENCODING_UNSUPPORTED";

export class HaldurFileOperationError extends HaldurDirectoryOperationError {
  constructor(code: FileErrorCode, message: string, status: number) {
    super(code, message, status);
    this.name = "HaldurFileOperationError";
  }
}

type FileIdentity = { size: number; hash: string };
type UploadInput = { targetParentRelativePath: string; originalFileName: string; revision: string; overwrite: boolean; source: AsyncIterable<Uint8Array>; mime?: string; operator: string };

function isInside(parentPath: string, candidatePath: string) {
  const relative = path.relative(parentPath, candidatePath);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function isMissing(error: unknown) {
  return (error as NodeJS.ErrnoException).code === "ENOENT";
}

function filePath(value: string, options: { allowRoot?: boolean } = {}) {
  try {
    return normalizeHaldurRelativePath(value, options);
  } catch (error) {
    throw new HaldurDirectoryOperationError("INVALID_PATH", error instanceof Error ? error.message : "Haldur 文件路径非法。", 400);
  }
}

function caseKey(name: string) {
  return name.normalize("NFC").toLocaleLowerCase("en-US");
}

function maxUploadBytes() {
  const value = process.env.HALDUR_DESIGN_SKILL_MAX_UPLOAD_BYTES?.trim();
  if (!value) return 100 * 1024 * 1024;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new HaldurFileOperationError("FILE_TOO_LARGE", "HALDUR_DESIGN_SKILL_MAX_UPLOAD_BYTES 配置无效。", 500);
  return parsed;
}

function maxMarkdownBytes() {
  const value = process.env.HALDUR_DESIGN_SKILL_MAX_MARKDOWN_BYTES?.trim();
  if (!value) return 2 * 1024 * 1024;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new HaldurFileOperationError("MARKDOWN_TOO_LARGE", "HALDUR_DESIGN_SKILL_MAX_MARKDOWN_BYTES 配置无效。", 500);
  return parsed;
}

function assertMarkdownPath(relativePath: string) {
  if (path.extname(relativePath).toLocaleLowerCase("en-US") !== ".md") throw new HaldurFileOperationError("MARKDOWN_REQUIRED", "仅支持 Markdown 文件。", 400);
}

function decodeMarkdown(bytes: Buffer) {
  try {
    const content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
  } catch {
    throw new HaldurFileOperationError("MARKDOWN_ENCODING_UNSUPPORTED", "Markdown 文件不是受支持的 UTF-8 编码。", 422);
  }
}

async function safeDirectory(root: string, relativePath: string, missingCode: "TARGET_NOT_FOUND" | "FILE_NOT_FOUND" = "TARGET_NOT_FOUND") {
  const normalized = filePath(relativePath, { allowRoot: true });
  const target = path.resolve(root, ...normalized.split("/").filter(Boolean));
  if (!isInside(root, target)) throw new HaldurDirectoryOperationError("PATH_OUTSIDE_ROOT", "目标路径越出 Haldur Root。", 400);
  try {
    const entry = await fs.lstat(target);
    if (!entry.isDirectory() || entry.isSymbolicLink()) throw new HaldurDirectoryOperationError("INVALID_PATH", "目标必须是非符号链接目录。", 400);
    const canonical = await fs.realpath(target);
    if (!isInside(root, canonical)) throw new HaldurDirectoryOperationError("PATH_OUTSIDE_ROOT", "目标路径越出 Haldur Root。", 400);
    return { normalized, target: canonical };
  } catch (error) {
    if (isMissing(error)) throw new HaldurFileOperationError(missingCode, "目标目录不存在。", 404);
    throw error;
  }
}

async function safeFile(root: string, relativePath: string, code: "FILE_NOT_FOUND" | "DOWNLOAD_UNSAFE" = "FILE_NOT_FOUND") {
  const normalized = filePath(relativePath);
  const target = path.resolve(root, ...normalized.split("/"));
  if (!isInside(root, target)) throw new HaldurDirectoryOperationError("PATH_OUTSIDE_ROOT", "目标路径越出 Haldur Root。", 400);
  try {
    const entry = await fs.lstat(target);
    if (!entry.isFile() || entry.isSymbolicLink()) throw new HaldurFileOperationError(code, "目标必须是普通文件。", 400);
    const canonical = await fs.realpath(target);
    if (!isInside(root, canonical)) throw new HaldurFileOperationError(code, "下载目标不安全。", 400);
    return { normalized, target: canonical };
  } catch (error) {
    if (isMissing(error)) throw new HaldurFileOperationError(code, "文件不存在。", 404);
    throw error;
  }
}

async function readableRoot() {
  try {
    const config = getHaldurDesignSkillConfig();
    const entry = await fs.lstat(config.root);
    if (!entry.isDirectory() || entry.isSymbolicLink()) throw new Error("Haldur Skill Root 必须是非符号链接目录。");
    return await fs.realpath(config.root);
  } catch (error) {
    if (isMissing(error)) throw new HaldurDirectoryOperationError("ROOT_UNAVAILABLE", "Haldur Skill Root 不存在。", 503);
    throw new HaldurDirectoryOperationError("ROOT_UNAVAILABLE", error instanceof Error ? error.message : "Haldur Skill Root 不可用。", 503);
  }
}

async function assertAvailableName(parent: string, name: string, allowedExistingPath?: string) {
  const normalized = filePath(name);
  if (normalized.includes("/")) throw new HaldurDirectoryOperationError("INVALID_PATH", "文件名必须是单个名称。", 400);
  const entries = await fs.readdir(parent, { withFileTypes: true });
  const conflict = entries.find((entry) => caseKey(entry.name) === caseKey(normalized) && path.resolve(parent, entry.name) !== allowedExistingPath);
  if (conflict) throw new HaldurDirectoryOperationError("NAME_CONFLICT", "目标已存在同名文件或目录。", 409);
  return { name: normalized, target: path.join(parent, normalized) };
}

async function hashFile(filePathValue: string): Promise<FileIdentity> {
  const hash = createHash("sha256");
  let size = 0;
  for await (const chunk of createReadStream(filePathValue)) {
    const bytes = Buffer.from(chunk);
    size += bytes.byteLength;
    hash.update(bytes);
  }
  return { size, hash: hash.digest("hex") };
}

async function stage(source: AsyncIterable<Uint8Array>, directory: string): Promise<FileIdentity> {
  const payload = path.join(directory, "payload");
  const output = await fs.open(payload, "wx");
  const hash = createHash("sha256");
  const limit = maxUploadBytes();
  let size = 0;
  try {
    for await (const chunk of source) {
      const bytes = Buffer.from(chunk);
      size += bytes.byteLength;
      if (size > limit) throw new HaldurFileOperationError("FILE_TOO_LARGE", `上传文件超过 ${limit} bytes 限制。`, 413);
      hash.update(bytes);
      await output.write(bytes);
    }
    await output.close();
    const result = { size, hash: hash.digest("hex") };
    const verified = await hashFile(payload);
    if (verified.size !== result.size || verified.hash !== result.hash) throw new HaldurFileOperationError("HASH_MISMATCH", "Staging 文件完整性校验失败。", 500);
    return result;
  } catch (error) {
    await output.close().catch(() => undefined);
    await fs.rm(directory, { recursive: true, force: true }).catch(() => undefined);
    if (error instanceof HaldurDirectoryOperationError) throw error;
    throw new HaldurFileOperationError("STAGING_FAILED", error instanceof Error ? error.message : "文件 Staging 失败。", 500);
  }
}

async function assertDiskSpace(runtimeRoot: string, bytesNeeded: number) {
  const minimum = Number(process.env.HALDUR_DESIGN_SKILL_MIN_FREE_BYTES ?? "0");
  try {
    const stats = await fs.statfs(runtimeRoot);
    const free = Number(stats.bavail) * Number(stats.bsize);
    if (!Number.isFinite(free) || free < bytesNeeded + Math.max(0, minimum)) throw new HaldurFileOperationError("DISK_SPACE_INSUFFICIENT", "磁盘可用空间不足，未开始正式文件替换。", 507);
  } catch (error) {
    if (error instanceof HaldurDirectoryOperationError) throw error;
    throw new HaldurFileOperationError("DISK_SPACE_INSUFFICIENT", "无法确认磁盘可用空间。", 507);
  }
}

async function snapshotAfterFile(root: string, source: string | undefined, target: string, expected?: FileIdentity) {
  if (source) await fs.lstat(path.resolve(root, ...source.split("/"))).then(() => { throw new HaldurDirectoryOperationError("HASH_MISMATCH", "源文件仍存在。", 500); }).catch((error) => { if (!isMissing(error)) throw error; });
  const file = await safeFile(root, target);
  const identity = await hashFile(file.target);
  if (expected && (expected.size !== identity.size || expected.hash !== identity.hash)) throw new HaldurFileOperationError("HASH_MISMATCH", "提交后的文件完整性校验失败。", 500);
  const snapshot = await haldurDesignSkillService.getSnapshot();
  if (!snapshot.rootAvailable || !snapshot.revision) throw new HaldurDirectoryOperationError("VERIFY_FAILED", "Haldur Root 重扫失败。", 500);
  return { snapshot, identity };
}

async function runFileTransaction(input: { operationType: HaldurDirectoryOperationType; revision: string; operator: string; source?: string; target?: string; mutate: (context: HaldurTransactionContext) => Promise<void>; rollback: (context: HaldurTransactionContext) => Promise<void>; verify: (root: string) => Promise<HaldurDesignSkillSnapshot>; metadata: () => Promise<HaldurMetadataChange>; cleanup?: () => Promise<void>; hasPartialMutation?: () => boolean }) {
  const roots = await getHaldurWritableRoots();
  return withHaldurRootWriteLock(roots.root, async (): Promise<HaldurDirectoryOperationResult> => {
    await assertHaldurNoRecovery(roots.runtimeRoot);
    const before = await requireHaldurRevision(input.revision);
    const operationId = randomUUID();
    const context: HaldurTransactionContext = {
      root: roots.root, runtimeRoot: roots.runtimeRoot, journalPath: path.join(roots.runtimeRoot, "journal", `${operationId}.json`),
      journal: { operationId, operationType: input.operationType, sourceRelativePath: input.source, targetRelativePath: input.target, revisionBefore: before.revision!, operator: input.operator, startedAt: new Date().toISOString(), status: "prepared", rollbackResult: "not-required" }
    };
    await writeHaldurJournal(context);
    let mutated = false;
    let metadata: HaldurMetadataChange = null;
    try {
      context.journal.status = "mutating";
      await writeHaldurJournal(context);
      await input.mutate(context);
      mutated = true;
      context.journal.status = "verifying";
      await writeHaldurJournal(context);
      const snapshot = await input.verify(roots.root);
      context.journal.status = "metadata";
      await writeHaldurJournal(context);
      metadata = await input.metadata();
      context.journal.revisionAfter = snapshot.revision!;
      context.journal.status = "committed";
      context.journal.completedAt = new Date().toISOString();
      await writeHaldurJournal(context);
      await writeHaldurAudit(roots.runtimeRoot, context.journal);
      await input.cleanup?.();
      return { operationId, snapshot };
    } catch (error) {
      const original = error instanceof HaldurDirectoryOperationError ? error : new HaldurDirectoryOperationError("FILESYSTEM_FAILED", error instanceof Error ? error.message : "Haldur 文件操作失败。", 500);
      if (!mutated && !input.hasPartialMutation?.()) {
        context.journal.status = "rolled-back"; context.journal.errorCode = original.code; context.journal.completedAt = new Date().toISOString();
        await writeHaldurJournal(context).catch(() => undefined);
        await input.cleanup?.().catch(() => undefined);
        throw original;
      }
      try {
        context.journal.status = "rollback"; context.journal.errorCode = original.code;
        await writeHaldurJournal(context);
        await input.rollback(context);
        await restoreHaldurMetadata(metadata);
        context.journal.status = "rolled-back"; context.journal.rollbackResult = "succeeded"; context.journal.completedAt = new Date().toISOString();
        await writeHaldurJournal(context);
        await input.cleanup?.().catch(() => undefined);
        throw original;
      } catch (rollbackError) {
        if (rollbackError === original) throw original;
        context.journal.status = "recovery-required"; context.journal.rollbackResult = "failed"; context.journal.completedAt = new Date().toISOString();
        await writeHaldurJournal(context).catch(() => undefined);
        throw new HaldurDirectoryOperationError("ROLLBACK_FAILED", "文件操作无法安全回滚，模块已进入只读恢复状态。", 423);
      }
    }
  });
}

export const haldurDesignSkillFileService = {
  async readMarkdown(relativePath: string) {
    const root = await readableRoot();
    const file = await safeFile(root, relativePath, "DOWNLOAD_UNSAFE");
    assertMarkdownPath(file.normalized);
    const stat = await fs.stat(file.target);
    const limit = maxMarkdownBytes();
    if (stat.size > limit) throw new HaldurFileOperationError("MARKDOWN_TOO_LARGE", `Markdown 文件超过 ${limit} bytes 在线编辑限制。`, 413);
    const snapshot = await haldurDesignSkillService.getSnapshot();
    if (!snapshot.rootAvailable || !snapshot.revision) throw new HaldurDirectoryOperationError("VERIFY_FAILED", "Haldur Root 重扫失败。", 500);
    return {
      path: file.normalized,
      name: path.basename(file.normalized),
      content: decodeMarkdown(await fs.readFile(file.target)),
      revision: snapshot.revision,
      size: stat.size,
      readOnly: await hasHaldurRecoveryRequired(getHaldurDesignSkillConfig().runtimeRoot)
    };
  },

  async saveMarkdown(input: { relativePath: string; content: string; revision: string; operator: string }) {
    const normalized = filePath(input.relativePath);
    assertMarkdownPath(normalized);
    const bytes = Buffer.from(input.content, "utf8");
    const limit = maxMarkdownBytes();
    if (bytes.byteLength > limit) throw new HaldurFileOperationError("MARKDOWN_TOO_LARGE", `Markdown 内容超过 ${limit} bytes 在线编辑限制。`, 413);
    const parentRelativePath = normalized.includes("/") ? normalized.slice(0, normalized.lastIndexOf("/")) : "";
    return this.upload({
      targetParentRelativePath: parentRelativePath,
      originalFileName: path.basename(normalized),
      revision: input.revision,
      overwrite: true,
      source: (async function* () { yield bytes; })(),
      mime: "text/markdown; charset=utf-8",
      operator: input.operator
    });
  },

  async upload(input: UploadInput) {
    const parentRelativePath = filePath(input.targetParentRelativePath, { allowRoot: true });
    const originalFileName = filePath(input.originalFileName);
    if (originalFileName.includes("/")) throw new HaldurDirectoryOperationError("INVALID_PATH", "originalFileName 必须是单个文件名。", 400);
    let target = "";
    let stagingDirectory = "";
    let payload: FileIdentity | undefined;
    let backup = "";
    let backupMoved = false;
    return runFileTransaction({
      operationType: input.overwrite ? "overwrite-file" : "upload-file", revision: input.revision, operator: input.operator,
      mutate: async (context) => {
        const parent = await safeDirectory(context.root, parentRelativePath);
        const candidate = await assertAvailableName(parent.target, originalFileName, input.overwrite ? path.join(parent.target, originalFileName) : undefined);
        target = [parentRelativePath, candidate.name].filter(Boolean).join("/");
        context.journal.targetRelativePath = target;
        stagingDirectory = path.join(context.runtimeRoot, "staging", context.journal.operationId);
        context.journal.stagingPath = stagingDirectory;
        await fs.mkdir(stagingDirectory, { recursive: true });
        await writeHaldurJournal(context);
        payload = await stage(input.source, stagingDirectory);
        context.journal.payloadSize = payload.size; context.journal.payloadHash = payload.hash;
        await assertDiskSpace(context.runtimeRoot, payload.size * (input.overwrite ? 2 : 1));
        const existing = await fs.lstat(candidate.target).catch((error) => isMissing(error) ? undefined : Promise.reject(error));
        if (existing && !input.overwrite) throw new HaldurDirectoryOperationError("NAME_CONFLICT", "目标文件已存在；请显式声明 overwrite。", 409);
        if (existing && (!existing.isFile() || existing.isSymbolicLink())) throw new HaldurDirectoryOperationError("NAME_CONFLICT", "同名目录或不安全条目不能覆盖。", 409);
        if (existing) {
          backup = path.join(stagingDirectory, "original-backup");
          context.journal.backupPath = backup;
          await writeHaldurJournal(context);
          await fs.rename(candidate.target, backup);
          backupMoved = true;
        }
        try {
          await fs.rename(path.join(stagingDirectory, "payload"), candidate.target);
        } catch (error) {
          throw new HaldurFileOperationError("REPLACE_FAILED", error instanceof Error ? error.message : "文件替换失败。", 500);
        }
      },
      rollback: async (context) => {
        const targetPath = path.resolve(context.root, ...target.split("/"));
        await fs.rm(targetPath, { force: true });
        if (backup) await fs.rename(backup, targetPath);
      },
      verify: async (root) => (await snapshotAfterFile(root, undefined, target, payload)).snapshot,
      metadata: () => updateHaldurFileMetadata(target, { size: payload!.size, hash: payload!.hash, mime: input.mime ?? "application/octet-stream", updatedBy: input.operator, updatedAt: new Date().toISOString() }),
      hasPartialMutation: () => backupMoved,
      cleanup: async () => { if (stagingDirectory) await fs.rm(stagingDirectory, { recursive: true, force: true }); }
    });
  },

  async rename(input: { sourceRelativePath: string; newFileName: string; revision: string; operator: string }) {
    const source = filePath(input.sourceRelativePath); const name = filePath(input.newFileName);
    if (name.includes("/")) throw new HaldurDirectoryOperationError("INVALID_PATH", "newFileName 必须是单个文件名。", 400);
    const parentRelativePath = source.includes("/") ? source.slice(0, source.lastIndexOf("/")) : "";
    let target = ""; let identity: FileIdentity | undefined;
    return runFileTransaction({ operationType: "rename-file", revision: input.revision, operator: input.operator, source,
      mutate: async (context) => { const file = await safeFile(context.root, source); identity = await hashFile(file.target); const parent = await safeDirectory(context.root, parentRelativePath); const destination = await assertAvailableName(parent.target, name, file.target); target = [parentRelativePath, destination.name].filter(Boolean).join("/"); if (target === source) throw new HaldurDirectoryOperationError("INVALID_PATH", "文件名未发生变化。", 400); context.journal.targetRelativePath = target; await writeHaldurJournal(context); await fs.rename(file.target, destination.target); },
      rollback: async (context) => { await fs.rename((await safeFile(context.root, target)).target, path.resolve(context.root, ...source.split("/"))); },
      verify: async (root) => (await snapshotAfterFile(root, source, target, identity)).snapshot,
      metadata: () => migrateHaldurMetadata(source, target) });
  },

  async move(input: { sourceRelativePath: string; targetParentRelativePath: string; revision: string; operator: string }) {
    const source = filePath(input.sourceRelativePath); const targetParent = filePath(input.targetParentRelativePath, { allowRoot: true });
    let target = ""; let identity: FileIdentity | undefined;
    return runFileTransaction({ operationType: "move-file", revision: input.revision, operator: input.operator, source,
      mutate: async (context) => { const file = await safeFile(context.root, source); identity = await hashFile(file.target); const parent = await safeDirectory(context.root, targetParent); const destination = await assertAvailableName(parent.target, path.basename(source), file.target); target = [targetParent, destination.name].filter(Boolean).join("/"); if (target === source) throw new HaldurDirectoryOperationError("INVALID_PATH", "文件已位于目标位置。", 400); context.journal.targetRelativePath = target; await writeHaldurJournal(context); await fs.rename(file.target, destination.target); },
      rollback: async (context) => { await fs.rename((await safeFile(context.root, target)).target, path.resolve(context.root, ...source.split("/"))); },
      verify: async (root) => (await snapshotAfterFile(root, source, target, identity)).snapshot,
      metadata: () => migrateHaldurMetadata(source, target) });
  },

  async delete(input: { sourceRelativePath: string; revision: string; operator: string }) {
    const source = filePath(input.sourceRelativePath); let trash = ""; let identity: FileIdentity | undefined;
    return runFileTransaction({ operationType: "delete-file", revision: input.revision, operator: input.operator, source,
      mutate: async (context) => { const file = await safeFile(context.root, source); identity = await hashFile(file.target); const directory = path.join(context.runtimeRoot, "trash", context.journal.operationId); await fs.mkdir(directory, { recursive: true }); trash = path.join(directory, path.basename(source)); context.journal.trashPath = trash; await writeHaldurJournal(context); await fs.rename(file.target, trash); },
      rollback: async (context) => { const restored = await hashFile(trash); if (restored.hash !== identity!.hash || restored.size !== identity!.size) throw new HaldurFileOperationError("HASH_MISMATCH", "Trash 文件无法安全恢复。", 500); await fs.rename(trash, path.resolve(context.root, ...source.split("/"))); },
      verify: async (root) => { await fs.lstat(path.resolve(root, ...source.split("/"))).then(() => { throw new HaldurFileOperationError("HASH_MISMATCH", "源文件仍存在。", 500); }).catch((error) => { if (!isMissing(error)) throw error; }); const trashed = await hashFile(trash); if (trashed.hash !== identity!.hash || trashed.size !== identity!.size) throw new HaldurFileOperationError("HASH_MISMATCH", "Trash 文件完整性校验失败。", 500); const snapshot = await haldurDesignSkillService.getSnapshot(); if (!snapshot.rootAvailable || !snapshot.revision) throw new HaldurDirectoryOperationError("VERIFY_FAILED", "Haldur Root 重扫失败。", 500); return snapshot; },
      metadata: () => migrateHaldurMetadata(source) });
  },

  async download(relativePath: string) {
    const root = await readableRoot();
    const file = await safeFile(root, relativePath, "DOWNLOAD_UNSAFE");
    const handle = await fs.open(file.target, "r");
    const stat = await handle.stat();
    if (!stat.isFile()) { await handle.close(); throw new HaldurFileOperationError("DOWNLOAD_UNSAFE", "下载目标不安全。", 400); }
    return { name: path.basename(file.normalized), size: stat.size, stream: Readable.toWeb(handle.createReadStream()) as ReadableStream<Uint8Array> };
  }
};
