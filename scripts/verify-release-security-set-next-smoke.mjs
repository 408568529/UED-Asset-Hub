import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createReleaseSecuritySet, materializeNextSecurityCache, verifyNextSecurityAdoption } from "./release-security-set.mjs";
import { supportedNextVersion } from "./release-security-set.mjs";

const projectRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const nextPackage = await import(path.join(projectRoot, "node_modules", "next", "package.json"), { with: { type: "json" } });
assert.equal(nextPackage.default.version, supportedNextVersion);
const root = await mkdtemp(path.join(os.tmpdir(), "ued-next-security-smoke-"));
const workspace = path.join(root, "workspace");
const sourceCommit = "a".repeat(40);
const sourceArchiveSha256 = "b".repeat(64);
const authorizationId = "phase1-next-smoke";
const now = Date.now();
const securitySet = createReleaseSecuritySet({ sourceCommit, sourceArchiveSha256, authorizationId, now });

function runBuild() {
  return new Promise((resolve, reject) => {
    const command = path.join(projectRoot, "node_modules", "next", "dist", "bin", "next");
    const child = spawn(process.execPath, [command, "build"], { cwd: workspace, env: { PATH: process.env.PATH, HOME: root, CI: "1", NEXT_TELEMETRY_DISABLED: "1", NODE_ENV: "production" }, stdio: ["ignore", "ignore", "ignore"] });
    child.once("error", () => reject(new Error("NEXT_SECURITY_ADAPTER_SMOKE_BUILD_FAILED")));
    child.once("close", (code) => code === 0 ? resolve() : reject(new Error(`NEXT_SECURITY_ADAPTER_SMOKE_BUILD_FAILED:${code}`)));
  });
}

let stage = "FIXTURE_SETUP";
try {
  await mkdir(path.join(workspace, "app"), { recursive: true });
  await symlink(path.join(projectRoot, "node_modules"), path.join(workspace, "node_modules"), "dir");
  await writeFile(path.join(workspace, "package.json"), JSON.stringify({ name: "ued-security-set-smoke", version: "1.0.0", private: true, dependencies: { next: supportedNextVersion, react: "19.2.7", "react-dom": "19.2.7" } }));
  await writeFile(path.join(workspace, "app", "layout.js"), "export default function RootLayout({ children }) { return <html><body>{children}</body></html>; }\n");
  await writeFile(path.join(workspace, "app", "page.js"), "export default function Home() { return <main>security-set-smoke</main>; }\n");
  await materializeNextSecurityCache({ workspace, securitySet, nextVersion: supportedNextVersion, sourceCommit, sourceArchiveSha256, authorizationId, now });
  stage = "NEXT_BUILD";
  await runBuild();
  stage = "ADOPTION_CHECK";
  const adoption = await verifyNextSecurityAdoption({ workspace, securitySet, options: { sourceCommit, sourceArchiveSha256, authorizationId, now: Date.now(), nextVersion: supportedNextVersion } });
  assert.equal(adoption.previewAdopted, true);
  assert.equal(adoption.serverActionsAdopted, true);
  process.stdout.write("[Release Security Set] isolated Next 15.5.19 build adoption smoke: PASS\n");
} catch (error) {
  const message = error instanceof Error && (/^NEXT_SECURITY_ADAPTER_SMOKE_BUILD_FAILED:\d+$/u.test(error.message) || /^SECURITY_[A-Z0-9_:-]+$/u.test(error.message)) ? error.message : "CONTRACT_CHECK_FAILED";
  process.stderr.write(`[Release Security Set] isolated Next build adoption smoke: FAIL:${stage}:${message}\n`);
  process.exitCode = 1;
} finally {
  await rm(root, { recursive: true, force: true });
}
