import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { getHaldurDesignSkillConfig } from "@/config/haldurDesignSkill";
import { readJsonFileForMutation, writeJsonFile } from "@/lib/storage/jsonStorage";
import { haldurDesignSkillService, normalizeHaldurRelativePath } from "@/services/haldurDesignSkillService";
import type { HaldurDesignSkillMetadataStore, HaldurDesignSkillSnapshot, HaldurDirectoryJournal, HaldurDirectoryOperationResult, HaldurDirectoryOperationType } from "@/types/haldurDesignSkill";

const metadataFile = "haldur-design-skill.json";
const rootQueues = new Map<string, Promise<void>>();

export type HaldurOperationErrorCode = "ROOT_UNAVAILABLE" | "INVALID_PATH" | "PATH_OUTSIDE_ROOT" | "NAME_CONFLICT" | "REVISION_CONFLICT" | "SOURCE_NOT_FOUND" | "TARGET_NOT_FOUND" | "INVALID_MOVE" | "JOURNAL_FAILED" | "FILESYSTEM_FAILED" | "VERIFY_FAILED" | "METADATA_FAILED" | "ROLLBACK_FAILED" | "RECOVERY_REQUIRED" | "FILE_NOT_FOUND" | "FILE_TOO_LARGE" | "STAGING_FAILED" | "HASH_MISMATCH" | "DISK_SPACE_INSUFFICIENT" | "REPLACE_FAILED" | "DOWNLOAD_UNSAFE" | "MARKDOWN_REQUIRED" | "MARKDOWN_TOO_LARGE" | "MARKDOWN_ENCODING_UNSUPPORTED";

export class HaldurDirectoryOperationError extends Error {
  constructor(public readonly code: HaldurOperationErrorCode, message: string, public readonly status: number, public readonly currentRevision?: string) {
    super(message);
    this.name = "HaldurDirectoryOperationError";
  }
}

export type HaldurTransactionContext = {
  root: string;
  runtimeRoot: string;
  journalPath: string;
  journal: HaldurDirectoryJournal;
};

export type HaldurMetadataChange = { previous: HaldurDesignSkillMetadataStore; next: HaldurDesignSkillMetadataStore } | null;

