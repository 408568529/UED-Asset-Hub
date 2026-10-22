import { randomBytes, randomUUID } from "node:crypto";
import http from "node:http";
import { createHostHttpsEdge } from "./host-https-edge.mjs";
import { createServer } from "node:net";
import { access, copyFile, readFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { isInside, runtimeEnvironmentProfiles } from "../agent-integration/scripts/runtime-boundary.mjs";
import { resolveAllowedDshSourcePath } from "../agent-integration/scripts/dsh-source-policy.mjs";
import { validateDshRuntimeSource, validateDshSource } from "../agent-integration/scripts/dsh-source-validator.mjs";
import { ensureRuntimePaths, ensureRuntimeSubdirectory, inspectRuntimePaths } from "./runtime-path-safety.mjs";
import { ManagedProcessController, assertNoLiveManagedOrphans, managedMetadataPath } from "./managed-process-controller.mjs";
import { RuntimeLifecycleCore } from "./runtime-lifecycle-core.mjs";
import { acquireSupervisorLock, supervisorLockPath } from "./supervisor-lock.mjs";
import { createRuntimeControlBridge, runtimeControlEndpoint } from "./runtime-control-bridge.mjs";
import { createWindowsStopDiscoveryBridge, windowsServiceMode } from "./windows-stop-discovery.mjs";
import { resolveWindowsServiceIdentity } from "./windows-service-identity.mjs";
import { credentialHelperPath, loadWindowsCredentialBundle } from "./windows-credential-bundle.mjs";
import { resolveHostSecurityConfig } from "./host-security-config.mjs";
import { createRuntimeDiagnosticsState } from "./runtime-diagnostics-state.mjs";
import { createBoundedNdjsonWriter } from "./bounded-ndjson-writer.mjs";
import { probeDshSessionList, probeKnowledgeGatewayMcp } from "../agent-integration/scripts/runtime-readiness.mjs";
import { installGenuiHaldurReadingPatch } from "../agent-integration/scripts/genui-haldur-reading.mjs";
import { resolveHostPorts } from "./runtime-ports.mjs";
import { acceptsLocalDistributionRequest } from "./local-distribution-config.mjs";

const require = createRequire(import.meta.url);
const { loadEnvConfig } = require("@next/env");
const httpProxy = require("http-proxy");
const projectDir = process.cwd();
const loopbackHosts = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

function fail(message) { throw new Error(`[Host Supervisor] ${message}`); }
function lifecycleError(message, reasonCode, retryable = false) {
  const error = new Error(message);
  error.reasonCode = reasonCode;
  error.retryable = retryable;
  return error;
}
export function createSharedShutdown(run) {
  let shutdownPromise = null;
  return (...args) => {
    if (!shutdownPromise) {
      try { shutdownPromise = Promise.resolve(run(...args)); }
      catch (error) { shutdownPromise = Promise.reject(error); }
    }
    return shutdownPromise;
  };
}
export function withRuntimeControlEnvironment(environment, { endpoint, token }) {
  return { ...environment, RUNTIME_CONTROL_ENDPOINT: endpoint, RUNTIME_CONTROL_TOKEN: token };
}
function value(name) { return process.env[name]?.trim() || ""; }
function requiredPath(name) { const raw = value(name); if (!raw) fail(`缺少 ${name}。`); return path.resolve(raw); }
function optionalPath(name) { const raw = value(name); return raw ? path.resolve(raw) : null; }
function assertNodeVersion() {
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major < 22 || (major === 22 && minor < 19)) fail(`Node.js ${process.versions.node} 不满足 DSH 需要的 22.19+。`);
  if (windowsServiceMode() && process.versions.node !== "22.23.3") fail(`Windows service mode requires pinned Node.js 22.23.3, received ${process.versions.node}.`);
}

function dshUrl(defaultPort = 3080) {
  let parsed;
  try { parsed = new URL(value("DSH_BASE_URL") || `http://127.0.0.1:${defaultPort}`); } catch { fail("DSH_BASE_URL 不是有效 URL。"); }
  if (parsed.protocol !== "http:" || !loopbackHosts.has(parsed.hostname)) fail("DSH_BASE_URL 必须保持本机回环地址。");
  return parsed;
}

