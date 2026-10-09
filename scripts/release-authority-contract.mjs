import { canonicalJson, sha256 } from "./release-artifact-tree.mjs";

const fail = (message) => { throw new Error("LOGICAL_RELEASE_AUTHORITY_INVALID:" + message); };
const hashPattern = /^[a-f0-9]{64}$/u;
const commitPattern = /^[a-f0-9]{40}$/u;
const authorityKeys = ["schemaVersion", "inputAuthorityIdentity", "source", "toolchain", "environment", "dependency", "native", "dsh", "security", "receipts"];
const receiptKeys = ["sourceManifestSha256", "sourceCreationReceiptSha256", "toolchainReceiptSha256", "environmentReceiptSha256", "dependencyReceiptSha256", "nativeManifestSha256", "nativeCreationReceiptSha256", "dshBundleAuthoritySha256", "dshProvenanceSha256", "securityProtectedArtifactSha256"];
const sourceKeys = ["sourceCommit", "sourceTreeSha256", "sourceArchiveSha256", "sourceManifestSha256", "sourceClassification", "productionEligible", "lockfileSha256"];
const toolchainKeys = ["identity", "nodeVersion", "nodeSha256", "npmVersion", "npmCliSha256", "npmDistributionSha256", "architecture", "distribution", "npmPackageJsonSha256", "bundledTarVersion", "bundledTarPackageSha256"];
const environmentKeys = ["profileId", "os", "architecture", "filesystem", "sanitizedEnvironmentPolicy"];
const dependencyKeys = ["lockfileSha256", "nextVersion", "graphIdentity", "byteTreeIdentity", "projectionVersion"];
const nativeKeys = ["nativeSetId", "manifestSha256", "setDigest", "nativeSourceIdentity", "toolchainIdentity", "buildReceiptSha256"];
const dshKeys = ["version", "repository", "commit", "tree", "fingerprint", "bundleSha256", "bundleAuthoritySha256", "provenanceSha256", "materializationMode"];
const securityKeys = ["securitySetId", "authorizationId", "sourceArchiveSha256", "nextVersion", "epochId"];
function exactKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(label + " must be an object");
  const actual = Object.keys(value).sort();
  const keys = [...expected].sort();
  if (actual.length !== keys.length || actual.some((key, index) => key !== keys[index])) fail(label + " has unknown or missing fields");
}
function nonempty(value, label) { if (typeof value !== "string" || !value) fail(label); }
function hash(value, label) { if (!hashPattern.test(value || "")) fail(label); }
function validateProjection(value, keys, hashes, label) {
  exactKeys(value, keys, label);
  for (const key of hashes) hash(value[key], label + "." + key);
}
export function logicalReleaseCore(authority) {
  const { schemaVersion: _schemaVersion, inputAuthorityIdentity: _identity, receipts: _receipts, ...core } = authority;
  return core;
}
export function createLogicalReleaseAuthority(core) {
  const projected = { ...core };
  delete projected.receipts;
  delete projected.inputAuthorityIdentity;
  const body = { schemaVersion: 1, ...projected };
  return { ...body, inputAuthorityIdentity: sha256(Buffer.from(canonicalJson(body), "utf8")), receipts: core.receipts };
}
export function assertLogicalReleaseAuthority(authority, { approvedRootSha256, expected = {} } = {}) {
  exactKeys(authority, authorityKeys, "authority");
  if (authority.schemaVersion !== 1) fail("schema version");
  validateProjection(authority.source, sourceKeys, ["sourceTreeSha256", "sourceArchiveSha256", "sourceManifestSha256", "lockfileSha256"], "source");
  if (!commitPattern.test(authority.source.sourceCommit || "") || typeof authority.source.productionEligible !== "boolean" || typeof authority.source.sourceClassification !== "string" || !authority.source.sourceClassification) fail("source identity");
  const eligibility = { R3_TEST_ONLY_NOT_RELEASE_PROVENANCE: false, SNAPSHOT_WITH_UNCOMMITTED_CHANGES: false, COMMITTED_CLEAN_SOURCE: true }[authority.source.sourceClassification];
  if (eligibility === undefined || authority.source.productionEligible !== eligibility) fail("source classification eligibility");
  validateProjection(authority.toolchain, toolchainKeys, ["nodeSha256", "npmCliSha256", "npmDistributionSha256"], "toolchain");
  if (canonicalJson(authority.toolchain.distribution) !== canonicalJson(approvedApplicationDistribution) || authority.toolchain.npmCliSha256 !== "3ce7cba6f5128dd5f54c98b6a5036b0f850496878cc2e21044b675fe3c594e3e" || authority.toolchain.npmPackageJsonSha256 !== "ca7a6d5da8e9ce79d231c8492399cf5f32da75b5bfca8145f83cc1db4bf2e4c1" || authority.toolchain.bundledTarVersion !== "7.5.22" || authority.toolchain.bundledTarPackageSha256 !== "95c2b5f991679a566e2492169bb26a584b49fd1c61f5d173becc5f09dbdf923f") fail("unapproved application distribution/npm bytes");
  if (authority.toolchain.identity !== stableToolchainIdentity(authority.toolchain) || authority.toolchain.nodeVersion !== "22.23.3" || authority.toolchain.npmVersion !== "10.9.9" || authority.toolchain.architecture !== "x64" || authority.toolchain.nodeSha256 !== "9c9245166b4a8e182e0b797da9c20136117ff24368eaff1fec8343a123c8db0e") fail("unapproved toolchain");
  exactKeys(authority.environment, environmentKeys, "environment");
  for (const [key, value] of Object.entries(authority.environment)) nonempty(value, "environment." + key);
  if (canonicalJson(authority.environment) !== canonicalJson({ profileId: "win11-x64-ntfs-v1", os: "Windows 11", architecture: "x64", filesystem: "NTFS", sanitizedEnvironmentPolicy: "build-env-v1" })) fail("unapproved environment profile");
  validateProjection(authority.dependency, dependencyKeys, ["lockfileSha256", "graphIdentity", "byteTreeIdentity"], "dependency");
  if (authority.dependency.lockfileSha256 !== "5a34f95705fc4c3dcc0289c434f9abdb90ed6dc0fa0c62f78881d356ab06121b" || authority.dependency.lockfileSha256 !== authority.source.lockfileSha256 || authority.dependency.nextVersion !== "15.5.19" || authority.dependency.projectionVersion !== 1) fail("unapproved dependency contract");
  validateProjection(authority.native, nativeKeys, ["manifestSha256", "setDigest", "nativeSourceIdentity", "buildReceiptSha256", "toolchainIdentity"], "native");
  validateProjection(authority.dsh, dshKeys, ["fingerprint", "bundleSha256", "bundleAuthoritySha256", "provenanceSha256"], "DSH");
  if (!/^[a-f0-9]{40}$/u.test(authority.dsh.tree || "")) fail("DSH tree");
  validateProjection(authority.security, securityKeys, ["sourceArchiveSha256"], "security");
  if (authority.dsh.repository !== "https://github.com/deepseek-ai/deepseek-harness.git" || !["fresh-clone", "verified-offline"].includes(authority.dsh.materializationMode)) fail("DSH repository/materialization contract");
  if (authority.dsh.commit !== "b150a551b8d465e31e418e1b2eaf5e79bbb7d28e" || authority.dsh.version !== "0.1.1-rc.2" || authority.dsh.bundleSha256 !== "8863c041a2268c0b50172e3d4899d4a5ba2bc7cc96cfa7057551976ae7e56912" || authority.dsh.bundleAuthoritySha256 !== "a73e12e32f401a89eef5a572d1c516926aecf23d10f5850603b4a2e8a27b7a3e" || authority.dsh.provenanceSha256 !== "7950ecfb277ffd337202e5ba6ca65f9a66c8f0312f809edb7f1e0a449d905176") fail("unapproved DSH authority");
  if (authority.security.sourceArchiveSha256 !== authority.source.sourceArchiveSha256 || authority.dependency.lockfileSha256 !== authority.source.lockfileSha256 || !/^(?:nb1-[a-f0-9]{12}-[a-f0-9]{32}|nb2-[a-f0-9]{16}(?:-[a-f0-9]{16}){2}|nb3-[a-f0-9]{64})$/u.test(authority.native.nativeSetId)) fail("cross-authority binding");
  exactKeys(authority.receipts, receiptKeys, "receipts");
  for (const key of receiptKeys) hash(authority.receipts[key], "receipt " + key);
  const receiptBindings = [
    ["sourceManifestSha256", authority.source.sourceManifestSha256],
    ["nativeManifestSha256", authority.native.manifestSha256],
    ["nativeCreationReceiptSha256", authority.native.buildReceiptSha256],
    ["dshBundleAuthoritySha256", authority.dsh.bundleAuthoritySha256],
    ["dshProvenanceSha256", authority.dsh.provenanceSha256],
  ];
  for (const [key, value] of receiptBindings) if (authority.receipts[key] !== value) fail("receipt projection mismatch: " + key);
  const core = {
    schemaVersion: 1,
    source: authority.source,
    toolchain: authority.toolchain,
    environment: authority.environment,
    dependency: authority.dependency,
    native: authority.native,
    dsh: authority.dsh,
    security: authority.security,
  };
  if (sha256(Buffer.from(canonicalJson(core), "utf8")) !== authority.inputAuthorityIdentity) fail("inputAuthorityIdentity");
  if (!hashPattern.test(approvedRootSha256 || "") || sha256(Buffer.from(canonicalJson(authority), "utf8")) !== approvedRootSha256) fail("independent approved root digest");
  for (const [key, value] of Object.entries(expected)) if (authority[key] !== value) fail("expected root " + key);
  return authority;
}
export function assertApprovedReceiptBytes(bytes, expectedSha256, label) {
  if (!hashPattern.test(expectedSha256 || "") || sha256(bytes) !== expectedSha256) fail("independent receipt SHA mismatch: " + label);
  return bytes;
}

export function stableToolchainIdentity(toolchain) { const { identity: _identity, ...core } = toolchain; return sha256(Buffer.from(canonicalJson(core))); }

export const approvedApplicationDistribution = Object.freeze({ officialChecksumFile: "https://nodejs.org/dist/v22.23.3/SHASUMS256.txt", officialChecksumFileSha256: "4fe99a2ba9d552a6f51c13ed68fb11104cfa5df601aec616be689253a8139e7a", sha256: "2b0ff57b049cda1bbcea2240eec20467018713c1efe1f7360c2681859b90ed71", size: 35574076, url: "https://nodejs.org/dist/v22.23.3/node-v22.23.3-win-x64.zip" });
