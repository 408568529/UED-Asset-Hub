// Real MCP transport -> running isolated Hub -> physical synthetic documents. No model calls.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile, writeFile, rename, unlink } from "node:fs/promises";
import { once } from "node:events";
import path from "node:path";

const root = process.env.HALDUR_MCP_TEST_ROOT;
assert.ok(root?.startsWith("/private/tmp/ued-haldur-mcp-"), "Synthetic test root required");
const env = JSON.parse(await readFile(path.join(root, "test-env.json"), "utf8"));
assert.equal(env.PUBLIC_ORIGIN, "http://127.0.0.1:5547");
const child = spawn(process.execPath, ["agent-integration/scripts/start-knowledge-gateway-mcp.mjs"], { env: { ...process.env, ...env, KNOWLEDGE_GATEWAY_MCP_PORT: "5549", KNOWLEDGE_GATEWAY_INTERNAL_URL: env.PUBLIC_ORIGIN }, stdio: ["ignore", "pipe", "pipe"] });
const trace = [];
let session;
async function rpc(method, params) {
  const response = await fetch("http://127.0.0.1:5549/mcp", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", "MCP-Protocol-Version": "2025-11-25", ...(session ? { "Mcp-Session-Id": session } : {}) }, body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }) });
  session = response.headers.get("mcp-session-id") ?? session;
  const text = await response.text();
  const payload = JSON.parse(response.headers.get("content-type")?.includes("text/event-stream") ? text.split("\n").find(line => line.startsWith("data: ")).slice(6) : text);
  assert.ok(payload.result, JSON.stringify(payload.error));
  return payload.result;
}
async function call(name, args) {
  const result = await rpc("tools/call", { name, arguments: args });
  assert.ok(!result.isError, JSON.stringify(result.content));
  const data = result.structuredContent;
  trace.push({ caller: "deterministic-test-client-not-model", tool: name, arguments: args, source: data.source ?? "ordinary-knowledge", relativePath: data.relativePath, citation: data.citation ?? data.asset?.citation, hasContent: data.hasContent, contentStatus: data.contentStatus, bodyExcerpt: data.content?.slice(0, 250), items: data.items?.map(item => ({ relativePath: item.relativePath, key: item.key })) });
  return data;
}
try {
  for (let attempt = 0; ; attempt++) {
    try { await rpc("initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "haldur-synthetic-verifier", version: "1" } }); break; }
    catch (error) { if (attempt >= 60) throw error; await new Promise(resolve => setTimeout(resolve, 100)); }
  }
  const list = await rpc("tools/list", {});
  assert.deepEqual(list.tools.map(tool => tool.name).sort(), ["get_haldur_skill_document", "get_knowledge_asset", "search_haldur_skill", "search_knowledge", "search_micro_specs"]);
  const entry = await call("get_haldur_skill_document", { path: "SKILL.md" });
  assert.match(entry.content, /先识别任务/);
  // Fixed synthetic scenario: table amount review. Follow this fixture's declared prerequisites.
  await call("get_haldur_skill_document", { path: "references/原则.md" });
  const discovery = await call("search_haldur_skill", { q: "金额", prefix: "micro-standard" });
  assert.equal(discovery.discoveryOnly, true);
  const spec = await call("get_haldur_skill_document", { path: discovery.items[0].relativePath });
  assert.match(spec.content, /两位小数/);
  await call("get_haldur_skill_document", { path: "examples/评审.md" });
  const ordinary = await call("search_knowledge", { q: "SYNTHETIC-README", assetTypes: ["skill"] });
  assert.equal(ordinary.items.length, 1);
  const readme = await call("get_knowledge_asset", { assetType: "skill", id: ordinary.items[0].id });
  assert.match(readme.skill.readme, /普通 Skill README/);
  assert.match(readme.asset.citation.key, /^asset-hub:\/\/knowledge\/skill\//);
  assert.notEqual(readme.asset.citation.key, spec.citation.key);
  await call("search_micro_specs", { q: "not-present" });
  const file = path.join(root, "skill/micro-standard/金额.md");
  const original = await readFile(file);
  try {
    await writeFile(file, "# 合成更新\n更新后正文 MCP-LIVE-UPDATE");
    const updated = await call("get_haldur_skill_document", { path: "micro-standard/金额.md" });
    assert.notEqual(updated.sha256, spec.sha256); assert.match(updated.content, /MCP-LIVE-UPDATE/);
    await rename(file, `${file}.renamed`);
    const missing = await rpc("tools/call", { name: "get_haldur_skill_document", arguments: { path: "micro-standard/金额.md" } });
    assert.equal(missing.isError, true);
    await unlink(`${file}.renamed`);
  } finally { await writeFile(file, original); }
  assert.equal((await fetch(`${env.PUBLIC_ORIGIN}/api/knowledge-gateway/haldur/document?path=SKILL.md`)).status, 401);
  const invalid = await rpc("tools/call", { name: "get_haldur_skill_document", arguments: { path: "../outside.md" } });
  assert.equal(invalid.isError, true);
  const result = { status: "PASS_TOOL_CHAIN", modelAgent: "NOT_VERIFIED", modelReason: "Independent runtime has no model key; original 3047 credentials not accessed", registeredTools: list.tools.map(tool => tool.name), trace, checks: ["actual MCP registration/schema/transport", "Hub internal authentication", "physical Markdown/hash/citation", "scripted entry/prerequisite/conditional discovery", "ordinary Skill distinct", "original three tools callable", "live update and deleted path rejection"] };
  await writeFile(path.join(root, "evidence/mcp-live.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  child.kill("SIGTERM");
  await once(child, "exit");
}
