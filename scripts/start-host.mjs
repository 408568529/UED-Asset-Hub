import { spawn, spawnSync } from "node:child_process";
import http from "node:http";
import { createServer } from "node:net";
import { access, mkdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { loadEnvConfig } = require("@next/env");
const httpProxy = require("http-proxy");

loadEnvConfig(process.cwd());

const projectDir = process.cwd();
const expectedVersion = JSON.parse(await readFile(path.join(projectDir, "agent-integration/dsh/version.json"), "utf8"));
const loopbackHosts = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
const services = new Map();
let stopping = false;
let edgeServer;
const edgeSockets = new Set();

function fail(message) {
  throw new Error(`[Host Runner] ${message}`);
}

function getRequiredPath(name) {
  const value = process.env[name]?.trim();
  if (!value) fail(`缺少 ${name}。请在主机 .env.local 中配置。`);
  return path.resolve(value);
}

function isInside(parentPath, candidatePath) {
  const relative = path.relative(parentPath, candidatePath);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== "..");
}

async function requireExternalDirectory(name, { create = false } = {}) {
  const directory = getRequiredPath(name);
  if (isInside(projectDir, directory)) fail(`${name} 必须位于 Git 代码目录外。`);
  if (create) await mkdir(directory, { recursive: true });
  try {
    await access(directory);
    if (!(await stat(directory)).isDirectory()) fail(`${name} 必须指向目录：${directory}`);
  } catch {
    fail(`${name} 目录不存在：${directory}`);
  }
  return directory;
}

function parsePort(name, fallback) {
  const value = Number.parseInt(process.env[name] || String(fallback), 10);
  if (!Number.isInteger(value) || value < 1 || value > 65535) fail(`${name} 必须是有效端口。`);
  return value;
}

function parseDshUrl() {
  const value = process.env.DSH_BASE_URL || "http://127.0.0.1:3080";
  let url;
  try {
    url = new URL(value);
  } catch {
    fail("DSH_BASE_URL 不是有效 URL。");
  }
  if (url.protocol !== "http:" || !loopbackHosts.has(url.hostname)) fail("DSH_BASE_URL 必须保持本机回环地址。");
  return url;
}

function assertNodeVersion() {
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major < 22 || (major === 22 && minor < 19)) fail(`Node.js ${process.versions.node} 不满足 DSH 需要的 22.19+。`);
}

function assertDshSource(sourceDir) {
  if (isInside(projectDir, sourceDir)) fail("DSH_SOURCE_DIR 必须位于 Asset Hub Git 目录外。");
  const revision = spawnSync("git", ["-C", sourceDir, "rev-parse", "HEAD"], { encoding: "utf8" });
  if (revision.status !== 0) fail(`无法读取 DSH_SOURCE_DIR 的 Git 版本：${sourceDir}`);
  const actualCommit = revision.stdout.trim();
  if (actualCommit !== expectedVersion.sourceCommit) {
    fail(`DSH 固定版本不匹配。期望 ${expectedVersion.sourceCommit}，实际 ${actualCommit}。`);
  }
}

async function assertPortAvailable(port, name) {
  await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", () => reject(new Error(`${name} 端口 ${port} 已被占用。请先停止旧服务。`)));
    probe.listen(port, "0.0.0.0", () => probe.close(resolve));
  });
}

