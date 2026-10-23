import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { access, cp, mkdir, mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { runtimeEnvironmentProfiles, blockedFromAgentProxyEnvironment } from "../agent-integration/scripts/runtime-boundary.mjs";
import { probeKnowledgeGatewayMcp } from "../agent-integration/scripts/runtime-readiness.mjs";

const projectDir = process.cwd();
const require = createRequire(import.meta.url);
const { loadEnvConfig } = require("@next/env");
const outputLimit = 1_000_000;
const diagnostic = { stage: "preflight", reasonCode: "preflight_failed" };
let latestHostOutput = () => "";

function mark(stage, reasonCode) {
  diagnostic.stage = stage;
  diagnostic.reasonCode = reasonCode;
}

function safePlatformEnvironment() {
  const keys = ["PATH", "Path", "PATHEXT", "SystemRoot", "SYSTEMROOT", "WINDIR", "ComSpec", "TMP", "TEMP", "TMPDIR", "HOME", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "PROGRAMDATA", "LANG", "LC_ALL", "LC_CTYPE", "TERM", "USER", "LOGNAME", "NODE_OPTIONS", "NODE_EXTRA_CA_CERTS", "SSL_CERT_FILE", "SSL_CERT_DIR"];
  return Object.fromEntries(keys.flatMap((key) => typeof process.env[key] === "string" && process.env[key].length > 0 ? [[key, process.env[key]]] : []));
}

async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const value = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  if (!value || typeof value === "string") throw new Error("Unable to reserve a loopback port.");
  return value.port;
}

