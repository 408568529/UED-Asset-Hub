import "server-only";
import path from "node:path";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

export const DSH_VERSION = "0.1.0-rc.5";
export const DSH_COMMIT = "47f943859bef60e4160492346772ded9b24f765a";

function resolveDshBaseUrl() {
  const value = process.env.DSH_BASE_URL || "http://127.0.0.1:3080";

  try {
    const url = new URL(value);
    if (url.protocol !== "http:" || !LOOPBACK_HOSTS.has(url.hostname)) return null;
    return url;
  } catch {
    return null;
  }
}

export const agentRuntimeConfig = {
  enabled: process.env.AGENT_ENABLED !== "false",
  dshBaseUrl: resolveDshBaseUrl(),
  workspacePath: process.env.AGENT_RUNTIME_DIR?.trim() ? path.join(process.env.AGENT_RUNTIME_DIR.trim(), "workspaces", "default") : null
};
