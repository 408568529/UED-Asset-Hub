import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

async function checksum(root: string): Promise<string> {
  async function visit(directory: string): Promise<string[]> {
    const entries = await readdir(directory, { withFileTypes: true });
    const result: string[] = [];
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const filePath = path.join(directory, entry.name);
      if (entry.isDirectory()) result.push(...await visit(filePath));
      else result.push(`${path.relative(root, filePath)}:${createHash("sha256").update(await readFile(filePath)).digest("hex")}`);
    }
    return result;
  }
  return createHash("sha256").update((await visit(root)).join("\n")).digest("hex");
}

async function main() {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "ued-knowledge-gateway-"));
  const dataRoot = path.join(tempRoot, "data");
  process.env.DATA_DIR = dataRoot;
  process.env.AGENT_GATEWAY_TOKEN = "verify-gateway-token";

  try {
  const documentRoot = path.join(dataRoot, "knowledge", "micro-table");
  const knowledgeRoot = path.join(dataRoot, "knowledge", "knowledge-guide");
  const emptyRoot = path.join(dataRoot, "knowledge", "knowledge-empty");
  const projectRoot = path.join(dataRoot, "knowledge", "project-guide");
  const longRoot = path.join(dataRoot, "knowledge", "knowledge-long");
  await Promise.all([mkdir(documentRoot, { recursive: true }), mkdir(knowledgeRoot, { recursive: true }), mkdir(emptyRoot, { recursive: true }), mkdir(projectRoot, { recursive: true }), mkdir(longRoot, { recursive: true })]);
  await mkdir(path.join(dataRoot, "meta"), { recursive: true });
  await writeFile(path.join(documentRoot, "metadata.json"), JSON.stringify({ schemaVersion: 1, id: "micro-table", documentType: "micro-spec", title: "表格微规范", description: "Portal 表格的分页和空状态", category: "组件", tags: ["Portal", "表格"], author: "UED", createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-02T00:00:00.000Z", contentFormat: "markdown", status: "published", legacySource: null, legacyId: null, specTopic: "table", relatedScopes: ["portal", "web-component-library"] }, null, 2));
  await writeFile(path.join(documentRoot, "content.md"), "# 表格\n\nmicro-body-needle：分页、空状态和列对齐必须一致。\n");
  await writeFile(path.join(knowledgeRoot, "metadata.json"), JSON.stringify({ schemaVersion: 1, id: "knowledge-guide", documentType: "knowledge", title: "知识文章", description: "正文检索验证", category: "知识", tags: ["阅读"], author: "UED", createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-02T00:00:00.000Z", contentFormat: "markdown", status: "published", legacySource: null, legacyId: null }, null, 2));
  await writeFile(path.join(knowledgeRoot, "content.md"), "knowledge-body-needle\n");
  await writeFile(path.join(emptyRoot, "metadata.json"), JSON.stringify({ schemaVersion: 1, id: "knowledge-empty", documentType: "knowledge", title: "空知识文章", description: "无正文验证", category: "知识", tags: ["阅读"], author: "UED", createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-02T00:00:00.000Z", contentFormat: "markdown", status: "published", legacySource: null, legacyId: null }, null, 2));
  await writeFile(path.join(projectRoot, "metadata.json"), JSON.stringify({ schemaVersion: 1, id: "project-guide", documentType: "project", title: "项目沉淀", description: "正文检索验证", category: "项目", tags: ["阅读"], author: "UED", createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-02T00:00:00.000Z", contentFormat: "markdown", status: "published", legacySource: null, legacyId: null }, null, 2));
  await writeFile(path.join(projectRoot, "content.md"), "project-body-needle\n");
  await writeFile(path.join(longRoot, "metadata.json"), JSON.stringify({ schemaVersion: 1, id: "knowledge-long", documentType: "knowledge", title: "超长知识文章", description: "截断验证", category: "知识", tags: ["长文"], author: "UED", createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-02T00:00:00.000Z", contentFormat: "markdown", status: "published", legacySource: null, legacyId: null }, null, 2));
  await writeFile(path.join(longRoot, "content.md"), `long-body-needle${"甲".repeat(33_000)}`);
  await writeFile(path.join(dataRoot, "meta", "prompts.json"), JSON.stringify([{ id: "prompt-table", name: "表格文案 Prompt", summary: "生成表格空状态文案", category: "设计", tags: ["表格"], author: "UED", version: "v1", models: ["Codex"], scenarios: ["Portal"], outputTypes: ["Markdown"], difficulty: "初级", rating: 5, content: "请生成表格空状态文案 prompt-body-needle", usageGuide: "直接输入 prompt-usage-needle", exampleInput: "库存列表", exampleOutput: "暂无数据", viewCount: 99, copyCount: 88, createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-03T00:00:00.000Z", credential: "secret" }]));
  await writeFile(path.join(dataRoot, "meta", "skills.json"), JSON.stringify([{ id: "skill-table", name: "表格 Skill", description: "表格设计辅助", category: "设计", version: "v1", authorName: "UED", uploadedBy: "admin", usageScenarios: ["Portal"], tags: ["表格"], downloadCount: 9, createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-04T00:00:00.000Z", packagePath: "skill-center/private.zip", readme: "只读说明 skill-readme-needle", changeLog: "初始版本 skill-change-needle" }]));
  await writeFile(path.join(dataRoot, "meta", "sops.json"), JSON.stringify([{ id: "sop-metadata", name: "SOP 元数据", description: "sop-metadata-needle", docLink: "file:///private/sop.md", tags: ["SOP"], createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-02T00:00:00.000Z" }]));
  await writeFile(path.join(dataRoot, "meta", "components.json"), JSON.stringify([{ id: "component-metadata", name: "组件元数据", description: "component-metadata-needle", docLink: "file:///private/component.md", tags: ["组件"], createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-02T00:00:00.000Z" }]));
  await writeFile(path.join(dataRoot, "meta", "training-videos.json"), JSON.stringify([{ id: "training-metadata", title: "培训元数据", description: "training-metadata-needle", groupId: "group", groupName: "培训", tags: ["培训"], videoPath: "/private/training.mp4", fileName: "training.mp4", fileSize: 1, duration: 0, totalWatchDuration: 0, averageWatchDuration: 0, playCount: 0, uploadedBy: "admin", createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-02T00:00:00.000Z" }]));
  await writeFile(path.join(dataRoot, "meta", "products.json"), JSON.stringify([{ id: "product-metadata", name: "产品元数据", description: "product-metadata-needle", link: "file:///private/product", tags: ["产品"], createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-02T00:00:00.000Z" }]));
  await writeFile(path.join(dataRoot, "meta", "fonts.json"), JSON.stringify([{ id: "font-metadata", name: "字体元数据", description: "font-metadata-needle", category: "中文字体", version: "v1", tags: ["字体"], filePath: "/private/font.ttf", fileName: "font.ttf", fileSize: 1, fileFormat: "ttf", downloadCount: 0, createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-02T00:00:00.000Z" }]));
  const before = await checksum(dataRoot);
  const { knowledgeGatewayService } = await import("@/services/knowledgeGatewayService");
  for (const [query, assetType] of [["knowledge-body-needle", "knowledge"], ["project-body-needle", "project"], ["prompt-usage-needle", "prompt"], ["skill-change-needle", "skill"], ["micro-body-needle", "micro-spec"]] as const) {
    const result = assetType === "micro-spec"
      ? await knowledgeGatewayService.searchMicroSpecs({ q: query })
      : await knowledgeGatewayService.search({ q: query });
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].assetType, assetType);
    assert.equal(result.items[0].contentStatus, "full");
    assert.equal(result.items[0].relevance.matchSource, "content");
  }
  const micro = await knowledgeGatewayService.searchMicroSpecs({ relatedScopes: ["portal"], specTopics: ["table"], q: "分页" });
  assert.equal(micro.items.length, 1);
  assert.equal(micro.items[0].assetType, "micro-spec");
  assert.ok(micro.items[0].relevance.score >= 2000);
  assert.equal(micro.items[0].relevance.matchSource, "both");
  const metadataOnly = await knowledgeGatewayService.search({ q: "sop-metadata-needle" });
  assert.equal(metadataOnly.items.length, 1);
  assert.equal(metadataOnly.items[0].assetType, "sop");
  assert.equal(metadataOnly.items[0].contentStatus, "metadata_only");
  assert.equal(metadataOnly.items[0].relevance.matchSource, "metadata");
  const missing = await knowledgeGatewayService.search({ q: "电视端遥控器焦点移动规范" });
  assert.deepEqual(missing.items, []);
  assert.deepEqual((await knowledgeGatewayService.search({ q: "private.zip" })).items, []);
  for (const [assetType, id] of [["knowledge", "knowledge-guide"], ["project", "project-guide"], ["micro-spec", "micro-table"]] as const) {
    const detail = await knowledgeGatewayService.getAsset(assetType, id);
    assert.equal(detail.asset.contentStatus, "full");
    assert.equal(detail.hasContent, true);
    assert.equal(detail.truncated, false);
    assert.ok(detail.content);
  }
  const emptyKnowledge = await knowledgeGatewayService.getAsset("knowledge", "knowledge-empty");
  assert.equal(emptyKnowledge.asset.contentStatus, "full");
  assert.equal(emptyKnowledge.hasContent, false);
  assert.equal(emptyKnowledge.content, "");
  assert.equal(emptyKnowledge.truncated, false);
  const prompt = await knowledgeGatewayService.getAsset("prompt", "prompt-table");
  assert.equal(prompt.prompt?.content, "请生成表格空状态文案 prompt-body-needle");
  assert.equal(prompt.asset.contentStatus, "full");
  assert.equal(prompt.hasContent, true);
  assert.equal(prompt.truncated, false);
  const skill = await knowledgeGatewayService.getAsset("skill", "skill-table");
  assert.equal(skill.skill?.readme, "只读说明 skill-readme-needle");
  assert.equal(skill.asset.contentStatus, "full");
  assert.equal(skill.hasContent, true);
  assert.equal(skill.truncated, false);
  assert.equal(JSON.stringify(skill).includes("packagePath"), false);
  assert.equal(JSON.stringify(skill).includes("downloadCount"), false);
  assert.equal(JSON.stringify(prompt).includes("credential"), false);
  for (const [assetType, id] of [["sop", "sop-metadata"], ["component-spec", "component-metadata"], ["training", "training-metadata"], ["vibe-product", "product-metadata"], ["font", "font-metadata"]] as const) {
    const detail = await knowledgeGatewayService.getAsset(assetType, id);
    assert.equal(detail.asset.contentStatus, "metadata_only");
    assert.equal(detail.hasContent, false);
    assert.equal(detail.truncated, false);
    assert.equal("content" in detail, false);
    assert.equal(JSON.stringify(detail).includes("file:///private"), false);
  }
  const long = await knowledgeGatewayService.getAsset("knowledge", "knowledge-long");
  const longAgain = await knowledgeGatewayService.getAsset("knowledge", "knowledge-long");
  assert.equal(long.asset.contentStatus, "full");
  assert.equal(long.hasContent, true);
  assert.equal(long.truncated, true);
  assert.equal(Array.from(long.content ?? "").length, 32_768);
  assert.equal(long.content, longAgain.content);
  assert.equal(long.truncated, longAgain.truncated);
  const after = await checksum(dataRoot);
  assert.equal(after, before, "Knowledge Gateway reads must not modify DATA_DIR");
  console.log("[UED Asset Hub] Knowledge Gateway read-only verification passed.");
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

void main();