function hasValidAgentModelConfiguration(settings, catalog) {
  const namespaces = Array.isArray(settings?.namespaces) ? settings.namespaces : [];
  const deepseek = namespaces.find((item) => item?.ns === "llm-deepseek")?.value;
  const selection = namespaces.find((item) => item?.ns === "agent-default-model")?.value;
  const baseUrl = typeof deepseek?.baseURL === "string" && deepseek.baseURL ? deepseek.baseURL : "https://api.deepseek.com";
  const model = selection?.provider === "deepseek-official" && typeof selection.model === "string" ? selection.model : "deepseek-v4-flash";
  try {
    const parsed = new URL(baseUrl);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || !parsed.hostname || !/^[A-Za-z0-9._:-]{1,160}$/.test(model)) return false;
  } catch { return false; }
  const group = Array.isArray(catalog?.groups) ? catalog.groups.find((item) => item?.id === "deepseek-official") : null;
  return Boolean(group && Array.isArray(group.models) && group.models.some((item) => item?.id === model) && (!selection || selection.provider === "deepseek-official"));
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

async function assertPortAvailable(portNumber, label, { reasonCode = null } = {}) {
  await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", () => reject(reasonCode ? lifecycleError(`${label} 端口 ${portNumber} 已被占用。`, reasonCode) : new Error(`${label} 端口 ${portNumber} 已被占用。`)));
    probe.listen(portNumber, process.env.UED_LOCAL_DISTRIBUTION_MODE === "true" ? "127.0.0.1" : "0.0.0.0", () => probe.close(resolve));
  });
}

