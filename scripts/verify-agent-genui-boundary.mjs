import assert from "node:assert/strict";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { createServer as createNetServer } from "node:net";
import { createServer as createHttpServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

async function freePort() {
  const server = createNetServer();
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

const root = await mkdtemp(path.join(os.tmpdir(), "ued-genui-boundary-"));
const edgeSource = await readFile("scripts/host-supervisor.mjs", "utf8");
const runtimeOverlay = await readFile("agent-integration/dsh/asset-hub-agent.overlay.yml", "utf8");
const restrictedPreset = await readFile("agent-integration/dsh/agent-presets/asset-hub-restricted/agent.cordis.yml", "utf8");
const presetSource = await readFile("agent-integration/dsh/agent-presets/asset-hub-genui-restricted/agent.cordis.yml", "utf8");
const pluginLock = JSON.parse(await readFile("agent-integration/dsh/genui-plugin.json", "utf8"));
const windowsInstaller = await readFile("scripts/install-internal-dsh-runtime.ps1", "utf8");
const windowsPayload = await readFile("scripts/windows-release-payload.mjs", "utf8");
const windowsBuild = await readFile("scripts/build-internal-windows-release.ps1", "utf8");
const pluginTarball = await readFile(pluginLock.packageTarball);
assert.match(edgeSource, /dsh-genui|startsWith\("\/genui\/"\)/);
assert.match(edgeSource, /"apps\/cli\/src\/bin\.ts", "--profile", "web", "--patch"[\s\S]*?"--no-open", "--host"/);
assert.doesNotMatch(runtimeOverlay, /- id: genui\s+disabled: true/);
assert.doesNotMatch(restrictedPreset, /name: dsh-plugin-genui/);
assert.match(presetSource, /name: dsh-plugin-genui/);
assert.match(presetSource, /artifactRoot: !!js process\.env\.DSH_GENUI_ARTIFACT_ROOT/);
assert.equal(pluginLock.version, "0.15.1");
assert.equal(pluginLock.license, "MIT");
assert.equal(createHash("sha256").update(pluginTarball).digest("hex"), pluginLock.packageTarballSha256);
assert.match(windowsInstaller, /Get-FileHash -LiteralPath \$pluginTarballSource -Algorithm SHA256/);
assert.match(windowsInstaller, /'plugin' '--profile' 'web' 'add' \$pluginTarball '--save-exact' '--ignore-scripts'/);
assert.match(windowsInstaller, /profileManifest\.dsh\.profile\.bundles[\s\S]*?not load in every DSH session/);
assert.match(windowsInstaller, /pnpm@\$pnpmVersion %\*/);
assert.match(windowsInstaller, /genui-packages/);
assert.match(windowsInstaller, /npmIntegrity/);
assert.match(windowsPayload, /agent-integration\/dsh\/packages\/dsh-plugin-genui-0\.15\.1\.tgz/);
assert.match(windowsBuild, /agent-integration\/dsh\/packages\/dsh-plugin-genui-0\.15\.1\.tgz/);
const adminSecret = randomBytes(32).toString("base64url");
const username = "genui-boundary-test";
const upstreamPort = await freePort();
const received = [];
const upstream = createHttpServer(async (request, response) => {
  if (request.method === "GET") {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ status: "ok" }));
    return;
  }
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const rawBody = Buffer.concat(chunks).toString("utf8");
  let payload;
  try { payload = JSON.parse(rawBody); } catch { response.writeHead(400); response.end(); throw new Error(`Unexpected upstream request: ${request.method} ${request.url} ${rawBody.slice(0, 40)}`); }
  received.push({ path: request.url, payload });
  response.writeHead(200, { "Content-Type": "application/json" });
  response.end(JSON.stringify({ type: "server-response", rpcId: payload.rpcId, result: { ok: true, value: { accepted: true } } }));
});
await new Promise((resolve) => upstream.listen(upstreamPort, "127.0.0.1", resolve));
const proxyPort = await freePort();
const proxy = spawn(process.execPath, ["agent-integration/scripts/start-agent-proxy.mjs"], {
  cwd: process.cwd(),
  env: { ...process.env, DSH_BASE_URL: `http://127.0.0.1:${upstreamPort}`, AGENT_PROXY_HOST: "127.0.0.1", AGENT_PROXY_PORT: String(proxyPort), AGENT_RUNTIME_DIR: root, AGENT_WORKSPACE_ROOT: path.join(root, "workspaces"), ADMIN_USERNAME: username, ADMIN_SESSION_SECRET: adminSecret },
  stdio: "ignore"
});
const base = `http://127.0.0.1:${proxyPort}`;
const encodedPayload = Buffer.from(JSON.stringify({ username, expiresAt: Date.now() + 60_000 })).toString("base64url");
const signature = createHmac("sha256", adminSecret).update(encodedPayload).digest("base64url");
const cookie = `ued_admin_session=${encodedPayload}.${signature}`;
async function waitForProxy() {
  const end = Date.now() + 10_000;
  while (Date.now() < end) {
    try { if ((await fetch(`${base}/healthz`)).ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Agent Proxy did not become ready.");
}
async function call(pathname, payload, authenticated = true) {
  const response = await fetch(`${base}${pathname}`, { method: "POST", headers: { "Content-Type": "application/json", ...(authenticated ? { Cookie: cookie } : {}) }, body: JSON.stringify(payload) });
  const text = await response.text();
  let body = null;
  try { body = JSON.parse(text); } catch {}
  return { status: response.status, body, text };
}

try {
  await waitForProxy();
  assert.equal((await call("/api/session.create", { rpcId: "anon", payload: { agentPreset: "asset-hub-genui-restricted" } }, false)).status, 401);
  const genui = await call("/api/session.create", { rpcId: "genui", payload: { agentPreset: "asset-hub-genui-restricted" } });
  assert.equal(genui.body.result.ok, true);
  assert.equal(received.at(-1).payload.payload.agentPreset, "asset-hub-genui-restricted");
  const defaults = await call("/api/session.create", { rpcId: "default", payload: {} });
  assert.equal(defaults.body.result.ok, true);
  assert.equal(received.at(-1).payload.payload.agentPreset, "asset-hub-restricted");
  const denied = await call("/api/session.create", { rpcId: "denied", payload: { agentPreset: "arbitrary-user-preset" } });
  assert.equal(denied.body.result.ok, false);
  assert.equal(denied.body.result.error.code, "agent-preset-restricted");
  assert.equal(received.length, 2, "unapproved presets must not reach DSH");
  assert.equal((await call("/api/agentPreset.select", { rpcId: "select", payload: { agentPreset: "asset-hub-genui-restricted" } })).body.result.ok, true);
  assert.equal((await call("/api/agentPreset.select", { rpcId: "select-denied", payload: { agentPreset: "arbitrary-user-preset" } })).body.result.error.code, "agent-preset-restricted");
  console.log("[UED Agent] GenUI preset opt-in, restricted default, authentication, and arbitrary-preset rejection passed.");
} finally {
  proxy.kill("SIGTERM");
  await new Promise((resolve) => proxy.once("exit", resolve));
  await new Promise((resolve) => upstream.close(resolve));
  await rm(root, { recursive: true, force: true });
}
