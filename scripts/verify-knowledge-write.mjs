import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const dataRoot = await mkdtemp(path.join(os.tmpdir(), "ued-knowledge-write-data-"));
const moduleRoot = await mkdtemp(path.join(os.tmpdir(), "ued-knowledge-write-module-"));
const outsideRoot = await mkdtemp(path.join(os.tmpdir(), "ued-knowledge-write-outside-"));
process.env.DATA_DIR = dataRoot;

async function snapshot(root) {
  const result = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name);
      const relativePath = path.relative(root, absolutePath);
      if (entry.isDirectory()) {
        result.push({ path: relativePath, type: "directory" });
        await visit(absolutePath);
      } else if (entry.isSymbolicLink()) {
        result.push({ path: relativePath, type: "symlink" });
      } else {
        result.push({ path: relativePath, type: "file", checksum: createHash("sha256").update(await readFile(absolutePath)).digest("hex") });
      }
    }
  }
  await visit(root);
  return result.sort((left, right) => left.path.localeCompare(right.path));
}

try {
  const sourceRoot = path.join(process.cwd(), "src");
  await writeFile(path.join(moduleRoot, "storage.ts"), await readFile(path.join(sourceRoot, "config/storage.ts"), "utf8"), "utf8");
  await writeFile(path.join(moduleRoot, "markdownKnowledge.ts"), await readFile(path.join(sourceRoot, "types/markdownKnowledge.ts"), "utf8"), "utf8");
  await writeFile(path.join(moduleRoot, "markdownKnowledgeService.ts"), (await readFile(path.join(sourceRoot, "services/markdownKnowledgeService.ts"), "utf8"))
    .replace('"@/config/storage"', '"./storage.ts"')
    .replace('"@/types/markdownKnowledge"', '"./markdownKnowledge.ts"'), "utf8");
  await writeFile(path.join(moduleRoot, "markdownKnowledgeWriteService.ts"), (await readFile(path.join(sourceRoot, "services/markdownKnowledgeWriteService.ts"), "utf8"))
    .replace('"@/config/storage"', '"./storage.ts"')
    .replace('"@/services/markdownKnowledgeService"', '"./markdownKnowledgeService.ts"')
    .replace('"@/types/markdownKnowledge"', '"./markdownKnowledge.ts"'), "utf8");

  const { MarkdownKnowledgePathError, markdownKnowledgeService } = await import(pathToFileURL(path.join(moduleRoot, "markdownKnowledgeService.ts")).href);
  const { MarkdownKnowledgeWriteError, markdownKnowledgeWriteService, titleFromMarkdownFileName } = await import(pathToFileURL(path.join(moduleRoot, "markdownKnowledgeWriteService.ts")).href);

  await mkdir(path.join(dataRoot, "meta"));
  await writeFile(path.join(dataRoot, "meta", "sentinel.json"), '{"protected":true}\n', "utf8");
  const protectedBefore = await snapshot(path.join(dataRoot, "meta"));

  const knowledge = await markdownKnowledgeWriteService.create({ title: "知识文章", documentType: "knowledge", description: "说明", category: "方法", tags: ["UED", "ued"], content: "# 知识\n" });
  const project = await markdownKnowledgeWriteService.create({ title: "项目沉淀", documentType: "project", content: "# 项目\n" });
  const microSpec = await markdownKnowledgeWriteService.importMarkdown({
    fileName: "Portal表格筛选规则.v2.md",
    title: "Portal表格筛选规则.v2",
    documentType: "micro-spec",
    specTopic: "search-filter",
    relatedScopes: ["portal", "global", "portal"],
    tags: ["表格"],
    content: "# 筛选规则\n\n| 条件 | 规则 |\n|---|---|\n| 默认 | 展开 |\n"
  });

  assert.equal(titleFromMarkdownFileName("Portal表格筛选规则.md"), "Portal表格筛选规则");
  assert.equal(titleFromMarkdownFileName("表格筛选规则.v2.md"), "表格筛选规则.v2");
  assert.equal(microSpec.metadata.documentType, "micro-spec");
  assert.deepEqual(microSpec.metadata.relatedScopes, ["portal", "global"]);
  assert.equal((await markdownKnowledgeService.getById(knowledge.metadata.id))?.content, "# 知识\n");
  assert.equal((await markdownKnowledgeService.getById(project.metadata.id))?.metadata.documentType, "project");

  await new Promise((resolve) => setTimeout(resolve, 5));
  const updated = await markdownKnowledgeWriteService.update(microSpec.metadata.id, { ...microSpec.metadata, title: "修改后的规则名称", content: "# 已修改\n" });
  assert.ok(updated);
  assert.equal(updated.metadata.createdAt, microSpec.metadata.createdAt);
  assert.notEqual(updated.metadata.updatedAt, microSpec.metadata.updatedAt);
  assert.equal(updated.content, "# 已修改\n");

  const countBeforeInvalid = (await markdownKnowledgeService.list()).documents.length;
  await assert.rejects(markdownKnowledgeWriteService.create({ title: "缺少范围", documentType: "micro-spec", specTopic: "table", content: "# 规则\n" }), MarkdownKnowledgeWriteError);
  await assert.rejects(markdownKnowledgeWriteService.create({ title: "非法主题", documentType: "micro-spec", specTopic: "invalid", relatedScopes: ["portal"], content: "# 规则\n" }), MarkdownKnowledgeWriteError);
  await assert.rejects(markdownKnowledgeWriteService.importMarkdown({ fileName: "规则.pdf", title: "规则", documentType: "micro-spec", specTopic: "table", relatedScopes: ["portal"], content: "# 规则\n" }), MarkdownKnowledgeWriteError);
  await assert.rejects(markdownKnowledgeWriteService.update("../escape", { title: "越界", documentType: "knowledge", content: "# 越界\n" }), MarkdownKnowledgePathError);
  assert.equal((await markdownKnowledgeService.list()).documents.length, countBeforeInvalid, "invalid drafts must not create partial documents");
  assert.deepEqual(await snapshot(path.join(dataRoot, "meta")), protectedBefore, "Knowledge writes must not modify protected DATA_DIR roots");

  await rm(path.join(dataRoot, "knowledge"), { recursive: true });
  await symlink(outsideRoot, path.join(dataRoot, "knowledge"), "dir");
  await assert.rejects(markdownKnowledgeWriteService.create({ title: "符号链接", documentType: "knowledge", content: "# 拒绝\n" }), MarkdownKnowledgePathError);
  assert.deepEqual(await readdir(outsideRoot), [], "symlinked Knowledge Root must remain untouched");

  console.log("[knowledge] create, import, update, validation, atomic-directory, protected-root, and symlink verification passed.");
} finally {
  await Promise.all([
    rm(dataRoot, { recursive: true, force: true }),
    rm(moduleRoot, { recursive: true, force: true }),
    rm(outsideRoot, { recursive: true, force: true })
  ]);
}
