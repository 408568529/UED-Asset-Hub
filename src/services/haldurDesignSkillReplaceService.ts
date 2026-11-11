import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { haldurDesignSkillService, normalizeHaldurRelativePath } from "@/services/haldurDesignSkillService";
import { HaldurDirectoryOperationError as Failure, assertHaldurNoRecovery, getHaldurWritableRoots, requireHaldurRevision, retainHaldurMetadata, withHaldurRootWriteLock, writeHaldurJournal } from "@/services/haldurDesignSkillDirectoryService";
import { assertDiskSpace, hashFile, maxUploadBytes, runFileTransaction, stage } from "@/services/haldurDesignSkillFileService";

type FileSpec = { relativePath: string; size: number; hash?: string };
type Plan = { id: string; revision: string; files: FileSpec[]; directories: string[]; commitId?: string };
const key = (value: string) => value.normalize("NFC").toLocaleLowerCase("en-US");
const fail = (message: string) => new Failure("INVALID_PATH", message, 400);
function normalized(value: string) { try { return normalizeHaldurRelativePath(value); } catch { throw fail("完整覆盖清单包含非法路径。"); } }
async function location(id: string) {
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(id)) throw fail("批次标识无效。");
  const roots = await getHaldurWritableRoots();
  const base = path.join(roots.runtimeRoot, "staging", `replace-${id}`);
  // Only server-generated, non-linked staging directories are accepted.
  for (const current of [path.dirname(base), base]) { const stat = await fs.lstat(current); if (!stat.isDirectory() || stat.isSymbolicLink()) throw fail("暂存目录不可用。"); }
  return { ...roots, base };
}
async function load(id: string) {
  const paths = await location(id);
  const plan = JSON.parse(await fs.readFile(path.join(paths.base, "plan.json"), "utf8")) as Plan;
  if (plan.id !== id) throw fail("暂存清单不一致。");
  return { ...paths, plan };
}
async function save(base: string, plan: Plan) {
  const temporary = path.join(base, "plan.next.json");
  await fs.writeFile(temporary, JSON.stringify(plan), { flag: "wx" });
  await fs.rename(temporary, path.join(base, "plan.json"));
}
function lock<T>(root: string, id: string, action: () => Promise<T>) { return withHaldurRootWriteLock(`${root}:replace:${id}`, action); }
async function verifyTree(root: string, plan: Plan) {
  const expected = new Map([...plan.directories.map(p => [p, "directory"] as const), ...plan.files.map(f => [f.relativePath, "file"] as const)]);
  const specifications = new Map(plan.files.map(file => [file.relativePath, file]));
  const seen: string[] = [];
  async function walk(dir: string, prefix = "") {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const relative = prefix + entry.name, target = path.join(dir, entry.name);
      if (entry.isSymbolicLink() || expected.get(relative) !== (entry.isDirectory() ? "directory" : entry.isFile() ? "file" : "unsafe")) throw new Failure("HASH_MISMATCH", "暂存或提交目录与最终清单不一致。", 500);
      seen.push(relative);
      if (entry.isDirectory()) await walk(target, relative + "/");
      else { const spec = specifications.get(relative)!; const actual = await hashFile(target); if (!spec.hash || actual.hash !== spec.hash || actual.size !== spec.size) throw new Failure("HASH_MISMATCH", "完整覆盖文件校验失败。", 500); }
    }
  }
  await walk(root);
  if (seen.length !== expected.size) throw new Failure("HASH_MISMATCH", "清单中的文件或目录尚未全部上传。", 409);
}
export const haldurDesignSkillReplaceService = {
  async prepare(input: { revision: string; files: FileSpec[]; directories?: string[] }) {
    if (!Array.isArray(input.files) || !Array.isArray(input.directories ?? []) || input.files.length + (input.directories?.length ?? 0) > 4000) throw fail("完整覆盖最多支持4000个文件和显式目录。");
    if (!input.files.length && !input.directories?.length) throw fail("未选择内容，不能清空整个Skill。");
    const names = new Map<string, string>(), directories = new Set<string>();
    function register(value: string, type: string) { const canonical = key(value), previous = names.get(canonical); if (previous && (type === "file" || previous !== value + ":directory")) throw fail("清单包含同名、大小写等价或文件/目录冲突。"); names.set(canonical, value + ":" + type); }
    const files = input.files.map(file => { const relativePath = normalized(file?.relativePath); if (!Number.isSafeInteger(file.size) || file.size < 0 || file.size > maxUploadBytes()) throw fail("文件大小无效。"); register(relativePath, "file"); return { relativePath, size: file.size }; });
    for (const value of [...(input.directories ?? []), ...files.map(f => f.relativePath).flatMap(p => p.split("/").slice(0, -1).map((_, i, parts) => parts.slice(0, i + 1).join("/")))]) {
      const relative = normalized(value); for (const p of relative.split("/").map((_, i, parts) => parts.slice(0, i + 1).join("/"))) { register(p, "directory"); directories.add(p); }
    }
    if (directories.size + files.length > 4000) throw fail("展开后的文件与目录总数不能超过4000项。");
    const total = files.reduce((n, f) => n + f.size, 0);
    if (!Number.isSafeInteger(total) || total > 2 * 1024 ** 3) throw fail("完整覆盖单批总量不能超过2GiB。");
    const roots = await getHaldurWritableRoots();
    return withHaldurRootWriteLock(roots.root, async () => {
      await assertHaldurNoRecovery(roots.runtimeRoot); const before = await requireHaldurRevision(input.revision);
      if (before.diagnostics.some(d => ["unsafe-entry", "scan-failed", "metadata-invalid"].includes(d.code))) throw fail("原Skill含不安全或无法核对的条目，请先处理。");
      await assertDiskSpace(roots.runtimeRoot, total);
      const id = randomUUID(), base = path.join(roots.runtimeRoot, "staging", `replace-${id}`);
      await fs.mkdir(path.dirname(base), { recursive: true });
      if ((await fs.lstat(path.dirname(base))).isSymbolicLink()) throw fail("暂存父目录不允许符号链接。");
      await fs.mkdir(base); await fs.mkdir(path.join(base, "tree"));
      const plan: Plan = { id, revision: input.revision, files, directories: [...directories] };
      await fs.writeFile(path.join(base, "plan.json"), JSON.stringify(plan), { flag: "wx" });
      const target = new Set([...directories, ...files.map(f => f.relativePath)]), old = new Map(before.manifest.map(e => [e.relativePath, e]));
      return { id, files: files.length, directories: directories.size, removed: before.manifest.filter(e => !target.has(e.relativePath)).map(e => e.relativePath), updated: [...target].filter(p => old.has(p) && (!directories.has(p) || old.get(p)!.type !== "directory")), added: [...target].filter(p => !old.has(p)) };
    });
  },
  async upload(id: string, index: number, source: AsyncIterable<Uint8Array>) {
    const paths = await load(id);
    return lock(paths.root, id, async () => {
      const { plan, base } = await load(id);
      if (plan.commitId || !Number.isInteger(index) || !plan.files[index] || plan.files[index].hash) throw fail("文件已暂存、批次已提交或序号无效。");
      const file = plan.files[index], directory = path.join(base, `upload-${index}`);
      await fs.mkdir(directory); const payload = await stage(source, directory);
      if (payload.size !== file.size) throw new Failure("HASH_MISMATCH", "文件大小与提交清单不符。", 409);
      const target = path.join(base, "tree", ...file.relativePath.split("/")); await fs.mkdir(path.dirname(target), { recursive: true }); await fs.rename(path.join(directory, "payload"), target);
      file.hash = payload.hash; await save(base, plan);
      return { size: payload.size, hash: payload.hash };
    });
  },
  async status(id: string) {
    const { plan, runtimeRoot } = await load(id);
    if (!plan.commitId) return { status: "staging" };
    const journal = JSON.parse(await fs.readFile(path.join(runtimeRoot, "journal", plan.commitId + ".json"), "utf8"));
    return { status: journal.status, operationId: plan.commitId, revision: journal.revisionAfter };
  },
  async commit(id: string, revision: string, operator: string) {
    const paths = await load(id);
    return lock(paths.root, id, async () => {
      const { plan, base, root, runtimeRoot } = await load(id);
      if (plan.commitId || revision !== plan.revision) throw new Failure("REVISION_CONFLICT", "批次已提交或版本不匹配，请重新选择并核对。", 409);
      const tree = path.join(base, "tree");
      for (const dir of plan.directories) await fs.mkdir(path.join(tree, ...dir.split("/")), { recursive: true });
      await verifyTree(tree, plan);
      const movedOld: string[] = [], movedNew: string[] = []; let backup = "", beforeRevision = "";
      return runFileTransaction({ operationType: "replace-skill", revision, operator,
        mutate: async context => {
          beforeRevision = context.journal.revisionBefore;
          const before = await haldurDesignSkillService.getSnapshot(); if (before.diagnostics.some(d => ["unsafe-entry", "scan-failed", "metadata-invalid"].includes(d.code))) throw fail("原目录无法安全完整替换。");
          const oldNames = await fs.readdir(root), newNames = await fs.readdir(tree);
          backup = path.join(runtimeRoot, "trash", context.journal.operationId, "content"); await fs.mkdir(backup, { recursive: true });
          context.journal.trashPath = backup; context.journal.stagingPath = tree; context.journal.replacementEntries = { oldNames, newNames };
          await writeHaldurJournal(context); plan.commitId = context.journal.operationId; await save(base, plan);
          // Keep the Root directory and its ACL unchanged; journal both complete
          // entry lists before the first move so interrupted work is recoverable.
          for (const name of oldNames) { await fs.rename(path.join(root, name), path.join(backup, name)); movedOld.push(name); }
          for (const name of newNames) { await fs.rename(path.join(tree, name), path.join(root, name)); movedNew.push(name); }
        },
        rollback: async () => {
          for (const name of [...movedNew].reverse()) await fs.rename(path.join(root, name), path.join(tree, name));
          for (const name of [...movedOld].reverse()) await fs.rename(path.join(backup, name), path.join(root, name));
          if ((await haldurDesignSkillService.getSnapshot()).revision !== beforeRevision) throw new Failure("ROLLBACK_FAILED", "原Skill未完整恢复，需要人工恢复。", 423);
        },
        verify: async () => { await verifyTree(root, plan); const snapshot = await haldurDesignSkillService.getSnapshot(); if (!snapshot.rootAvailable || !snapshot.revision) throw new Failure("VERIFY_FAILED", "替换后目录不可读。", 500); return snapshot; },
        metadata: () => retainHaldurMetadata([...plan.directories, ...plan.files.map(f => f.relativePath)], path.join(path.dirname(backup), "metadata.before.json")),
        hasPartialMutation: () => movedOld.length > 0 || movedNew.length > 0
      });
    });
  }
};
