import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import type { MarkdownKnowledgeDocument, MarkdownKnowledgeMetadata } from "@/types/markdownKnowledge";

type RecordEntry = { metadata: MarkdownKnowledgeMetadata; file: string; sha256: string };
type Index = { schemaVersion: 1; revision: number; topics: string[]; documents: Record<string, RecordEntry> };
type Change = { file: string; before: string | null; after: string | null };
type Journal = { before: Index; after: Index; changes: Change[] };
export const microSha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const empty = (): Index => ({ schemaVersion: 1, revision: 0, topics: [], documents: {} });
const indexName = ".micro-index.json";
const journalName = ".micro-transaction.json";
const missing = (e: unknown) => (e as NodeJS.ErrnoException).code === "ENOENT";

export function microSegment(value: string) {
  if (typeof value !== "string" || !value || value !== value.normalize("NFC") || value !== value.trim()
    || value === "." || value === ".." || value.startsWith(".") || /[<>:"/\\|?*\x00-\x1f%]/.test(value)
    || /[. ]$/.test(value) || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(value)
    || Buffer.byteLength(value) > 220) throw Error("名称包含非法路径、保留名称或过长字符。");
  return value;
}
function safeRelative(file: string) {
  const parts = file.split("/");
  if (parts.length !== 2) throw Error("微规范文件必须在一层主题目录中。");
  parts.forEach(microSegment);
  if (!parts[1].endsWith(".md")) throw Error("只允许 Markdown 文件。");
  return file;
}
const collision = (a: string, b: string) => a.normalize("NFC").toLowerCase() === b.normalize("NFC").toLowerCase();
export function microFileName(title: string, id: string) {
  // Titles remain intact in metadata. Long/colliding legacy titles get traceable stable IDs.
  let stem = title.normalize("NFC").replace(/[<>:"/\\|?*\x00-\x1f%]/g, "-").trim().replace(/[. ]+$/, "");
  if (!stem || stem.startsWith(".") || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(stem)) stem = "规范-" + stem;
  while (Buffer.byteLength(stem) > 170) stem = Array.from(stem).slice(0, -1).join("");
  return microSegment(`${stem}--${microSha(id).slice(0, 10)}.md`);
}

export class MicroStandardStore {
  constructor(readonly root: string, readonly excludedRoots: string[] = [], private fault?: (phase: string) => void) {}
  async assertRoot() {
    if (!path.isAbsolute(this.root)) throw Error("微规范根必须显式指定绝对路径。");
    const resolved = path.resolve(this.root);
    for (const other of this.excludedRoots.filter(Boolean)) {
      const p = path.resolve(other);
      if ([path.relative(p, resolved), path.relative(resolved, p)].some(r => r === "" || (!r.startsWith(".." + path.sep) && r !== ".." && !path.isAbsolute(r)))) throw Error("微规范根与程序、知识库或其他资产目录重叠。");
    }
    for (let p = resolved;; p = path.dirname(p)) {
      const stat = await fs.lstat(p);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw Error("微规范路径不允许链接或非目录。");
      if (p === path.dirname(p)) break;
    }
  }
  private async regular(file: string): Promise<string | null> {
    try {
      const s = await fs.lstat(file);
      if (!s.isFile() || s.isSymbolicLink() || s.nlink !== 1) throw Error("微规范文件不是安全的普通文件。");
      return await fs.readFile(file, "utf8");
    } catch (e) { if (missing(e)) return null; throw e; }
  }
  private async topicExists(topic: string) {
    microSegment(topic);
    const s = await fs.lstat(path.join(this.root, topic));
    if (!s.isDirectory() || s.isSymbolicLink()) throw Error("主题不是安全的真实文件夹。");
  }
  private async atomic(file: string, text: string) {
    const temporary = file + ".tmp-" + randomUUID();
    try { await fs.writeFile(temporary, text, { flag: "wx", mode: 0o600 }); await fs.rename(temporary, file); }
    finally { await fs.rm(temporary, { force: true }); }
  }
  private async readIndex(): Promise<Index> {
    const text = await this.regular(path.join(this.root, indexName));
    if (text === null) throw Error("微规范索引缺失；不会自动初始化空库，请先完成显式迁移或首次初始化。");
    const data = JSON.parse(text) as Index;
    if (data.schemaVersion !== 1 || !Number.isSafeInteger(data.revision) || !Array.isArray(data.topics) || !data.documents || Array.isArray(data.documents)) throw Error("微规范索引无效。");
    for (const t of data.topics) microSegment(t);
    const files: string[] = [];
    for (const [id, entry] of Object.entries(data.documents)) {
      if (entry.metadata.id !== id || entry.metadata.documentType !== "micro-spec" || !data.topics.includes(entry.metadata.specTopic)
        || safeRelative(entry.file).split("/")[0] !== entry.metadata.specTopic || files.some(f => collision(f, entry.file))) throw Error("微规范索引与路径不一致。");
      files.push(entry.file);
    }
    return data;
  }
  private async apply(changes: Change[], side: "before" | "after") {
    for (const change of changes) {
      safeRelative(change.file);
      await this.topicExists(change.file.split("/")[0]);
      const target = path.join(this.root, change.file);
      await this.regular(target); // Never overwrite a link or special file.
      if (change[side] === null) await fs.rm(target, { force: true });
      else await this.atomic(target, change[side]!);
    }
  }
  private async recover() {
    const text = await this.regular(path.join(this.root, journalName));
    if (!text) return;
    const j = JSON.parse(text) as Journal;
    const current = await this.readIndex();
    const committed = JSON.stringify(current) === JSON.stringify(j.after);
    await this.apply(j.changes, committed ? "after" : "before");
    if (!committed) await this.atomic(path.join(this.root, indexName), JSON.stringify(j.before, null, 2) + "\n");
    await fs.unlink(path.join(this.root, journalName));
  }
  private async locked<T>(action: () => Promise<T>): Promise<T> {
    await this.assertRoot();
    const lock = path.join(this.root, ".micro-lock");
    let handle;
    for (let attempt = 0; attempt < 60; attempt++) {
      try { handle = await fs.open(lock, "wx", 0o600); await handle.writeFile(String(process.pid)); break; }
      catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
        const pid = Number(await this.regular(lock));
        if (Number.isSafeInteger(pid) && pid > 0) {
          try { process.kill(pid, 0); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ESRCH") { await fs.unlink(lock).catch(() => undefined); continue; } }
        }
        await new Promise(r => setTimeout(r, 30));
      }
    }
    if (!handle) throw Error("微规范正在写入，请稍后刷新确认结果，勿重复提交。");
    try { await this.recover(); return await action(); }
    finally { await handle.close(); await fs.unlink(lock); }
  }
  private async commit(before: Index, after: Index, proposed: Array<{ file: string; content: string | null }>) {
    const changes: Change[] = [];
    for (const change of proposed) {
      safeRelative(change.file); await this.topicExists(change.file.split("/")[0]);
      changes.push({ file: change.file, before: await this.regular(path.join(this.root, change.file)), after: change.content });
    }
    after.revision = before.revision + 1;
    const journal: Journal = { before, after, changes };
    await fs.writeFile(path.join(this.root, journalName), JSON.stringify(journal), { flag: "wx", mode: 0o600 });
    try {
      await this.apply(changes, "after"); this.fault?.("files-written");
      await this.atomic(path.join(this.root, indexName), JSON.stringify(after, null, 2) + "\n");
    } catch (e) { await this.recover(); throw e; }
    await fs.unlink(path.join(this.root, journalName));
  }
  async list() {
    return this.locked(async () => {
      const index = await this.readIndex();
      for (const topic of index.topics) await this.topicExists(topic);
      const docs: MarkdownKnowledgeMetadata[] = [];
      for (const entry of Object.values(index.documents)) {
        const content = await this.regular(path.join(this.root, entry.file));
        if (content === null || microSha(content) !== entry.sha256) throw Error("微规范正文缺失或哈希改变，请核对资产，不会使用旧知识库副本替代。");
        docs.push(entry.metadata);
      }
      return { documents: docs, topics: index.topics, revision: index.revision, diagnostics: [] };
    });
  }
  async get(id: string): Promise<MarkdownKnowledgeDocument | null> {
    return this.locked(async () => {
      const index = await this.readIndex();
      const entry = Object.hasOwn(index.documents, id) ? index.documents[id] : undefined;
      if (!entry) return null;
      await this.topicExists(entry.metadata.specTopic!);
      const content = await this.regular(path.join(this.root, entry.file));
      if (content === null || microSha(content) !== entry.sha256) throw Error("微规范正文缺失或校验失败。");
      return { metadata: entry.metadata, content };
    });
  }
  async put(document: MarkdownKnowledgeDocument, revision?: number, importing = false) {
    return this.locked(async () => {
      const before = await this.readIndex(), after = structuredClone(before);
      const m = document.metadata;
      if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(m.id) || m.documentType !== "micro-spec" || document.content === null) throw Error("微规范数据无效。");
      if (!before.topics.includes(m.specTopic)) throw Error("请选择已存在的规范主题文件夹。");
      if (revision !== undefined && revision !== before.revision) throw Error("资产已更新，请刷新后再编辑。");
      const current = Object.hasOwn(before.documents, m.id) ? before.documents[m.id] : undefined;
      const file = `${m.specTopic}/${microFileName(m.title, m.id)}`, sha256 = microSha(document.content);
      if (importing && current) {
        if (JSON.stringify(current.metadata) !== JSON.stringify(m) || current.sha256 !== sha256 || current.file !== file) throw Error("目标资产已变化，迁移停止，禁止覆盖。");
        const existing = await this.regular(path.join(this.root, current.file));
        if (existing !== document.content) throw Error("目标文件与迁移源冲突。");
        return document;
      }
      if (!importing && (!current || current.metadata.title !== m.title || current.metadata.specTopic !== m.specTopic) && Object.values(before.documents).some(e => e.metadata.id !== m.id && e.metadata.specTopic === m.specTopic && collision(e.metadata.title, m.title))) throw Error("同主题已有同名规范，请调整名称。");
      const destination = await this.regular(path.join(this.root, file));
      if (file !== current?.file && destination !== null) throw Error("目标文件已存在，未覆盖。");
      after.documents[m.id] = { metadata: m, file, sha256 };
      const changes: Array<{ file: string; content: string | null }> = [{ file, content: document.content }];
      if (current && current.file !== file) changes.push({ file: current.file, content: null });
      await this.commit(before, after, changes);
      return document;
    });
  }
  async topic(action: "create" | "rename" | "delete", name: string, next?: string) {
    return this.locked(async () => {
      microSegment(name); if (next !== undefined) microSegment(next);
      const before = await this.readIndex(), after = structuredClone(before);
      if (action === "create") {
        if (before.topics.some(t => collision(t, name))) throw Error("主题已存在。");
        await fs.mkdir(path.join(this.root, name));
        try { after.topics.push(name); await this.commit(before, after, []); }
        catch (e) { await fs.rmdir(path.join(this.root, name)).catch(() => undefined); throw e; }
      } else {
        if (!before.topics.includes(name)) throw Error("主题不存在。");
        await this.topicExists(name);
        if (action === "delete") {
          if ((await fs.readdir(path.join(this.root, name))).length || Object.values(before.documents).some(e => e.metadata.specTopic === name)) throw Error("仅允许删除空主题，请先移动规范。");
          after.topics = after.topics.filter(t => t !== name);
          await this.commit(before, after, []); await fs.rmdir(path.join(this.root, name));
        } else {
          if (!next || before.topics.some(t => collision(t, next))) throw Error("新主题名称已存在或无效。");
          await fs.mkdir(path.join(this.root, next));
          const changes: Array<{ file: string; content: string | null }> = [];
          for (const entry of Object.values(after.documents).filter(e => e.metadata.specTopic === name)) {
            const content = await this.regular(path.join(this.root, entry.file));
            if (content === null || microSha(content) !== entry.sha256) throw Error("主题中正文校验失败。");
            const old = entry.file; entry.file = `${next}/${path.basename(old)}`; entry.metadata = { ...entry.metadata, specTopic: next };
            changes.push({ file: entry.file, content }, { file: old, content: null });
          }
          // Refuse hidden/unindexed files rather than silently abandoning their ownership.
          if ((await fs.readdir(path.join(this.root, name))).length !== changes.length / 2) throw Error("主题包含未索引文件，停止重命名。");
          after.topics = after.topics.map(t => t === name ? next : t);
          try { await this.commit(before, after, changes); }
          catch (e) { await fs.rmdir(path.join(this.root, next)).catch(() => undefined); throw e; }
          await fs.rmdir(path.join(this.root, name));
        }
      }
    });
  }
}

// Explicit initialization only: normal service reads never create a missing root/index.
export async function initializeMicroRoot(root: string) {
  await fs.mkdir(root, { mode: 0o700 });
  await new MicroStandardStore(root).assertRoot();
  await fs.writeFile(path.join(root, indexName), JSON.stringify(empty(), null, 2) + "\n", { flag: "wx", mode: 0o600 });
}
