import assert from "node:assert/strict";
import path from "node:path";
import { assertApprovedNodeArtifactSha256, assertApprovedNodeNpmVersions, assertContained, buildContract } from "./windows-release-constructor.mjs";

const approvedHash = "9c9245166b4a8e182e0b797da9c20136117ff24368eaff1fec8343a123c8db0e";
assert.equal(buildContract.nodeVersion, "22.23.3");
assert.equal(buildContract.npmVersion, "10.9.9");
assert.equal(buildContract.nodeArtifactSha256, approvedHash);
assert.doesNotThrow(() => assertApprovedNodeArtifactSha256(approvedHash));
assert.doesNotThrow(() => assertApprovedNodeNpmVersions("22.23.3", "10.9.9"));

assert.throws(() => assertApprovedNodeNpmVersions("22.23.2", "10.9.9"), /version mismatch/u);
assert.throws(() => assertApprovedNodeNpmVersions("22.23.3", "10.9.8"), /version mismatch/u);
assert.throws(() => assertApprovedNodeNpmVersions("24.18.0", "10.9.9"), /version mismatch/u);
assert.throws(() => assertApprovedNodeArtifactSha256("0d0f5e39f9f3d9587bc19f73eab3c2c9c4903fd02d6dbf9c853dd81b3d95fad4"), /SHA-256 mismatch/u);
assert.throws(() => assertApprovedNodeArtifactSha256("0".repeat(64)), /SHA-256 mismatch/u);

const stagingRoot = process.platform === "win32" ? "D:\\UED-Asset-Hub-Staging" : path.join(process.cwd(), "isolated-staging");
const systemNodeRoot = process.platform === "win32" ? "D:\\node" : path.join(process.cwd(), "system-node");
assert.doesNotThrow(() => assertContained(stagingRoot, path.join(stagingRoot, "staging", "toolchains", "approved"), "staged Node root"));
assert.throws(() => assertContained(stagingRoot, systemNodeRoot, "staged Node root"), /strict child/u);
console.log("[ConstructorToolchainContract] exact approved identity and old/system/wrong-identity rejection: PASS");