function isInside(parentPath: string, candidatePath: string) {
  const relative = path.relative(parentPath, candidatePath);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function isMissing(error: unknown) {
  return (error as NodeJS.ErrnoException).code === "ENOENT";
}

function errorFrom(error: unknown, fallback: HaldurOperationErrorCode, message: string) {
  return error instanceof HaldurDirectoryOperationError ? error : new HaldurDirectoryOperationError(fallback, error instanceof Error ? error.message : message, 500);
}

function directoryPath(value: string, options: { allowRoot?: boolean } = {}) {
  try {
    return normalizeHaldurRelativePath(value, options);
  } catch (error) {
    throw new HaldurDirectoryOperationError("INVALID_PATH", error instanceof Error ? error.message : "Haldur 路径非法。", 400);
  }
}

function caseKey(name: string) {
  return name.normalize("NFC").toLocaleLowerCase("en-US");
}

export async function withHaldurRootWriteLock<T>(key: string, action: () => Promise<T>) {
  const previous = rootQueues.get(key) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const current = previous.catch(() => undefined).then(() => gate);
  rootQueues.set(key, current);
  await previous.catch(() => undefined);
  try {
    return await action();
  } finally {
    release();
    if (rootQueues.get(key) === current) rootQueues.delete(key);
  }
}

export async function getHaldurWritableRoots() {
  const config = getHaldurDesignSkillConfig();
  try {
    const rootEntry = await fs.lstat(config.root);
    if (!rootEntry.isDirectory() || rootEntry.isSymbolicLink()) throw new Error("Root is unsafe.");
    const root = await fs.realpath(config.root);
    await fs.mkdir(config.runtimeRoot, { recursive: true });
    const runtimeEntry = await fs.lstat(config.runtimeRoot);
    if (!runtimeEntry.isDirectory() || runtimeEntry.isSymbolicLink()) throw new Error("Runtime Root is unsafe.");
    const runtimeRoot = await fs.realpath(config.runtimeRoot);
    if (isInside(root, runtimeRoot) || isInside(runtimeRoot, root)) throw new Error("Root and Runtime Root overlap.");
    const [rootStats, runtimeStats] = await Promise.all([fs.stat(root), fs.stat(runtimeRoot)]);
    if (rootStats.dev !== runtimeStats.dev) throw new Error("Root 与 Runtime Root 必须位于同一文件系统，才能安全移动到 Trash。");
    return { root, runtimeRoot };
  } catch (error) {
    if (isMissing(error)) throw new HaldurDirectoryOperationError("ROOT_UNAVAILABLE", "Haldur Skill Root 不存在；写操作不会自动创建 Root。", 503);
    throw new HaldurDirectoryOperationError("ROOT_UNAVAILABLE", error instanceof Error ? error.message : "Haldur Root 不可用。", 503);
  }
}

async function safeDirectory(root: string, relativePath: string, missingCode: HaldurOperationErrorCode = "SOURCE_NOT_FOUND") {
  const normalized = directoryPath(relativePath, { allowRoot: true });
  const target = path.resolve(root, ...normalized.split("/").filter(Boolean));
  if (!isInside(root, target)) throw new HaldurDirectoryOperationError("PATH_OUTSIDE_ROOT", "目标路径越出 Haldur Root。", 400);
  try {
    const entry = await fs.lstat(target);
    if (!entry.isDirectory() || entry.isSymbolicLink()) throw new HaldurDirectoryOperationError("INVALID_PATH", "目标必须是非符号链接目录。", 400);
    const canonical = await fs.realpath(target);
    if (!isInside(root, canonical)) throw new HaldurDirectoryOperationError("PATH_OUTSIDE_ROOT", "目标路径越出 Haldur Root。", 400);
    return { normalized, target: canonical };
  } catch (error) {
    if (isMissing(error)) throw new HaldurDirectoryOperationError(missingCode, "目标目录不存在。", 404);
    throw error;
  }
}

async function assertAvailableName(parent: string, name: string, allowedExistingPath?: string) {
  const normalized = directoryPath(name);
  if (normalized.includes("/")) throw new HaldurDirectoryOperationError("INVALID_PATH", "目录名称不能包含路径分隔符。", 400);
  const candidate = path.join(parent, normalized);
  const entries = await fs.readdir(parent, { withFileTypes: true });
  const conflict = entries.find((entry) => caseKey(entry.name) === caseKey(normalized) && path.resolve(parent, entry.name) !== allowedExistingPath);
  if (conflict) throw new HaldurDirectoryOperationError("NAME_CONFLICT", "目标目录已存在同名文件或目录。", 409);
  return { name: normalized, target: candidate };
}

async function writeAtomic(filePath: string, value: unknown) {
  const temporary = `${filePath}.${randomUUID()}.tmp`;
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  try {
    await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    await fs.rename(temporary, filePath);
  } finally {
    await fs.rm(temporary, { force: true }).catch(() => undefined);
  }
}

export async function writeHaldurJournal(context: HaldurTransactionContext) {
  try {
    await writeAtomic(context.journalPath, context.journal);
  } catch (error) {
    throw new HaldurDirectoryOperationError("JOURNAL_FAILED", error instanceof Error ? error.message : "无法写入 Haldur Journal。", 500);
  }
}

export async function assertHaldurNoRecovery(runtimeRoot: string) {
  const journalDirectory = path.join(runtimeRoot, "journal");
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(journalDirectory, { withFileTypes: true });
  } catch (error) {
    if (isMissing(error)) return;
    throw new HaldurDirectoryOperationError("JOURNAL_FAILED", error instanceof Error ? error.message : "无法读取 Haldur Journal。", 500);
  }
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    try {
      const journal = JSON.parse(await fs.readFile(path.join(journalDirectory, entry.name), "utf8")) as Partial<HaldurDirectoryJournal>;
      if (journal.status !== "committed" && journal.status !== "rolled-back") {
        throw new HaldurDirectoryOperationError("RECOVERY_REQUIRED", "检测到未完成的 Haldur 文件事务，模块已进入只读恢复状态。", 423);
      }
    } catch (error) {
      if (error instanceof HaldurDirectoryOperationError) throw error;
      throw new HaldurDirectoryOperationError("RECOVERY_REQUIRED", "无法识别 Haldur Journal，模块已进入只读恢复状态。", 423);
    }
  }
}

export async function hasHaldurRecoveryRequired(runtimeRoot: string) {
  try {
    await assertHaldurNoRecovery(runtimeRoot);
    return false;
  } catch (error) {
    if (error instanceof HaldurDirectoryOperationError && error.code === "RECOVERY_REQUIRED") return true;
    return false;
  }
}

