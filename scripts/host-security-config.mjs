import { validateProductionSessionSecurity } from "./windows-security-foundation.mjs";
import os from "node:os";
import path from "node:path";
import { realpathSync } from "node:fs";
import { isLocalDistributionEnvironment } from "./local-distribution-config.mjs";

const invalidPasswordPatterns = [/(?:example|sample|placeholder|changeme)/i, /^<.*>$/u, /请设置/u];
const knownDefaultPasswords = new Set(["admin123", "password", "password123", "123456", "12345678"]);

export class HostSecurityConfigError extends Error {
  constructor(reasonCode, field) {
    super(reasonCode === "host_security_config_missing" ? "Host security configuration is missing." : "Host security configuration is invalid.");
    this.name = "HostSecurityConfigError";
    this.reasonCode = reasonCode;
    this.field = field;
  }
}

function readRequired(environment, field) {
  const value = environment[field];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new HostSecurityConfigError("host_security_config_missing", field);
  }
  return value;
}

function invalid(field) {
  throw new HostSecurityConfigError("host_security_config_invalid", field);
}

function isPlaceholder(value) {
  return invalidPasswordPatterns.some((pattern) => pattern.test(value));
}

function isLocalSyntheticTestEnvironment(environment) {
  if (environment.UED_LOCAL_TEST_MODE !== "true") return false;
  let origin;
  try { origin = new URL(environment.PUBLIC_ORIGIN || ""); } catch { return false; }
  const loopback = new Set(["127.0.0.1", "[::1]"]);
  if (origin.protocol !== "http:" || !loopback.has(origin.hostname) || !loopback.has(environment.HOST_BIND_HOST || "")) return false;
  const dataDir = path.resolve(environment.DATA_DIR || "");
  const tempRoots = [os.tmpdir(), environment.TMPDIR].filter(Boolean).map((root) => path.resolve(root));
  return tempRoots.some((root) => {
    const relative = path.relative(root, dataDir);
    return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
  });
}

// Explicit Mac demo opt-in: persistent DATA is allowed only on the loopback edge.
// Canonical paths prevent a symlink from redirecting the approved DATA child.
function isPersistentMacDemoEnvironment(environment) {
  if (process.platform !== "darwin" || environment.UED_LOCAL_DEMO_MODE !== "true") return false;
  if (environment.HOST_BIND_HOST !== "127.0.0.1") return false;
  let origin;
  try { origin = new URL(environment.PUBLIC_ORIGIN || ""); } catch { return false; }
  if (origin.protocol !== "http:" || origin.hostname !== "127.0.0.1" || origin.username || origin.password
      || origin.pathname !== "/" || origin.search || origin.hash
      || origin.port !== environment.HOST_PORT) return false;
  const root = environment.UED_LOCAL_DEMO_ROOT;
  const data = environment.DATA_DIR;
  if (!root || !data || !path.isAbsolute(root) || !path.isAbsolute(data)) return false;
  try {
    return realpathSync(root) === path.resolve(root)
      && realpathSync(data) === path.join(realpathSync(root), "hub-data")
      && path.resolve(data) === path.join(path.resolve(root), "hub-data");
  } catch { return false; }
}

export function resolveHostSecurityConfig(environment = process.env) {
  const productionSession = validateProductionSessionSecurity(environment);
  const localDistribution = isLocalDistributionEnvironment(environment);
  if (environment.UED_LOCAL_DISTRIBUTION_MODE && !localDistribution) invalid("UED_LOCAL_DISTRIBUTION_MODE");
  const localSyntheticTest = isLocalSyntheticTestEnvironment(environment);
  const localHttpDemo = localDistribution || localSyntheticTest || isPersistentMacDemoEnvironment(environment);
  if (!productionSession.ok && !(localHttpDemo && ["ADMIN_SESSION_SECURE", "PUBLIC_ORIGIN"].includes(productionSession.field))) invalid(productionSession.field);
  const { username, sessionSecret } = resolveProxySessionConfig(environment);
  const password = readRequired(environment, "ADMIN_PASSWORD");
  const normalizedPassword = password.trim();
  if ((knownDefaultPasswords.has(normalizedPassword.toLowerCase()) && !localSyntheticTest) || isPlaceholder(normalizedPassword)) invalid("ADMIN_PASSWORD");
  if (Buffer.byteLength(sessionSecret, "utf8") < 32 || isPlaceholder(sessionSecret) || sessionSecret === username || sessionSecret === password || sessionSecret === `${username}:${password}:ued-asset-hub`) invalid("ADMIN_SESSION_SECRET");
  return { username, password, sessionSecret };
}

export function resolveProxySessionConfig(environment = process.env) {
  const username = environment.ADMIN_USERNAME?.trim() || "admin";
  const sessionSecret = readRequired(environment, "ADMIN_SESSION_SECRET");
  if (Buffer.byteLength(sessionSecret, "utf8") < 32 || isPlaceholder(sessionSecret) || sessionSecret === username) invalid("ADMIN_SESSION_SECRET");
  return { username, sessionSecret };
}

export function isHostSecurityConfigError(error) {
  return error instanceof HostSecurityConfigError;
}