export function createEdgeServer({ host, port: publicPort, internalPort, proxyPort }) {
  const edge = httpProxy.createProxyServer({ changeOrigin: true, ws: true });
  const sockets = new Set();
  const belongsToAgentRuntime = (request, requestUrl) => {
    if (requestUrl.pathname.startsWith("/agent-runtime/")) return true;
    if (requestUrl.pathname === "/.well-known/dsh-genui" || requestUrl.pathname === "/genui" || requestUrl.pathname.startsWith("/genui/")) return true;
    if (requestUrl.pathname === "/api/respond" || /^\/api\/[^/]+\.[^/]+$/.test(requestUrl.pathname)) return true;
    try { return Boolean(request.headers.referer && new URL(request.headers.referer).pathname.startsWith("/agent-runtime/")); } catch { return false; }
  };
  edge.on("error", (error, _request, response) => {
    if (response && "writeHead" in response) { response.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" }); response.end("Asset Hub internal service is unavailable."); }
  });
  const server = http.createServer((request, response) => {
    if (process.env.UED_LOCAL_DISTRIBUTION_INSTANCE) response.setHeader("X-UED-Local-Instance", process.env.UED_LOCAL_DISTRIBUTION_INSTANCE || "");
    if (!acceptsLocalDistributionRequest(request)) { response.writeHead(403); response.end("Forbidden"); return; }
    const requestUrl = new URL(request.url || "/", "http://localhost");
    if (requestUrl.pathname === "/api/knowledge-gateway" || requestUrl.pathname.startsWith("/api/knowledge-gateway/")) { response.writeHead(404, { "Content-Type": "application/json" }); response.end(JSON.stringify({ error: { code: "not-found", message: "Not found." } })); return; }
    if (requestUrl.pathname === "/agent-runtime") { response.writeHead(308, { Location: "/agent-runtime/" }); response.end(); return; }
    if (belongsToAgentRuntime(request, requestUrl)) { if (requestUrl.pathname.startsWith("/agent-runtime/")) request.url = request.url?.replace(/^\/agent-runtime/, "") || "/"; edge.web(request, response, { target: `http://127.0.0.1:${proxyPort}` }); return; }
    edge.web(request, response, { target: `http://127.0.0.1:${internalPort}`, changeOrigin: false });
  });
  server.on("connection", (socket) => { sockets.add(socket); socket.once("close", () => sockets.delete(socket)); });
  server.on("upgrade", (request, socket, head) => {
    if (!acceptsLocalDistributionRequest(request)) { socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n"); return; }
    const requestUrl = new URL(request.url || "/", "http://localhost");
    if (belongsToAgentRuntime(request, requestUrl)) { if (requestUrl.pathname.startsWith("/agent-runtime/")) request.url = request.url?.replace(/^\/agent-runtime/, "") || "/"; edge.ws(request, socket, head, { target: `http://127.0.0.1:${proxyPort}` }); return; }
    edge.ws(request, socket, head, { target: `http://127.0.0.1:${internalPort}` });
  });
  return {
    start: () => new Promise((resolve, reject) => server.once("error", reject).listen(publicPort, host, () => { server.off("error", reject); console.log(`[Host Supervisor] Public Asset Hub edge listening on http://${host}:${publicPort}.`); resolve(); })),
    stop: () => new Promise((resolve) => {
      server.close(() => resolve());
      setTimeout(() => { for (const socket of sockets) socket.destroy(); sockets.clear(); }, 5_000).unref();
    })
  };
}

async function windowsJobHelperSpecification() {
  if (process.platform !== "win32") return undefined;
  const directory = path.join(projectDir, "native", "windows-job-helper", "bin");
  const helperPath = path.join(directory, "ued-windows-job-helper.exe");
  const manifestPath = path.join(directory, "ued-windows-job-helper.manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (manifest?.architecture !== "x64" || typeof manifest?.sha256 !== "string") throw new Error("Windows Job Helper manifest is invalid.");
  return { path: helperPath, manifestPath, sha256: manifest.sha256 };
}

async function windowsPipeSecurityAdapterSpecification() {
  if (process.platform !== "win32") return undefined;
  const directory = path.join(projectDir, "native", "windows-pipe-security-adapter", "bin");
  const helperPath = path.join(directory, "ued-windows-pipe-security-adapter.exe");
  const manifestPath = path.join(directory, "ued-windows-pipe-security-adapter.manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (manifest?.architecture !== "x64" || manifest?.version !== 1 || typeof manifest?.sha256 !== "string") throw new Error("Windows Pipe Security Adapter manifest is invalid.");
  await access(helperPath);
  return { path: helperPath, manifestPath, sha256: manifest.sha256 };
}

export async function installAgentPresets(runtimePaths) {
  await installGenuiHaldurReadingPatch(path.join(runtimePaths.agentRoot, "dsh-home"));
  const bootstrapSource = path.join(projectDir, "agent-integration", "dsh", "genui-client-bootstrap");
  const bootstrapDestination = await ensureRuntimeSubdirectory({ dataRoot: runtimePaths.dataRoot, agentRoot: runtimePaths.agentRoot, relativePath: "dsh-home/profiles/web/node_modules/@ued/asset-hub-genui-client-bootstrap" });
  for (const file of ["package.json", "index.mjs"]) await copyFile(path.join(bootstrapSource, file), path.join(bootstrapDestination, file));
  for (const preset of ["asset-hub-restricted", "asset-hub-genui-restricted"]) {
    const source = path.join(projectDir, "agent-integration", "dsh", "agent-presets", preset);
    const destination = await ensureRuntimeSubdirectory({ dataRoot: runtimePaths.dataRoot, agentRoot: runtimePaths.agentRoot, relativePath: `dsh-home/.agent-presets/${preset}` });
    for (const file of ["agent.cordis.yml", "preset.yml"]) { await access(path.join(source, file)); await copyFile(path.join(source, file), path.join(destination, file)); }
  }
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

export function publicLifecycleRecord(event) {
  return {
    timestamp: new Date().toISOString(),
    operationId: event.operationId ?? null,
    phase: event.phase ?? null,
    component: event.component ?? null,
    pid: Number.isInteger(event.pid) ? event.pid : null,
    generation: Number.isInteger(event.generation) ? event.generation : null,
    dshCommit: event.dshCommit ?? null,
    health: event.health ?? null,
    reasonCode: event.reasonCode ?? null,
    status: event.status ?? null,
    operation: event.operation ?? null,
    stderrRef: typeof event.stderrRef === "string" ? event.stderrRef : null,
    ownership: event.ownership ?? null,
    exitCode: Number.isInteger(event.exitCode) ? event.exitCode : null,
    exitSignal: typeof event.exitSignal === "string" ? event.exitSignal : null,
    restartCount: Number.isInteger(event.restartCount) ? event.restartCount : null,
    recoveryCount: Number.isInteger(event.recoveryCount) ? event.recoveryCount : null
  };
}

export async function main() {
  loadEnvConfig(projectDir);
  const serviceMode = windowsServiceMode();
  const serviceIdentity = serviceMode ? resolveWindowsServiceIdentity() : null;
  let securityEnvironment = process.env;
  if (serviceMode && process.env.NODE_ENV === "production") {
    for (const key of ["ADMIN_PASSWORD", "ADMIN_SESSION_SECRET", "DEEPSEEK_API_KEY", "AGENT_GATEWAY_TOKEN", "TEST_ENV_ENCRYPTION_KEY"]) if (process.env[key]) fail(`Windows production credential ${key} must come from the DPAPI bundle.`);
    const bundlePath = value("UED_CREDENTIAL_BUNDLE_PATH");
    if (!bundlePath) fail("Windows production requires UED_CREDENTIAL_BUNDLE_PATH.");
    securityEnvironment = { ...process.env, ...await loadWindowsCredentialBundle({ helperPath: credentialHelperPath(projectDir), bundlePath: path.resolve(bundlePath) }) };
  }
  const securityConfig = resolveHostSecurityConfig(securityEnvironment);
  assertNodeVersion();
  if (value("AGENT_ENABLED") === "false") fail("AGENT_ENABLED=false 时不能启动 Host Supervisor。");
  const dataDir = requiredPath("DATA_DIR");
  const agentRuntimeDir = optionalPath("AGENT_RUNTIME_DIR");
  const sourceDir = optionalPath("DSH_SOURCE_DIR");
  const runtimeSourceDir = optionalPath("DSH_RUNTIME_SOURCE_DIR");
  const expectedVersion = JSON.parse(await readFile(path.join(projectDir, "agent-integration/dsh/version.json"), "utf8"));
  const { dsh: dshPort, proxy: proxyPort, publicHub: publicPort, internalHub: internalPort, gateway: gatewayPort } = resolveHostPorts(process.env);
  let runtimeUrl = new URL(`http://127.0.0.1:${dshPort}`);
  const mediaDir = value("TRAINING_MEDIA_DIR");
  if (mediaDir && isInside(projectDir, path.resolve(mediaDir))) fail("TRAINING_MEDIA_DIR 必须位于 Git 代码目录外。");
  await access(path.join(projectDir, ".next", "BUILD_ID"));

  const instanceId = randomUUID();
  const runtimeInstanceId = randomUUID();
  const windowsJobHelper = await windowsJobHelperSpecification();
  const windowsPipeSecurityAdapter = serviceMode ? await windowsPipeSecurityAdapterSpecification() : undefined;
  let stopping = false;
  let runtimePaths = null;
  let releaseLock = async () => {};
  let runtimeControl = null;
  let stopDiscovery = null;
  let managedShutdown = null;
  let finalizationPromise = null;
  const diagnostics = createRuntimeDiagnosticsState({ supervisorStartedAt: new Date().toISOString() });
  diagnostics.recordInProcessLifecycle("supervisor", { status: "running", health: "healthy" });
  let lifecycleWriter = null;
  const ensureLifecycleWriter = () => {
    if (lifecycleWriter || !runtimePaths?.directories?.logs) return lifecycleWriter;
    lifecycleWriter = createBoundedNdjsonWriter({
      filePath: path.join(runtimePaths.directories.logs, "runtime-supervisor.ndjson"),
      onDegraded: () => { diagnostics.recordSupervisorDegradation("diagnostics_retention_failed"); },
      onRecovered: () => { diagnostics.clearSupervisorDegradation("diagnostics_retention_failed"); }
    });
    return lifecycleWriter;
  };
  const logLifecycle = (event) => {
    void ensureLifecycleWriter()?.append(publicLifecycleRecord(event));
  };
  if (agentRuntimeDir) {
    const inspected = await inspectRuntimePaths({ dataDir, agentRuntimeDir }).catch(() => null);
    if (inspected?.directories?.supervisor) {
      runtimePaths = inspected;
      ensureLifecycleWriter();
      releaseLock = await acquireSupervisorLock({ lockPath: supervisorLockPath(inspected.directories), instanceId });
      await assertNoLiveManagedOrphans(managedMetadataPath(inspected.directories));
    }
  }
  let core;
  const controller = new ManagedProcessController({
    supervisorInstanceId: instanceId,
    runtimeInstanceId,
    metadataPath: runtimePaths ? managedMetadataPath(runtimePaths.directories) : undefined,
    onPersistenceError: () => {
      diagnostics.recordSupervisorDegradation("metadata_persistence_failed");
      logLifecycle({ status: "metadata_persistence_failed", reasonCode: "metadata_persistence_failed" });
    },
    onProcessEvent: (event) => {
      diagnostics.recordManagedEvent(event);
      const componentState = diagnostics.component(event.component === "assetHub" ? "assetHubInternal" : event.component);
      const wrapperPath = value("UED_WINSW_EXECUTABLE");
      const stderrRef = serviceMode && wrapperPath ? path.win32.resolve(wrapperPath, "..", "..", "logs", "winsw", `${serviceIdentity.serviceName}.err.log`) : null;
      const exitReasonCode = event.type !== "exit" ? null : event.spawnFailed ? "child_spawn_failed" : event.signal ? "child_exit_signal" : event.code === 0 ? "child_exit_code_zero" : Number.isInteger(event.code) ? "child_exit_code_nonzero" : "child_exit_code_unknown";
      logLifecycle({ component: event.component, pid: event.pid, generation: event.generation, status: event.type, operation: event.operation, operationId: event.operationId, stderrRef, ownership: event.ownership ?? null, exitCode: event.code, exitSignal: event.signal, activeProcessCount: event.activeProcessCount ?? null, deadlineAt: event.deadlineAt ?? null, restartCount: componentState?.restartCount ?? null, reasonCode: event.reasonCode ?? exitReasonCode ?? componentState?.reasonCode ?? null });
      if (stopping || event.type !== "exit") return;
      if (event.component === "assetHub") {
        controller.scheduleRestart("assetHub", async () => { try { await controller.start("assetHub", specifications.assetHub, { operation: "process_restart" }); await waitFor("Asset Hub", () => request(`http://127.0.0.1:${internalPort}/api/auth/session`)); } catch (error) { console.error(`[Host Supervisor] Asset Hub recovery failed: ${error instanceof Error ? error.message : error}`); } }, 1_000);
      } else if (core) void core.handleProcessExit(event);
    }
  });
  const specifications = {
    assetHub: { command: process.execPath, args: securityEnvironment.UED_LOCAL_TEST_MODE === "true" ? [".next-local-test/standalone/server.js"] : ["server.js"], cwd: projectDir, env: runtimeEnvironmentProfiles.assetHub(securityEnvironment, { ADMIN_USERNAME: securityConfig.username, ADMIN_PASSWORD: securityConfig.password, ADMIN_SESSION_SECRET: securityConfig.sessionSecret, DSH_BASE_URL: runtimeUrl.origin, HOSTNAME: "127.0.0.1", PORT: String(internalPort), UED_STAGING_SHUTDOWN_ENABLED: securityEnvironment.UED_STAGING_SHUTDOWN_ENABLED === "true" ? "true" : "false" }), windowsJobHelper, convergence: { verify: () => assertPortAvailable(internalPort, "内部 Asset Hub", { reasonCode: "managed_component_port_not_released" }) } }
  };
  const rpc = async (method, payload) => {
    if (method === "session.list") return probeDshSessionList({ baseUrl: runtimeUrl });
    const rpcId = `host-supervisor-${method}`;
    const response = await request(new URL(`/api/${method}`, runtimeUrl), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "client-request", rpcId, method, payload }) });
    const body = await response.json();
    if (body?.type !== "server-response" || body?.rpcId !== rpcId || body?.result?.ok !== true) throw new Error("DSH rejected read-only health RPC.");
    return body.result.value;
  };
  const observeHealth = async (component, check, { reasonCode = "health_check_failed", operation = "health_check", operationId = null } = {}) => {
    const token = diagnostics.beginHealthProbe(component);
    try {
      const result = await check();
      diagnostics.acceptHealthProbe(token, { health: "healthy", operation, operationId });
      return result;
    } catch (error) {
      diagnostics.acceptHealthProbe(token, { health: "unhealthy", reasonCode, operation, operationId });
      throw error;
    }
  };
  const inspectStatic = async () => {
    try {
      if (!agentRuntimeDir || !sourceDir || !runtimeSourceDir || !securityEnvironment.AGENT_GATEWAY_TOKEN) return { ok: false, reasonCode: "runtime_configuration_invalid" };
      const configuredUrl = dshUrl(dshPort);
      if (Number.parseInt(configuredUrl.port || "3080", 10) !== dshPort) return { ok: false, reasonCode: "runtime_configuration_invalid" };
      await inspectRuntimePaths({ dataDir, agentRuntimeDir });
      const canonicalSource = await resolveAllowedDshSourcePath(projectDir, sourceDir);
      const identity = await validateDshSource(canonicalSource, expectedVersion, { readOnly: true });
      const runtimeSource = await validateDshRuntimeSource(canonicalSource, runtimeSourceDir);
      const build = await inspectBuild(runtimeSource.runtimeSourceDir, identity);
      if (!build.ok) return build;
      lastCanonicalRuntimeSource = runtimeSource.runtimeSourceDir;
      runtimeUrl = configuredUrl;
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      console.error(`[Host Supervisor] Agent Runtime static preflight failed: ${message || "unknown error"}`);
      return { ok: false, reasonCode: /DSH|Git|版本|fingerprint/.test(message) ? "source_invalid" : "runtime_configuration_invalid" };
    }
  };
  let lastCanonicalRuntimeSource = null;
  const configureAgentSpecifications = () => {
    if (!runtimePaths?.agentRoot || !lastCanonicalRuntimeSource) throw new Error("Agent Runtime 尚未完成受控预检。");
    const values = { DSH_HOME: path.join(runtimePaths.agentRoot, "dsh-home"), AGENT_WORKSPACE_ROOT: path.join(runtimePaths.agentRoot, "workspaces") };
    specifications.gateway = { command: process.execPath, args: ["agent-integration/scripts/start-knowledge-gateway-mcp.mjs"], cwd: projectDir, env: runtimeEnvironmentProfiles.gatewayBridge(securityEnvironment, { KNOWLEDGE_GATEWAY_MCP_PORT: String(gatewayPort), KNOWLEDGE_GATEWAY_INTERNAL_URL: `http://127.0.0.1:${internalPort}` }), windowsJobHelper, convergence: { verify: () => assertPortAvailable(gatewayPort, "Knowledge Gateway", { reasonCode: "managed_component_port_not_released" }) } };
    specifications.dsh = { command: process.execPath, args: ["--import", "tsx/esm", "apps/cli/src/bin.ts", "--profile", "web", "--patch", path.join(projectDir, "agent-integration", "dsh", "asset-hub-agent.overlay.yml"), "--no-open", "--host", "127.0.0.1", "--port", String(dshPort)], cwd: lastCanonicalRuntimeSource, env: runtimeEnvironmentProfiles.dsh(securityEnvironment, { DSH_HOME: values.DSH_HOME, DSH_TELEMETRY_DISABLED: "1", DSH_GENUI_ARTIFACT_ROOT: path.join(values.DSH_HOME, "genui-artifacts"), AGENT_WORKSPACE_ROOT: values.AGENT_WORKSPACE_ROOT, ASSET_HUB_MCP_URL: `http://127.0.0.1:${gatewayPort}/mcp` }), windowsJobHelper, convergence: { verify: () => assertPortAvailable(dshPort, "DSH", { reasonCode: "managed_component_port_not_released" }) } };
    specifications.proxy = { command: process.execPath, args: ["agent-integration/scripts/start-agent-proxy.mjs"], cwd: projectDir, env: runtimeEnvironmentProfiles.agentProxy(securityEnvironment, { ADMIN_USERNAME: securityConfig.username, ADMIN_SESSION_SECRET: securityConfig.sessionSecret, DSH_BASE_URL: runtimeUrl.origin, AGENT_PROXY_HOST: "127.0.0.1", AGENT_PROXY_BASE_PATH: "/agent-runtime", AGENT_WORKSPACE_ROOT: values.AGENT_WORKSPACE_ROOT }), windowsJobHelper, convergence: { verify: () => assertPortAvailable(proxyPort, "Agent Proxy", { reasonCode: "managed_component_port_not_released" }) } };
  };
  const inspectRuntime = async () => {
    let credentialStatus = "unknown";
    let agentConfigurationStatus = "unknown";
    let dsh = false;
    try {
      await observeHealth("dsh", () => rpc("session.list", {}), { reasonCode: "dsh_unavailable" });
      dsh = true;
      const [credentialResult, settingsResult, catalogResult] = await Promise.allSettled([
        rpc("credentials.describe", { refs: ["DEEPSEEK_API_KEY"] }),
        rpc("settings.describe", {}),
        rpc("llm.models", {})
      ]);
      if (credentialResult.status === "fulfilled") credentialStatus = credentialResult.value?.credentials?.DEEPSEEK_API_KEY?.configured === true ? "configured" : "missing";
      agentConfigurationStatus = settingsResult.status === "fulfilled" && catalogResult.status === "fulfilled" && hasValidAgentModelConfiguration(settingsResult.value, catalogResult.value) ? "valid" : "invalid";
    } catch {}
    const [gateway, proxy] = await Promise.all([
      observeHealth("gateway", () => probeKnowledgeGatewayMcp({ endpoint: `http://127.0.0.1:${gatewayPort}/mcp` }), { reasonCode: "gateway_health_failed" }).then(() => true).catch(() => false),
      observeHealth("proxy", () => request(`http://127.0.0.1:${proxyPort}/healthz`), { reasonCode: "proxy_health_failed" }).then(() => true).catch(() => false)
    ]);
    return { dsh, gateway, proxy, mcp: gateway, credentialStatus, agentConfigurationStatus, reasonCode: !dsh ? "dsh_unavailable" : gateway && proxy ? undefined : "runtime_health_failed" };
  };
  const componentPort = { gateway: gatewayPort, dsh: dshPort, proxy: proxyPort };
  core = new RuntimeLifecycleCore({
    controller, inspectStatic, inspectRuntime,
    prepareRuntime: async () => {
      try {
        runtimePaths = await ensureRuntimePaths({ dataDir, agentRuntimeDir });
        ensureLifecycleWriter();
        if (!controller.metadataPath) {
          await controller.setMetadataPath(managedMetadataPath(runtimePaths.directories));
          releaseLock = await acquireSupervisorLock({ lockPath: supervisorLockPath(runtimePaths.directories), instanceId });
        }
        configureAgentSpecifications();
        await installAgentPresets(runtimePaths);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Agent Runtime 配置失败。";
        const reasonCode = /ownership|lock|遗留|orphan/i.test(message) ? "runtime_ownership_conflict" : "runtime_configuration_invalid";
        throw lifecycleError(message, reasonCode);
      }
    },
    startComponent: async (component, operation) => {
      if (controller.isRunning(component)) return;
      await assertPortAvailable(componentPort[component], component, { reasonCode: "port_conflict" });
      await controller.start(component, specifications[component], { operation: operation.trigger, operationId: operation.operationId });
      if (component === "gateway") await observeHealth("gateway", () => waitFor("Knowledge Gateway MCP", () => probeKnowledgeGatewayMcp({ endpoint: `http://127.0.0.1:${gatewayPort}/mcp` })), { reasonCode: "gateway_health_failed", operation: operation.trigger, operationId: operation.operationId });
      if (component === "dsh") await observeHealth("dsh", () => waitFor("DSH Runtime", () => rpc("session.list", {})), { reasonCode: "dsh_unavailable", operation: operation.trigger, operationId: operation.operationId });
      if (component === "proxy") await observeHealth("proxy", () => waitFor("Agent Proxy", () => request(`http://127.0.0.1:${proxyPort}/healthz`)), { reasonCode: "proxy_health_failed", operation: operation.trigger, operationId: operation.operationId });
    },
    stopComponents: async (components = ["proxy", "dsh", "gateway"]) => { for (const component of components) await controller.stop(component); },
    onStateChange: (state) => {
      diagnostics.recordRuntimeState(state);
      logLifecycle({ ...state, dshCommit: expectedVersion.sourceCommit, health: state.status === "ready" ? "pass" : null });
      console.log(`[Host Supervisor] Agent Runtime ${state.status}${state.phase ? ` (${state.phase})` : ""}${state.reasonCode ? `: ${state.reasonCode}` : ""}.`);
    },
    onRecoveryEvent: (event) => {
      diagnostics.recordRecovery(event);
      logLifecycle({ ...event, status: `recovery_${event.type}`, operation: "runtime_recovery", recoveryCount: diagnostics.recoveryCount });
    }
  });
  const token = randomBytes(32).toString("base64url");
  const endpoint = runtimeControlEndpoint({ supervisorDirectory: runtimePaths?.directories?.supervisor || (agentRuntimeDir ? path.join(agentRuntimeDir, "supervisor") : projectDir), instanceId });
  runtimeControl = createRuntimeControlBridge({
    endpoint,
    token,
    inspect: () => core.inspect({ readOnly: true }),
    ensureReady: () => core.ensureReady({ trigger: "manual_start" }),
    shutdown: () => {
      if (!managedShutdown) throw new Error("Managed shutdown is unavailable during startup.");
      return managedShutdown();
    },
    shutdownBinding: () => ({ supervisorInstanceId: instanceId, runtimeInstanceId, generation: core.snapshot().generation }),
    diagnostics: () => diagnostics.snapshot(),
    onEvent: (event) => { logLifecycle({ ...event, phase: `runtime-control:${event.operation}` }); },
    onShutdownDelivered: () => { void finalizeShutdown({ exitCode: 0, exitProcess: true }); }
  });
  diagnostics.recordInProcessLifecycle("runtimeControl", { status: "starting" });
  await runtimeControl.start();
  diagnostics.recordInProcessLifecycle("runtimeControl", { status: "running", health: "healthy" });
  specifications.assetHub.env = withRuntimeControlEnvironment(specifications.assetHub.env, { endpoint, token });
  await assertPortAvailable(publicPort, "公开 Asset Hub");
  await assertPortAvailable(internalPort, "内部 Asset Hub");
  let httpsEdge;
  if (value("UED_LAN_HTTPS_CONFIG")) {
    if (value("HOST_BIND_HOST") !== "127.0.0.1" || value("ADMIN_SESSION_SECURE") !== "true" || value("UED_LOCAL_DISTRIBUTION_MODE")) fail("LAN HTTPS requires the original protected HTTPS mode with a loopback backend.");
    const lan = JSON.parse(await readFile(value("UED_LAN_HTTPS_CONFIG"), "utf8"));
    if (lan.mode !== "lan" || lan.lan?.origin !== value("PUBLIC_ORIGIN")) fail("LAN HTTPS configuration identity mismatch.");
    httpsEdge = await createHostHttpsEdge(lan.lan, publicPort);
    await httpsEdge.start();
  }
  await controller.start("assetHub", specifications.assetHub, { operation: "initial_start" });
  await observeHealth("assetHubInternal", () => waitFor("Asset Hub", () => request(`http://127.0.0.1:${internalPort}/api/auth/session`)), { reasonCode: "asset_hub_health_failed", operation: "initial_start" });
  const configuredEdgeHost = value("HOST_BIND_HOST");
  if (serviceMode && configuredEdgeHost && configuredEdgeHost !== "127.0.0.1") fail("Windows service mode requires HOST_BIND_HOST=127.0.0.1.");
  const winswExecutable = value("UED_WINSW_EXECUTABLE");
  if (serviceMode && !winswExecutable) fail("Windows service mode requires UED_WINSW_EXECUTABLE.");
  if (serviceMode && path.resolve(winswExecutable) !== path.resolve(projectDir, "..", "service", `${serviceIdentity.serviceName}.exe`)) fail("Windows service wrapper identity is invalid.");
  const edge = createEdgeServer({ host: serviceMode ? "127.0.0.1" : configuredEdgeHost || "0.0.0.0", port: publicPort, internalPort, proxyPort });
  diagnostics.recordInProcessLifecycle("publicEdge", { status: "starting" });
  await edge.start();
  await observeHealth("publicEdge", () => waitFor("Public Asset Hub", () => request(`http://127.0.0.1:${publicPort}/api/auth/session`)), { reasonCode: "public_edge_health_failed", operation: "initial_start" });
  console.log(`[Host Supervisor] Asset Hub Shell is ready at ${httpsEdge ? value("PUBLIC_ORIGIN") : `http://主机IP:${publicPort}`}.`);
  const state = await core.ensureReady({ trigger: "initial_start" });
  if (state.status !== "ready") console.error(`[Host Supervisor] Agent Runtime is ${state.status}${state.reasonCode ? `: ${state.reasonCode}` : ""}. Asset Hub Shell remains available.`);
  const shutdown = createSharedShutdown(async (signal) => {
    stopping = true;
    logLifecycle({ status: "managed-shutdown-entered", phase: "managed-shutdown" });
    diagnostics.beginShutdown();
    controller.beginShutdown();
    let releaseAllowed = false;
    try {
      console.log(`\n[Host Supervisor] Received ${signal}. Stopping managed services...`);
      diagnostics.recordInProcessLifecycle("publicEdge", { status: "stopping" });
      await httpsEdge?.stop();
      await edge.stop();
      diagnostics.recordInProcessLifecycle("publicEdge", { status: "stopped" });
      await core.stopForShutdown();
      await controller.stopAll(["assetHub"]);
      await controller.flushMetadata();
      logLifecycle({ status: "metadata-flushed", phase: "managed-shutdown" });
      controller.assertAllExited();
      logLifecycle({ status: "managed-components-converged", phase: "managed-shutdown" });
      await lifecycleWriter?.flush();
      releaseAllowed = true;
    } finally { if (!releaseAllowed) diagnostics.recordSupervisorDegradation("shutdown_incomplete"); }
    return 0;
  });
  const finalizeShutdown = ({ exitCode = 0, exitProcess = false } = {}) => {
    if (!finalizationPromise) finalizationPromise = (async () => {
      await stopDiscovery?.stop();
      diagnostics.recordInProcessLifecycle("runtimeControl", { status: "stopping" });
      await runtimeControl?.stop();
      diagnostics.recordInProcessLifecycle("runtimeControl", { status: "stopped" });
      diagnostics.recordInProcessLifecycle("supervisor", { status: "stopped" });
      await releaseLock();
      logLifecycle({ status: "finalization-completed", phase: "managed-shutdown" });
      await lifecycleWriter?.flush();
      if (exitProcess) process.exit(exitCode);
    })();
    return finalizationPromise;
  };
  managedShutdown = () => shutdown("SCM_STOP");
  if (serviceMode) {
    logLifecycle({ operation: "stop-discovery", status: "initializing", phase: "stop-discovery" });
    stopDiscovery = createWindowsStopDiscoveryBridge({
      adapterPath: windowsPipeSecurityAdapter.path,
      serviceName: serviceIdentity.serviceName,
      clientExecutable: process.execPath,
      clientScript: path.join(projectDir, "scripts", "windows-managed-shutdown-client.mjs"),
      parentPid: process.ppid,
      parentExecutable: winswExecutable,
      capability: () => ({ endpoint, token, supervisorInstanceId: instanceId, runtimeInstanceId, generation: core.snapshot().generation }),
      onEvent: (event) => logLifecycle({ ...event, phase: "stop-discovery" })
    });
    stopDiscovery.start();
    logLifecycle({ operation: "stop-discovery", status: "initialized", phase: "stop-discovery" });
  }
  const handleSignal = (signal) => {
    void shutdown(signal).then((exitCode) => finalizeShutdown({ exitCode, exitProcess: true })).catch((error) => {
      console.error(`[Host Supervisor] Shutdown failed: ${error instanceof Error ? error.message : error}`);
      process.exitCode = 1;
    });
  };
  process.on("SIGINT", () => handleSignal("SIGINT"));
  process.on("SIGTERM", () => handleSignal("SIGTERM"));
}
