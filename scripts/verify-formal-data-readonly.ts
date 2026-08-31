import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

async function main() {
const root = await mkdtemp(path.join(os.tmpdir(), "ued-formal-data-readonly-"));
const dataRoot = path.join(root, "formal-data");
const operationalRoot = path.join(root, "asset-hub-runtime");
const mediaRoot = path.join(root, "training-media");
const agentRoot = path.join(root, "agent-runtime");
const marker = path.join(root, ".ued-formal-data-fixture-marker");

process.env.DATA_DIR = dataRoot;
process.env.ASSET_HUB_RUNTIME_DIR = operationalRoot;
process.env.TRAINING_MEDIA_DIR = mediaRoot;
process.env.AGENT_RUNTIME_DIR = agentRoot;
process.env.DSH_SOURCE_DIR = path.join(root, "dsh-source");
process.env.ADMIN_USERNAME = "fixture-admin";
process.env.ADMIN_PASSWORD = "fixture-password-42";
process.env.ADMIN_SESSION_SECRET = "fixture-session-secret-012345678901234567890123";
process.env.ADMIN_SESSION_SECURE = "false";
process.env.AGENT_GATEWAY_TOKEN = "fixture-gateway-token";

function hash(value: Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

function assertSeparate(left: string, right: string, label: string) {
  const relative = path.relative(left, right);
  const reverse = path.relative(right, left);
  const overlaps = relative === "" || reverse === "" || (!relative.startsWith(`..${path.sep}`) && relative !== "..") || (!reverse.startsWith(`..${path.sep}`) && reverse !== "..");
  assert.ok(!overlaps, `${label} must be separate.`);
}

async function manifest(directory: string) {
  const entries: Array<Record<string, unknown>> = [];
  async function visit(current: string) {
    const relative = path.relative(directory, current).split(path.sep).join("/") || ".";
    const stat = await lstat(current);
    if (stat.isSymbolicLink()) {
      entries.push({ path: relative, type: "symlink", target: await (await import("node:fs/promises")).readlink(current), mode: stat.mode });
      return;
    }
    if (stat.isDirectory()) {
      const children = (await readdir(current)).sort();
      entries.push({ path: relative, type: "directory", entries: children, mode: stat.mode });
      await Promise.all(children.map((child) => visit(path.join(current, child))));
      return;
    }
    if (stat.isFile()) entries.push({ path: relative, type: "file", bytes: stat.size, sha256: hash(await readFile(current)), mode: stat.mode });
    else entries.push({ path: relative, type: "other", mode: stat.mode });
  }
  await visit(directory);
  return entries.sort((left, right) => String(left.path).localeCompare(String(right.path)));
}

async function writeJson(relativePath: string, value: unknown) {
  const target = path.join(dataRoot, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function fixture() {
  await Promise.all([mkdir(dataRoot), mkdir(mediaRoot), mkdir(agentRoot), mkdir(path.join(root, "dsh-source"))]);
  await writeFile(marker, "formal-data-fixture\n", "utf8");
  await writeJson("meta/products.json", [{ id: "product-1", name: "中文产品", description: "Fixture product", link: "https://example.test/product", tags: ["产品"], createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }]);
  await writeJson("meta/components.json", [{ id: "component-1", name: "表格组件", description: "Fixture component", docLink: "https://example.test/component", tags: ["组件"], createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }]);
  await writeJson("meta/sops.json", [{ id: "sop-1", name: "发布 SOP", description: "Fixture SOP", docLink: "https://example.test/sop", tags: ["流程"], createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }]);
  await writeJson("meta/prompts.json", [{ id: "prompt-1", name: "中文 Prompt", summary: "Fixture prompt", category: "通用 Prompt", tags: ["提示"], author: "UED", version: "v1", models: ["Codex"], scenarios: ["Portal"], outputTypes: ["Markdown"], difficulty: "初级", rating: 5, content: "fixture content", usageGuide: "fixture guide", exampleInput: "input", exampleOutput: "output", viewCount: 7, copyCount: 3, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }]);
  await writeJson("meta/skills.json", [{ name: "历史 Skill", description: "legacy skill", category: "Other", version: "v1", author: "UED", usageScenarios: ["Portal"], tags: ["技能"], downloadCount: 2, packagePath: "skill-center/历史 Skill/v1/skill.zip", createdAt: "2026-01-01T00:00:00.000Z" }]);
  await writeJson("meta/skill-versions.json", [{ id: "skill-version-1", skillId: "skill-legacy-40c4e6efcbf11b2c", version: "v1", packagePath: "skill-center/历史 Skill/v1/skill.zip", fileName: "skill with spaces.zip", fileSize: 4, createdAt: "2026-01-01T00:00:00.000Z", downloadCount: 1 }]);
  await writeJson("meta/fonts.json", [{ id: "font-1", name: "中文 字体", description: "fixture font", category: "中文字体", version: "v1", tags: ["字体"], filePath: "font-library/中文 字体/v1/font file.ttf", fileName: "font file.ttf", fileSize: 4, fileFormat: "ttf", downloadCount: 1, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }]);
  await writeJson("meta/font-versions.json", [{ id: "font-version-1", fontId: "font-1", version: "v1", filePath: "font-library/中文 字体/v1/font file.ttf", fileName: "font file.ttf", fileSize: 4, fileFormat: "ttf", createdAt: "2026-01-01T00:00:00.000Z", downloadCount: 1 }]);
  await writeJson("meta/training-groups.json", []);
  await writeJson("meta/training-videos.json", [{ title: "历史 培训", groupName: "培训资料", topicName: "旧主题", tags: ["培训"], videoPath: "training/历史 培训/video.mp4", fileName: "video.mp4", fileSize: 4, duration: 0, playCount: 2, totalWatchDuration: 8, createdAt: "2026-01-01T00:00:00.000Z" }]);
  await writeJson("meta/test-environments.json", []);
  await writeJson("meta/tags.json", [{ id: "legacy-tag-1", type: "prompt-tag", name: "提示", usageCount: 99, createdAt: "2026-01-01T00:00:00.000Z" }]);
  await writeJson("meta/taxonomy.json", []);
  await writeJson("meta/uploads.json", [{ fileName: "历史 文件.txt", uploadedBy: "UED", createdAt: "2026-01-01T00:00:00.000Z" }]);
  await writeJson("meta/versions.json", [{ id: "version-1", assetId: "product-1", assetType: "product", version: "v1", createdAt: "2026-01-01T00:00:00.000Z" }]);
  await writeJson("meta/logs.json", [{ id: "legacy-log-1", type: "login", title: "历史登录", description: "legacy", targetType: "auth", operator: "UED", createdAt: "2026-01-01T00:00:00.000Z" }]);
  await writeFile(path.join(dataRoot, "meta", "corrupt.json"), "{not-json}\n", "utf8");
  await writeJson("products.json", [{ id: "legacy-root-product", name: "legacy root", description: "legacy", link: "https://example.test/legacy", tags: [], createdAt: "2025-01-01T00:00:00.000Z", updatedAt: "2025-01-01T00:00:00.000Z" }]);
  await mkdir(path.join(dataRoot, "knowledge", "micro-spec-1"), { recursive: true });
  await writeFile(path.join(dataRoot, "knowledge", "micro-spec-1", "metadata.json"), JSON.stringify({ schemaVersion: 1, id: "micro-spec-1", documentType: "micro-spec", title: "表格微规范", description: "Fixture micro spec", category: "组件", tags: ["表格"], author: "UED", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", contentFormat: "markdown", status: "published", legacySource: null, legacyId: null, specTopic: "table", relatedScopes: ["portal"] }), "utf8");
  await writeFile(path.join(dataRoot, "knowledge", "micro-spec-1", "content.md"), "# 表格微规范\n", "utf8");
  await Promise.all([
    mkdir(path.join(dataRoot, "skill-center", "历史 Skill", "v1"), { recursive: true }),
    mkdir(path.join(dataRoot, "font-library", "中文 字体", "v1"), { recursive: true }),
    mkdir(path.join(dataRoot, "training", "历史 培训"), { recursive: true }),
    mkdir(path.join(dataRoot, "training-media"), { recursive: true }),
    mkdir(path.join(dataRoot, "empty-directory"), { recursive: true })
  ]);
  await Promise.all([
    writeFile(path.join(dataRoot, "skill-center", "历史 Skill", "v1", "skill.zip"), "zip!"),
    writeFile(path.join(dataRoot, "font-library", "中文 字体", "v1", "font file.ttf"), "font"),
    writeFile(path.join(dataRoot, "training", "历史 培训", "video.mp4"), "video")
  ]);
}

async function runReadSuite() {
  const { productService } = await import("@/services/productService");
  const { componentSpecService } = await import("@/services/componentSpecService");
  const { sopService } = await import("@/services/sopService");
  const { promptService } = await import("@/services/promptService");
  const { skillService } = await import("@/services/skillService");
  const { fontService } = await import("@/services/fontService");
  const { trainingService } = await import("@/services/trainingService");
  const { uploadRecordService } = await import("@/services/uploadRecordService");
  const { assetVersionService } = await import("@/services/assetVersionService");
  const { taxonomyService } = await import("@/services/taxonomyService");
  const { tagService } = await import("@/services/tagService");
  const { operationLogService } = await import("@/services/operationLogService");
  const { knowledgeGatewayService } = await import("@/services/knowledgeGatewayService");
  const { trainingAnalyticsService } = await import("@/services/trainingAnalyticsService");
  const { listTrainingServerFiles } = await import("@/lib/trainingStorage");
  const { readJsonFileReadonly } = await import("@/lib/storage/jsonStorage");

  assert.equal((await productService.getProducts()).length, 1);
  await Promise.all([componentSpecService.getComponents(), sopService.getSops(), promptService.getPrompts(), skillService.getSkills(), fontService.getFonts(), trainingService.getVideos(), uploadRecordService.getUploads(), assetVersionService.getVersions(), operationLogService.getLogs(), taxonomyService.getItems("prompt-category"), tagService.getTagsProjectionByType("prompt-tag", ["提示"]), trainingAnalyticsService.getVideoMetrics("missing")]);
  assert.deepEqual(await listTrainingServerFiles(), []);
  assert.deepEqual(await readJsonFileReadonly("missing.json", []), []);
  await assert.rejects(readJsonFileReadonly("corrupt.json", []));
  const [skillsFirst, skillsSecond, videosFirst, videosSecond, uploadsFirst, uploadsSecond] = await Promise.all([
    skillService.getSkills(), skillService.getSkills(), trainingService.getVideos(), trainingService.getVideos(), uploadRecordService.getUploads(), uploadRecordService.getUploads()
  ]);
  assert.deepEqual(skillsFirst, skillsSecond, "Legacy Skill normalization must be deterministic.");
  assert.deepEqual(videosFirst, videosSecond, "Legacy training normalization must be deterministic.");
  assert.deepEqual(uploadsFirst, uploadsSecond, "Legacy upload normalization must be deterministic.");
  await promptService.incrementView("prompt-1");
  await promptService.incrementCopy("prompt-1", "fixture-reader");
  await skillService.incrementDownload(skillsFirst[0].id, "skill-version-1");
  await fontService.incrementDownload("font-1", "font-version-1");
  await trainingAnalyticsService.reportWatchProgress({ videoId: videosFirst[0].id, sessionId: "fixture-session", currentTime: 8, watchedSeconds: 8 });
  await trainingService.upsertUploadTask({ id: "fixture-upload-task", fileName: "video.mp4", status: "uploading", uploadedBytes: 0, totalBytes: 4, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" });
  assert.equal((await trainingService.getUploadTask("fixture-upload-task"))?.id, "fixture-upload-task");
  await operationLogService.createLog({ type: "login", title: "fixture login", description: "login/logout operational log regression", targetType: "auth", operator: "fixture-admin" });
  await knowledgeGatewayService.search({ q: "表格" });
  await knowledgeGatewayService.searchMicroSpecs({ q: "表格", specTopics: ["table"], relatedScopes: ["portal"] });
}

try {
  await fixture();
  const [canonicalRoot, canonicalData] = await Promise.all([realpath(root), realpath(dataRoot)]);
  assert.ok(existsSync(marker));
  assert.notEqual(canonicalData, canonicalRoot);
  const before = await manifest(dataRoot);
  await runReadSuite();
  const [canonicalOperational, canonicalMedia, canonicalAgent, canonicalDsh] = await Promise.all([realpath(operationalRoot), realpath(mediaRoot), realpath(agentRoot), realpath(path.join(root, "dsh-source"))]);
  assertSeparate(canonicalOperational, canonicalData, "Operational root and Formal DATA");
  assertSeparate(canonicalOperational, canonicalMedia, "Operational root and training media");
  assertSeparate(canonicalOperational, canonicalAgent, "Operational root and Agent runtime");
  assertSeparate(canonicalOperational, canonicalDsh, "Operational root and DSH source");
  const after = await manifest(dataRoot);
  assert.deepEqual(after, before, "Formal DATA changed during the read-only suite");

  const { productService } = await import("@/services/productService");
  await productService.createProduct({ name: "Explicit mutation", description: "fixture", link: "https://example.test/mutation", tags: [] });
  assert.notDeepEqual(await manifest(dataRoot), before, "Explicit mutation did not modify the fixture Formal DATA");
  console.log("[formal-data] isolated fixture manifest gate and explicit mutation regression passed.");
} finally {
  if (existsSync(marker)) await rm(root, { recursive: true, force: true });
}
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
