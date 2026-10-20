import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import http from "node:http";
import { once } from "node:events";
import { readFile } from "node:fs/promises";

const assetTypes = ["knowledge", "sop", "component-spec", "micro-spec", "project", "prompt", "skill", "training", "vibe-product", "font"];
let gatewayRequests = 0;

function gatewayCitation(assetType, id, overrides = {}) {
  return {
    key: `asset-hub://knowledge/${assetType}/${id}`,
    assetType,
    id,
    title: "Gateway fixture",
    href: assetType === "micro-spec" ? `/micro-standards?asset=${encodeURIComponent(id)}` : `/knowledge?asset=${encodeURIComponent(`${assetType}:${id}`)}`,
    source: "markdownKnowledgeService",
    updatedAt: "2026-08-29T00:00:00.000Z",
    ...overrides
  };
}

function asset(assetType, id, contentStatus, citationOverrides) {
  return {
    key: `${assetType}:${id}`,
    assetType,
    contentStatus,
    id,
    title: "Gateway fixture",
    description: "Safe fixture metadata",
    tags: ["fixture"],
    updatedAt: "2026-08-29T00:00:00.000Z",
    source: "markdownKnowledgeService",
    section: "document",
    citation: gatewayCitation(assetType, id, citationOverrides)
  };
}

function startServer(handler) {
  const server = http.createServer(handler);
  server.listen(0, "127.0.0.1");
  return once(server, "listening").then(() => server);
}

async function post(url, payload, sessionId) {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", "MCP-Protocol-Version": "2025-11-25", ...(sessionId ? { "MCP-Session-Id": sessionId } : {}) }, body: JSON.stringify(payload) });
  const body = await response.text();
  const json = response.headers.get("content-type")?.includes("text/event-stream")
    ? JSON.parse(body.split("\n").find((line) => line.startsWith("data: "))?.slice(6) ?? "")
    : JSON.parse(body);
  return { json, sessionId: response.headers.get("mcp-session-id") ?? sessionId };
}

async function waitFor(url) {
  let lastError;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const initialized = await post(url, { jsonrpc: "2.0", id: "initialize", method: "initialize", params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "fixture", version: "1.0.0" } } });
      if (initialized.json.result && initialized.sessionId) return post(url, { jsonrpc: "2.0", id: "ready", method: "tools/list", params: {} }, initialized.sessionId);
    } catch (error) { lastError = error; }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Knowledge Gateway MCP did not start: ${lastError instanceof Error ? lastError.message : "unknown error"}`);
}

const gateway = await startServer((request, response) => {
  gatewayRequests += 1;
  const invalidCitationKey = request.url?.includes("invalid-citation-key");
  const externalCitationHref = request.url?.includes("external-citation-href");
  const metadataOnly = request.url?.includes("/assets/sop/");
  const microSpec = request.url?.includes("/micro-specs/search");
  const payload = request.url?.includes("/assets/")
    ? { asset: asset(metadataOnly ? "sop" : "knowledge", metadataOnly ? "sop-fixture" : "knowledge-fixture", metadataOnly ? "metadata_only" : "full", invalidCitationKey ? { key: "knowledge:invalid" } : externalCitationHref ? { href: "https://example.test/knowledge" } : undefined), hasContent: !metadataOnly, truncated: !metadataOnly, ...(metadataOnly ? {} : { content: "Returned excerpt only" }), diagnostics: [], partial: false }
    : { status: "ok", items: [{ ...asset(microSpec ? "micro-spec" : "knowledge", microSpec ? "micro-fixture" : "knowledge-fixture", "full"), relevance: { score: 200, matchedFields: ["content"], matchSource: "content" } }], diagnostics: [], partial: false };
  response.writeHead(200, { "Content-Type": "application/json" });
  response.end(JSON.stringify(payload));
});
const gatewayPort = gateway.address().port;
const mcpPort = await new Promise((resolve, reject) => {
  const probe = http.createServer();
  probe.listen(0, "127.0.0.1");
  probe.once("listening", () => { const port = probe.address().port; probe.close((error) => error ? reject(error) : resolve(port)); });
  probe.once("error", reject);
});
const bridge = spawn(process.execPath, ["agent-integration/scripts/start-knowledge-gateway-mcp.mjs"], {
  env: { ...process.env, KNOWLEDGE_GATEWAY_MCP_PORT: String(mcpPort), KNOWLEDGE_GATEWAY_INTERNAL_URL: `http://127.0.0.1:${gatewayPort}`, AGENT_GATEWAY_TOKEN: "fixture-token" },
  stdio: ["ignore", "inherit", "inherit"]
});

