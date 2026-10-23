import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { MicroStandardStore, initializeMicroRoot, microFileName, microSha, microSegment } from "../src/services/microStandardStore";
import { parseMarkdownKnowledgeMetadata } from "../src/services/markdownKnowledgeService";
import type { MarkdownKnowledgeDocument } from "../src/types/markdownKnowledge";
export async function inventoryMicroStandards(data: string) {
  const root = path.join(data, "knowledge"), documents: MarkdownKnowledgeDocument[] = [], errors: string[] = [];
  for (const entry of await fs.readdir(root, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) { errors.push(`Unsafe entry: ${entry.name}`); continue; }
    if (!entry.isDirectory()) { errors.push(`Unexpected knowledge entry: ${entry.name}`); continue; }
    try {
      const dir = path.join(root, entry.name), meta = path.join(dir, "metadata.json"), content = path.join(dir, "content.md");
      if (!(await fs.lstat(meta)).isFile() || (await fs.lstat(meta)).isSymbolicLink()) throw Error("Unsafe metadata");
      const value = JSON.parse(await fs.readFile(meta, "utf8"));
      if (value.documentType !== "micro-spec") continue;
      const metadata = parseMarkdownKnowledgeMetadata(value, entry.name);
      microSegment(metadata.specTopic!);
      const st = await fs.lstat(content); if (!st.isFile() || st.isSymbolicLink()) throw Error("Unsafe or missing content");
      documents.push({ metadata, content: await fs.readFile(content, "utf8") });
    } catch (e) { errors.push(`${entry.name}: ${e instanceof Error ? e.message : "invalid record"}`); }
  }
  // Recognize possible historical sources without guessing an undocumented schema.
  try {
    for (const entry of await fs.readdir(path.join(data, "meta"), { withFileTypes: true })) {
      if (!entry.name.endsWith(".json")) continue;
      if (entry.isSymbolicLink() || !entry.isFile()) { errors.push(`Unsafe legacy source: ${entry.name}`); continue; }
      const text = await fs.readFile(path.join(data, "meta", entry.name), "utf8");
      const value = JSON.parse(text);
      const candidates = Array.isArray(value) ? value : Object.values(value);
      if (/micro.?spec/i.test(entry.name) || candidates.some(v => v && typeof v === "object" && (v.documentType === "micro-spec" || v.assetType === "micro-spec"))) errors.push(`Legacy source needs explicit reconciliation: meta/${entry.name}`);
    }
  } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") errors.push("Legacy JSON inspection failed"); }
  documents.sort((a, b) => a.metadata.id.localeCompare(b.metadata.id));
  const items = documents.map(d => ({ id: d.metadata.id, title: d.metadata.title, topic: d.metadata.specTopic, source: path.join(root, d.metadata.id), destination: `${d.metadata.specTopic}/${microFileName(d.metadata.title, d.metadata.id)}`, contentSha256: microSha(d.content!), metadataSha256: microSha(JSON.stringify(d.metadata)), metadata: d.metadata }));
  return { documents, report: { count: documents.length, items, errors } };
}
export async function migrateMicroStandards(data: string, target: string, copy = false) {
  const { documents, report } = await inventoryMicroStandards(data);
  if (!copy) return { phase: "dry-run", ...report };
  if (report.errors.length) throw Error("Migration blocked: " + report.errors.join("; "));
  const store = new MicroStandardStore(target, [data, process.cwd(), process.env.HALDUR_DESIGN_SKILL_ROOT || ""]);
  // Validate even an absent target against overlaps before creating anything.
  const parent = path.dirname(target); await new MicroStandardStore(parent).assertRoot();
  for (const excluded of store.excludedRoots.filter(Boolean)) {
    const relative = path.relative(path.resolve(excluded), path.resolve(target));
    const reverse = path.relative(path.resolve(target), path.resolve(excluded));
    if ([relative, reverse].some(r => r === "" || (!r.startsWith(".." + path.sep) && r !== ".." && !path.isAbsolute(r)))) throw Error("Migration destination overlaps source/program");
  }
  try { await fs.lstat(target); } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; await initializeMicroRoot(target); }
  const initial = await store.list();
  if (initial.documents.some(d => !documents.some(s => s.metadata.id === d.id))) throw Error("Target contains unrelated assets; not activated");
  for (const topic of [...new Set(documents.map(d => d.metadata.specTopic!))]) if (!initial.topics.includes(topic)) await store.topic("create", topic);
  for (const document of documents) await store.put(document, undefined, true);
  for (const document of documents) {
    const actual = await store.get(document.metadata.id);
    if (!actual || actual.content !== document.content || JSON.stringify(actual.metadata) !== JSON.stringify(document.metadata)) throw Error("Migration verification failed");
  }
  if ((await store.list()).documents.length !== documents.length) throw Error("Migration counts differ");
  const sourceAgain = await inventoryMicroStandards(data);
  if (JSON.stringify(sourceAgain.report) !== JSON.stringify(report)) throw Error("Source changed during migration; candidate not activated");
  return { phase: "verified-candidate", ...report, verified: true, active: false };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [mode, data, target] = process.argv.slice(2);
  if (!["dry-run", "copy"].includes(mode) || !data || !target || !path.isAbsolute(data) || !path.isAbsolute(target)) throw Error("Use dry-run|copy <absolute-old-DATA> <absolute-independent-root>");
  migrateMicroStandards(data, target, mode === "copy").then(r => console.log(JSON.stringify(r, null, 2))).catch(e => { console.error(e.message); process.exitCode = 1; });
}
