import { randomUUID } from "node:crypto";
import http from "node:http";
import { createServer } from "node:net";
import { access, appendFile, copyFile, readFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { isInside, runtimeEnvironmentProfiles } from "../agent-integration/scripts/runtime-boundary.mjs";
import { resolveAllowedDshSourcePath } from "../agent-integration/scripts/dsh-source-policy.mjs";
import { validateDshSource } from "../agent-integration/scripts/dsh-source-validator.mjs";
import { ensureRuntimePaths, ensureRuntimeSubdirectory, inspectRuntimePaths } from "./runtime-path-safety.mjs";
import { ManagedProcessController, assertNoLiveManagedOrphans, managedMetadataPath } from "./managed-process-controller.mjs";
import { RuntimeLifecycleCore } from "./runtime-lifecycle-core.mjs";
import { acquireSupervisorLock, supervisorLockPath } from "./supervisor-lock.mjs";

const require = createRequire(import.meta.url);
const { loadEnvConfig } = require("@next/env");
const httpProxy = require("http-proxy");
const projectDir = process.cwd();
const loopbackHosts = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

function fail(message) { throw new Error(`[Host Supervisor] ${message}`); }
function value(name) { return process.env[name]?.trim() || ""; }
function requiredPath(name) { const raw = value(name); if (!raw) fail(`缺少 ${name}。`); return path.resolve(raw); }
function optionalPath(name) { const raw = value(name); return raw ? path.resolve(raw) : null; }
function port(name, fallback) { const parsed = Number.parseInt(value(name) || String(fallback), 10); if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) fail(`${name} 必须是有效端口。`); return parsed; }

function assertNodeVersion() {
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major < 22 || (major === 22 && minor < 19)) fail(`Node.js ${process.versions.node} 不满足 DSH 需要的 22.19+。`);
}

function dshUrl() {
  let parsed;
  try { parsed = new URL(value("DSH_BASE_URL") || "http://127.0.0.1:3080"); } catch { fail("DSH_BASE_URL 不是有效 URL。"); }
  if (parsed.protocol !== "http:" || !loopbackHosts.has(parsed.hostname)) fail("DSH_BASE_URL 必须保持本机回环地址。");
  return parsed;
}

async function waitFor(label, check, timeoutMs = 60_000) {
  const startedAt = Date.now();
  let lastError = "";
  while (Date.now() - startedAt < timeoutMs) {
    try { await check(); console.log(`[Host Supervisor] ${label} is ready.`); return; } catch (error) { lastError = error instanceof Error ? error.message : String(error); await new Promise((resolve) => setTimeout(resolve, 500)); }
  }
  throw new Error(`${label} 未在 ${Math.round(timeoutMs / 1000)} 秒内就绪：${lastError || "未知错误"}`);
}

async function request(url, init) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2_500);
  try {
    const response = await fetch(url, { ...init, headers: { Accept: "application/json, text/event-stream", ...init?.headers }, signal: controller.signal, cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response;
  } finally { clearTimeout(timeout); }
}

async function assertPortAvailable(portNumber, label) {
  await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", () => reject(new Error(`${label} 端口 ${portNumber} 已被占用。`)));
    probe.listen(portNumber, "0.0.0.0", () => probe.close(resolve));
  });
}

