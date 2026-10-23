import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import { MicroStandardStore, initializeMicroRoot } from "../src/services/microStandardStore";
import type { MarkdownKnowledgeMetadata } from "../src/types/markdownKnowledge";
async function main() {
  const root = await fs.mkdtemp("/private/tmp/micro-gateway-"), data = path.join(root, "hub-data"), micro = path.join(root, "micro-standards");
  process.env.DATA_DIR = data; process.env.MICRO_STANDARD_ROOT = micro;
  await fs.mkdir(path.join(data, "knowledge", "micro-money"), { recursive: true }); await fs.mkdir(path.join(data, "meta"));
  const metadata: MarkdownKnowledgeMetadata = { schemaVersion: 1, id: "micro-money", documentType: "micro-spec", title: "合成金额规则", description: "验证单一真源", category: "文案", author: "UED-test", createdAt: "2026-10-16T00:00:00Z", updatedAt: "2026-10-16T00:00:00Z", tags: ["测试"], contentFormat: "markdown", status: "published", legacySource: null, legacyId: null, specTopic: "copywriting", relatedScopes: ["portal"] };
  await fs.writeFile(path.join(data, "knowledge/micro-money/metadata.json"), JSON.stringify(metadata)); await fs.writeFile(path.join(data, "knowledge/micro-money/content.md"), "LEGACY-DO-NOT-READ");
  await initializeMicroRoot(micro); const store = new MicroStandardStore(micro); await store.topic("create", "copywriting");
  await store.put({ metadata, content: "# 金额\nNEW-AUTHORITY 金额两位小数。" });
  const { knowledgeGatewayService: gateway } = await import("../src/services/knowledgeGatewayService");
  const { knowledgeAggregatorService: aggregator } = await import("../src/services/knowledgeAggregatorService");
  let results = await gateway.searchMicroSpecs({ q: "NEW-AUTHORITY", specTopics: ["copywriting"], relatedScopes: ["portal"] });
  assert.equal(results.items.length, 1);
  const full = await gateway.getAsset("micro-spec", "micro-money"); assert.equal(full.content, "# 金额\nNEW-AUTHORITY 金额两位小数。"); assert.equal(full.truncated, false);
  assert.equal(full.asset.citation.key, "asset-hub://knowledge/micro-spec/micro-money"); assert.equal(full.asset.citation.href, "/micro-standards?asset=micro-money");
  assert.equal((await gateway.search({ q: "LEGACY-DO-NOT-READ" })).items.length, 0);
  assert.equal((await gateway.search({ q: "NEW-AUTHORITY" })).items.length, 1);
  assert.equal((await aggregator.getLibrary({}, false)).items.filter(d => d.assetType === "micro-spec").length, 0);
  const doc = (await store.get("micro-money"))!; await store.put({ ...doc, content: "# 金额\nUPDATED-AUTHORITY" });
  assert.equal((await gateway.searchMicroSpecs({ q: "UPDATED-AUTHORITY" })).items.length, 1);
  assert.equal((await gateway.getAsset("micro-spec", "micro-money")).content, "# 金额\nUPDATED-AUTHORITY");
  await store.topic("rename", "copywriting", "金额展示");
  results = await gateway.searchMicroSpecs({ specTopics: ["金额展示"] }); assert.equal(results.items.length, 1);
  assert.equal((await gateway.getAsset("micro-spec", "micro-money")).asset.citation.key, full.asset.citation.key);
  assert.equal(await fs.readFile(path.join(data, "knowledge/micro-money/content.md"), "utf8"), "LEGACY-DO-NOT-READ");
  const normalDir = path.join(data, "knowledge", "normal-guide"); await fs.mkdir(normalDir);
  await fs.writeFile(path.join(normalDir, "metadata.json"), JSON.stringify({ ...metadata, id: "normal-guide", documentType: "knowledge" }));
  await fs.writeFile(path.join(normalDir, "content.md"), "NORMAL-KNOWLEDGE-BODY");
  await fs.rename(micro, micro + "-offline");
  try {
    const { markdownKnowledgeService } = await import("../src/services/markdownKnowledgeService");
    assert.equal((await markdownKnowledgeService.getById("normal-guide"))?.content, "NORMAL-KNOWLEDGE-BODY");
    const partial = await gateway.search({ q: "NORMAL-KNOWLEDGE-BODY" }); assert.equal(partial.items.length, 1); assert.equal(partial.partial, true);
    assert.equal((await gateway.search({ q: "LEGACY-DO-NOT-READ" })).items.length, 0);
  } finally { await fs.rename(micro + "-offline", micro); }
  const { runtimeEnvironmentProfiles } = await import(new URL("../agent-integration/scripts/runtime-boundary.mjs", import.meta.url).href) as { runtimeEnvironmentProfiles: Record<"assetHub" | "dsh" | "agentProxy", (source: Record<string, string>) => Record<string, string>> };
  assert.equal(runtimeEnvironmentProfiles.assetHub({ MICRO_STANDARD_ROOT: micro }).MICRO_STANDARD_ROOT, micro);
  assert.equal(runtimeEnvironmentProfiles.dsh({ MICRO_STANDARD_ROOT: micro }).MICRO_STANDARD_ROOT, undefined);
  assert.equal(runtimeEnvironmentProfiles.agentProxy({ MICRO_STANDARD_ROOT: micro }).MICRO_STANDARD_ROOT, undefined);
  console.log(JSON.stringify({ status: "PASS", checks: ["search_micro_specs", "search_knowledge-single-source", "get-full-content", "stable-citation-new-href", "immediate-update-read", "topic-rename-filter", "legacy-kept-readonly", "knowledge-ui-separation", "root-not-exposed-to-DSH-proxy", "missing-micro-root-preserves-normal-knowledge-no-legacy-fallback"], root, modelCalls: 0 }));
}
main().catch(e => { console.error(e); process.exitCode = 1; });
