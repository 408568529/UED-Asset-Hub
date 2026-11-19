import path from "node:path";

export const formalDataWritableChildren = Object.freeze(["meta", "knowledge", "vibe-product", "component-spec", "standard-sop", "skill-center", "font-library", "prompt-library", "training", "test-environments", "uploads"]);
export const internalPorts = Object.freeze([3027, 3028, 3080, 3081, 3082]);
export const serviceIdentity = Object.freeze({ account: "NT SERVICE\\UEDAssetHub", sidType: "unrestricted" });
export const credentialConsumers = Object.freeze({
  ADMIN_PASSWORD: ["assetHub"], ADMIN_SESSION_SECRET: ["assetHub", "agentProxy"], DEEPSEEK_API_KEY: ["dsh"], AGENT_GATEWAY_TOKEN: ["assetHub", "gateway"], TEST_ENV_ENCRYPTION_KEY: ["assetHub"]
});
export const productionLayout = Object.freeze({ root: "D:\\UED-Asset-Hub", data: "D:\\UED-Asset-Data", backup: "E:\\UED-Asset-Backup" });

export function isProduction(environment = process.env) { return environment.NODE_ENV === "production"; }
export function validateProductionSessionSecurity(environment = process.env) {
  if (!isProduction(environment)) return { ok: true };
  if (environment.ADMIN_SESSION_SECURE !== "true") return { ok: false, field: "ADMIN_SESSION_SECURE" };
  let origin;
  try { origin = new URL(environment.PUBLIC_ORIGIN || ""); } catch { return { ok: false, field: "PUBLIC_ORIGIN" }; }
  if (origin.protocol !== "https:" || !origin.hostname || origin.username || origin.password) return { ok: false, field: "PUBLIC_ORIGIN" };
  return { ok: true };
}

export function credentialEnvironmentFor(consumer, credentials) {
  const result = {};
  for (const [name, consumers] of Object.entries(credentialConsumers)) if (consumers.includes(consumer) && typeof credentials?.[name] === "string" && credentials[name]) result[name] = credentials[name];
  return result;
}

export function assertWindowsDeploymentPath(value, root) {
  if (typeof value !== "string" || !/^[A-Za-z]:\\/.test(value) || value.startsWith("\\\\")) throw new Error("Windows deployment path is invalid.");
  const normalized = path.win32.normalize(value);
  if (!normalized.toLowerCase().startsWith(`${path.win32.normalize(root).toLowerCase()}\\`) && normalized.toLowerCase() !== path.win32.normalize(root).toLowerCase()) throw new Error("Windows deployment path escapes its expected root.");
  return normalized;
}

export function windowsAclContract() {
  return {
    service: "RX", releases: "RX", current: "RX_TRAVERSE", staging: "NONE", dshSource: "RX", agentRuntime: "MODIFY", assetHubRuntime: "MODIFY", trainingMedia: "MODIFY", logs: "MODIFY_APPEND", config: "READ", credentials: "READ", formalDataRoot: "READ_TRAVERSE", formalDataWritableChildren: "MODIFY", backup: "NONE"
  };
}
