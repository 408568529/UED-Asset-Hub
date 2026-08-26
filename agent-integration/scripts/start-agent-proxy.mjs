import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readdir, realpath, stat } from "node:fs/promises";
import http from "node:http";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const { loadEnvConfig } = require("@next/env");
const httpProxy = require("http-proxy");

loadEnvConfig(process.cwd());

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
const target = new URL(process.env.DSH_BASE_URL || "http://127.0.0.1:3080");

if (target.protocol !== "http:" || !LOOPBACK_HOSTS.has(target.hostname)) {
  throw new Error("DSH_BASE_URL must point to a loopback-only http address.");
}

const port = Number.parseInt(process.env.AGENT_PROXY_PORT || "3081", 10);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("AGENT_PROXY_PORT must be a valid TCP port.");

const host = process.env.AGENT_PROXY_HOST || "127.0.0.1";
if (!LOOPBACK_HOSTS.has(host)) {
  throw new Error("AGENT_PROXY_HOST must remain a loopback-only address.");
}
const basePath = (process.env.AGENT_PROXY_BASE_PATH || "/agent-runtime").replace(/\/$/, "");
const cookieName = "ued_admin_session";
const username = process.env.ADMIN_USERNAME || "admin";
const password = process.env.ADMIN_PASSWORD || "admin123";
const sessionSecret = process.env.ADMIN_SESSION_SECRET || `${username}:${password}:ued-asset-hub`;
const agentRuntimeDir = process.env.AGENT_RUNTIME_DIR?.trim();
if (!agentRuntimeDir) throw new Error("AGENT_RUNTIME_DIR must be configured before starting the Agent Proxy.");
const workspaceRoot = path.resolve(process.env.AGENT_WORKSPACE_ROOT || path.join(agentRuntimeDir, "workspaces"));
await mkdir(workspaceRoot, { recursive: true });
const workspaceRootRealPath = await realpath(workspaceRoot);

const themeCss = `
/* Asset Hub only overrides DSH semantic color tokens. Layout, typography and motion remain official DSH. */
:root, body, body[data-ds-dark-theme] {
  --dsw-static-deepseek-50: rgb(244, 253, 232);
  --dsw-static-deepseek-100: rgb(233, 250, 207);
  --dsw-static-deepseek-200: rgb(214, 242, 170);
  --dsw-static-deepseek-300: rgb(190, 231, 125);
  --dsw-static-deepseek-400: rgb(171, 243, 33);
  --dsw-static-deepseek-450: rgb(160, 231, 28);
  --dsw-static-deepseek-500: rgb(151, 220, 22);
  --dsw-static-deepseek-600: rgb(115, 171, 15);
  --dsw-static-deepseek-700-delete: rgb(74, 111, 14);
  --dsw-static-deepseek-800: rgb(37, 57, 10);
  --dsw-static-deepseek-900: rgb(20, 32, 7);
  --dsw-static-blue-100: rgb(233, 250, 207);
  --dsw-static-blue-300: rgb(190, 231, 125);
  --dsw-static-blue-400: rgb(171, 243, 33);
  --dsw-static-blue-450: rgb(160, 231, 28);
  --dsw-static-blue-500: rgb(151, 220, 22);
  --dsw-static-blue-50: rgb(244, 253, 232);
  --dsw-static-blue-50p: rgb(239, 250, 220);
  --dsw-static-blue-600: rgb(115, 171, 15);
  --dsw-static-blue-800: rgb(37, 57, 10);
  --dsw-static-blue-900: rgb(20, 32, 7);
  --dsw-static-blue-950: rgb(13, 22, 5);
  --dsw-alias-button-info-fill: var(--dsw-static-deepseek-500);
  --dsw-alias-button-info-hover: var(--dsw-static-deepseek-400);
  --dsw-alias-brand-primary-new-colorprimary-new-color: var(--dsw-static-deepseek-500);
}
`;

const brandScript = `
(() => {
  document.title = "悠鼎 Agent";
  const base = window.__UED_AGENT_BASE__ || "";
  const mapUrl = (value) => {
    const source = typeof value === "string"
      ? value
      : value instanceof URL
        ? value.href
        : value.url;
    const url = new URL(source, window.location.href);
    if (url.origin === window.location.origin && url.pathname.startsWith("/") && !url.pathname.startsWith(base + "/")) {
      url.pathname = base + url.pathname;
    }
    return url.toString();
  };
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input, init) => originalFetch(
    typeof input === "string" || input instanceof URL ? mapUrl(input) : new Request(mapUrl(input), input),
    init,
  );
  const NativeWebSocket = window.WebSocket;
  window.WebSocket = function AgentWebSocket(url, protocols) {
    return protocols === undefined ? new NativeWebSocket(mapUrl(url)) : new NativeWebSocket(mapUrl(url), protocols);
  };
  window.WebSocket.prototype = NativeWebSocket.prototype;
  const replaceBrand = () => {
    const mark = document.querySelector('button[class*="brand"]');
    if (!mark || mark.dataset.uedBrand === "true") return;
    mark.dataset.uedBrand = "true";
    mark.replaceChildren(Object.assign(document.createElement("span"), { textContent: "悠鼎 Agent" }));
    mark.setAttribute("aria-label", "新会话");
  };
  new MutationObserver(replaceBrand).observe(document.documentElement, { childList: true, subtree: true });
  replaceBrand();
})();
`;

