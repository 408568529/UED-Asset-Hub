import { access, lstat, mkdir, realpath } from "node:fs/promises";
import path from "node:path";
import { isInside } from "../agent-integration/scripts/runtime-boundary.mjs";

const managedDirectories = ["logs", "dsh-home", "workspaces", "artifacts", "supervisor"];

function fail(message) {
  throw new Error(`[Runtime Paths] ${message}`);
}

async function directoryRealPath(directory, label) {
  const entry = await lstat(directory).catch(() => null);
  if (!entry) return null;
  if (!entry.isDirectory() || entry.isSymbolicLink()) fail(`${label} 必须是非符号链接目录。`);
  return realpath(directory);
}

function assertSeparate(dataRoot, agentRoot) {
  if (dataRoot === agentRoot || isInside(dataRoot, agentRoot) || isInside(agentRoot, dataRoot)) {
    fail("DATA_DIR 与 AGENT_RUNTIME_DIR 必须彼此独立且互不包含。");
  }
}

function assertContained(agentRoot, candidate, label) {
  if (!isInside(agentRoot, candidate) || candidate === agentRoot) fail(`${label} 必须位于 AGENT_RUNTIME_DIR 内。`);
}

export async function inspectRuntimePaths({ dataDir, agentRuntimeDir }) {
  if (!dataDir?.trim()) fail("缺少 DATA_DIR。");
  if (!agentRuntimeDir?.trim()) fail("缺少 AGENT_RUNTIME_DIR。");
  const configuredDataDir = path.resolve(dataDir);
  const configuredAgentRuntimeDir = path.resolve(agentRuntimeDir);
  await access(configuredDataDir);
  const dataRoot = await directoryRealPath(configuredDataDir, "DATA_DIR");
  if (!dataRoot) fail("DATA_DIR 不存在。");

  const agentRoot = await directoryRealPath(configuredAgentRuntimeDir, "AGENT_RUNTIME_DIR");
  if (!agentRoot) {
    const parent = await realpath(path.dirname(configuredAgentRuntimeDir)).catch(() => null);
    if (!parent) fail("AGENT_RUNTIME_DIR 父目录不存在。");
    return { dataRoot, agentRoot: null, configuredAgentRuntimeDir, initializationRequired: true, directories: {} };
  }
  assertSeparate(dataRoot, agentRoot);
  const directories = {};
  for (const name of managedDirectories) {
    const candidate = path.join(agentRoot, name);
    const canonical = await directoryRealPath(candidate, `AGENT_RUNTIME_DIR/${name}`);
    if (canonical) {
      assertContained(agentRoot, canonical, `AGENT_RUNTIME_DIR/${name}`);
      if (isInside(dataRoot, canonical)) fail(`AGENT_RUNTIME_DIR/${name} 不允许位于 DATA_DIR 内。`);
    }
    directories[name] = canonical;
  }
  return { dataRoot, agentRoot, configuredAgentRuntimeDir, initializationRequired: Object.values(directories).some((value) => !value), directories };
}

export async function ensureRuntimePaths({ dataDir, agentRuntimeDir }) {
  const inspected = await inspectRuntimePaths({ dataDir, agentRuntimeDir });
  if (!inspected.agentRoot) {
    await mkdir(inspected.configuredAgentRuntimeDir, { recursive: true });
  }
  const agentRoot = await directoryRealPath(inspected.configuredAgentRuntimeDir, "AGENT_RUNTIME_DIR");
  if (!agentRoot) fail("无法创建 AGENT_RUNTIME_DIR。");
  assertSeparate(inspected.dataRoot, agentRoot);
  const directories = {};
  for (const name of managedDirectories) {
    const candidate = path.join(agentRoot, name);
    await mkdir(candidate, { recursive: true });
    const canonical = await directoryRealPath(candidate, `AGENT_RUNTIME_DIR/${name}`);
    if (!canonical) fail(`无法创建 AGENT_RUNTIME_DIR/${name}。`);
    assertContained(agentRoot, canonical, `AGENT_RUNTIME_DIR/${name}`);
    if (isInside(inspected.dataRoot, canonical)) fail(`AGENT_RUNTIME_DIR/${name} 不允许位于 DATA_DIR 内。`);
    directories[name] = canonical;
  }
  return { ...inspected, agentRoot, initializationRequired: false, directories };
}

export async function ensureRuntimeSubdirectory({ dataRoot, agentRoot, relativePath }) {
  const segments = relativePath.split(/[\\/]+/).filter(Boolean);
  let current = agentRoot;
  for (const segment of segments) {
    if (segment === "." || segment === "..") fail("Runtime 子目录路径无效。");
    current = path.join(current, segment);
    await mkdir(current, { recursive: true });
    const canonical = await directoryRealPath(current, `AGENT_RUNTIME_DIR/${relativePath}`);
    if (!canonical) fail(`无法创建 AGENT_RUNTIME_DIR/${relativePath}。`);
    assertContained(agentRoot, canonical, `AGENT_RUNTIME_DIR/${relativePath}`);
    if (isInside(dataRoot, canonical)) fail(`AGENT_RUNTIME_DIR/${relativePath} 不允许位于 DATA_DIR 内。`);
    current = canonical;
  }
  return current;
}

export { managedDirectories };
