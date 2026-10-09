import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";
export { parseWindowsCredentialBundle } from "./windows-credential-schema.mjs";
import { parseWindowsCredentialBundle } from "./windows-credential-schema.mjs";

const maximumBytes = 64 * 1024;

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


export function credentialHelperPath(projectDir) { return path.join(projectDir, "native", "windows-dpapi-credential-helper", "bin", "ued-windows-dpapi-credential-helper.exe"); }
