import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { assertAgentRuntimeBoundary, blockedFromDshEnvironment, runtimeEnvironmentProfiles } from "../agent-integration/scripts/runtime-boundary.mjs";

const root = await mkdtemp(path.join(os.tmpdir(), "ued-agent-boundary-"));
try {
  const dataDir = path.join(root, "data");
  const agentRuntimeDir = path.join(root, "agent");
  await Promise.all([mkdir(dataDir), mkdir(agentRuntimeDir)]);
  await assert.doesNotReject(assertAgentRuntimeBoundary({ dataDir, agentRuntimeDir }));
  await assert.rejects(assertAgentRuntimeBoundary({ dataDir, agentRuntimeDir: path.join(dataDir, "agent") }));
  const dshEnv = runtimeEnvironmentProfiles.dsh({ DATA_DIR: dataDir, TRAINING_MEDIA_DIR: "training", AGENT_RUNTIME_DIR: agentRuntimeDir, AGENT_GATEWAY_TOKEN: "secret", ADMIN_PASSWORD: "secret", OPENAI_API_KEY: "model-secret", PATH: process.env.PATH }, { DSH_HOME: path.join(agentRuntimeDir, "dsh-home"), AGENT_WORKSPACE_ROOT: path.join(agentRuntimeDir, "workspaces"), ASSET_HUB_MCP_URL: "http://127.0.0.1:3082/mcp" });
  for (const key of blockedFromDshEnvironment) assert.equal(key in dshEnv, false, `${key} must not reach DSH`);
  assert.equal(dshEnv.ASSET_HUB_MCP_URL, "http://127.0.0.1:3082/mcp");
  console.log("[UED Agent] Runtime isolation and DSH environment allowlist verification passed.");
} finally {
  await rm(root, { recursive: true, force: true });
}
