import { allowsPublicAgentRequest } from "../agent-integration/scripts/agent-public-access.mjs";
import assert from "node:assert/strict";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { createServer as createNetServer } from "node:net";
import { createServer as createHttpServer } from "node:http";
import { spawn, execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { originalLoadHandler, compatibleLoadHandler, originalReadinessTimeout, compatibleReadinessTimeout, originalReadinessCleanup, compatibleReadinessCleanup, officialClientSha256, patchedClientSha256, patchGenuiClientLoad } from "../agent-integration/scripts/genui-client-load-liveness.mjs";

async function freePort() {
  const server = createNetServer();
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

const guestEnvironment = { AGENT_PUBLIC_ACCESS: "true", PUBLIC_ORIGIN: "http://127.0.0.1:3047" };
const sandboxRequest = { method: "POST", headers: { origin: "null", "sec-fetch-site": "cross-site" } };
assert.equal(allowsPublicAgentRequest(sandboxRequest, new URL("http://127.0.0.1/genui/api/test/state/read"), guestEnvironment), true, "sandbox state calls must reach GenUI's own capability check");
assert.equal(allowsPublicAgentRequest(sandboxRequest, new URL("http://127.0.0.1/api/credentials.set"), guestEnvironment), false);
assert.equal(allowsPublicAgentRequest({ method: "POST", headers: { origin: "https://untrusted.example", "sec-fetch-site": "cross-site" } }, new URL("http://127.0.0.1/api/session.prompt"), guestEnvironment), false);
assert.equal(allowsPublicAgentRequest({ method: "GET", headers: {} }, new URL("http://127.0.0.1/plugins/@deepseek-ai/dsh-client-runtime/client.js"), guestEnvironment), true);
assert.equal(allowsPublicAgentRequest({ method: "GET", headers: {} }, new URL("http://127.0.0.1/"), {}), false);

assert.equal(allowsPublicAgentRequest({ method: "GET", headers: { "sec-fetch-site": "cross-site" } }, new URL("http://127.0.0.1/"), guestEnvironment), true);
assert.equal(allowsPublicAgentRequest({ method: "GET", headers: { "sec-fetch-site": "cross-site" } }, new URL("http://127.0.0.1/api/session.export"), guestEnvironment), false);
assert.equal(allowsPublicAgentRequest({ method: "GET", headers: { "sec-fetch-site": "cross-site" } }, new URL("http://127.0.0.1/api/events.host"), guestEnvironment), false);

assert.equal(allowsPublicAgentRequest({ method: "GET", headers: { origin: "null", "sec-fetch-site": "cross-site" } }, new URL("http://127.0.0.1/"), guestEnvironment), true);
assert.equal(allowsPublicAgentRequest({ method: "GET", headers: { origin: "null" } }, new URL("http://127.0.0.1/genui/assets/a/v/app.js"), guestEnvironment), false, "sandbox assets still require a signed preview grant");

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
assert.match(runtimeOverlay, /default: asset-hub-genui-restricted/);
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
const officialClient = execFileSync("tar", ["-xOf", pluginLock.packageTarball, "package/lib/client.js"], { encoding: "utf8" });
assert.equal(pluginLock.clientCompatibility.officialClientSha256, officialClientSha256);
assert.equal(pluginLock.clientCompatibility.patchedClientSha256, patchedClientSha256);
const compatibleClient = patchGenuiClientLoad(officialClient);
assert.equal(createHash("sha256").update(compatibleClient).digest("hex"), patchedClientSha256);
assert.equal(patchGenuiClientLoad(compatibleClient), compatibleClient);
assert.equal(patchGenuiClientLoad(officialClient.replace(originalLoadHandler, compatibleLoadHandler)), compatibleClient);
assert.equal(compatibleClient.replace(compatibleLoadHandler, originalLoadHandler).replace(compatibleReadinessTimeout, originalReadinessTimeout).replace(compatibleReadinessCleanup, originalReadinessCleanup), officialClient);
assert.throws(() => patchGenuiClientLoad(officialClient + "changed"));
assert.match(windowsInstaller, /genui-client-load-liveness\.mjs/);
assert.match(windowsBuild, /genui-client-load-liveness\.mjs/);
assert.match(windowsPayload, /genui-client-load-liveness\.mjs/);
const loadHarness = new Function("trustedPreviewStarted", `
  let active = true, resolveLiveness;
  const calls = { verify: 0, close: 0, fail: 0 };
  const connection = { verifyCurrentDocument() { calls.verify++; return new Promise(resolve => { resolveLiveness = resolve; }); }, close() { calls.close++; } };
  const failNavigatedPreview = () => { calls.fail++; };
  ${compatibleLoadHandler}
  return { loaded, calls, settle: value => resolveLiveness(value), deactivate() { active = false; } };
`);
const earlyLoad = loadHarness(false); earlyLoad.loaded();
assert.deepEqual(earlyLoad.calls, { verify: 0, close: 0, fail: 0 });
for (const alive of [true, false]) {
  const lateLoad = loadHarness(true); lateLoad.loaded(); lateLoad.settle(alive); await Promise.resolve();
  assert.deepEqual(lateLoad.calls, { verify: 1, close: alive ? 0 : 1, fail: alive ? 0 : 1 });
}
const disposedLoad = loadHarness(true); disposedLoad.loaded(); disposedLoad.deactivate(); disposedLoad.settle(false); await Promise.resolve();
assert.deepEqual(disposedLoad.calls, { verify: 1, close: 0, fail: 0 });

const readinessHarness = new Function(`
  let state = "loading", listener, observerCallback, disconnected = false, nextId = 0;
  const timers = new Map(), messages = [];
  const frameRef = { current: { contentWindow: { postMessage(value) { messages.push(value); } } } };
  const meta = { artifactId: "same-artifact" }, activeVersionId = "same-version";
  const window = { setTimeout(callback, ms) { const id = ++nextId; timers.set(id, { callback, ms }); return id; }, clearTimeout(id) { timers.delete(id); }, removeEventListener() {} };
  const document = { visibilityState: "visible", addEventListener(type, callback) { listener = callback; }, removeEventListener(type, callback) { if (listener === callback) listener = undefined; } };
  const IntersectionObserver = class { constructor(callback) { observerCallback = callback; } observe(frame) { if (frame !== frameRef.current) throw Error("wrong frame"); } disconnect() { disconnected = true; } };
  const setFrameState = update => { state = update(state); };
  const receive = () => {};
  ${compatibleReadinessTimeout}
  return { timers, messages, state: () => state,
    intersect(value) { if (!disconnected) observerCallback([{ isIntersecting: value }]); },
    visibility(value) { document.visibilityState = value; listener?.(); },
    fire() { for (const timer of [...timers.values()]) timer.callback(); timers.clear(); },
    ready() { state = "ready"; },
    dispose() { ${compatibleReadinessCleanup} },
    disconnected: () => disconnected
  };
`);
const offscreen = readinessHarness(); offscreen.intersect(false);
assert.equal(offscreen.timers.size, 0); assert.equal(offscreen.messages.length, 0);
offscreen.intersect(true);
assert.equal(offscreen.timers.size, 1); assert.equal([...offscreen.timers.values()][0].ms, 8000);
assert.deepEqual(offscreen.messages[0], { source: "dsh-genui", type: "ready-request", artifactId: "same-artifact", versionId: "same-version" });
offscreen.visibility("hidden"); assert.equal(offscreen.timers.size, 0);
offscreen.visibility("visible"); assert.equal(offscreen.timers.size, 1);
offscreen.intersect(false); assert.equal(offscreen.timers.size, 0);
offscreen.intersect(true); offscreen.ready(); offscreen.fire(); assert.equal(offscreen.state(), "ready");
const brokenVisible = readinessHarness(); brokenVisible.intersect(true); brokenVisible.fire(); assert.equal(brokenVisible.state(), "failed");
const hiddenTab = readinessHarness(); hiddenTab.visibility("hidden"); hiddenTab.intersect(true); assert.equal(hiddenTab.timers.size, 0);
hiddenTab.visibility("visible"); assert.equal(hiddenTab.timers.size, 1);
hiddenTab.dispose(); assert.equal(hiddenTab.disconnected(), true); assert.equal(hiddenTab.timers.size, 0);
hiddenTab.visibility("visible"); hiddenTab.intersect(true); assert.equal(hiddenTab.timers.size, 0);

const adminSecret = randomBytes(32).toString("base64url");
const username = "genui-boundary-test";
const upstreamPort = await freePort();
const received = [];
const receivedGenui = [];
const upstream = createHttpServer(async (request, response) => {
  if (request.method === "GET" && request.url.startsWith("/genui/preview/")) {
    response.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": "default-src 'none'; script-src 'self'; frame-src 'none'; sandbox allow-scripts allow-modals",
      "X-Frame-Options": "SAMEORIGIN",
      "Cache-Control": "no-store"
    });
    response.end('<!doctype html><html><head><link rel="stylesheet" href="/genui/assets/s-fixture/v-fixture/app.css?runtime=0.14.0"></head><body data-route-prefix="/genui"><div id="root" data-app-src="/genui/assets/s-fixture/v-fixture/app.js?runtime=0.14.0"></div><script src="/genui/bridge.js?runtime=0.14.0"></script></body></html>');
    return;
  }
  if (request.method === "GET" && (request.url.startsWith("/genui/bridge.js") || request.url.startsWith("/genui/assets/"))) {
    receivedGenui.push({ path: request.url, origin: request.headers.origin || null });
    response.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8", ...(request.headers.origin === "null" ? { "Access-Control-Allow-Origin": "null", Vary: "Origin" } : {}) });
    response.end("// synthetic GenUI asset");
    return;
  }
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
  env: { ...process.env, DSH_BASE_URL: `http://127.0.0.1:${upstreamPort}`, AGENT_PROXY_HOST: "127.0.0.1", AGENT_PROXY_PORT: String(proxyPort), AGENT_RUNTIME_DIR: root, AGENT_WORKSPACE_ROOT: path.join(root, "workspaces"), ADMIN_USERNAME: username, ADMIN_SESSION_SECRET: adminSecret, PUBLIC_ORIGIN: `http://127.0.0.1:${proxyPort}` },
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
  const publicAccess = process.env.AGENT_PUBLIC_ACCESS === "true";
  assert.equal((await call("/api/session.create", { rpcId: "anon", payload: { agentPreset: "asset-hub-genui-restricted" } }, false)).status, publicAccess ? 200 : 401);
  for (const method of ["credentials.describe", "credentials.set", "settings.describe", "settings.update", "agentPreset.copy", "host.openPath", "unlisted.method"]) {
    assert.equal((await call(`/api/${method}`, { rpcId: "guest-denied", payload: {} }, false)).status, 401, `${method} stays protected`);
  }
  if (publicAccess) {
    const forbidden = await call("/api/session.create", { rpcId: "guest-unrestricted", payload: { agentPreset: "unrestricted" } }, false);
    assert.equal(forbidden.body.result.ok, false);
    assert.equal((await fetch(`${base}/api/session.list`, { method: "POST", headers: { Origin: "https://untrusted.example", "Content-Type": "application/json" }, body: JSON.stringify({ rpcId: "cross-site", payload: {} }) })).status, 401);
  }
  const protectedPreview = await fetch(`${base}/genui/preview/s-fixture/v-fixture`);
  assert.equal(protectedPreview.status, publicAccess ? 200 : 401, "GenUI preview requires a session or explicitly enabled public use");
  const preview = await fetch(`${base}/genui/preview/s-fixture/v-fixture`, { headers: { Cookie: cookie } });
  assert.equal(preview.status, 200);
  assert.equal(preview.headers.get("content-security-policy"), "default-src 'none'; script-src 'self'; frame-src 'none'; sandbox allow-scripts allow-modals");
  assert.equal(preview.headers.get("x-frame-options"), "SAMEORIGIN");
  assert.equal(preview.headers.get("cache-control"), "private, no-store");
  assert.equal(preview.headers.get("referrer-policy"), "no-referrer");
  const previewHtml = await preview.text();
  assert.match(previewHtml, /data-route-prefix="\/genui"/);
  assert.match(preview.headers.get("content-security-policy"), /sandbox allow-scripts allow-modals/);
  const previewGrantMatch = previewHtml.match(/ued_preview_grant=([^&"']+)/);
  assert.ok(previewGrantMatch, "authenticated preview HTML must issue a scoped read-only asset grant");
  const previewGrant = decodeURIComponent(previewGrantMatch[1]);
  assert.match(previewHtml, /href="\/genui\/assets\/s-fixture\/v-fixture\/app\.css\?[^\"]*ued_preview_grant=/);
  assert.match(previewHtml, /data-app-src="\/genui\/assets\/s-fixture\/v-fixture\/app\.js\?[^\"]*ued_preview_grant=/);
  assert.equal((await fetch(`${base}/genui/bridge.js?runtime=0.14.0`)).status, 401, "bridge bootstrap remains denied without a session or grant");
  const bridge = await fetch(`${base}/genui/bridge.js?runtime=0.14.0&ued_preview_grant=${encodeURIComponent(previewGrant)}`);
  assert.equal(bridge.status, 200);
  assert.equal(bridge.headers.get("cache-control"), "private, no-store");
  const stylesheet = await fetch(`${base}/genui/assets/s-fixture/v-fixture/app.css?ued_preview_grant=${encodeURIComponent(previewGrant)}`);
  assert.equal(stylesheet.status, 200);
  assert.equal(stylesheet.headers.get("cache-control"), "private, no-store");
  const cookieAuthenticatedAsset = await fetch(`${base}/genui/assets/s-fixture/v-fixture/app.js?ued_preview_grant=${encodeURIComponent(previewGrant)}`, { headers: { Cookie: cookie, Origin: "null" } });
  assert.equal(cookieAuthenticatedAsset.status, 200);
  assert.equal(cookieAuthenticatedAsset.headers.get("cache-control"), "private, no-store");
  assert.equal(cookieAuthenticatedAsset.headers.get("access-control-allow-origin"), "null", "Cookie plus a valid static grant must preserve the sandbox module Origin");
  const sandboxedModule = await fetch(`${base}/genui/assets/s-fixture/v-fixture/app.js?ued_preview_grant=${encodeURIComponent(previewGrant)}`, { headers: { Origin: "null" } });
  assert.equal(sandboxedModule.status, 200);
  assert.equal(sandboxedModule.headers.get("access-control-allow-origin"), "null");
  assert.equal((await fetch(`${base}/genui/assets/s-other/v-fixture/app.js?ued_preview_grant=${encodeURIComponent(previewGrant)}`)).status, 401, "asset grant must not cross artifact scope");
  assert.equal((await fetch(`${base}/genui/assets/s-fixture/v-other/app.js?ued_preview_grant=${encodeURIComponent(previewGrant)}`)).status, 401, "asset grant must not cross version scope");
  assert.equal((await fetch(`${base}/genui/api/s-fixture/state/read?ued_preview_grant=${encodeURIComponent(previewGrant)}`)).status, 401, "asset grant must not authorize artifact APIs");
  assert.equal((await fetch(`${base}/genui/assets/s-fixture/v-fixture/app.js?ued_preview_grant=${encodeURIComponent(previewGrant)}`, { method: "POST" })).status, 401, "asset grant is read-only");
  const expiredPayload = Buffer.from(JSON.stringify({ artifactId: "s-fixture", versionId: "v-fixture", expiresAt: Date.now() - 1 })).toString("base64url");
  const expiredSignature = createHmac("sha256", adminSecret).update(`genui-preview-asset-v1.${expiredPayload}`).digest("base64url");
  assert.equal((await fetch(`${base}/genui/assets/s-fixture/v-fixture/app.js?ued_preview_grant=${expiredPayload}.${expiredSignature}`)).status, 401, "expired preview grant must be denied");
  const tamperedGrant = `${previewGrant.slice(0, -1)}${previewGrant.endsWith("a") ? "b" : "a"}`;
  assert.equal((await fetch(`${base}/genui/bridge.js?ued_preview_grant=${encodeURIComponent(tamperedGrant)}`)).status, 401, "tampered preview grant must be denied");
  assert.equal((await fetch(`${base}/genui/bridge.js?ued_preview_grant=${encodeURIComponent(previewGrant)}&ued_preview_grant=${encodeURIComponent(previewGrant)}`)).status, 401, "duplicate preview grants must be denied");
  assert.ok(receivedGenui.every(({ path }) => !path.includes("ued_preview_grant")), "proxy grant must not be forwarded to DSH");
  assert.equal(receivedGenui.find(({ origin }) => origin === "null")?.origin, "null", "sandbox origin must reach DSH unchanged for module CORS");
  const genui = await call("/api/session.create", { rpcId: "genui", payload: { agentPreset: "asset-hub-genui-restricted" } });
  assert.equal(genui.body.result.ok, true);
  assert.equal(received.at(-1).payload.payload.agentPreset, "asset-hub-genui-restricted");
  const defaults = await call("/api/session.create", { rpcId: "default", payload: {} });
  assert.equal(defaults.body.result.ok, true);
  assert.equal(received.at(-1).payload.payload.agentPreset, "asset-hub-genui-restricted");
  const knowledgeOnly = await call("/api/session.create", { rpcId: "knowledge", payload: { agentPreset: "asset-hub-restricted" } });
  assert.equal(knowledgeOnly.body.result.ok, true);
  assert.equal(received.at(-1).payload.payload.agentPreset, "asset-hub-restricted");
  const denied = await call("/api/session.create", { rpcId: "denied", payload: { agentPreset: "arbitrary-user-preset" } });
  assert.equal(denied.body.result.ok, false);
  assert.equal(denied.body.result.error.code, "agent-preset-restricted");
  assert.equal(received.length, publicAccess ? 4 : 3, "unapproved presets must not reach DSH");
  assert.equal((await call("/api/agentPreset.select", { rpcId: "select", payload: { agentPreset: "asset-hub-genui-restricted" } })).body.result.ok, true);
  assert.equal((await call("/api/agentPreset.select", { rpcId: "select-denied", payload: { agentPreset: "arbitrary-user-preset" } })).body.result.error.code, "agent-preset-restricted");
  console.log("[UED Agent] Default GenUI preset, explicit knowledge-only selection, authentication, and arbitrary-preset rejection passed.");
} finally {
  proxy.kill("SIGTERM");
  await new Promise((resolve) => proxy.once("exit", resolve));
  await new Promise((resolve) => upstream.close(resolve));
  await rm(root, { recursive: true, force: true });
}