async function assertPortAvailable(port) {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

async function waitFor(check, timeoutMs = 60_000) {
  const startedAt = Date.now();
  let lastError;
  while (Date.now() - startedAt < timeoutMs) {
    try { return await check(); } catch (error) { lastError = error; await new Promise((resolve) => setTimeout(resolve, 250)); }
  }
  throw lastError instanceof Error ? lastError : new Error("Timed out waiting for Host Runner.");
}

async function requestJson(url, init = {}) {
  const response = await fetch(url, { ...init, headers: { Accept: "application/json", ...init.headers }, cache: "no-store" });
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch {}
  return { response, text, body };
}

function capture(child) {
  let output = "";
  const append = (chunk) => { if (output.length < outputLimit) output += chunk.toString("utf8").slice(0, outputLimit - output.length); };
  child.stdout?.on("data", append);
  child.stderr?.on("data", append);
  return () => output;
}

function digest(value) { return createHash("sha256").update(value).digest("hex"); }

async function waitForExit(child, timeoutMs = 15_000) {
  if (child.exitCode !== null) return child.exitCode;
  return Promise.race([
    new Promise((resolve) => child.once("exit", (code) => resolve(code))),
    new Promise((_, reject) => setTimeout(() => reject(new Error("Host Runner did not stop.")), timeoutMs))
  ]);
}

async function configuredDshSources() {
  loadEnvConfig(projectDir);
  const source = process.env.DSH_SOURCE_DIR?.trim();
  const runtimeSource = process.env.DSH_RUNTIME_SOURCE_DIR?.trim();
  if (!source || !runtimeSource) throw new Error("DSH authoritative source and runtime source are required for E2E.");
  return Promise.all([realpath(path.resolve(source)), realpath(path.resolve(runtimeSource))]);
}

async function runDshProbe(environment) {
  const child = spawn(process.execPath, ["agent-integration/scripts/verify-dsh.mjs"], { cwd: projectDir, env: { ...environment, DSH_BASE_URL: `http://127.0.0.1:${environment.DSH_PORT}` }, stdio: ["ignore", "pipe", "pipe"] });
  const output = capture(child);
  const code = await waitForExit(child, 10_000);
  assert.equal(code, 0, "isolated DSH probe must pass");
  return output();
}

async function materializeIsolatedRuntimeWorkspace(testRoot) {
  const workspace = path.join(testRoot, "candidate-runtime");
  await access(path.join(projectDir, ".next", "standalone", "server.js"));
  await access(path.join(projectDir, ".next", "static"));
  await mkdir(workspace);
  await Promise.all([
    cp(path.join(projectDir, ".next", "standalone"), workspace, { recursive: true }),
    cp(path.join(projectDir, ".next", "static"), path.join(workspace, ".next", "static"), { recursive: true }),
    cp(path.join(projectDir, "scripts"), path.join(workspace, "scripts"), { recursive: true }),
    cp(path.join(projectDir, "agent-integration"), path.join(workspace, "agent-integration"), { recursive: true }),
    cp(path.join(projectDir, "native"), path.join(workspace, "native"), { recursive: true }),
    cp(path.join(projectDir, "node_modules"), path.join(workspace, "node_modules"), { recursive: true, force: true }),
    cp(path.join(projectDir, "package.json"), path.join(workspace, "package.json"))
  ]);
  return workspace;
}

async function main() {
  mark("preflight", "preflight_failed");
  await access(path.join(projectDir, ".next", "BUILD_ID"));
  const [sourceDir, runtimeSourceDir] = await configuredDshSources();
  await assertPortAvailable(3080);
  const testRoot = await mkdtemp(path.join(os.tmpdir(), "ued-host-security-e2e-"));
  let host = null;
  let shutdownStarted = false;
  let hostOutput = () => "";
  const sentinel = `host-security-${randomUUID()}`;
  const sessionSecret = `${randomBytes(48).toString("base64url")}-${sentinel}`;
  const password = `${randomBytes(24).toString("base64url")}-${sentinel}`;
  try {
    const runtimeWorkspace = await materializeIsolatedRuntimeWorkspace(testRoot);
    const [dshPort, publicPort, internalPort, proxyPort, gatewayPort] = await Promise.all([freePort(), freePort(), freePort(), freePort(), freePort()]);
    assert.equal(new Set([dshPort, publicPort, internalPort, proxyPort, gatewayPort]).size, 5, "isolated ports must be unique");
    const dataDir = path.join(testRoot, "data");
    const agentRuntimeDir = path.join(testRoot, "agent-runtime");
    const trainingMediaDir = path.join(testRoot, "training-media");
    await Promise.all([mkdir(dataDir), mkdir(trainingMediaDir)]);
    const environment = {
      ...safePlatformEnvironment(),
      NODE_ENV: "production",
      DATA_DIR: dataDir,
      AGENT_RUNTIME_DIR: agentRuntimeDir,
      TRAINING_MEDIA_DIR: trainingMediaDir,
      DSH_SOURCE_DIR: sourceDir,
      DSH_RUNTIME_SOURCE_DIR: runtimeSourceDir,
      DSH_PORT: String(dshPort),
      HOST_BIND_HOST: "127.0.0.1",
      HOST_PORT: String(publicPort),
      HOST_INTERNAL_PORT: String(internalPort),
      AGENT_PROXY_PORT: String(proxyPort),
      KNOWLEDGE_GATEWAY_MCP_PORT: String(gatewayPort),
      AGENT_GATEWAY_TOKEN: `${randomBytes(32).toString("base64url")}-${sentinel}`,
      ADMIN_PASSWORD: password,
      ADMIN_SESSION_SECRET: sessionSecret,
      ADMIN_SESSION_SECURE: "true",
      PUBLIC_ORIGIN: "https://asset-hub.test",
      DEEPSEEK_API_KEY: "",
      OPENAI_API_KEY: "",
      TEST_ENV_ENCRYPTION_KEY: ""
    };
    const proxyEnvironment = runtimeEnvironmentProfiles.agentProxy(environment, { ADMIN_USERNAME: "admin", ADMIN_SESSION_SECRET: sessionSecret });
    for (const key of blockedFromAgentProxyEnvironment) assert.equal(key in proxyEnvironment, false, `${key} must not reach Agent Proxy`);

    mark("host-startup", "host_startup_failed");
    host = spawn(process.execPath, ["scripts/start-host.mjs"], { cwd: runtimeWorkspace, env: environment, stdio: ["ignore", "pipe", "pipe"] });
    hostOutput = capture(host);
    latestHostOutput = hostOutput;
    const publicBaseUrl = `http://127.0.0.1:${publicPort}`;
    const internalBaseUrl = `http://127.0.0.1:${internalPort}`;
    await waitFor(async () => {
      const { response, body } = await requestJson(`${publicBaseUrl}/api/auth/session`);
      assert.equal(response.status, 200);
      assert.equal(body?.authenticated, false);
    });
    mark("host-startup", "internal_session_failed");
    const internalSession = await requestJson(`${internalBaseUrl}/api/auth/session`);
    assert.equal(internalSession.response.status, 200);

    mark("login", "login_failed");
    const login = await requestJson(`${publicBaseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin", password })
    });
    assert.equal(login.response.status, 200, "missing ADMIN_USERNAME must use the shared admin default");
    const setCookie = login.response.headers.getSetCookie?.()[0] ?? login.response.headers.get("set-cookie") ?? "";
    const cookie = setCookie.split(";", 1)[0];
    assert.match(cookie, /^ued_admin_session=/);
    assert.match(setCookie, /HttpOnly/i);
    assert.equal(login.text.includes(sentinel), false);

    mark("login", "session_verification_failed");
    const authenticated = await requestJson(`${publicBaseUrl}/api/auth/session`, { headers: { Cookie: cookie } });
    assert.deepEqual(authenticated.body, { authenticated: true });
    mark("runtime-status", "runtime_status_unexpected");
    const runtime = await waitFor(async () => {
      const result = await requestJson(`${publicBaseUrl}/api/runtime/status`, { headers: { Cookie: cookie } });
      assert.equal(result.response.status, 200);
      assert.equal(result.body?.runtime?.shell, "ready");
      assert.equal(result.body?.runtime?.status, "configuration_required");
      assert.equal(result.body?.runtime?.reasonCode, "credential_missing");
      return result;
    });
    assert.equal(runtime.text.includes(sentinel), false);

    mark("runtime-status", "diagnostics_unexpected");
    const lifecyclePath = path.join(agentRuntimeDir, "logs", "runtime-supervisor.ndjson");
    const metadataPath = path.join(agentRuntimeDir, "supervisor", "managed-processes.json");
    const [lifecycleBefore, metadataBefore] = await Promise.all([readFile(lifecyclePath, "utf8"), readFile(metadataPath, "utf8")]);
    const diagnosticsBefore = await requestJson(`${publicBaseUrl}/api/admin/runtime-diagnostics`, { headers: { Cookie: cookie } });
    assert.equal(diagnosticsBefore.response.status, 200);
    assert.equal(diagnosticsBefore.body?.diagnostics?.shell, "ready");
    assert.equal(diagnosticsBefore.body?.diagnostics?.status, "configuration_required", "diagnostics must safely represent the actual credential-missing Runtime state");
    assert.equal(diagnosticsBefore.body?.diagnostics?.reasonCode, "credential_missing");
    assert.equal(typeof diagnosticsBefore.body?.report, "string");
    const diagnosticsAfter = await requestJson(`${publicBaseUrl}/api/admin/runtime-diagnostics`, { headers: { Cookie: cookie } });
    assert.equal(diagnosticsAfter.response.status, 200);
    for (const field of ["generation", "recoveryCount", "snapshotVersion"]) assert.equal(diagnosticsAfter.body?.diagnostics?.[field], diagnosticsBefore.body?.diagnostics?.[field], `diagnostics read must not mutate ${field}`);
    assert.equal(digest(await readFile(lifecyclePath, "utf8")), digest(lifecycleBefore), "diagnostics read must not append lifecycle NDJSON");
    assert.equal(digest(await readFile(metadataPath, "utf8")), digest(metadataBefore), "diagnostics read must not alter managed metadata");
    assert.equal(diagnosticsBefore.text.includes(sentinel), false);
    assert.equal(diagnosticsBefore.body?.report.includes(sentinel), false);
    const invalidDiagnostics = await requestJson(`${publicBaseUrl}/api/admin/runtime-diagnostics?component=dsh`, { headers: { Cookie: cookie } });
    assert.equal(invalidDiagnostics.response.status, 400);
    const anonymousDiagnostics = await requestJson(`${publicBaseUrl}/api/admin/runtime-diagnostics`);
    assert.equal(anonymousDiagnostics.response.status, 401);

    mark("model-settings", "model_settings_unexpected");
    const modelSettings = await requestJson(`${publicBaseUrl}/api/agent/model-settings`, { headers: { Cookie: cookie } });
    assert.equal(modelSettings.response.status, 200);
    assert.equal(modelSettings.body?.reasonCode, "credential_missing");
    assert.equal(modelSettings.text.includes(sentinel), false);
    mark("proxy", "proxy_workbench_failed");
    const workbench = await requestJson(`${publicBaseUrl}/api/agent/workbench`, { headers: { Cookie: cookie } });
    assert.equal(workbench.response.status, 200);
    assert.equal(workbench.body?.url, "/agent-runtime/");
    mark("proxy", "proxy_health_failed");
    const proxyHealth = await requestJson(`http://127.0.0.1:${proxyPort}/healthz`);
    assert.equal(proxyHealth.response.status, 200);
    mark("dsh", "dsh_probe_failed");
    const dshProbeOutput = await runDshProbe(environment);

    mark("gateway", "gateway_health_failed");
    const mcp = await probeKnowledgeGatewayMcp({ endpoint: `http://127.0.0.1:${gatewayPort}/mcp` });
    assert.deepEqual(mcp.tools, ["get_haldur_skill_document", "get_knowledge_asset", "search_haldur_skill", "search_knowledge", "search_micro_specs"]);

    mark("runtime-status", "runtime_metadata_unexpected");
    const [lifecycle, metadata] = await Promise.all([
      readFile(path.join(agentRuntimeDir, "logs", "runtime-supervisor.ndjson"), "utf8"),
      readFile(path.join(agentRuntimeDir, "supervisor", "managed-processes.json"), "utf8")
    ]);
    assert.equal(lifecycle.includes(sentinel), false);
    assert.equal(metadata.includes(sentinel), false);
    for (const component of ["assetHub", "gateway", "dsh", "proxy"]) assert.match(metadata, new RegExp(`"component": "${component}"`));
    assert.equal(dshProbeOutput.includes(sentinel), false);
    assert.equal(hostOutput().includes(sentinel), false);

    mark("shutdown", "shutdown_failed");
    shutdownStarted = true;
    host.kill("SIGTERM");
    assert.equal(await waitForExit(host), 0);
    host = null;
    await Promise.all([assertPortAvailable(3080), assertPortAvailable(dshPort), assertPortAvailable(publicPort), assertPortAvailable(internalPort), assertPortAvailable(proxyPort), assertPortAvailable(gatewayPort)]);
    console.log("[Host Security E2E] isolated Host Runner, credential-missing behavior, redaction, and shutdown verification passed.");
  } finally {
    if (host?.exitCode === null && !shutdownStarted) {
      shutdownStarted = true;
      host.kill("SIGTERM");
      await waitForExit(host);
    }
    if (host?.exitCode === null && host?.signalCode === null) {
      mark("shutdown", "shutdown_failed");
      throw new Error(`Host Runner shutdown failed. Output: ${hostOutput().slice(-4_000)}`);
    }
    await rm(testRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`[Host Security E2E] FAIL stage=${diagnostic.stage} reasonCode=${diagnostic.reasonCode}`);
  console.error(error instanceof Error ? error.message : error);
  const output = latestHostOutput();
  if (output) console.error(`[Host Security E2E] Host output:\n${output.slice(-4_000)}`);
  process.exit(1);
});
