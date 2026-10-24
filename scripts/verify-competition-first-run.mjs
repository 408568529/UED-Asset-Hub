import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { access, mkdtemp, mkdir, readFile, readdir, realpath, rm, stat, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { initializeCompetitionData } from "./competition-first-run.mjs";
import { localDistributionEnvironment } from "./competition-launcher.mjs";
import { runtimeEnvironmentProfiles } from "../agent-integration/scripts/runtime-boundary.mjs";
import { allowsPublicAgentRequest } from "../agent-integration/scripts/agent-public-access.mjs";

const root = await realpath(await mkdtemp(path.join(os.tmpdir(), "ued-v25-first-run-")));
try {
  const packageRoot = path.join(root, "程序 含空格"), dependencyRoot = path.join(packageRoot, "dependencies");
  await mkdir(path.join(dependencyRoot, "dsh-source"), { recursive: true });
  await mkdir(path.join(dependencyRoot, "dsh-runtime"));
  const plugin = path.join(dependencyRoot, "genui-home", "profiles", "web", "node_modules", "dsh-plugin-genui");
  await mkdir(plugin, { recursive: true });
  await writeFile(path.join(plugin, "package.json"), JSON.stringify({ name: "dsh-plugin-genui", version: "0.15.1" }));
  const dataRoot = path.join(root, "持久数据 O'Brien"), options = { packageRoot, dependencyRoot, dataRoot, confirmed: true };
  await assert.rejects(initializeCompetitionData({ ...options, confirmed: false }), /confirmation/);
  await assert.rejects(initializeCompetitionData({ ...options, dataRoot: path.join(packageRoot, "data") }), /separate/);
  const result = await initializeCompetitionData(options);
  const config = await readFile(result.configPath, "utf8");
  assert.equal(JSON.parse(config).DATA_DIR, path.join(dataRoot, "hub-data"));
  assert.equal(JSON.parse(config).MICRO_STANDARD_ROOT, path.join(dataRoot, "micro-standards"));
  assert.equal(JSON.parse(config).AGENT_PUBLIC_ACCESS, "true");
  const shipping = localDistributionEnvironment(JSON.parse(config), packageRoot, dataRoot);
  assert.equal(shipping.AGENT_PUBLIC_ACCESS, "true");
  assert.equal(runtimeEnvironmentProfiles.assetHub(shipping).AGENT_PUBLIC_ACCESS, "true");
  assert.equal(runtimeEnvironmentProfiles.agentProxy(shipping).AGENT_PUBLIC_ACCESS, "true");
  const request = { method: "POST", headers: { origin: shipping.PUBLIC_ORIGIN } };
  assert.equal(allowsPublicAgentRequest(request, new URL("/api/session.prompt", shipping.PUBLIC_ORIGIN), shipping), true);
  assert.equal(allowsPublicAgentRequest(request, new URL("/api/credentials.set", shipping.PUBLIC_ORIGIN), shipping), false);
  const legacyConfig = { ...JSON.parse(config) }; delete legacyConfig.AGENT_PUBLIC_ACCESS;
  assert.equal(localDistributionEnvironment(legacyConfig, packageRoot, dataRoot).AGENT_PUBLIC_ACCESS, "true");
  const privateEnvironment = localDistributionEnvironment({ ...legacyConfig, AGENT_PUBLIC_ACCESS: "false" }, packageRoot, dataRoot);
  assert.equal(privateEnvironment.AGENT_PUBLIC_ACCESS, "false");
  assert.equal(allowsPublicAgentRequest(request, new URL("/api/session.prompt", shipping.PUBLIC_ORIGIN), privateEnvironment), false);
  console.log("[V2.5] persisted guest Agent default, legacy fallback, explicit private override and RPC boundary: PASS");
  assert.deepEqual(JSON.parse(await readFile(path.join(dataRoot, "micro-standards", ".micro-index.json"), "utf8")), { schemaVersion: 1, revision: 0, topics: [], documents: {} });
  assert.ok(!/API_KEY|PASSWORD|SESSION_SECRET/.test(config));
  assert.equal(JSON.parse(await readFile(path.join(dataRoot, "agent-runtime", "dsh-home", "profiles", "web", "node_modules", "dsh-plugin-genui", "package.json"), "utf8")).version, "0.15.1");
  assert.equal((await readdir(result.environment.DATA_DIR)).length, 0);
  await writeFile(path.join(dataRoot, "keep.txt"), "existing-user-data");
  await assert.rejects(initializeCompetitionData(options), /Existing data/);
  assert.equal(await readFile(path.join(dataRoot, "keep.txt"), "utf8"), "existing-user-data");
  await rm(result.environment.TRAINING_MEDIA_DIR, { recursive: true });
  await assert.rejects(initializeCompetitionData(options), /Existing data/);
  await assert.rejects(access(result.environment.TRAINING_MEDIA_DIR), { code: "ENOENT" });
  const linked = path.join(root, "linked-parent");
  await symlink(packageRoot, linked, process.platform === "win32" ? "junction" : "dir");
  await assert.rejects(initializeCompetitionData({ ...options, dataRoot: path.join(linked, "new-data") }), /link|separate/);
  if (process.platform === "darwin") {
    const { createRuntimeControlBridge, requestRuntimeControl, runtimeControlEndpoint } = await import("./runtime-control-bridge.mjs");
    const longRuntime = path.join(root, "长目录".repeat(24), "asset-runtime");
    await mkdir(path.join(longRuntime, "tmp"), { recursive: true });
    const shipping = localDistributionEnvironment({ ...result.environment, ASSET_HUB_RUNTIME_DIR: longRuntime }, packageRoot, dataRoot);
    const priorTmp = process.env.TMPDIR;
    process.env.TMPDIR = shipping.TMPDIR;
    const endpoint = runtimeControlEndpoint({ supervisorDirectory: longRuntime, instanceId: randomUUID() });
    const token = randomBytes(32).toString("base64url");
    const bridge = createRuntimeControlBridge({ endpoint, token, inspect: () => ({ status: "ready", credentialStatus: "configured", generation: 0, shell: "ready" }) });
    try {
      assert.ok(Buffer.byteLength(endpoint) < 104, "long selected paths must not truncate the private Unix control socket");
      await bridge.start();
      assert.equal((await stat(endpoint)).mode & 0o777, 0o600);
      assert.equal((await requestRuntimeControl({ endpoint, token, operation: "status" })).status, "ready");
    } finally { await bridge.stop(); if (priorTmp === undefined) delete process.env.TMPDIR; else process.env.TMPDIR = priorTmp; }
    console.log("[V2.5] long macOS data path with private authenticated IPC: PASS");
  }
  console.log("[V2.5] first-run consent, Chinese/spaced paths, quoting, empty storage, existing data, missing roots and linked paths: PASS");
} finally { await rm(root, { recursive: true, force: true }); }
