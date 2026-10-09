import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { canonicalJson, sha256 } from "./release-artifact-tree.mjs";
import { assertLogicalReleaseAuthority, createLogicalReleaseAuthority, stableToolchainIdentity, approvedApplicationDistribution } from "./release-authority-contract.mjs";
import { assertApprovalSelection, approvalPolicyVersion } from "./release-authority-approval.mjs";
import { identity } from "./release-json-contract.mjs";
import { assertExecutionBinding, createExecutionBinding } from "./release-execution-binding.mjs";
import { compareReleaseByteTrees } from "./release-byte-comparison.mjs";

const hash = (n) => sha256(Buffer.from(String(n)));
const receiptKeys = ["sourceManifestSha256", "sourceCreationReceiptSha256", "toolchainReceiptSha256", "environmentReceiptSha256", "dependencyReceiptSha256", "nativeManifestSha256", "nativeCreationReceiptSha256", "dshBundleAuthoritySha256", "dshProvenanceSha256", "securityProtectedArtifactSha256"];
const receipts = Object.fromEntries(receiptKeys.map((key, index) => [key, hash(index + 1)]));
receipts.sourceManifestSha256 = hash(3);
receipts.nativeManifestSha256 = hash(9);
receipts.nativeCreationReceiptSha256 = hash(12);
receipts.dshBundleAuthoritySha256 = "a73e12e32f401a89eef5a572d1c516926aecf23d10f5850603b4a2e8a27b7a3e";
receipts.dshProvenanceSha256 = "7950ecfb277ffd337202e5ba6ca65f9a66c8f0312f809edb7f1e0a449d905176";
const authority = createLogicalReleaseAuthority({
  source: { sourceCommit: "1".repeat(40), sourceTreeSha256: hash(1), sourceArchiveSha256: hash(2), sourceManifestSha256: hash(3), sourceClassification: "COMMITTED_CLEAN_SOURCE", productionEligible: true, lockfileSha256: "5a34f95705fc4c3dcc0289c434f9abdb90ed6dc0fa0c62f78881d356ab06121b" },
  toolchain: { identity: "ec99131c76bbadfb40cb8429a0b88d59825156f5a33982526cca3b75d2dcdc3f", nodeVersion: "22.23.3", nodeSha256: "9c9245166b4a8e182e0b797da9c20136117ff24368eaff1fec8343a123c8db0e", npmVersion: "10.9.9", npmCliSha256: hash(4), npmDistributionSha256: hash(5), architecture: "x64" },
  environment: { profileId: "win11-x64-ntfs-v1", os: "Windows 11", architecture: "x64", filesystem: "NTFS", sanitizedEnvironmentPolicy: "build-env-v1" },
  dependency: { lockfileSha256: "5a34f95705fc4c3dcc0289c434f9abdb90ed6dc0fa0c62f78881d356ab06121b", nextVersion: "15.5.19", graphIdentity: hash(6), byteTreeIdentity: hash(7), projectionVersion: 1 },
  native: { nativeSetId: "nb3-" + hash(8), manifestSha256: hash(9), setDigest: hash(10), nativeSourceIdentity: hash(11), toolchainIdentity: "ec99131c76bbadfb40cb8429a0b88d59825156f5a33982526cca3b75d2dcdc3f", buildReceiptSha256: hash(12) },
  dsh: { version: "0.1.1-rc.2", repository: "https://github.com/deepseek-ai/deepseek-harness.git", commit: "b150a551b8d465e31e418e1b2eaf5e79bbb7d28e", tree: "53915efe4e2126cc7779b73dfc8a3bcec5318c44", fingerprint: "1e6c2e8009679997ee5de23d4976f6060bea53e6670a3e6b07f022251bf43584", bundleSha256: "8863c041a2268c0b50172e3d4899d4a5ba2bc7cc96cfa7057551976ae7e56912", bundleAuthoritySha256: "a73e12e32f401a89eef5a572d1c516926aecf23d10f5850603b4a2e8a27b7a3e", provenanceSha256: "7950ecfb277ffd337202e5ba6ca65f9a66c8f0312f809edb7f1e0a449d905176", materializationMode: "fresh-clone" },
  security: { securitySetId: "2".repeat(32), authorizationId: "formal-v5-authority", sourceArchiveSha256: hash(2), nextVersion: "15.5.19", epochId: "epoch-v5" },
  receipts,
});
Object.assign(authority.toolchain, { distribution: approvedApplicationDistribution, npmCliSha256: "3ce7cba6f5128dd5f54c98b6a5036b0f850496878cc2e21044b675fe3c594e3e", npmPackageJsonSha256: "ca7a6d5da8e9ce79d231c8492399cf5f32da75b5bfca8145f83cc1db4bf2e4c1", bundledTarVersion: "7.5.22", bundledTarPackageSha256: "95c2b5f991679a566e2492169bb26a584b49fd1c61f5d173becc5f09dbdf923f" });
authority.toolchain.identity = stableToolchainIdentity(authority.toolchain);
Object.assign(authority, createLogicalReleaseAuthority(authority));
const approvedRootSha256 = sha256(Buffer.from(canonicalJson(authority), "utf8"));
assert.equal(assertLogicalReleaseAuthority(authority, { approvedRootSha256 }), authority);

