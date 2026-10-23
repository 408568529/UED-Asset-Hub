import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readdir, realpath, stat } from "node:fs/promises";
import http from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import { resolveProxySessionConfig } from "../../scripts/host-security-config.mjs";
import { allowsPublicAgentRequest } from "./agent-public-access.mjs";
import { hasValidPreviewGrant, previewGrantLifetimeMs, previewGrantQuery } from "./genui-preview-grant.mjs";
const require = createRequire(import.meta.url);
const httpProxy = require("http-proxy");

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
const { username, sessionSecret } = resolveProxySessionConfig(process.env);
const agentRuntimeDir = process.env.AGENT_RUNTIME_DIR?.trim();
if (!agentRuntimeDir) throw new Error("AGENT_RUNTIME_DIR must be configured before starting the Agent Proxy.");
const workspaceRoot = path.resolve(process.env.AGENT_WORKSPACE_ROOT || path.join(agentRuntimeDir, "workspaces"));
const restrictedPreset = "asset-hub-restricted";
const genuiPreset = "asset-hub-genui-restricted";
const allowedPresets = new Set([restrictedPreset, genuiPreset]);
await mkdir(workspaceRoot, { recursive: true });
const workspaceRootRealPath = await realpath(workspaceRoot);


function createPreviewGrant(artifactId, versionId) {
  const payload = Buffer.from(JSON.stringify({ artifactId, versionId, expiresAt: Date.now() + previewGrantLifetimeMs })).toString("base64url");
  const signature = createHmac("sha256", sessionSecret).update(`genui-preview-asset-v1.${payload}`).digest("base64url");
  return `${payload}.${signature}`;
}


function addPreviewAssetGrant(html, artifactId, versionId, grant) {
  const assetPrefix = `/genui/assets/${encodeURIComponent(artifactId)}/${encodeURIComponent(versionId)}/`;
  let bridgeCount = 0;
  let appCount = 0;
  const rewritten = html.replace(/(\s(?:src|href|data-app-src)=["'])([^"']+)(["'])/g, (match, before, value, after) => {
    const asset = new URL(value, "http://127.0.0.1");
    const bridge = asset.pathname === "/genui/bridge.js";
    const artifactAsset = asset.pathname.startsWith(assetPrefix);
    if (!bridge && !artifactAsset) return match;
    asset.searchParams.set(previewGrantQuery, grant);
    if (bridge) bridgeCount += 1;
    if (asset.pathname === `${assetPrefix}app.js`) appCount += 1;
    return `${before}${asset.pathname}${asset.search}${after}`;
  });
  if (bridgeCount !== 1 || appCount !== 1) throw new Error("GenUI preview document does not contain the expected bridge and app entrypoints.");
  return rewritten;
}

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