function getCookie(request, name) {
  const header = request.headers.cookie || "";
  return header.split(";").map((item) => item.trim()).find((item) => item.startsWith(`${name}=`))?.slice(name.length + 1);
}

function hasAdminSession(request) {
  const token = getCookie(request, cookieName);
  if (!token) return false;
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) return false;

  const expected = createHmac("sha256", sessionSecret).update(encodedPayload).digest("base64url");
  const receivedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (receivedBuffer.length !== expectedBuffer.length || !timingSafeEqual(receivedBuffer, expectedBuffer)) return false;

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
    return payload?.username === username && Number.isFinite(payload?.expiresAt) && payload.expiresAt > Date.now();
  } catch {
    return false;
  }
}

function unauthorized(response) {
  response.writeHead(401, { "Content-Type": "text/plain; charset=utf-8" });
  response.end("Unauthorized. Open /agent from Asset Hub after signing in.");
}

function copyHeaders(headers, bodyLength) {
  const copied = { ...headers };
  delete copied["content-security-policy"];
  delete copied["content-security-policy-report-only"];
  delete copied["x-frame-options"];
  delete copied.connection;
  delete copied["transfer-encoding"];
  if (bodyLength === undefined) delete copied["content-length"];
  else copied["content-length"] = String(bodyLength);
  return copied;
}

function injectTheme(html) {
  const additions = `<script>window.__UED_AGENT_BASE__=${JSON.stringify(basePath)};</script><link rel="stylesheet" href="${basePath}/asset-hub-agent-theme.css"><script src="${basePath}/asset-hub-agent-brand.js"></script>`;
  const rewritten = html.replace(/(["'])\/(?!\/)/g, `$1${basePath}/`);
  return rewritten.includes("</head>") ? rewritten.replace("</head>", `${additions}</head>`) : `${additions}${rewritten}`;
}

function isDshHealthy() {
  return new Promise((resolve) => {
    const probe = http.request(target, { method: "GET", timeout: 3_000 }, (response) => {
      response.resume();
      resolve((response.statusCode || 500) < 500);
    });
    probe.on("error", () => resolve(false));
    probe.on("timeout", () => {
      probe.destroy();
      resolve(false);
    });
    probe.end();
  });
}

function isInsideWorkspaceRoot(candidate) {
  const relative = path.relative(workspaceRootRealPath, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== "..");
}

function rpcError(response, request, code, message, details) {
  response.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify({
    type: "server-response",
    rpcId: typeof request?.rpcId === "string" ? request.rpcId : "asset-hub-workspace",
    result: { ok: false, error: { code, message, details } }
  }));
}

function rpcSuccess(response, request, value) {
  response.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify({
    type: "server-response",
    rpcId: request.rpcId,
    result: { ok: true, value }
  }));
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function resolveManagedDirectory(candidate) {
  const requestedPath = candidate ? path.resolve(candidate) : workspaceRootRealPath;
  if (!isInsideWorkspaceRoot(requestedPath)) {
    throw { code: "workspace-invalid-path", message: "Workspace 必须位于悠鼎 Agent 工作区内。", details: { path: requestedPath } };
  }
  let canonicalPath;
  try {
    canonicalPath = await realpath(requestedPath);
  } catch {
    throw { code: "directory-unreadable", message: "无法读取该工作区目录。", details: { path: requestedPath } };
  }
  if (!isInsideWorkspaceRoot(canonicalPath) || !(await stat(canonicalPath)).isDirectory()) {
    throw { code: "workspace-invalid-path", message: "Workspace 必须位于悠鼎 Agent 工作区内。", details: { path: requestedPath } };
  }
  return canonicalPath;
}

function workspaceCrumbs(directory) {
  const relative = path.relative(workspaceRootRealPath, directory);
  const crumbs = [{ name: "悠鼎 Agent 工作区", path: workspaceRootRealPath, hidden: false }];
  if (!relative) return crumbs;
  let current = workspaceRootRealPath;
  for (const segment of relative.split(path.sep)) {
    current = path.join(current, segment);
    crumbs.push({ name: segment, path: current, hidden: false });
  }
  return crumbs;
}

async function listManagedDirectory(candidate) {
  const directory = await resolveManagedDirectory(candidate);
  const entries = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
    try {
      const canonicalPath = await realpath(entryPath);
      if ((await stat(canonicalPath)).isDirectory() && isInsideWorkspaceRoot(canonicalPath)) {
        entries.push({ name: entry.name, path: canonicalPath, hidden: entry.name.startsWith(".") });
      }
    } catch {
      // Broken or inaccessible symlinks are not valid Workspace choices.
    }
  }
  entries.sort((left, right) => left.name.localeCompare(right.name));
  return { path: directory, home: workspaceRootRealPath, crumbs: workspaceCrumbs(directory), entries, truncated: false };
}

async function createManagedDirectory(parentPath, rawName) {
  const name = String(rawName ?? "").trim();
  if (!name || name === "." || name === ".." || /[/\\\\]/.test(name)) {
    throw { code: "directory-create-failed", message: "文件夹名称无效。", details: { path: String(parentPath ?? workspaceRootRealPath) } };
  }
  const parent = await resolveManagedDirectory(parentPath);
  const createdPath = path.join(parent, name);
  if (!isInsideWorkspaceRoot(createdPath)) {
    throw { code: "workspace-invalid-path", message: "Workspace 必须位于悠鼎 Agent 工作区内。", details: { path: createdPath } };
  }
  try {
    await mkdir(createdPath);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "EEXIST") {
      throw { code: "directory-exists", message: "同名文件夹已存在。", details: { path: createdPath } };
    }
    throw { code: "directory-create-failed", message: "无法创建工作区文件夹。", details: { path: createdPath } };
  }
  return resolveManagedDirectory(createdPath);
}

