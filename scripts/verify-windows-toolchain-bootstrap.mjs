import assert from "node:assert/strict";
import crypto from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { bootstrapWindowsToolchain } from "./windows-toolchain-bootstrap.mjs";

const root = await mkdtemp(path.join(os.tmpdir(), "ued-toolchain-fixture-"));
const sidecar = path.join(process.cwd(), "service/windows/node-22.23.2-x64.artifact.json");
const expected = "0d0f5e39f9f3d9587bc19f73eab3c2c9c4903fd02d6dbf9c853dd81b3d95fad4";
async function fixture({ missingNode = false, nodeHash = expected, nodeVersion = "v22.23.2", npmVersion = "10.9.8", acquireFails = false } = {}) {
  const acquire = async ({ destination }) => { if (acquireFails) throw new Error("acquisition failed"); await mkdir(path.dirname(destination), { recursive: true }); await writeFile(destination, "fixture"); return { path: destination, sha256: "a".repeat(64), evidence: { source: "fixture" } }; };
  const extract = async ({ destination }) => { if (missingNode) return destination; await mkdir(path.join(destination, "node_modules", "npm", "bin"), { recursive: true }); await writeFile(path.join(destination, "node.exe"), "fixture-node"); await writeFile(path.join(destination, "node_modules", "npm", "bin", "npm-cli.js"), "fixture-npm"); return destination; };
  const run = async (_exe, args) => args.length === 1 ? nodeVersion : npmVersion;
  return bootstrapWindowsToolchain({ runId: "fixture-run", runStaging: path.join(root, crypto.randomUUID()), sidecarPath: sidecar, acquire, extract, run, hash: async () => nodeHash });
}
try {
  const resolved = await fixture(); assert.equal(resolved.nodeVersion, "v22.23.2"); assert.equal(resolved.npmVersion, "10.9.8"); assert.match(resolved.nodeExecutable, /node\.exe$/u);
  for (const options of [{ missingNode: true }, { nodeHash: "b".repeat(64) }, { nodeVersion: "v24.18.0" }, { npmVersion: "8.12.2" }, { acquireFails: true }]) await assert.rejects(() => fixture(options));
  await assert.rejects(() => bootstrapWindowsToolchain({ runId: "fixture-run", runStaging: root, sidecarPath: path.join(root, "missing.json"), acquire: async () => ({}), extract: async () => root, run: async () => "" }));
  console.log("[WindowsToolchainBootstrap] acquisition, identity, no-fallback, and PATH-shadow contract: PASS");
} finally { await rm(root, { recursive: true, force: true }); }
