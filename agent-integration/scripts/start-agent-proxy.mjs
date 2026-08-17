import { createHmac, timingSafeEqual } from "node:crypto";
import http from "node:http";
import { createRequire } from "node:module";

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
    const url = typeof value === "string" ? new URL(value, window.location.href) : new URL(value.url, window.location.href);
    if (url.origin === window.location.origin && url.pathname.startsWith("/") && !url.pathname.startsWith(base + "/")) {
      url.pathname = base + url.pathname;
    }
    return url.toString();
  };
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input, init) => originalFetch(typeof input === "string" || input instanceof URL ? mapUrl(input) : new Request(mapUrl(input), input), init);
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
  if (bodyLength === undefined) delete copied["content-length"];
  else copied["content-length"] = String(bodyLength);
  return copied;
}

function injectTheme(html) {
  const additions = `<script>window.__UED_AGENT_BASE__=${JSON.stringify(basePath)};</script><link rel="stylesheet" href="${basePath}/asset-hub-agent-theme.css"><script src="${basePath}/asset-hub-agent-brand.js"></script>`;
  const rewritten = html.replace(/\b(href|src)="\/(?!\/)/g, `$1="${basePath}/`);
  return rewritten.includes("</head>") ? rewritten.replace("</head>", `${additions}</head>`) : `${additions}${rewritten}`;
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

const server = http.createServer((request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  if (url.pathname === "/healthz") {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ ok: true, target: target.origin }));
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