try {
  const mcpUrl = `http://127.0.0.1:${mcpPort}/mcp`;
  const list = await waitFor(mcpUrl);
  const tools = list.json.result.tools;
  assert.deepEqual(tools.map((tool) => tool.name).sort(), ["get_haldur_skill_document", "get_knowledge_asset", "search_haldur_skill", "search_knowledge", "search_micro_specs"]);
  for (const tool of tools) {
    assert.ok(tool.outputSchema, `${tool.name} must publish an outputSchema`);
    assert.match(tool.description, /discovery|contentStatus|citation/i);
    assert.equal(JSON.stringify(tool.outputSchema).match(/packagePath|downloadUrl|credential|session|token|filePath/g), null);
  }
  for (const name of ["search_knowledge", "search_micro_specs"]) {
    const tool = tools.find((candidate) => candidate.name === name);
    assert.equal(tool.inputSchema.properties.limit.maximum, 20);
  }
  const rejected = await post(mcpUrl, { jsonrpc: "2.0", id: "limit", method: "tools/call", params: { name: "search_knowledge", arguments: { limit: 21 } } }, list.sessionId);
  assert.equal(rejected.json.result.isError, true);
  assert.equal(gatewayRequests, 0, "MCP must reject limit=21 before requesting Gateway");
  const search = await post(mcpUrl, { jsonrpc: "2.0", id: "search", method: "tools/call", params: { name: "search_knowledge", arguments: { q: "fixture" } } }, list.sessionId);
  assert.equal(search.json.result.structuredContent.items[0].contentStatus, "full");
  assert.equal(search.json.result.structuredContent.items[0].relevance.matchSource, "content");
  assert.equal("content" in search.json.result.structuredContent.items[0], false);
  assert.match(search.json.result.structuredContent.items[0].citation.key, /^asset-hub:\/\/knowledge\/knowledge\/knowledge-fixture$/);
  assert.match(search.json.result.structuredContent.items[0].citation.href, /^\/knowledge\?asset=/);
  const micro = await post(mcpUrl, { jsonrpc: "2.0", id: "micro", method: "tools/call", params: { name: "search_micro_specs", arguments: {} } }, list.sessionId);
  assert.equal(micro.json.result.isError, undefined);
  assert.equal(micro.json.result.structuredContent.items[0].citation.href, "/micro-standards?asset=micro-fixture");
  const truncated = await post(mcpUrl, { jsonrpc: "2.0", id: "truncated", method: "tools/call", params: { name: "get_knowledge_asset", arguments: { assetType: "knowledge", id: "knowledge-fixture" } } }, list.sessionId);
  assert.equal(truncated.json.result.structuredContent.asset.contentStatus, "full");
  assert.equal(truncated.json.result.structuredContent.hasContent, true);
  assert.equal(truncated.json.result.structuredContent.truncated, true);
  assert.equal(truncated.json.result.structuredContent.content, "Returned excerpt only");
  assert.match(truncated.json.result.structuredContent.asset.citation.key, /^asset-hub:\/\/knowledge\/knowledge\/knowledge-fixture$/);
  assert.match(truncated.json.result.structuredContent.asset.citation.href, /^\/knowledge\?asset=/);
  const invalidCitationKey = await post(mcpUrl, { jsonrpc: "2.0", id: "invalid-citation-key", method: "tools/call", params: { name: "get_knowledge_asset", arguments: { assetType: "knowledge", id: "invalid-citation-key" } } }, list.sessionId);
  assert.equal(invalidCitationKey.json.result.isError, true);
  const externalCitationHref = await post(mcpUrl, { jsonrpc: "2.0", id: "external-citation-href", method: "tools/call", params: { name: "get_knowledge_asset", arguments: { assetType: "knowledge", id: "external-citation-href" } } }, list.sessionId);
  assert.equal(externalCitationHref.json.result.isError, true);
  const metadataOnly = await post(mcpUrl, { jsonrpc: "2.0", id: "detail", method: "tools/call", params: { name: "get_knowledge_asset", arguments: { assetType: "sop", id: "sop-fixture" } } }, list.sessionId);
  assert.equal(metadataOnly.json.result.structuredContent.asset.contentStatus, "metadata_only");
  assert.equal(metadataOnly.json.result.structuredContent.hasContent, false);
  assert.equal(metadataOnly.json.result.structuredContent.truncated, false);
  assert.equal("content" in metadataOnly.json.result.structuredContent, false);
  assert.equal(JSON.stringify(metadataOnly.json.result.structuredContent).includes("fixture-token"), false);
  assert.equal(JSON.stringify(metadataOnly.json.result.structuredContent).includes("packagePath"), false);
  assert.equal(JSON.stringify(metadataOnly.json.result.structuredContent).includes("/private/"), false);
  assert.deepEqual(assetTypes, tools.find((tool) => tool.name === "get_knowledge_asset").inputSchema.properties.assetType.enum);
  const preset = await readFile("agent-integration/dsh/agent-presets/asset-hub-restricted/agent.cordis.yml", "utf8");
  assert.match(preset, /Search is discovery, not document reading/);
  assert.match(preset, /metadata_only/);
  assert.match(preset, /truncated content/);
  assert.match(preset, /citation returned/);
  assert.equal(preset.match(/dsh-tool-(shell|filesystem|web|editor|skill|delegation|workflow)/g), null);
  console.log("[UED Asset Hub] Knowledge Gateway MCP contract verification passed.");
} finally {
  bridge.kill("SIGTERM");
  await once(bridge, "exit");
  await new Promise((resolve, reject) => gateway.close((error) => error ? reject(error) : resolve()));
}