// Pure Approval selection fixtures exercise real LRA schema and all ten raw membership slots.
// This does not grant protected-store admission or publish an Approval.
const authorityBytes = Buffer.from(canonicalJson(authority) + "\n");
const selectedBytes = Object.fromEntries(receiptKeys.map((key) => [key, Buffer.from("fixture-" + key)]));
// The immutable DSH raw identities are fixed by the live contract; use the actual LRA and
// reject every swapped slot before parsing the domain objects rather than inventing new pins.
const approvalBody = { schemaVersion: 2, policyVersion: approvalPolicyVersion, logicalReleaseAuthoritySha256: sha256(authorityBytes), inputAuthorityIdentity: authority.inputAuthorityIdentity, approvedReceipts: authority.receipts, approvalProvenance: { method: "trusted-operator-review-v1", operatorPrincipal: "S-1-5-21-1-2-3-1001", reviewedAt: "2026-09-30T00:00:00.000Z" } };
const approval = { ...approvalBody, approvalIdentity: identity(approvalBody) };
for (const key of receiptKeys) {
  const changed = { ...approvalBody, approvedReceipts: { ...authority.receipts, [key]: hash("unapproved-" + key) } };
  assert.throws(() => assertApprovalSelection({ ...changed, approvalIdentity: identity(changed) }, authorityBytes, selectedBytes), /Approval LRA membership/u);
}
assert.throws(() => assertApprovalSelection(approval, authorityBytes, selectedBytes), /Approval actual receipt/u);
assert.throws(() => assertApprovalSelection(null, authorityBytes, selectedBytes));
assert.throws(() => assertApprovalSelection(approval, Buffer.from(canonicalJson({ ...authority, inputAuthorityIdentity: hash("other") }) + "\n"), selectedBytes));

