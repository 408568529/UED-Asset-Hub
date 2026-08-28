import http from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const port = Number.parseInt(process.env.KNOWLEDGE_GATEWAY_MCP_PORT || "3082", 10);
const gatewayBaseUrl = process.env.KNOWLEDGE_GATEWAY_INTERNAL_URL?.replace(/\/$/, "");
const gatewayToken = process.env.AGENT_GATEWAY_TOKEN?.trim();

if (!gatewayBaseUrl || !gatewayToken) throw new Error("Knowledge Gateway MCP requires KNOWLEDGE_GATEWAY_INTERNAL_URL and AGENT_GATEWAY_TOKEN.");
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("KNOWLEDGE_GATEWAY_MCP_PORT must be valid.");

async function gatewayRequest(route, query = new URLSearchParams()) {
  const response = await fetch(`${gatewayBaseUrl}${route}${query.size ? `?${query}` : ""}`, {
    headers: { Authorization: `Bearer ${gatewayToken}` }
  });
  const body = await response.json().catch(() => ({ error: { message: "Gateway returned an invalid response." } }));
  if (!response.ok) throw new Error(body?.error?.message || "Knowledge Gateway request failed.");
  return body;
}

function textResult(value) {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }], structuredContent: value };
}

function buildServer() {
  const server = new McpServer({ name: "ued-asset-hub-knowledge-gateway", version: "2.1.0.1" });
  server.registerTool("search_knowledge", {
    description: "Read-only search over UED Asset Hub knowledge. Returns citations and partial-failure diagnostics.",
    inputSchema: {
      q: z.string().max(200).optional(),
      assetTypes: z.array(z.enum(["knowledge", "sop", "component-spec", "micro-spec", "project", "prompt", "skill", "training", "vibe-product", "font"])).max(10).optional(),
      tags: z.array(z.string().max(80)).max(10).optional(),
      limit: z.number().int().min(1).max(50).optional()
    }
  }, async ({ q, assetTypes, tags, limit }) => {
    const query = new URLSearchParams();
    if (q) query.set("q", q);
    for (const type of assetTypes ?? []) query.append("assetType", type);
    for (const tag of tags ?? []) query.append("tag", tag);
    if (limit) query.set("limit", String(limit));
    return textResult(await gatewayRequest("/api/knowledge-gateway/search", query));
  });
  server.registerTool("search_micro_specs", {
    description: "Read-only structured search for formal Micro Specs. Filters scopes, topic and tags before Markdown content matching.",
    inputSchema: {
      q: z.string().max(200).optional(),
      relatedScopes: z.array(z.enum(["web-component-library", "app-component-library", "global", "portal", "retail-app"])).max(5).optional(),
      specTopics: z.array(z.enum(["layout", "navigation", "search-filter", "table", "form", "dialog", "feedback", "status", "copywriting", "upload-download", "permission", "i18n", "other"])).max(13).optional(),
      tags: z.array(z.string().max(80)).max(10).optional(),
      limit: z.number().int().min(1).max(50).optional()
    }
  }, async ({ q, relatedScopes, specTopics, tags, limit }) => {
    const query = new URLSearchParams();
    if (q) query.set("q", q);
    for (const scope of relatedScopes ?? []) query.append("relatedScope", scope);
    for (const topic of specTopics ?? []) query.append("specTopic", topic);
    for (const tag of tags ?? []) query.append("tag", tag);
    if (limit) query.set("limit", String(limit));
    return textResult(await gatewayRequest("/api/knowledge-gateway/micro-specs/search", query));
  });
  server.registerTool("get_knowledge_asset", {
    description: "Read an allowlisted Knowledge Gateway asset by type and id. Skill responses exclude package paths and download links.",
    inputSchema: {
      assetType: z.enum(["knowledge", "sop", "component-spec", "micro-spec", "project", "prompt", "skill", "training", "vibe-product", "font"]),
      id: z.string().min(1).max(128)
    }
  }, async ({ assetType, id }) => textResult(await gatewayRequest(`/api/knowledge-gateway/assets/${encodeURIComponent(assetType)}/${encodeURIComponent(id)}`)));
  return server;
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : undefined); } catch { reject(new Error("Invalid JSON request.")); }
    });
    request.on("error", reject);
  });
}

const service = http.createServer(async (request, response) => {
  if (request.url?.split("?")[0] !== "/mcp" || request.method !== "POST") {
    response.writeHead(405, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed." }, id: null }));
    return;
  }
  try {
    const body = await readBody(request);
    const server = buildServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    await server.connect(transport);
    await transport.handleRequest(request, response, body);
    response.once("close", () => { void transport.close(); void server.close(); });
  } catch (error) {
    if (!response.headersSent) {
      response.writeHead(500, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null }));
    }
    console.error("Knowledge Gateway MCP request failed", error);
  }
});

service.listen(port, "127.0.0.1", () => console.log(`[Knowledge Gateway MCP] listening on http://127.0.0.1:${port}/mcp`));
process.on("SIGTERM", () => service.close(() => process.exit(0)));
process.on("SIGINT", () => service.close(() => process.exit(0)));
