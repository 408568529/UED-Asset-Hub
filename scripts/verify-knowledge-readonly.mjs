import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const dataRoot = await mkdtemp(path.join(os.tmpdir(), "ued-knowledge-readonly-data-"));
const moduleRoot = await mkdtemp(path.join(os.tmpdir(), "ued-knowledge-readonly-module-"));
let outsideDirectory;
process.env.DATA_DIR = dataRoot;

function metadata(id, documentType, overrides = {}) {
  return {
    schemaVersion: 1,
    id,
    title: documentType === "project" ? "项目沉淀" : "知识文章",
    documentType,
    description: "用于只读验证的文档。",
    category: "测试",
    tags: ["readonly", "中文"],
    author: "UED",
    createdAt: "2026-08-26T08:00:00.000Z",
    updatedAt: "2026-08-26T09:00:00.000Z",
    contentFormat: "markdown",
    status: "published",
    legacySource: null,
    legacyId: null,
    ...overrides
  };
}

async function writeDocument(id, documentType, content, overrides) {
  const directory = path.join(dataRoot, "knowledge", id);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "metadata.json"), `${JSON.stringify(metadata(id, documentType, overrides), null, 2)}\n`, "utf8");
  if (content !== undefined) await writeFile(path.join(directory, "content.md"), content, "utf8");
}

async function snapshotTree(root) {
  if (!existsSync(root)) return [];
  const snapshot = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name);
      const relativePath = path.relative(root, absolutePath);
      if (entry.isDirectory()) {
        snapshot.push({ path: relativePath, type: "directory" });
        await visit(absolutePath);
      } else if (entry.isSymbolicLink()) {
        snapshot.push({ path: relativePath, type: "symlink" });
      } else {
        snapshot.push({ path: relativePath, type: "file", checksum: createHash("sha256").update(await readFile(absolutePath)).digest("hex") });
      }
    }
  }
  await visit(root);
  return snapshot.sort((left, right) => left.path.localeCompare(right.path));
}

try {
  const sourceRoot = path.join(process.cwd(), "src");
  const serviceSource = await readFile(path.join(sourceRoot, "services/markdownKnowledgeService.ts"), "utf8");
  await writeFile(path.join(moduleRoot, "storage.ts"), await readFile(path.join(sourceRoot, "config/storage.ts"), "utf8"), "utf8");
  await writeFile(path.join(moduleRoot, "markdownKnowledge.ts"), await readFile(path.join(sourceRoot, "types/markdownKnowledge.ts"), "utf8"), "utf8");
  await writeFile(path.join(moduleRoot, "markdownKnowledgeService.ts"), serviceSource
    .replace('"@/config/storage"', '"./storage.ts"')
    .replace('"@/types/markdownKnowledge"', '"./markdownKnowledge.ts"'), "utf8");
  const { markdownKnowledgeService, MarkdownKnowledgePathError } = await import(pathToFileURL(path.join(moduleRoot, "markdownKnowledgeService.ts")).href);

  assert.deepEqual(await markdownKnowledgeService.list(), { documents: [], diagnostics: [] });
  assert.equal(existsSync(path.join(dataRoot, "knowledge")), false, "list must not create a missing Knowledge Root");

  await writeDocument("knowledge_unicode", "knowledge", "# 中文 Markdown\n\n正文 ✅\n");
  await writeDocument("project_archive", "project", "# Project\n");
  await writeDocument("knowledge_empty", "knowledge", "");
  await writeDocument("knowledge_missing_content", "knowledge", undefined);
  await mkdir(path.join(dataRoot, "knowledge", "knowledge_missing_metadata"));
  await mkdir(path.join(dataRoot, "knowledge", "knowledge_invalid_metadata"));
  await writeFile(path.join(dataRoot, "knowledge", "knowledge_invalid_metadata", "metadata.json"), "{invalid json", "utf8");

  outsideDirectory = await mkdtemp(path.join(os.tmpdir(), "ued-knowledge-outside-"));
  await writeFile(path.join(outsideDirectory, "metadata.json"), "{}", "utf8");
  await symlink(outsideDirectory, path.join(dataRoot, "knowledge", "knowledge_symlink_escape"), "dir");

  const before = await snapshotTree(dataRoot);
  const listed = await markdownKnowledgeService.list();
  assert.deepEqual(listed.documents.map((item) => item.id).sort(), ["knowledge_empty", "knowledge_missing_content", "knowledge_unicode", "project_archive"]);
  assert.equal(listed.diagnostics.length, 3, "broken metadata and symlink entries must be isolated");
  assert.equal((await markdownKnowledgeService.readMetadata("knowledge_unicode"))?.title, "知识文章");
  assert.equal(await markdownKnowledgeService.readContent("knowledge_unicode"), "# 中文 Markdown\n\n正文 ✅\n");
  assert.equal((await markdownKnowledgeService.getById("knowledge_empty"))?.content, "");
  assert.equal((await markdownKnowledgeService.getById("knowledge_missing_content"))?.content, null);
  assert.equal(await markdownKnowledgeService.readMetadata("knowledge_missing_metadata"), null);

  for (const invalidId of ["../escape", "/tmp/escape", "C:\\escape", "%2e%2e", "knowledge%2fescape", "knowledge.with.dot"]) {
    await assert.rejects(markdownKnowledgeService.readMetadata(invalidId), MarkdownKnowledgePathError);
  }

  const after = await snapshotTree(dataRoot);
  assert.deepEqual(after, before, "Knowledge reads must not add, delete, rename, or modify any DATA_DIR file");
  console.log("[knowledge] Markdown service readonly, invalid-document, corruption, Unicode, and checksum verification passed.");
} finally {
  await Promise.all([rm(dataRoot, { recursive: true, force: true }), rm(moduleRoot, { recursive: true, force: true }), outsideDirectory ? rm(outsideDirectory, { recursive: true, force: true }) : Promise.resolve()]);
}
