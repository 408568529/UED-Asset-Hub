import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { canonicalJson, sha256 } from "./release-artifact-tree.mjs";
import { validateFrozenSourceManifest } from "./frozen-source-authority.mjs";
import { assertReleaseReceiptProjections } from "./release-receipt-contract.mjs";
if (process.argv.length !== 4) throw new Error("Usage: node verify-release-receipt-projections.mjs <original manifest> <original archive> (read-only)");
const manifestBytes = await readFile(process.argv[2]), archiveBytes = await readFile(process.argv[3]);
const { manifest, projection } = validateFrozenSourceManifest(manifestBytes, archiveBytes);
const h = (value) => sha256(Buffer.from(value)), bytes = (value) => Buffer.from(canonicalJson(value) + "\n");
const artifactCreation = { creatorRunId: "receipt-fixture-creator", createdAt: "2026-09-30T00:00:00.000Z" };
const toolchain = { identity: h("fixture-toolchain") }, environment = { profileId: "fixture-environment" };
const byteTree = [{ path: "example/package.json", size: 2, sha256: h("{}") }];
const dependency = { byteTreeIdentity: sha256(Buffer.from(canonicalJson(byteTree))) };
const dsh = { repository: "fixture-only", version: "fixture", commit: "1".repeat(40), tree: "2".repeat(40), fingerprint: h("dsh"), bundleSha256: h("bundle") };
const provenance = { method: "bundle", sourceCommit: dsh.commit, sourceTree: dsh.tree, sourceFingerprint: dsh.fingerprint, sourceVersion: dsh.version, upstreamCanonicalUrl: dsh.repository, sourceRef: "fixture-ref", verification: { bundleSha256: dsh.bundleSha256 } };
dsh.provenanceSha256 = sha256(bytes(provenance));
const bundle = { schemaVersion: 1, authorityContract: "ued-dsh-self-contained-git-bundle-v1", sourceAuthority: { repository: dsh.repository, ref: "fixture-ref", version: dsh.version, commit: dsh.commit, tree: dsh.tree, fingerprint: dsh.fingerprint }, bundle: { filename: "fixture.bundle", format: "v2", size: 1, sha256: dsh.bundleSha256, includedRefs: [], declaredExternalPrerequisites: 0, reachableObjectClosure: {}, missingParentAvailable: true }, emptyEnvironmentMaterialization: { resultingCommit: dsh.commit, resultingTree: dsh.tree, sourceFingerprint: dsh.fingerprint, cloneExit: 0, destinationWasAbsent: true, workingTreeClean: true, shallow: "false" }, provenance: { evidenceSha256: dsh.provenanceSha256 }, negativeTests: {}, generation: {} };
dsh.bundleAuthoritySha256 = sha256(bytes(bundle));
const records = {
 sourceCreationReceiptSha256: { schemaVersion: 1, kind: "FrozenSourceAuthority", source: projection, baseTree: manifest.baseTree, archiveSize: archiveBytes.length, frozenSourceIdentity: manifest.frozenSourceIdentity, artifactCreation: { creatorRunId: manifest.creationRunId, createdAt: manifest.createdAt } },
 toolchainReceiptSha256: { schemaVersion: 3, kind: "ToolchainReceipt", core: toolchain, originalAuthorityIdentity: "ec99131c76bbadfb40cb8429a0b88d59825156f5a33982526cca3b75d2dcdc3f", artifactCreation, observations: { hostname: "fixture-host", nodeRoot: "fixture-node" } },
 environmentReceiptSha256: { schemaVersion: 2, kind: "EnvironmentReceipt", profile: environment, source: projection, toolchainIdentity: toolchain.identity, artifactCreation, observations: { hostname: "fixture-host", osBuild: "fixture-build", workspace: "fixture-workspace" } },
 dependencyReceiptSha256: { schemaVersion: 1, kind: "DependencyReceipt", core: dependency, source: projection, toolchainIdentity: toolchain.identity, postPruneGraphIdentity: h("graph"), byteTree, artifactCreation },
 dshBundleAuthoritySha256: bundle, dshProvenanceSha256: provenance,
};
const receiptBytes = { sourceManifestSha256: manifestBytes, ...Object.fromEntries(Object.entries(records).map(([key, value]) => [key, bytes(value)])) };
const authority = { source: projection, toolchain, environment, dependency, dsh, receipts: Object.fromEntries(Object.entries(receiptBytes).map(([key, value]) => [key, sha256(value)])) };
assertReleaseReceiptProjections(authority, receiptBytes, archiveBytes);
let checks = 1;
function rejectChange(key, change) {
 const modified = { ...receiptBytes, [key]: bytes(change(structuredClone(records[key]))) };
 // Recompute raw membership to exercise semantic checks beyond self-consistent receipt digests.
 const selected = structuredClone(authority); selected.receipts[key] = sha256(modified[key]);
 assert.throws(() => assertReleaseReceiptProjections(selected, modified, archiveBytes)); checks++;
}
for (const key of ["sourceCreationReceiptSha256", "toolchainReceiptSha256", "environmentReceiptSha256", "dependencyReceiptSha256"]) {
 rejectChange(key, (v) => ({ ...v, unknown: true }));
 rejectChange(key, (v) => ({ ...v, artifactCreation: { ...v.artifactCreation, createdAt: "invalid" } }));
}
rejectChange("sourceCreationReceiptSha256", (v) => ({ ...v, artifactCreation }));
rejectChange("toolchainReceiptSha256", (v) => ({ ...v, core: { ...v.core, hostname: "execution-host" } }));
rejectChange("toolchainReceiptSha256", (v) => ({ ...v, originalAuthorityIdentity: h("other") }));
rejectChange("environmentReceiptSha256", (v) => ({ ...v, toolchainIdentity: h("other") }));
rejectChange("environmentReceiptSha256", (v) => ({ ...v, source: { ...v.source, sourceArchiveSha256: h("other") } }));
rejectChange("dependencyReceiptSha256", (v) => ({ ...v, toolchainIdentity: h("other") }));
rejectChange("dependencyReceiptSha256", (v) => ({ ...v, byteTree: [{ ...v.byteTree[0], path: "../escape" }] }));
rejectChange("dependencyReceiptSha256", (v) => ({ ...v, byteTree: [{ ...v.byteTree[0], sha256: h("changed") }] }));
rejectChange("dependencyReceiptSha256", (v) => ({ ...v, postPruneGraphIdentity: "bad" }));
rejectChange("dshBundleAuthoritySha256", (v) => ({ ...v, bundle: { ...v.bundle, declaredExternalPrerequisites: 1 } }));
rejectChange("dshProvenanceSha256", (v) => ({ ...v, sourceCommit: "3".repeat(40) }));
assert.throws(() => assertReleaseReceiptProjections(authority, { ...receiptBytes, toolchainReceiptSha256: Buffer.from("swapped") }, archiveBytes)); checks++;
assert.equal(sha256(await readFile(process.argv[2])), sha256(manifestBytes));
assert.equal(sha256(await readFile(process.argv[3])), sha256(archiveBytes)); checks += 2;
process.stdout.write(JSON.stringify({ result: "PASS", checks, scope: "read-only original Source plus in-memory typed receipt projection fixtures; no trusted admission, receipt publication or actual toolchain/DSH execution" }) + "\n");
