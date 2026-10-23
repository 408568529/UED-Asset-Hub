import { realpath } from "node:fs/promises";
import path from "node:path";

const platformEnvironmentKeys = ["PATH", "Path", "PATHEXT", "SystemRoot", "SYSTEMROOT", "WINDIR", "ComSpec", "TMP", "TEMP", "TMPDIR", "HOME", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "PROGRAMDATA", "LANG", "LC_ALL", "LC_CTYPE", "TERM", "USER", "LOGNAME", "NODE_OPTIONS", "NODE_EXTRA_CA_CERTS", "SSL_CERT_FILE", "SSL_CERT_DIR"];
const assetHubEnvironmentKeys = ["AGENT_PUBLIC_ACCESS", "NODE_ENV", "MICRO_STANDARD_ROOT", "DATA_DIR", "ASSET_HUB_RUNTIME_DIR", "TRAINING_MEDIA_DIR", "HALDUR_DESIGN_SKILL_ROOT", "HALDUR_DESIGN_SKILL_RUNTIME_ROOT", "ADMIN_USERNAME", "ADMIN_PASSWORD", "ADMIN_SESSION_SECRET", "ADMIN_SESSION_SECURE", "PUBLIC_ORIGIN", "HOST_BIND_HOST", "UED_LOCAL_TEST_MODE", "UED_LOCAL_DEMO_MODE", "UED_LOCAL_DEMO_ROOT", "HOST_PORT", "TEST_ENV_ENCRYPTION_KEY", "OPENAI_API_KEY", "OPENAI_BASE_URL", "OPENAI_MODEL", "NEXT_PUBLIC_API_BASE_URL", "NEXT_PUBLIC_USE_MOCK", "NEXT_PUBLIC_STORAGE_PROVIDER", "NEXT_PUBLIC_OSS_BUCKET", "NEXT_PUBLIC_OSS_REGION", "AGENT_ENABLED", "AGENT_GATEWAY_TOKEN", "DSH_BASE_URL"];
const agentProxyEnvironmentKeys = ["AGENT_PUBLIC_ACCESS", "PUBLIC_ORIGIN", "NODE_ENV", "DSH_BASE_URL", "AGENT_PROXY_PORT", "AGENT_PROXY_HOST", "AGENT_PROXY_BASE_PATH", "AGENT_RUNTIME_DIR", "AGENT_WORKSPACE_ROOT", "ADMIN_USERNAME", "ADMIN_SESSION_SECRET"];
const dshEnvironmentKeys = ["NODE_ENV", "DSH_HOME", "DSH_TELEMETRY_DISABLED", "DSH_GENUI_ARTIFACT_ROOT", "AGENT_WORKSPACE_ROOT", "ASSET_HUB_MCP_URL", "DEEPSEEK_API_KEY", "CHOKIDAR_USEPOLLING"];
const gatewayBridgeEnvironmentKeys = ["NODE_ENV", "KNOWLEDGE_GATEWAY_MCP_PORT", "KNOWLEDGE_GATEWAY_INTERNAL_URL", "AGENT_GATEWAY_TOKEN"];
assetHubEnvironmentKeys.push("UED_LOCAL_DISTRIBUTION_MODE", "UED_LOCAL_DISTRIBUTION_ROOT", "UED_LOCAL_DISTRIBUTION_PACKAGE");

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

export const blockedFromDshEnvironment = ["MICRO_STANDARD_ROOT", "DATA_DIR", "TRAINING_MEDIA_DIR", "AGENT_RUNTIME_DIR", "AGENT_GATEWAY_TOKEN", "ADMIN_USERNAME", "ADMIN_PASSWORD", "ADMIN_SESSION_SECRET", "TEST_ENV_ENCRYPTION_KEY", "OPENAI_API_KEY"];
export const blockedFromAgentProxyEnvironment = ["MICRO_STANDARD_ROOT", "ADMIN_PASSWORD", "DATA_DIR", "AGENT_GATEWAY_TOKEN", "TRAINING_MEDIA_DIR", "TEST_ENV_ENCRYPTION_KEY", "RUNTIME_CONTROL_TOKEN", "DEEPSEEK_API_KEY", "OPENAI_API_KEY"];