function remapMetadata(entries: Record<string, unknown>, source: string, target?: string) {
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(entries)) {
    if (key === source || key.startsWith(`${source}/`)) {
      if (target) next[`${target}${key.slice(source.length)}`] = value;
      continue;
    }
    next[key] = value;
  }
  return next;
}

export async function migrateHaldurMetadata(source: string, target?: string): Promise<HaldurMetadataChange> {
  try {
    const previous = await readJsonFileForMutation<HaldurDesignSkillMetadataStore>(metadataFile, { schemaVersion: 1, entries: {} });
    if (previous.schemaVersion !== 1 || !previous.entries || typeof previous.entries !== "object") throw new Error("Haldur Metadata Schema 无效。");
    const next = { schemaVersion: 1 as const, entries: remapMetadata(previous.entries, source, target) as HaldurDesignSkillMetadataStore["entries"] };
    if (JSON.stringify(previous.entries) === JSON.stringify(next.entries)) return null;
    await writeJsonFile(metadataFile, next);
    return { previous, next };
  } catch (error) {
    throw new HaldurDirectoryOperationError("METADATA_FAILED", error instanceof Error ? error.message : "Haldur Metadata 更新失败。", 500);
  }
}

export async function updateHaldurFileMetadata(relativePath: string, fields: Record<string, unknown>): Promise<HaldurMetadataChange> {
  try {
    const previous = await readJsonFileForMutation<HaldurDesignSkillMetadataStore>(metadataFile, { schemaVersion: 1, entries: {} });
    if (previous.schemaVersion !== 1 || !previous.entries || typeof previous.entries !== "object") throw new Error("Haldur Metadata Schema 无效。");
    const current = previous.entries[relativePath] ?? {};
    const next = { schemaVersion: 1 as const, entries: { ...previous.entries, [relativePath]: { ...current, ...fields } } };
    await writeJsonFile(metadataFile, next);
    return { previous, next };
  } catch (error) {
    throw new HaldurDirectoryOperationError("METADATA_FAILED", error instanceof Error ? error.message : "Haldur Metadata 更新失败。", 500);
  }
}

export async function restoreHaldurMetadata(change: HaldurMetadataChange) {
  if (!change) return;
  await writeJsonFile(metadataFile, change.previous);
}

export async function writeHaldurAudit(runtimeRoot: string, journal: HaldurDirectoryJournal) {
  try {
    await writeAtomic(path.join(runtimeRoot, "audit", `${journal.operationId}.json`), journal);
    return true;
  } catch (error) {
    // Audit is an operation trace, not transaction recovery evidence. A committed
    // filesystem change must never be rolled back solely because audit storage fails.
    return false;
  }
}

export async function requireHaldurRevision(revision: string) {
  const snapshot = await haldurDesignSkillService.getSnapshot();
  if (!snapshot.rootAvailable || !snapshot.revision) throw new HaldurDirectoryOperationError("ROOT_UNAVAILABLE", "Haldur Skill Root 不可用。", 503);
  if (snapshot.revision !== revision) throw new HaldurDirectoryOperationError("REVISION_CONFLICT", "目录已被其他操作修改，请刷新后重试。", 409, snapshot.revision);
  return snapshot;
}

async function verifyDirectory(root: string, source?: string, target?: string) {
  if (source) {
    const sourcePath = path.resolve(root, ...source.split("/"));
    await fs.lstat(sourcePath).then(() => { throw new HaldurDirectoryOperationError("VERIFY_FAILED", "源目录仍然存在。", 500); }).catch((error) => {
      if (isMissing(error)) return;
      throw error;
    });
  }
  if (target) await safeDirectory(root, target, "VERIFY_FAILED");
  const snapshot = await haldurDesignSkillService.getSnapshot();
  if (!snapshot.rootAvailable || !snapshot.revision) throw new HaldurDirectoryOperationError("VERIFY_FAILED", "Haldur Root 重扫失败。", 500);
  return snapshot;
}

