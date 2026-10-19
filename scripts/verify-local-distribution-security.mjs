import assert from "node:assert/strict";
import { createServer, request } from "node:http";
import { mkdtemp, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { isLocalDistributionEnvironment, acceptsLocalDistributionRequest } from "./local-distribution-config.mjs";
import { resolveHostSecurityConfig } from "./host-security-config.mjs";
import { createEdgeServer } from "./host-supervisor.mjs";

const root = await realpath(await mkdtemp(path.join(os.tmpdir(), "ued-v25-security-")));
const saved = { ...process.env };
let edge, upstream;
try {
  const packageRoot = path.join(root, "package"), dataRoot = path.join(root, "data");
  await mkdir(path.join(packageRoot, "app"), { recursive: true }); await mkdir(dataRoot);
  const source = { commit: "1".repeat(40), tree: "2".repeat(40) };
  await writeFile(path.join(packageRoot, "competition-manifest.json"), JSON.stringify({ channel: "V2.5_COMPETITION", platform: `${process.platform}-${process.arch}`, source }));
  await writeFile(path.join(packageRoot, "app/release-manifest.json"), JSON.stringify({ source }));
  const environment = { NODE_ENV: "production", UED_LOCAL_DISTRIBUTION_MODE: "true", UED_LOCAL_DISTRIBUTION_ROOT: dataRoot, UED_LOCAL_DISTRIBUTION_PACKAGE: packageRoot, HOST_BIND_HOST: "127.0.0.1", HOST_PORT: "3247", PUBLIC_ORIGIN: "http://127.0.0.1:3247", ADMIN_SESSION_SECURE: "false", ADMIN_USERNAME: "test-admin", ADMIN_PASSWORD: "Synthetic-admin-only-764!", ADMIN_SESSION_SECRET: "x".repeat(48) };
  for (const [key, child] of Object.entries({ DATA_DIR: "hub-data", TRAINING_MEDIA_DIR: "training-media", AGENT_RUNTIME_DIR: "agent-runtime", ASSET_HUB_RUNTIME_DIR: "asset-hub-runtime", HALDUR_DESIGN_SKILL_ROOT: "Haldur-Design-Skill", HALDUR_DESIGN_SKILL_RUNTIME_ROOT: "haldur-runtime" })) { environment[key] = path.join(dataRoot, child); await mkdir(environment[key]); }
  assert.equal(isLocalDistributionEnvironment(environment), true);
  resolveHostSecurityConfig(environment);
  for (const patch of [{ HOST_BIND_HOST: "0.0.0.0" }, { PUBLIC_ORIGIN: "http://192.168.1.3:3247" }, { UED_WINDOWS_SERVICE_MODE: "true" }, { UED_LOCAL_TEST_MODE: "true" }, { UED_LOCAL_DEMO_MODE: "true" }, { DATA_DIR: root }]) {
    assert.equal(isLocalDistributionEnvironment({ ...environment, ...patch }), false);
    assert.throws(() => resolveHostSecurityConfig({ ...environment, ...patch }));
  }
  assert.throws(() => resolveHostSecurityConfig({ ...environment, ADMIN_PASSWORD: "admin123" }));
  assert.throws(() => resolveHostSecurityConfig({ ...environment, UED_LOCAL_DISTRIBUTION_MODE: undefined }));
  resolveHostSecurityConfig({ ...environment, UED_LOCAL_DISTRIBUTION_MODE: undefined, UED_WINDOWS_SERVICE_MODE: "true", PUBLIC_ORIGIN: "https://server.test", ADMIN_SESSION_SECURE: "true" });
  const req = (method, host, origin) => ({ method, headers: new Headers({ host, ...(origin ? { origin } : {}) }) });
  assert.equal(acceptsLocalDistributionRequest(req("POST", "127.0.0.1:3247", "http://127.0.0.1:3247"), environment), true);
  for (const bad of [req("POST", "127.0.0.1:3247"), req("POST", "127.0.0.1:3247", "http://evil.test"), req("GET", "evil.test:3247")]) assert.equal(acceptsLocalDistributionRequest(bad, environment), false);
  upstream = createServer((_req, response) => { response.writeHead(200); response.end("upstream"); });
  await new Promise((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  const reserve = createServer(); await new Promise((resolve) => reserve.listen(0, "127.0.0.1", resolve)); const port = reserve.address().port; await new Promise((resolve) => reserve.close(resolve));
  Object.assign(process.env, environment, { HOST_PORT: String(port), PUBLIC_ORIGIN: `http://127.0.0.1:${port}` });
  edge = createEdgeServer({ host: "127.0.0.1", port, internalPort: upstream.address().port, proxyPort: upstream.address().port }); await edge.start();
  const status = (host, headers = {}, method = "GET", address = "127.0.0.1") => new Promise((resolve, reject) => {
    const call = request({ hostname: address, port, method, headers: { Host: host, ...headers }, timeout: 1500 }, (response) => { response.resume(); resolve(response.statusCode); });
    call.on("timeout", () => call.destroy(new Error("timeout"))); call.on("error", reject); call.end();
  });
  assert.equal(await status(`127.0.0.1:${port}`), 200);
  assert.equal(await status(`evil.test:${port}`), 403);
  assert.equal(await status(`127.0.0.1:${port}`, { Origin: "http://evil.test" }, "POST"), 403);
  assert.equal(await status(`127.0.0.1:${port}`, {}, "POST"), 403);
  const lan = Object.values(os.networkInterfaces()).flat().find((item) => item?.family === "IPv4" && !item.internal)?.address;
  if (lan) { await assert.rejects(status(`127.0.0.1:${port}`, {}, "GET", lan)); console.log("[V2.5] LAN interface cannot reach the loopback listener: PASS"); }
  else console.log("[V2.5] LAN-interface probe: NOT_VERIFIED (no non-loopback IPv4)");
  console.log("[V2.5] independent local mode, weak-password rejection, Service HTTPS rules, loopback listener, Host and Origin guards: PASS");
} finally {
  if (edge) await edge.stop();
  if (upstream) await new Promise((resolve) => upstream.close(resolve));
  for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
  Object.assign(process.env, saved);
  await rm(root, { recursive: true, force: true });
}
