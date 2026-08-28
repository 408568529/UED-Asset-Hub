import { realpath } from "node:fs/promises";
import path from "node:path";

const platformEnvironmentKeys = ["PATH", "Path", "PATHEXT", "SystemRoot", "SYSTEMROOT", "WINDIR", "ComSpec", "TMP", "TEMP", "TMPDIR", "HOME", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "PROGRAMDATA", "LANG", "LC_ALL", "LC_CTYPE", "TERM", "USER", "LOGNAME", "NODE_OPTIONS", "NODE_EXTRA_CA_CERTS", "SSL_CERT_FILE", "SSL_CERT_DIR"];
const assetHubEnvironmentKeys = ["NODE_ENV", "DATA_DIR", "TRAINING_MEDIA_DIR", "ADMIN_USERNAME", "ADMIN_PASSWORD", "ADMIN_SESSION_SECRET", "ADMIN_SESSION_SECURE", "TEST_ENV_ENCRYPTION_KEY", "OPENAI_API_KEY", "OPENAI_BASE_URL", "OPENAI_MODEL", "NEXT_PUBLIC_API_BASE_URL", "NEXT_PUBLIC_USE_MOCK", "NEXT_PUBLIC_STORAGE_PROVIDER", "NEXT_PUBLIC_OSS_BUCKET", "NEXT_PUBLIC_OSS_REGION", "AGENT_ENABLED", "AGENT_GATEWAY_TOKEN", "DSH_BASE_URL"];
const agentProxyEnvironmentKeys = ["NODE_ENV", "DSH_BASE_URL", "AGENT_PROXY_PORT", "AGENT_PROXY_HOST", "AGENT_PROXY_BASE_PATH", "AGENT_RUNTIME_DIR", "AGENT_WORKSPACE_ROOT", "ADMIN_USERNAME", "ADMIN_PASSWORD", "ADMIN_SESSION_SECRET"];
const dshEnvironmentKeys = ["NODE_ENV", "DSH_HOME", "DSH_TELEMETRY_DISABLED", "AGENT_WORKSPACE_ROOT", "ASSET_HUB_MCP_URL", "DEEPSEEK_API_KEY"];
const gatewayBridgeEnvironmentKeys = ["NODE_ENV", "KNOWLEDGE_GATEWAY_MCP_PORT", "KNOWLEDGE_GATEWAY_INTERNAL_URL", "AGENT_GATEWAY_TOKEN"];

export function isInside(parentPath, candidatePath) {
  const relative = path.relative(parentPath, candidatePath);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== "..");
}

export async function assertAgentRuntimeBoundary({ dataDir, agentRuntimeDir }) {
  const [dataRoot, agentRoot] = await Promise.all([realpath(dataDir), realpath(agentRuntimeDir)]);
  if (dataRoot === agentRoot || isInside(dataRoot, agentRoot) || isInside(agentRoot, dataRoot)) {
    throw new Error("DATA_DIR 与 AGENT_RUNTIME_DIR 必须是彼此独立、互不包含的目录。");
  }
  const knowledgeRoot = path.resolve(dataRoot, "knowledge");
  if (isInside(agentRoot, knowledgeRoot)) throw new Error("KNOWLEDGE_DIR 不允许位于 AGENT_RUNTIME_DIR 内。");
  if (isInside(dataRoot, agentRoot)) throw new Error("AGENT_RUNTIME_DIR 不允许位于 DATA_DIR 内。");
  return { dataRoot, agentRoot, knowledgeRoot };
}

export function buildChildEnvironment(source, keys, additions = {}) {
  const result = {};
  for (const key of [...platformEnvironmentKeys, ...keys]) {
    const value = source[key];
    if (typeof value === "string" && value.length > 0) result[key] = value;
  }
  return { ...result, ...additions };
}

export const runtimeEnvironmentProfiles = {
  assetHub: (source, additions) => buildChildEnvironment(source, assetHubEnvironmentKeys, additions),
  agentProxy: (source, additions) => buildChildEnvironment(source, agentProxyEnvironmentKeys, additions),
  dsh: (source, additions) => buildChildEnvironment(source, dshEnvironmentKeys, additions),
  gatewayBridge: (source, additions) => buildChildEnvironment(source, gatewayBridgeEnvironmentKeys, additions)
};

export const blockedFromDshEnvironment = ["DATA_DIR", "TRAINING_MEDIA_DIR", "AGENT_RUNTIME_DIR", "AGENT_GATEWAY_TOKEN", "ADMIN_USERNAME", "ADMIN_PASSWORD", "ADMIN_SESSION_SECRET", "TEST_ENV_ENCRYPTION_KEY", "OPENAI_API_KEY"];