async function executeDirectoryOperation(input: { operationType: HaldurDirectoryOperationType; revision: string; operator: string; source?: string; target?: string; mutate: (context: HaldurTransactionContext) => Promise<void>; rollback: (context: HaldurTransactionContext) => Promise<void>; verify: (root: string) => Promise<HaldurDesignSkillSnapshot>; metadata: () => Promise<HaldurMetadataChange> }) {
  const roots = await getHaldurWritableRoots();
  return withHaldurRootWriteLock(roots.root, async (): Promise<HaldurDirectoryOperationResult> => {
    await assertHaldurNoRecovery(roots.runtimeRoot);
    const before = await requireHaldurRevision(input.revision);
    const operationId = randomUUID();
    const context: HaldurTransactionContext = {
      root: roots.root,
      runtimeRoot: roots.runtimeRoot,
      journalPath: path.join(roots.runtimeRoot, "journal", `${operationId}.json`),
      journal: { operationId, operationType: input.operationType, sourceRelativePath: input.source, targetRelativePath: input.target, revisionBefore: before.revision!, operator: input.operator, startedAt: new Date().toISOString(), status: "prepared", rollbackResult: "not-required" }
    };
    await writeHaldurJournal(context);
    let mutated = false;
    let metadataChange: HaldurMetadataChange = null;
    try {
      context.journal.status = "mutating";
      await writeHaldurJournal(context);
      await input.mutate(context);
      mutated = true;
      context.journal.status = "verifying";
      await writeHaldurJournal(context);
      const verified = await input.verify(roots.root);
      context.journal.status = "metadata";
      await writeHaldurJournal(context);
      metadataChange = await input.metadata();
      context.journal.revisionAfter = verified.revision!;
      context.journal.status = "committed";
      context.journal.completedAt = new Date().toISOString();
      await writeHaldurJournal(context);
      await writeHaldurAudit(roots.runtimeRoot, context.journal);
      return { operationId, snapshot: verified };
    } catch (error) {
      const original = errorFrom(error, "FILESYSTEM_FAILED", "Haldur 目录操作失败。");
      if (!mutated) {
        context.journal.status = "rolled-back";
        context.journal.errorCode = original.code;
        context.journal.rollbackResult = "not-required";
        context.journal.completedAt = new Date().toISOString();
        await writeHaldurJournal(context).catch(() => undefined);
        throw original;
      }
      try {
        context.journal.status = "rollback";
        context.journal.errorCode = original.code;
        await writeHaldurJournal(context);
        await input.rollback(context);
        await restoreHaldurMetadata(metadataChange);
        await haldurDesignSkillService.getSnapshot();
        context.journal.status = "rolled-back";
        context.journal.rollbackResult = "succeeded";
        context.journal.completedAt = new Date().toISOString();
        await writeHaldurJournal(context);
        throw original;
      } catch (rollbackError) {
        if (rollbackError === original) throw original;
        context.journal.status = "recovery-required";
        context.journal.rollbackResult = "failed";
        context.journal.errorCode = errorFrom(rollbackError, "ROLLBACK_FAILED", "Haldur 回滚失败。").code;
        context.journal.completedAt = new Date().toISOString();
        await writeHaldurJournal(context).catch(() => undefined);
        throw new HaldurDirectoryOperationError("ROLLBACK_FAILED", "目录操作无法安全回滚，模块已进入只读恢复状态。", 423);
      }
    }
  });
}

