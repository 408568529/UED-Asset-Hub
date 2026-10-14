import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { assertAgentRuntimeBoundary, blockedFromAgentProxyEnvironment, blockedFromDshEnvironment, runtimeEnvironmentProfiles } from "../agent-integration/scripts/runtime-boundary.mjs";

const root = await mkdtemp(path.join(os.tmpdir(), "ued-agent-boundary-"));
try {
  const dataDir = path.join(root, "data");
  const agentRuntimeDir = path.join(root, "agent");
  await Promise.all([mkdir(dataDir), mkdir(agentRuntimeDir)]);
  await assert.doesNotReject(assertAgentRuntimeBoundary({ dataDir, agentRuntimeDir }));
  await assert.rejects(assertAgentRuntimeBoundary({ dataDir, agentRuntimeDir: path.join(dataDir, "agent") }));
  const haldurRoot = path.join(root, "haldur-source");
  const haldurRuntimeRoot = path.join(root, "haldur-runtime");
  const assetHubEnv = runtimeEnvironmentProfiles.assetHub({ HALDUR_DESIGN_SKILL_ROOT: haldurRoot, HALDUR_DESIGN_SKILL_RUNTIME_ROOT: haldurRuntimeRoot });
  assert.equal(assetHubEnv.HALDUR_DESIGN_SKILL_ROOT, haldurRoot, "Haldur source root must reach Asset Hub");
  assert.equal(assetHubEnv.HALDUR_DESIGN_SKILL_RUNTIME_ROOT, haldurRuntimeRoot, "Haldur runtime root must reach Asset Hub");
  const genuiArtifacts = path.join(agentRuntimeDir, "dsh-home", "genui-artifacts");
  const dshEnv = runtimeEnvironmentProfiles.dsh({ DATA_DIR: dataDir, TRAINING_MEDIA_DIR: "training", AGENT_RUNTIME_DIR: agentRuntimeDir, HALDUR_DESIGN_SKILL_ROOT: haldurRoot, HALDUR_DESIGN_SKILL_RUNTIME_ROOT: haldurRuntimeRoot, AGENT_GATEWAY_TOKEN: "secret", ADMIN_PASSWORD: "secret", OPENAI_API_KEY: "model-secret", CHOKIDAR_USEPOLLING: "1", PATH: process.env.PATH }, { DSH_HOME: path.join(agentRuntimeDir, "dsh-home"), DSH_GENUI_ARTIFACT_ROOT: genuiArtifacts, AGENT_WORKSPACE_ROOT: path.join(agentRuntimeDir, "workspaces"), ASSET_HUB_MCP_URL: "http://127.0.0.1:3082/mcp" });
  for (const key of blockedFromDshEnvironment) assert.equal(key in dshEnv, false, `${key} must not reach DSH`);
  assert.equal("HALDUR_DESIGN_SKILL_ROOT" in dshEnv, false, "Haldur source root must not reach DSH");
  assert.equal("HALDUR_DESIGN_SKILL_RUNTIME_ROOT" in dshEnv, false, "Haldur runtime root must not reach DSH");
  assert.equal(dshEnv.ASSET_HUB_MCP_URL, "http://127.0.0.1:3082/mcp");
  assert.equal(dshEnv.DSH_GENUI_ARTIFACT_ROOT, genuiArtifacts);
  assert.equal(dshEnv.CHOKIDAR_USEPOLLING, "1");
  const proxyEnv = runtimeEnvironmentProfiles.agentProxy({ ADMIN_USERNAME: "operator", ADMIN_SESSION_SECRET: "x".repeat(32), ADMIN_PASSWORD: "secret", DATA_DIR: dataDir, AGENT_GATEWAY_TOKEN: "secret", TRAINING_MEDIA_DIR: "training", HALDUR_DESIGN_SKILL_ROOT: haldurRoot, HALDUR_DESIGN_SKILL_RUNTIME_ROOT: haldurRuntimeRoot, TEST_ENV_ENCRYPTION_KEY: "secret", RUNTIME_CONTROL_TOKEN: "secret", DEEPSEEK_API_KEY: "secret", OPENAI_API_KEY: "secret", PATH: process.env.PATH });
  for (const key of blockedFromAgentProxyEnvironment) assert.equal(key in proxyEnv, false, `${key} must not reach Agent Proxy`);
  assert.equal("HALDUR_DESIGN_SKILL_ROOT" in proxyEnv, false, "Haldur source root must not reach Agent Proxy");
  assert.equal("HALDUR_DESIGN_SKILL_RUNTIME_ROOT" in proxyEnv, false, "Haldur runtime root must not reach Agent Proxy");
  assert.equal(proxyEnv.ADMIN_USERNAME, "operator");
  assert.equal(proxyEnv.ADMIN_SESSION_SECRET, "x".repeat(32));
  const gatewayEnv = runtimeEnvironmentProfiles.gatewayBridge({ HALDUR_DESIGN_SKILL_ROOT: haldurRoot, HALDUR_DESIGN_SKILL_RUNTIME_ROOT: haldurRuntimeRoot });
  assert.equal("HALDUR_DESIGN_SKILL_ROOT" in gatewayEnv, false, "Haldur source root must not reach Gateway");
  assert.equal("HALDUR_DESIGN_SKILL_RUNTIME_ROOT" in gatewayEnv, false, "Haldur runtime root must not reach Gateway");
  console.log("[UED Agent] Runtime isolation and DSH environment allowlist verification passed.");
} finally {
  await rm(root, { recursive: true, force: true });
}