async function waitFor(label, check, timeoutMs = 60_000) {
  const startedAt = Date.now();
  let lastError = "";
  while (Date.now() - startedAt < timeoutMs) {
    try {
      await check();
      console.log(`[Host Runner] ${label} is ready.`);
      return;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  fail(`${label} 未在 ${Math.round(timeoutMs / 1000)} 秒内就绪：${lastError || "未知错误"}`);
}

async function request(url, init) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2_500);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

function startEdgeServer({ host, port, assetHubPort, proxyPort }) {
  const edge = httpProxy.createProxyServer({ changeOrigin: true, ws: true });
  const assetHubTarget = `http://127.0.0.1:${assetHubPort}`;
  const agentTarget = `http://127.0.0.1:${proxyPort}`;

  edge.on("error", (error, _request, response) => {
    if (response && "writeHead" in response) {
      response.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
      response.end(`Asset Hub internal service is unavailable: ${error.message}`);
    }
  });

  const belongsToAgentRuntime = (request, requestUrl) => {
    if (requestUrl.pathname.startsWith("/agent-runtime/")) return true;
    if (requestUrl.pathname === "/api/respond") return true;
    if (/^\/api\/[^/]+\.[^/]+$/.test(requestUrl.pathname)) return true;
    const referer = request.headers.referer;
    if (!referer) return false;
    try {
      return new URL(referer).pathname.startsWith("/agent-runtime/");
    } catch {
      return false;
    }
  };

  edgeServer = http.createServer((request, response) => {
    const requestUrl = new URL(request.url || "/", "http://localhost");
    if (requestUrl.pathname === "/agent-runtime") {
      response.writeHead(308, { Location: "/agent-runtime/" });
      response.end();
      return;
    }
    if (belongsToAgentRuntime(request, requestUrl)) {
      if (requestUrl.pathname.startsWith("/agent-runtime/")) {
        request.url = request.url?.replace(/^\/agent-runtime/, "") || "/";
      }
      edge.web(request, response, { target: agentTarget });
      return;
    }
    edge.web(request, response, { target: assetHubTarget, changeOrigin: false });
  });

  edgeServer.on("connection", (socket) => {
    edgeSockets.add(socket);
    socket.once("close", () => edgeSockets.delete(socket));
  });

  edgeServer.on("upgrade", (request, socket, head) => {
    const requestUrl = new URL(request.url || "/", "http://localhost");
    if (belongsToAgentRuntime(request, requestUrl)) {
      if (requestUrl.pathname.startsWith("/agent-runtime/")) {
        request.url = request.url?.replace(/^\/agent-runtime/, "") || "/";
      }
      edge.ws(request, socket, head, { target: agentTarget });
      return;
    }
    edge.ws(request, socket, head, { target: assetHubTarget, changeOrigin: false });
  });

  return new Promise((resolve, reject) => {
    edgeServer.once("error", reject);
    edgeServer.listen(port, host, () => {
      edgeServer?.off("error", reject);
      console.log(`[Host Runner] Public Asset Hub edge listening on http://${host}:${port}.`);
      resolve();
    });
  });
}

function stopEdgeServer() {
  if (!edgeServer) return Promise.resolve();
  return new Promise((resolve) => {
    const server = edgeServer;
    edgeServer = undefined;
    for (const socket of edgeSockets) socket.destroy();
    edgeSockets.clear();
    server.close(() => resolve());
  });
}

function startService(service) {
  const child = spawn(service.command, service.args, {
    cwd: service.cwd,
    env: process.env,
    stdio: "inherit",
    detached: process.platform !== "win32",
    shell: process.platform === "win32" && service.command.endsWith(".cmd")
  });
  service.child = child;
  console.log(`[Host Runner] Starting ${service.label}.`);

  const recover = (reason) => {
    if (stopping || service.recovering) return;
    service.recovering = true;
    service.child = undefined;
    service.restartCount += 1;
    const delay = Math.min(1_000 * 2 ** Math.min(service.restartCount - 1, 5), 30_000);
    console.error(`[Host Runner] ${service.label} ${reason}. Restarting in ${Math.round(delay / 1000)}s.`);
    service.restartTimer = setTimeout(() => {
      service.recovering = false;
      startService(service);
    }, delay);
  };

  child.once("error", (error) => recover(`failed to start: ${error.message}`));
  child.once("exit", (code, signal) => recover(`exited (code ${code ?? "none"}, signal ${signal ?? "none"})`));
}

function stopService(service) {
  if (service.restartTimer) clearTimeout(service.restartTimer);
  if (!service.child || service.child.exitCode !== null) return Promise.resolve();
  const pid = service.child.pid;
  if (!pid) return Promise.resolve();

  if (process.platform === "win32") {
    return new Promise((resolve) => {
      const taskkill = spawn("taskkill.exe", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore" });
      taskkill.once("exit", resolve);
      taskkill.once("error", resolve);
    });
  }

  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    service.child.kill("SIGTERM");
  }
  return new Promise((resolve) => setTimeout(resolve, 250));
}

async function shutdown(signal, exitCode = 0) {
  if (stopping) return;
  stopping = true;
  console.log(`\n[Host Runner] Received ${signal}. Stopping managed services...`);
  await stopEdgeServer();
  await Promise.all([...services.values()].reverse().map(stopService));
  process.exit(exitCode);
}

async function main() {
  assertNodeVersion();
  if (process.env.AGENT_ENABLED === "false") fail("AGENT_ENABLED=false 时不能启动 Host Runner。");

  const dataDir = await requireExternalDirectory("DATA_DIR");
  const agentRuntimeDir = await requireExternalDirectory("AGENT_RUNTIME_DIR", { create: true });
  await Promise.all(["dsh-home", "workspaces", "artifacts", "logs"].map((directory) => mkdir(path.join(agentRuntimeDir, directory), { recursive: true })));
  process.env.DSH_HOME = path.join(agentRuntimeDir, "dsh-home");
  process.env.DSH_TELEMETRY_DISABLED = "1";
  process.env.AGENT_WORKSPACE_ROOT = path.join(agentRuntimeDir, "workspaces");
  process.env.AGENT_PROXY_HOST = "127.0.0.1";
  process.env.AGENT_PROXY_BASE_PATH = "/agent-runtime";
  const trainingMediaDir = process.env.TRAINING_MEDIA_DIR?.trim();
  if (trainingMediaDir && isInside(projectDir, path.resolve(trainingMediaDir))) fail("TRAINING_MEDIA_DIR 必须位于 Git 代码目录外。");
  const dshSourceDir = getRequiredPath("DSH_SOURCE_DIR");
  assertDshSource(dshSourceDir);

  const dshUrl = parseDshUrl();
  const dshPort = Number.parseInt(dshUrl.port || "3080", 10);
  if (dshPort !== 3080) fail("正式 Host Runner 只允许 DSH 使用 127.0.0.1:3080。");
  const proxyPort = parsePort("AGENT_PROXY_PORT", 3081);
  const hostPort = parsePort("HOST_PORT", 3027);
  const internalAssetHubPort = parsePort("HOST_INTERNAL_PORT", 3028);
  const hostBindHost = process.env.HOST_BIND_HOST || "0.0.0.0";
  if (new Set([dshPort, proxyPort, hostPort, internalAssetHubPort]).size !== 4) fail("DSH、Agent Proxy、公开 Asset Hub 与内部 Asset Hub 必须使用不同端口。");
  await Promise.all([
    assertPortAvailable(dshPort, "DSH"),
    assertPortAvailable(proxyPort, "Agent Proxy"),
    assertPortAvailable(hostPort, "公开 Asset Hub"),
    assertPortAvailable(internalAssetHubPort, "内部 Asset Hub")
  ]);
  try {
    await access(path.join(projectDir, ".next", "BUILD_ID"));
  } catch {
    fail("未找到生产构建。请先执行 npm run build。");
  }

  console.log(`[Host Runner] DATA_DIR: ${dataDir}`);
  console.log(`[Host Runner] AGENT_RUNTIME_DIR: ${agentRuntimeDir}`);

  const workspacePickerOverlay = path.join(projectDir, "agent-integration", "dsh", "workspace-picker.overlay.yml");
  const dsh = { label: "DSH Runtime", command: process.execPath, args: ["--import", "tsx/esm", "apps/cli/src/bin.ts", "web", "--patch", workspacePickerOverlay, "--host", "127.0.0.1", "--port", String(dshPort)], cwd: dshSourceDir, restartCount: 0 };
  const proxy = { label: "Agent Proxy", command: process.execPath, args: ["agent-integration/scripts/start-agent-proxy.mjs"], cwd: projectDir, restartCount: 0 };
  const assetHub = { label: "Asset Hub", command: process.execPath, args: ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", String(internalAssetHubPort)], cwd: projectDir, restartCount: 0 };
  services.set("dsh", dsh);
  services.set("proxy", proxy);
  services.set("assetHub", assetHub);

  startService(dsh);
  await waitFor("DSH Runtime", async () => {
    const response = await request(new URL("/api/session.list", dshUrl), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "client-request", rpcId: "host-runner-health", method: "session.list", payload: {} })
    });
    const body = await response.json();
    if (body?.result?.ok !== true) throw new Error("DSH rejected session.list");
  });

  startService(proxy);
  await waitFor("Agent Proxy", () => request(`http://127.0.0.1:${proxyPort}/healthz`));

  startService(assetHub);
  await waitFor("Asset Hub", () => request(`http://127.0.0.1:${internalAssetHubPort}/`));
  await startEdgeServer({ host: hostBindHost, port: hostPort, assetHubPort: internalAssetHubPort, proxyPort });
  await waitFor("Public Asset Hub", () => request(`http://127.0.0.1:${hostPort}/`));
  console.log(`[Host Runner] UED Asset Hub is ready at http://主机IP:${hostPort}`);
}

process.on("SIGINT", () => { void shutdown("SIGINT"); });
process.on("SIGTERM", () => { void shutdown("SIGTERM"); });

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  await shutdown("startup failure", 1);
});
