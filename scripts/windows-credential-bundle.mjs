import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";

const maximumBytes = 64 * 1024;
const required = { adminPassword: "ADMIN_PASSWORD", adminSessionSecret: "ADMIN_SESSION_SECRET", deepseekApiKey: "DEEPSEEK_API_KEY", gatewayToken: "AGENT_GATEWAY_TOKEN", testEnvironmentEncryptionKey: "TEST_ENV_ENCRYPTION_KEY" };

export async function loadWindowsCredentialBundle({ helperPath, bundlePath }) {
  await Promise.all([access(helperPath), access(bundlePath)]);
  return new Promise((resolve, reject) => {
    const child = spawn(helperPath, ["--operation", "unprotect", "--input", bundlePath], { stdio: ["ignore", "pipe", "ignore"], windowsHide: true });
    let output = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { output += chunk; if (Buffer.byteLength(output) > maximumBytes) child.stdout.destroy(); });
    child.once("error", () => reject(new Error("Credential bundle is unavailable.")));
    child.once("exit", (code) => {
      if (code !== 0) return reject(new Error("Credential bundle cannot be decrypted."));
      try { resolve(parseWindowsCredentialBundle(output)); } catch { reject(new Error("Credential bundle is invalid.")); }
    });
  });
}

export function parseWindowsCredentialBundle(source) {
  const payload = JSON.parse(source);
  if (!payload || payload.schemaVersion !== 1 || !payload.credentials || typeof payload.credentials !== "object") throw new Error("Credential bundle is invalid.");
  const environment = {};
  for (const [field, name] of Object.entries(required)) {
    if (typeof payload.credentials[field] !== "string" || !payload.credentials[field]) throw new Error("Credential bundle is invalid.");
    environment[name] = payload.credentials[field];
  }
  return environment;
}

export function credentialHelperPath(projectDir) { return path.join(projectDir, "native", "windows-dpapi-credential-helper", "bin", "ued-windows-dpapi-credential-helper.exe"); }
