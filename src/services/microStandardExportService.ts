import { microFileName, type MicroStandardStore } from "./microStandardStore";

// Export only indexed, hash-verified documents; never walk or zip the storage root.
export async function microStandardExportEntries(store: MicroStandardStore, topic?: string) {
  const before = await store.list();
  if (topic !== undefined && !before.topics.includes(topic)) throw Error("目标文件夹不存在。");
  const selected = before.documents.filter(doc => topic === undefined || doc.specTopic === topic);
  const entries: Array<{ name: string; content: string }> = [];
  let bytes = 0;
  for (const metadata of selected) {
    const document = await store.get(metadata.id);
    if (!document || document.content === null) throw Error("规范正文不可用，请刷新后重试。");
    bytes += Buffer.byteLength(document.content);
    if (bytes > 64 * 1024 * 1024) throw Error("下载内容超过 64 MiB，请按文件夹分别下载。");
    entries.push({ name: `${metadata.specTopic}/${microFileName(metadata.title, metadata.id)}`, content: document.content });
  }
  if ((await store.list()).revision !== before.revision) throw Error("规范目录已发生变化，请重新下载。");
  entries.push({ name: "micro-standards.json", content: JSON.stringify({ schemaVersion: 1, topics: topic === undefined ? before.topics : [topic], documents: selected }, null, 2) + "\n" });
  return entries;
}