export const haldurDesignSkillDirectoryService = {
  async createDirectory(input: { parentRelativePath: string; directoryName: string; revision: string; operator: string }) {
    const parentRelativePath = directoryPath(input.parentRelativePath, { allowRoot: true });
    const directoryName = directoryPath(input.directoryName);
    if (directoryName.includes("/")) throw new HaldurDirectoryOperationError("INVALID_PATH", "directoryName 必须是单个目录名。", 400);
    let targetRelativePath = "";
    return executeDirectoryOperation({
      operationType: "create-directory", revision: input.revision, operator: input.operator, target: undefined,
      mutate: async (context) => {
        const parent = await safeDirectory(context.root, parentRelativePath, "TARGET_NOT_FOUND");
        const target = await assertAvailableName(parent.target, directoryName);
        targetRelativePath = [parentRelativePath, target.name].filter(Boolean).join("/");
        context.journal.targetRelativePath = targetRelativePath;
        await writeHaldurJournal(context);
        await fs.mkdir(target.target);
      },
      rollback: async (context) => {
        const target = await safeDirectory(context.root, targetRelativePath, "VERIFY_FAILED");
        await fs.rmdir(target.target);
      },
      verify: (root) => verifyDirectory(root, undefined, targetRelativePath),
      metadata: async () => null
    });
  },

  async renameDirectory(input: { sourceRelativePath: string; directoryName: string; revision: string; operator: string }) {
    const source = directoryPath(input.sourceRelativePath);
    const directoryName = directoryPath(input.directoryName);
    if (directoryName.includes("/")) throw new HaldurDirectoryOperationError("INVALID_PATH", "directoryName 必须是单个目录名。", 400);
    const parentRelativePath = source.includes("/") ? source.slice(0, source.lastIndexOf("/")) : "";
    let target = "";
    return executeDirectoryOperation({
      operationType: "rename-directory", revision: input.revision, operator: input.operator, source,
      mutate: async (context) => {
        const sourceDirectory = await safeDirectory(context.root, source);
        const parent = await safeDirectory(context.root, parentRelativePath, "VERIFY_FAILED");
        const destination = await assertAvailableName(parent.target, directoryName, sourceDirectory.target);
        target = [parentRelativePath, destination.name].filter(Boolean).join("/");
        if (target === source) throw new HaldurDirectoryOperationError("INVALID_MOVE", "目录名称未发生变化。", 400);
        context.journal.targetRelativePath = target;
        await writeHaldurJournal(context);
        await fs.rename(sourceDirectory.target, destination.target);
      },
      rollback: async (context) => {
        const destination = await safeDirectory(context.root, target, "VERIFY_FAILED");
        const sourceTarget = path.resolve(context.root, ...source.split("/"));
        await fs.rename(destination.target, sourceTarget);
      },
      verify: (root) => verifyDirectory(root, source, target),
      metadata: () => migrateHaldurMetadata(source, target)
    });
  },

  async moveDirectory(input: { sourceRelativePath: string; targetParentRelativePath: string; revision: string; operator: string }) {
    const source = directoryPath(input.sourceRelativePath);
    const targetParent = directoryPath(input.targetParentRelativePath, { allowRoot: true });
    if (targetParent === source || targetParent.startsWith(`${source}/`)) throw new HaldurDirectoryOperationError("INVALID_MOVE", "不能将目录移动到自身或自身后代。", 400);
    let target = "";
    return executeDirectoryOperation({
      operationType: "move-directory", revision: input.revision, operator: input.operator, source,
      mutate: async (context) => {
        const sourceDirectory = await safeDirectory(context.root, source);
        const parent = await safeDirectory(context.root, targetParent, "TARGET_NOT_FOUND");
        const destination = await assertAvailableName(parent.target, path.basename(source), sourceDirectory.target);
        target = [targetParent, destination.name].filter(Boolean).join("/");
        if (target === source) throw new HaldurDirectoryOperationError("INVALID_MOVE", "目录已位于目标位置。", 400);
        context.journal.targetRelativePath = target;
        await writeHaldurJournal(context);
        await fs.rename(sourceDirectory.target, destination.target);
      },
      rollback: async (context) => {
        const destination = await safeDirectory(context.root, target, "VERIFY_FAILED");
        await fs.rename(destination.target, path.resolve(context.root, ...source.split("/")));
      },
      verify: (root) => verifyDirectory(root, source, target),
      metadata: () => migrateHaldurMetadata(source, target)
    });
  },

  async deleteDirectory(input: { sourceRelativePath: string; revision: string; operator: string }) {
    const source = directoryPath(input.sourceRelativePath);
    let trashPath = "";
    return executeDirectoryOperation({
      operationType: "delete-directory", revision: input.revision, operator: input.operator, source,
      mutate: async (context) => {
        const sourceDirectory = await safeDirectory(context.root, source);
        const trashDirectory = path.join(context.runtimeRoot, "trash", context.journal.operationId);
        await fs.mkdir(trashDirectory, { recursive: true });
        trashPath = path.join(trashDirectory, path.basename(source));
        context.journal.trashPath = trashPath;
        await writeHaldurJournal(context);
        await fs.rename(sourceDirectory.target, trashPath);
      },
      rollback: async (context) => {
        const entry = await fs.lstat(trashPath);
        if (!entry.isDirectory() || entry.isSymbolicLink()) throw new HaldurDirectoryOperationError("ROLLBACK_FAILED", "Trash 内容不安全。", 500);
        await fs.rename(trashPath, path.resolve(context.root, ...source.split("/")));
      },
      verify: async (root) => {
        const result = await verifyDirectory(root, source);
        const entry = await fs.lstat(trashPath);
        if (!entry.isDirectory() || entry.isSymbolicLink()) throw new HaldurDirectoryOperationError("VERIFY_FAILED", "Trash 中未发现完整目录。", 500);
        return result;
      },
      metadata: () => migrateHaldurMetadata(source)
    });
  }
};
