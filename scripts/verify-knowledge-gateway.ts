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
  await mkdir(documentRoot, { recursive: true });
  await mkdir(path.join(dataRoot, "meta"), { recursive: true });
  await writeFile(path.join(documentRoot, "metadata.json"), JSON.stringify({ schemaVersion: 1, id: "micro-table", documentType: "micro-spec", title: "表格微规范", description: "Portal 表格的分页和空状态", category: "组件", tags: ["Portal", "表格"], author: "UED", createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-02T00:00:00.000Z", contentFormat: "markdown", status: "published", legacySource: null, legacyId: null, specTopic: "table", relatedScopes: ["portal", "web-component-library"] }, null, 2));
  await writeFile(path.join(documentRoot, "content.md"), "# 表格\n\n分页、空状态和列对齐必须一致。\n");
  await writeFile(path.join(dataRoot, "meta", "prompts.json"), JSON.stringify([{ id: "prompt-table", name: "表格文案 Prompt", summary: "生成表格空状态文案", category: "设计", tags: ["表格"], author: "UED", version: "v1", models: ["Codex"], scenarios: ["Portal"], outputTypes: ["Markdown"], difficulty: "初级", rating: 5, content: "请生成表格空状态文案", usageGuide: "直接输入", exampleInput: "库存列表", exampleOutput: "暂无数据", viewCount: 99, copyCount: 88, createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-03T00:00:00.000Z" }]));
  await writeFile(path.join(dataRoot, "meta", "skills.json"), JSON.stringify([{ id: "skill-table", name: "表格 Skill", description: "表格设计辅助", category: "设计", version: "v1", authorName: "UED", uploadedBy: "admin", usageScenarios: ["Portal"], tags: ["表格"], downloadCount: 9, createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-04T00:00:00.000Z", packagePath: "skill-center/private.zip", readme: "只读说明", changeLog: "初始版本" }]));
  const before = await checksum(dataRoot);
  const { knowledgeGatewayService } = await import("@/services/knowledgeGatewayService");
  const micro = await knowledgeGatewayService.searchMicroSpecs({ relatedScopes: ["portal"], specTopics: ["table"], q: "分页" });
  assert.equal(micro.items.length, 1);
  assert.equal(micro.items[0].assetType, "micro-spec");
  assert.ok(micro.items[0].relevance.score >= 2000);
  const missing = await knowledgeGatewayService.search({ q: "电视端遥控器焦点移动规范" });
  assert.deepEqual(missing.items, []);
  const prompt = await knowledgeGatewayService.getAsset("prompt", "prompt-table");
  assert.equal(prompt.prompt?.content, "请生成表格空状态文案");
  const skill = await knowledgeGatewayService.getAsset("skill", "skill-table");
  assert.equal(skill.skill?.readme, "只读说明");
  assert.equal(JSON.stringify(skill).includes("packagePath"), false);
  assert.equal(JSON.stringify(skill).includes("downloadCount"), false);
  const after = await checksum(dataRoot);
  assert.equal(after, before, "Knowledge Gateway reads must not modify DATA_DIR");
  console.log("[UED Asset Hub] Knowledge Gateway read-only verification passed.");
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

void main();
