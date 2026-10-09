import assert from "node:assert/strict";
import crypto from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { bootstrapWindowsToolchain } from "./windows-toolchain-bootstrap.mjs";

const root = await mkdtemp(path.join(os.tmpdir(), "ued-toolchain-fixture-"));
const sidecar = path.join(process.cwd(), "service/windows/node-22.23.3-x64.artifact.json");
const expected = "9c9245166b4a8e182e0b797da9c20136117ff24368eaff1fec8343a123c8db0e";
const npmBytes = Buffer.from("fixture-npm");
const npmCliSha256 = crypto.createHash("sha256").update(npmBytes).digest("hex");
const npmDistributionSha256 = crypto.createHash("sha256").update(JSON.stringify([{ path: "bin/npm-cli.js", sha256: npmCliSha256, size: npmBytes.length }])).digest("hex");
const authority = { toolchain: { nodeVersion: "22.23.3", nodeSha256: expected, npmVersion: "10.9.9", npmCliSha256, npmDistributionSha256, architecture: "x64" } };
async function fixture({ missingNode = false, nodeHash = expected, nodeVersion = "v22.23.3", npmVersion = "10.9.9", acquireFails = false } = {}) {
  const acquire = async ({ destination }) => { if (acquireFails) throw new Error("acquisition failed"); await mkdir(path.dirname(destination), { recursive: true }); await writeFile(destination, "fixture"); return { path: destination, sha256: "a".repeat(64), evidence: { source: "fixture" } }; };
  const extract = async ({ destination }) => { if (missingNode) return destination; await mkdir(path.join(destination, "node_modules", "npm", "bin"), { recursive: true }); await writeFile(path.join(destination, "node.exe"), "fixture-node"); await writeFile(path.join(destination, "node_modules", "npm", "bin", "npm-cli.js"), npmBytes); return destination; };
  const run = async (_exe, args) => args.length === 1 ? nodeVersion : npmVersion;
  return bootstrapWindowsToolchain({ runId: "fixture-run", runStaging: path.join(root, crypto.randomUUID()), sidecarPath: sidecar, acquire, extract, run, authority, hash: async (file) => path.basename(file) === "node.exe" ? nodeHash : crypto.createHash("sha256").update(await readFile(file)).digest("hex") });
}
try {
  const resolved = await fixture(); assert.equal(resolved.nodeVersion, "v22.23.3"); assert.equal(resolved.npmVersion, "10.9.9"); assert.match(resolved.nodeExecutable, /node\.exe$/u);
  for (const options of [{ missingNode: true }, { nodeHash: "b".repeat(64) }, { nodeVersion: "v22.23.2" }, { npmVersion: "10.9.8" }, { nodeVersion: "v24.18.0" }, { npmVersion: "8.12.2" }, { acquireFails: true }]) await assert.rejects(() => fixture(options));
  await assert.rejects(() => bootstrapWindowsToolchain({ runId: "fixture-run", runStaging: root, sidecarPath: path.join(root, "missing.json"), acquire: async () => ({}), extract: async () => root, run: async () => "" }));
  console.log("[WindowsToolchainBootstrap] acquisition, identity, no-fallback, and PATH-shadow contract: PASS");
} finally { await rm(root, { recursive: true, force: true }); }
