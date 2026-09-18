import { randomUUID } from "node:crypto";

const requiredKnowledgeTools = new Set(["search_knowledge", "search_micro_specs", "get_knowledge_asset"]);

function parseJsonResponse(text, contentType) {
  if (!text) throw new Error("Runtime readiness response was empty.");
  if (contentType?.includes("text/event-stream")) {
    const data = text.split("\n").find((line) => line.startsWith("data: "))?.slice(6);
    if (!data) throw new Error("MCP readiness response did not contain JSON data.");
    return JSON.parse(data);
  }
  return JSON.parse(text);
}

async function postJson(url, body, { headers = {}, timeoutMs = 3_000 } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { Accept: "application/json, text/event-stream", "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
      cache: "no-store"
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return { response, body: parseJsonResponse(text, response.headers.get("content-type")) };
  } finally {
    clearTimeout(timeout);
  }
}

export async function probeDshSessionList({ baseUrl, timeoutMs } = {}) {
  const url = new URL("/api/session.list", baseUrl || process.env.DSH_BASE_URL || "http://127.0.0.1:3080");
  const rpcId = randomUUID();
  const result = await postJson(url, { type: "client-request", rpcId, method: "session.list", payload: {} }, { timeoutMs });
  if (result.body?.type !== "server-response") throw new Error("DSH session.list response type was invalid.");
  if (result.body?.rpcId !== rpcId) throw new Error("DSH session.list response rpcId did not match.");
  if (result.body?.result?.ok !== true) throw new Error("DSH session.list response did not report result.ok=true.");
  return result.body.result.value;
}

export async function probeKnowledgeGatewayMcp({ endpoint, timeoutMs } = {}) {
  if (!endpoint) throw new Error("Knowledge Gateway MCP endpoint is required.");
  const initialized = await postJson(endpoint, {
    jsonrpc: "2.0",
    id: randomUUID(),
    method: "initialize",
    params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "ued-asset-hub-runtime-readiness", version: "2.1.0.1" } }
  }, { timeoutMs });
  const sessionId = initialized.response.headers.get("mcp-session-id");
  if (!initialized.body?.result || !sessionId) throw new Error("Knowledge Gateway MCP initialize did not establish a session.");
  const listed = await postJson(endpoint, { jsonrpc: "2.0", id: randomUUID(), method: "tools/list", params: {} }, {
    headers: { "MCP-Session-Id": sessionId, "MCP-Protocol-Version": "2025-11-25" }, timeoutMs
  });
  const names = new Set(Array.isArray(listed.body?.result?.tools) ? listed.body.result.tools.map((tool) => tool?.name) : []);
  for (const name of requiredKnowledgeTools) if (!names.has(name)) throw new Error(`Knowledge Gateway MCP discovery is missing ${name}.`);
  return { sessionId, tools: [...names].sort() };
}