function copyHeaders(headers, bodyLength, { noStore = false, noReferrer = false } = {}) {
  const copied = { ...headers };
  delete copied.connection;
  delete copied["transfer-encoding"];
  if (bodyLength === undefined) delete copied["content-length"];
  else copied["content-length"] = String(bodyLength);
  if (noStore) copied["cache-control"] = "private, no-store";
  if (noReferrer) copied["referrer-policy"] = "no-referrer";
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

async function handlePresetBoundaryRequest(request, response, url) {
  if (request.method !== "POST") return false;
  if (url.pathname !== "/api/session.create" && url.pathname !== "/api/agentPreset.select") return false;

  let payload;
  try {
    payload = await readJson(request);
  } catch {
    rpcError(response, null, "bad-request", "无法读取 Agent Preset 请求。", { issues: [] });
    return true;
  }

  if (url.pathname === "/api/session.create") {
    const agentPreset = payload?.payload?.agentPreset || genuiPreset;
    if (!allowedPresets.has(agentPreset)) {
      rpcError(response, payload, "agent-preset-restricted", "悠鼎 Agent 只允许使用已批准的 Agent 预设。", { agentPreset, allowed: [...allowedPresets] });
      return true;
    }
    await forwardRpcRequest(url, {
      ...payload,
      payload: { ...(payload?.payload || {}), agentPreset }
    }, response);
    return true;
  }

  if (!allowedPresets.has(payload?.payload?.agentPreset)) {
    rpcError(response, payload, "agent-preset-restricted", "悠鼎 Agent 只允许使用已批准的 Agent 预设。", { agentPreset: payload?.payload?.agentPreset, allowed: [...allowedPresets] });
    return true;
  }
  await forwardRpcRequest(url, payload, response);
  return true;
}

const proxy = httpProxy.createProxyServer({ changeOrigin: true, selfHandleResponse: true, ws: true });

proxy.on("proxyRes", (proxyResponse, request, response) => {
  const contentType = String(proxyResponse.headers["content-type"] || "");
  const requestPath = new URL(request.url || "/", target).pathname;
  const previewDocument = requestPath.startsWith("/genui/preview/");
  const noStore = previewDocument || request.__uedPreviewGrantPresent === true;
  const copyProxyHeaders = (bodyLength) => copyHeaders(proxyResponse.headers, bodyLength, { noStore, noReferrer: previewDocument });
  if (contentType.includes("text/html") && requestPath.startsWith("/genui/preview/")) {
    const match = requestPath.match(/^\/genui\/preview\/([^/]+)\/([^/]+)$/);
    if (proxyResponse.statusCode !== 200 || !match) {
      response.writeHead(proxyResponse.statusCode || 502, copyProxyHeaders());
      proxyResponse.pipe(response);
      return;
    }
    const chunks = [];
    proxyResponse.on("data", (chunk) => chunks.push(chunk));
    proxyResponse.on("end", () => {
      const source = Buffer.concat(chunks).toString("utf8");
      let html;
      try {
        const artifactId = decodeURIComponent(match[1]);
        const versionId = decodeURIComponent(match[2]);
        html = addPreviewAssetGrant(source, artifactId, versionId, createPreviewGrant(artifactId, versionId));
      } catch {
        response.writeHead(502, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
        response.end("GenUI preview could not be prepared.");
        return;
      }
      const body = Buffer.from(html);
      response.writeHead(proxyResponse.statusCode || 502, copyProxyHeaders(body.length));
      response.end(body);
    });
    return;
  }
  if (!contentType.includes("text/html")) {
    response.writeHead(proxyResponse.statusCode || 502, copyProxyHeaders());
    proxyResponse.pipe(response);
    return;
  }

  const chunks = [];
  proxyResponse.on("data", (chunk) => chunks.push(chunk));
  proxyResponse.on("end", () => {
    const html = injectTheme(Buffer.concat(chunks).toString("utf8"));
    response.writeHead(proxyResponse.statusCode || 502, copyProxyHeaders(Buffer.byteLength(html)));
    response.end(html);
  });
});

proxy.on("error", (error, _request, response) => {
  if (response && "writeHead" in response) {
    response.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("DSH runtime is unavailable.");
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
  const sessionAuthorized = hasAdminSession(request);
  const previewGrantPresent = url.searchParams.has(previewGrantQuery);
  const previewGrantValid = hasValidPreviewGrant(request, url, sessionSecret);
  const previewGrantAuthorized = !sessionAuthorized && previewGrantValid;
  const publicAuthorized = allowsPublicAgentRequest(request, url);
  if (!sessionAuthorized && !previewGrantAuthorized && !publicAuthorized) return unauthorized(response);
  if (previewGrantPresent) {
    request.__uedPreviewGrantPresent = true;
    url.searchParams.delete(previewGrantQuery);
    request.url = `${url.pathname}${url.search}`;
  }
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
  if (await handlePresetBoundaryRequest(request, response, url)) return;
  if (await handleManagedWorkspaceRequest(request, response, url)) return;
  const proxyHeaders = { origin: previewGrantValid && request.headers.origin === "null" ? "null" : target.origin, referer: `${target.origin}/` };
  proxy.web(request, response, { target: target.origin, headers: proxyHeaders });
});

const sockets = new Set();
server.on("connection", (socket) => { sockets.add(socket); socket.once("close", () => sockets.delete(socket)); });

server.on("upgrade", (request, socket, head) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  const publicDownlink = (url.pathname === "/api/events.mux" || url.pathname === "/api/events.host") && allowsPublicAgentRequest(request, url);
  if (!hasAdminSession(request) && !publicDownlink) {
    socket.write("HTTP/1.1 401 Unauthorized\\r\\nConnection: close\\r\\n\\r\\n");
    socket.destroy();
    return;
  }
  proxy.ws(request, socket, head, { target: target.origin, headers: { origin: target.origin, referer: `${target.origin}/` } });
});

server.listen(port, host, () => {
  console.log(`[UED Agent] Official DSH proxy listening on http://${host}:${port} -> ${target.origin}`);
});

let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  proxy.close();
  server.close(() => process.exit(0));
  setTimeout(() => { for (const socket of sockets) socket.destroy(); }, 5_000).unref();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