const bindingCore = {
  schemaVersion: 1, experimentId: "experiment-v5", executionRunId: "run-v5-a", candidateLabel: "A",
  inputAuthorityIdentity: authority.inputAuthorityIdentity, receipts,
  bindings: { nativeRunBindingSha256: hash(20), dshMode: "bundle", dshRunBindingSha256: null },
  locators: {
    stagingRoot: "C:\\staging\\experiment-v5",
    canonicalWorkspace: "C:\\staging\\experiment-v5\\workspaces\\a",
    tempRoot: "C:\\staging\\experiment-v5\\temp\\a",
    outputRoot: "C:\\staging\\experiment-v5\\output\\a",
    evidenceRoot: "C:\\staging\\experiment-v5\\evidence\\a",
    sourceArtifact: "C:\\staging\\experiment-v5\\source\\source.tar",
    nativeRoot: "C:\\staging\\experiment-v5\\native\\nb3",
    dshMaterializationRoot: "C:\\staging\\experiment-v5\\dsh\\a",
    toolchainRoot: "C:\\staging\\experiment-v5\\toolchain",
    securityArtifact: "C:\\staging\\experiment-v5\\security\\protected.bin",
  },
  permission: { experimentPermissionDigest: hash(21), labelBudget: 1, resumePolicy: "never", expectedPhase: "prepare", journalIdentity: hash(22) },
};
const expected = {
  experimentId: bindingCore.experimentId, executionRunId: bindingCore.executionRunId, candidateLabel: bindingCore.candidateLabel,
  inputAuthorityIdentity: authority.inputAuthorityIdentity, phase: "prepare", receipts,
  bindings: bindingCore.bindings, journal: { identity: hash(22), executionRunId: "run-v5-a", completedPhase: null, usedBudget: 0 },
};
const binding = createExecutionBinding(bindingCore, expected);
assert.equal(assertExecutionBinding(binding, expected), binding);
for (const changed of [
  { ...expected, executionRunId: "run-v5-b" },
  { ...expected, candidateLabel: "B" },
  { ...expected, phase: "build" },
  { ...expected, inputAuthorityIdentity: hash(23) },
  { ...expected, receipts: { ...receipts, sourceManifestSha256: hash(24) } },
  { ...expected, bindings: { ...bindingCore.bindings, nativeRunBindingSha256: hash(25) } },
  { ...expected, journal: { ...expected.journal, completedPhase: "prepare" } },
]) assert.throws(() => assertExecutionBinding(binding, changed), /EXECUTION_BINDING_INVALID/u);
const tamperedAuthority = structuredClone(authority);
tamperedAuthority.environment.hostname = "host-a";
assert.throws(() => assertLogicalReleaseAuthority(tamperedAuthority, { approvedRootSha256 }), /LOGICAL_RELEASE_AUTHORITY_INVALID/u);
assert.throws(() => assertLogicalReleaseAuthority(authority, { approvedRootSha256: hash(26) }), /LOGICAL_RELEASE_AUTHORITY_INVALID/u);

const temp = await mkdtemp(path.join(os.tmpdir(), "ued-release-byte-comparison-"));
try {
  const a = path.join(temp, "a"), b = path.join(temp, "b"), evidence = path.join(temp, "evidence", "first.json");
  await Promise.all([mkdir(a), mkdir(b)]);
  await Promise.all([
    writeFile(path.join(a, "deployment.manifest.json"), "{ \"v\": 1 }\n"),
    writeFile(path.join(b, "deployment.manifest.json"), "{\"v\":1}\n"),
    writeFile(path.join(a, "deployment.manifest.sha256"), "sidecar\n"),
    writeFile(path.join(b, "deployment.manifest.sha256"), "sidecar\n"),
  ]);
  await assert.rejects(compareReleaseByteTrees(a, b, { evidencePath: evidence }), /BYTE_TREE_MISMATCH/u);
  assert.match(await (await import("node:fs/promises")).readFile(evidence, "utf8"), /deployment\.manifest\.json/u);
  await writeFile(path.join(b, "deployment.manifest.json"), await (await import("node:fs/promises")).readFile(path.join(a, "deployment.manifest.json")));
  assert.equal((await compareReleaseByteTrees(a, b)).equal, true);
  await writeFile(path.join(b, "deployment.manifest.sha256"), "changed\n");
  await assert.rejects(compareReleaseByteTrees(a, b), /deployment\.manifest\.sha256/u);
} finally {
  await rm(temp, { recursive: true, force: true });
}
process.stdout.write("release authority boundary contracts: PASS\n");
