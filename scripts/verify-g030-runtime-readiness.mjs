import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import { probeDshSessionList, probeKnowledgeGatewayMcp } from "../agent-integration/scripts/runtime-readiness.mjs";

async function start(handler) {
  const server = http.createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Fixture listener did not expose a TCP port.");
  return { server, url: `http://127.0.0.1:${address.port}` };
}

async function assertRejected(check, expected) {
  await assert.rejects(check, expected);
}

async function testDshFalseReadyCases() {
  const cases = [
    ["404", (_request, response) => { response.writeHead(404).end(); }, /HTTP 404/],
    ["invalid-json", (_request, response) => { response.writeHead(200, { "Content-Type": "application/json" }).end("not-json"); }, /Unexpected token/],
    ["wrong-rpc-id", (_request, response) => { response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ type: "server-response", rpcId: "wrong", result: { ok: true } })); }, /rpcId/],
    ["wrong-type", (_request, response) => { response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ type: "client-request", rpcId: "wrong", result: { ok: true } })); }, /type/],
    ["missing-result-ok", (_request, response) => { response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ type: "server-response", rpcId: "wrong", result: {} })); }, /rpcId|result\.ok/]
  ];
  for (const [name, handler, expected] of cases) {
    const fixture = await start(handler);
    try { await assertRejected(() => probeDshSessionList({ baseUrl: fixture.url }), expected); }
    finally { fixture.server.close(); await once(fixture.server, "close"); }
    assert.ok(name);
  }
}

async function testMcpFailureCases() {
  await assertRejected(() => probeKnowledgeGatewayMcp({ endpoint: "http://127.0.0.1:1/mcp", timeoutMs: 100 }), /fetch failed/);
  const fixture = await start((_request, response) => {
    response.writeHead(200, { "Content-Type": "application/json", "MCP-Session-Id": "fixture" });
    response.end(JSON.stringify({ jsonrpc: "2.0", id: "fixture", result: {} }));
  });
  try { await assertRejected(() => probeKnowledgeGatewayMcp({ endpoint: `${fixture.url}/mcp` }), /missing search_knowledge/); }
  finally { fixture.server.close(); await once(fixture.server, "close"); }
}

await testDshFalseReadyCases();
await testMcpFailureCases();
console.log("G-030 runtime readiness negative regression passed.");