function createEdgeServer({ host, port: publicPort, internalPort, proxyPort }) {
  const edge = httpProxy.createProxyServer({ changeOrigin: true, ws: true });
  const sockets = new Set();
  const belongsToAgentRuntime = (request, requestUrl) => {
    if (requestUrl.pathname.startsWith("/agent-runtime/")) return true;
    if (requestUrl.pathname === "/api/respond" || /^\/api\/[^/]+\.[^/]+$/.test(requestUrl.pathname)) return true;
    try { return Boolean(request.headers.referer && new URL(request.headers.referer).pathname.startsWith("/agent-runtime/")); } catch { return false; }
  };
  edge.on("error", (error, _request, response) => {
    if (response && "writeHead" in response) { response.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" }); response.end(`Asset Hub internal service is unavailable: ${error.message}`); }
  });
  const server = http.createServer((request, response) => {
    const requestUrl = new URL(request.url || "/", "http://localhost");
    if (requestUrl.pathname === "/api/knowledge-gateway" || requestUrl.pathname.startsWith("/api/knowledge-gateway/")) { response.writeHead(404, { "Content-Type": "application/json" }); response.end(JSON.stringify({ error: { code: "not-found", message: "Not found." } })); return; }
    if (requestUrl.pathname === "/agent-runtime") { response.writeHead(308, { Location: "/agent-runtime/" }); response.end(); return; }
    if (belongsToAgentRuntime(request, requestUrl)) { if (requestUrl.pathname.startsWith("/agent-runtime/")) request.url = request.url?.replace(/^\/agent-runtime/, "") || "/"; edge.web(request, response, { target: `http://127.0.0.1:${proxyPort}` }); return; }
    edge.web(request, response, { target: `http://127.0.0.1:${internalPort}`, changeOrigin: false });
  });
  server.on("connection", (socket) => { sockets.add(socket); socket.once("close", () => sockets.delete(socket)); });
  server.on("upgrade", (request, socket, head) => {
    const requestUrl = new URL(request.url || "/", "http://localhost");
    if (belongsToAgentRuntime(request, requestUrl)) { if (requestUrl.pathname.startsWith("/agent-runtime/")) request.url = request.url?.replace(/^\/agent-runtime/, "") || "/"; edge.ws(request, socket, head, { target: `http://127.0.0.1:${proxyPort}` }); return; }
    edge.ws(request, socket, head, { target: `http://127.0.0.1:${internalPort}` });
  });
  return {
    start: () => new Promise((resolve, reject) => server.once("error", reject).listen(publicPort, host, () => { server.off("error", reject); console.log(`[Host Supervisor] Public Asset Hub edge listening on http://${host}:${publicPort}.`); resolve(); })),
    stop: () => new Promise((resolve) => { for (const socket of sockets) socket.destroy(); sockets.clear(); server.close(resolve); })
  };
}

async function installRestrictedPreset(runtimePaths) {
  const source = path.join(projectDir, "agent-integration", "dsh", "agent-presets", "asset-hub-restricted");
  const destination = await ensureRuntimeSubdirectory({ dataRoot: runtimePaths.dataRoot, agentRoot: runtimePaths.agentRoot, relativePath: "dsh-home/.agent-presets/asset-hub-restricted" });
  for (const file of ["agent.cordis.yml", "preset.yml"]) { await access(path.join(source, file)); await copyFile(path.join(source, file), path.join(destination, file)); }
}

async function inspectBuild(sourceDir, identity) {
  try {
    const [recordText] = await Promise.all([readFile(path.join(sourceDir, ".dsh-build", "client-build-environment.json"), "utf8"), access(path.join(sourceDir, "apps", "web", "dist"))]);
    const record = JSON.parse(recordText);
    return record?.environment?.DSH_CLIENT_COMMIT_HASH === identity.commit.slice(0, 7) && record?.artifacts?.sha256 && record?.artifacts?.fileCount
      ? { ok: true }
      : { ok: false, reasonCode: "build_invalid" };
  } catch { return { ok: false, reasonCode: "build_missing" }; }
}

async function appendLifecycleLog(runtimePaths, event) {
  if (!runtimePaths?.directories?.logs) return;
  const record = {
    timestamp: new Date().toISOString(),
    operationId: event.operationId ?? null,
    phase: event.phase ?? null,
    component: event.component ?? null,
    pid: Number.isInteger(event.pid) ? event.pid : null,
    generation: Number.isInteger(event.generation) ? event.generation : null,
    dshCommit: event.dshCommit ?? null,
    health: event.health ?? null,
    reasonCode: event.reasonCode ?? null,
    status: event.status ?? null
  };
  await appendFile(path.join(runtimePaths.directories.logs, "runtime-supervisor.ndjson"), `${JSON.stringify(record)}\n`, { mode: 0o600 });
}

export async function main() {
  loadEnvConfig(projectDir);
  assertNodeVersion();
  if (value("AGENT_ENABLED") === "false") fail("AGENT_ENABLED=false 时不能启动 Host Supervisor。");
  const dataDir = requiredPath("DATA_DIR");
  const agentRuntimeDir = optionalPath("AGENT_RUNTIME_DIR");
  const sourceDir = optionalPath("DSH_SOURCE_DIR");
  const expectedVersion = JSON.parse(await readFile(path.join(projectDir, "agent-integration/dsh/version.json"), "utf8"));
  const runtimeUrl = dshUrl();
  const dshPort = Number.parseInt(runtimeUrl.port || "3080", 10);
  const proxyPort = port("AGENT_PROXY_PORT", 3081);
  const publicPort = port("HOST_PORT", 3027);
  const internalPort = port("HOST_INTERNAL_PORT", 3028);
  const gatewayPort = port("KNOWLEDGE_GATEWAY_MCP_PORT", 3082);
  if (dshPort !== 3080 || new Set([dshPort, proxyPort, publicPort, internalPort, gatewayPort]).size !== 5) fail("Host Supervisor 端口配置不符合正式运行约束。");
  const mediaDir = value("TRAINING_MEDIA_DIR");
  if (mediaDir && isInside(projectDir, path.resolve(mediaDir))) fail("TRAINING_MEDIA_DIR 必须位于 Git 代码目录外。");
  await access(path.join(projectDir, ".next", "BUILD_ID"));

  const instanceId = randomUUID();
  let stopping = false;
  let runtimePaths = null;
  let releaseLock = async () => {};
  if (agentRuntimeDir) {
    const inspected = await inspectRuntimePaths({ dataDir, agentRuntimeDir }).catch(() => null);
    if (inspected?.directories?.supervisor) {
      runtimePaths = inspected;
      releaseLock = await acquireSupervisorLock({ lockPath: supervisorLockPath(inspected.directories), instanceId });
      await assertNoLiveManagedOrphans(managedMetadataPath(inspected.directories));
    }
  }
  let core;
  const controller = new ManagedProcessController({
    supervisorInstanceId: instanceId,
    metadataPath: runtimePaths ? managedMetadataPath(runtimePaths.directories) : undefined,
    onProcessEvent: (event) => {
      void appendLifecycleLog(runtimePaths, { component: event.component, pid: event.record?.pid, generation: event.generation, status: event.type, reasonCode: event.intentional ? "intentional_stop" : null });
      if (stopping || event.type !== "exit") return;
      if (event.component === "assetHub") {
        controller.scheduleRestart("assetHub", async () => { try { await controller.start("assetHub", specifications.assetHub); await waitFor("Asset Hub", () => request(`http://127.0.0.1:${internalPort}/api/auth/session`)); } catch (error) { console.error(`[Host Supervisor] Asset Hub recovery failed: ${error instanceof Error ? error.message : error}`); } }, 1_000);
      } else if (core) void core.handleProcessExit(event);
    }
  });
  const specifications = {
    assetHub: { command: process.execPath, args: ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", String(internalPort)], cwd: projectDir, env: runtimeEnvironmentProfiles.assetHub(process.env) }
  };
  const rpc = async (method, payload) => {
    const response = await request(new URL(`/api/${method}`, runtimeUrl), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "client-request", rpcId: `host-supervisor-${method}`, method, payload }) });
    const body = await response.json();
    if (body?.result?.ok !== true) throw new Error("DSH rejected read-only health RPC.");
    return body.result.value;
  };
  const inspectStatic = async () => {
    try {
      if (!agentRuntimeDir || !sourceDir || !value("AGENT_GATEWAY_TOKEN")) return { ok: false, reasonCode: "runtime_configuration_invalid" };
      await inspectRuntimePaths({ dataDir, agentRuntimeDir });
      const canonicalSource = await resolveAllowedDshSourcePath(projectDir, sourceDir);
      const identity = await validateDshSource(canonicalSource, expectedVersion, { readOnly: true });
      const build = await inspectBuild(canonicalSource, identity);
      if (!build.ok) return build;
      lastCanonicalSource = canonicalSource;
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      return { ok: false, reasonCode: /DSH|Git|版本|fingerprint/.test(message) ? "source_invalid" : "runtime_configuration_invalid" };
    }
  };
  let lastCanonicalSource = null;
  const configureAgentSpecifications = () => {
    if (!runtimePaths?.agentRoot || !lastCanonicalSource) throw new Error("Agent Runtime 尚未完成受控预检。");
    const values = { DSH_HOME: path.join(runtimePaths.agentRoot, "dsh-home"), AGENT_WORKSPACE_ROOT: path.join(runtimePaths.agentRoot, "workspaces") };
    specifications.gateway = { command: process.execPath, args: ["agent-integration/scripts/start-knowledge-gateway-mcp.mjs"], cwd: projectDir, env: runtimeEnvironmentProfiles.gatewayBridge(process.env, { KNOWLEDGE_GATEWAY_MCP_PORT: String(gatewayPort), KNOWLEDGE_GATEWAY_INTERNAL_URL: `http://127.0.0.1:${internalPort}` }) };
    specifications.dsh = { command: process.execPath, args: ["--import", "tsx/esm", "apps/cli/src/bin.ts", "web", "--patch", path.join(projectDir, "agent-integration", "dsh", "asset-hub-agent.overlay.yml"), "--host", "127.0.0.1", "--port", String(dshPort)], cwd: lastCanonicalSource, env: runtimeEnvironmentProfiles.dsh(process.env, { DSH_HOME: values.DSH_HOME, DSH_TELEMETRY_DISABLED: "1", AGENT_WORKSPACE_ROOT: values.AGENT_WORKSPACE_ROOT, ASSET_HUB_MCP_URL: `http://127.0.0.1:${gatewayPort}/mcp` }) };
    specifications.proxy = { command: process.execPath, args: ["agent-integration/scripts/start-agent-proxy.mjs"], cwd: projectDir, env: runtimeEnvironmentProfiles.agentProxy(process.env, { AGENT_PROXY_HOST: "127.0.0.1", AGENT_PROXY_BASE_PATH: "/agent-runtime", AGENT_WORKSPACE_ROOT: values.AGENT_WORKSPACE_ROOT }) };
  };
  const inspectRuntime = async () => {
    let credentialStatus = "unknown";
    try {
      await rpc("session.list", {});
      const described = await rpc("credentials.describe", { refs: ["DEEPSEEK_API_KEY"] });
      credentialStatus = described?.credentials?.DEEPSEEK_API_KEY?.configured === true ? "configured" : "missing";
    } catch { return { dsh: false, gateway: false, proxy: false, mcp: false, credentialStatus, reasonCode: "dsh_unavailable" }; }
    const gateway = await request(`http://127.0.0.1:${gatewayPort}/mcp`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: "health", method: "initialize", params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "host-supervisor", version: "2.1.0.9" } } }) }).then(() => true).catch(() => false);
    const proxy = await request(`http://127.0.0.1:${proxyPort}/healthz`).then(() => true).catch(() => false);
    return { dsh: true, gateway, proxy, mcp: gateway, credentialStatus, reasonCode: gateway && proxy ? undefined : "runtime_health_failed" };
  };
  const componentPort = { gateway: gatewayPort, dsh: dshPort, proxy: proxyPort };
  core = new RuntimeLifecycleCore({
    controller, inspectStatic, inspectRuntime,
    prepareRuntime: async () => {
      runtimePaths = await ensureRuntimePaths({ dataDir, agentRuntimeDir });
      if (!controller.metadataPath) {
        await controller.setMetadataPath(managedMetadataPath(runtimePaths.directories));
        releaseLock = await acquireSupervisorLock({ lockPath: supervisorLockPath(runtimePaths.directories), instanceId });
      }
      configureAgentSpecifications();
      await installRestrictedPreset(runtimePaths);
    },
    startComponent: async (component) => {
      if (controller.isRunning(component)) return;
      await assertPortAvailable(componentPort[component], component);
      await controller.start(component, specifications[component]);
      if (component === "gateway") await waitFor("Knowledge Gateway MCP", () => request(`http://127.0.0.1:${gatewayPort}/mcp`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: "health", method: "initialize", params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "host-supervisor", version: "2.1.0.9" } } }) }));
      if (component === "dsh") await waitFor("DSH Runtime", () => rpc("session.list", {}));
      if (component === "proxy") await waitFor("Agent Proxy", () => request(`http://127.0.0.1:${proxyPort}/healthz`));
    },
    stopComponents: async (components = ["proxy", "dsh", "gateway"]) => { for (const component of components) await controller.stop(component); },
    onStateChange: (state) => {
      void appendLifecycleLog(runtimePaths, { ...state, dshCommit: expectedVersion.sourceCommit, health: state.status === "ready" ? "pass" : null });
      console.log(`[Host Supervisor] Agent Runtime ${state.status}${state.phase ? ` (${state.phase})` : ""}${state.reasonCode ? `: ${state.reasonCode}` : ""}.`);
    }
  });
  await assertPortAvailable(publicPort, "公开 Asset Hub");
  await assertPortAvailable(internalPort, "内部 Asset Hub");
  await controller.start("assetHub", specifications.assetHub);
  await waitFor("Asset Hub", () => request(`http://127.0.0.1:${internalPort}/api/auth/session`));
  const edge = createEdgeServer({ host: value("HOST_BIND_HOST") || "0.0.0.0", port: publicPort, internalPort, proxyPort });
  await edge.start();
  await waitFor("Public Asset Hub", () => request(`http://127.0.0.1:${publicPort}/api/auth/session`));
  console.log(`[Host Supervisor] Asset Hub Shell is ready at http://主机IP:${publicPort}.`);
  const state = await core.ensureReady();
  if (state.status !== "ready") console.error(`[Host Supervisor] Agent Runtime is ${state.status}${state.reasonCode ? `: ${state.reasonCode}` : ""}. Asset Hub Shell remains available.`);
  const shutdown = async (signal, exitCode = 0) => {
    if (stopping) return;
    stopping = true;
    console.log(`\n[Host Supervisor] Received ${signal}. Stopping managed services...`);
    await core.stopForShutdown();
    await edge.stop();
    await controller.stopAll(["assetHub"]);
    await releaseLock();
    process.exit(exitCode);
  };
  process.on("SIGINT", () => { void shutdown("SIGINT"); });
  process.on("SIGTERM", () => { void shutdown("SIGTERM"); });
}