async function forwardRpcRequest(url, payload, response) {
  const upstream = await fetch(new URL(`${url.pathname}${url.search}`, target), {
    method: "POST",
    headers: { "Content-Type": "application/json", origin: target.origin, referer: `${target.origin}/` },
    body: JSON.stringify(payload)
  });
  const body = Buffer.from(await upstream.arrayBuffer());
  response.writeHead(upstream.status, { "Content-Type": upstream.headers.get("content-type") || "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(body);
}

async function handleManagedWorkspaceRequest(request, response, url) {
  if (request.method !== "POST") return false;
  const methods = new Set(["/api/host.listDirectory", "/api/host.createDirectory", "/api/workspace.create"]);
  if (!methods.has(url.pathname)) return false;

  let payload;
  try {
    payload = await readJson(request);
  } catch {
    rpcError(response, null, "bad-request", "无法读取 Workspace 请求。", { issues: [] });
    return true;
  }

  try {
    if (url.pathname === "/api/host.listDirectory") {
      rpcSuccess(response, payload, await listManagedDirectory(payload?.payload?.path));
      return true;
    }
    if (url.pathname === "/api/host.createDirectory") {
      rpcSuccess(response, payload, { path: await createManagedDirectory(payload?.payload?.path, payload?.payload?.name) });
      return true;
    }
    const workspacePath = await resolveManagedDirectory(payload?.payload?.path);
    await forwardRpcRequest(url, { ...payload, payload: { ...payload.payload, path: workspacePath } }, response);
    return true;
  } catch (error) {
    const failure = error && typeof error === "object" && "code" in error
      ? error
      : { code: "internal", message: "Workspace Adapter 处理失败。", details: {} };
    rpcError(response, payload, failure.code, failure.message, failure.details);
    return true;
  }
}

const proxy = httpProxy.createProxyServer({ changeOrigin: true, selfHandleResponse: true, ws: true });

proxy.on("proxyRes", (proxyResponse, request, response) => {
  const contentType = String(proxyResponse.headers["content-type"] || "");
  if (!contentType.includes("text/html")) {
    response.writeHead(proxyResponse.statusCode || 502, copyHeaders(proxyResponse.headers));
    proxyResponse.pipe(response);
    return;
  }

  const chunks = [];
  proxyResponse.on("data", (chunk) => chunks.push(chunk));
  proxyResponse.on("end", () => {
    const html = injectTheme(Buffer.concat(chunks).toString("utf8"));
    response.writeHead(proxyResponse.statusCode || 502, copyHeaders(proxyResponse.headers, Buffer.byteLength(html)));
    response.end(html);
  });
});

proxy.on("error", (error, _request, response) => {
  if (response && "writeHead" in response) {
    response.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
    response.end(`DSH runtime is unavailable: ${error.message}`);
  }
});

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  if (url.pathname === "/healthz") {
    const ok = await isDshHealthy();
    response.writeHead(ok ? 200 : 503, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    response.end(JSON.stringify({ ok }));
    return;
  }
  if (!hasAdminSession(request)) return unauthorized(response);
  if (url.pathname === "/asset-hub-agent-theme.css") {
    response.writeHead(200, { "Content-Type": "text/css; charset=utf-8", "Cache-Control": "no-store" });
    response.end(themeCss);
    return;
  }
  if (url.pathname === "/asset-hub-agent-brand.js") {
    response.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8", "Cache-Control": "no-store" });
    response.end(brandScript);
    return;
  }
  if (await handleManagedWorkspaceRequest(request, response, url)) return;
  proxy.web(request, response, { target: target.origin, headers: { origin: target.origin, referer: `${target.origin}/` } });
});

server.on("upgrade", (request, socket, head) => {
  if (!hasAdminSession(request)) {
    socket.write("HTTP/1.1 401 Unauthorized\\r\\nConnection: close\\r\\n\\r\\n");
    socket.destroy();
    return;
  }
  proxy.ws(request, socket, head, { target: target.origin, headers: { origin: target.origin, referer: `${target.origin}/` } });
});

server.listen(port, host, () => {
  console.log(`[UED Agent] Official DSH proxy listening on http://${host}:${port} -> ${target.origin}`);
});
