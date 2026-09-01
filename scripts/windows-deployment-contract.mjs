import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, realpath, rename, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { artifactDigestAlgorithm, artifactFilesMatch, assertArtifactPathSet, calculateReleaseArtifactSet, canonicalJson } from "./release-artifact-tree.mjs";

const manifestFile = "deployment.manifest.json";
const manifestSidecar = "deployment.manifest.sha256";
const releaseIdPattern = /^v\d+\.\d+\.\d+(?:[-.][a-z0-9]+)*-r2-[0-9a-f]{12}-[0-9a-f]{32}$/;
const secretPattern = /(api.?key|password|secret|token|private.?key|pfx)/i;
const requiredComponents = ["node", "winsw", "windowsJobHelper", "windowsPipeSecurityAdapter", "windowsDpapiHelper", "reverseProxy", "productionConfig"];
const manifestKeys = ["artifactSet", "assetHub", "build", "components", "dsh", "formalData", "manifestSchemaVersion", "operationalStorage", "releaseId", "releaseIdentitySchemaVersion", "requiredEvidenceTypes", "runtime"];

export function createReleaseId({ version, commit, artifactDigest }) {
  if (!/^\d+\.\d+\.\d+(?:[-.][a-z0-9]+)*$/i.test(version) || !/^[0-9a-f]{40}$/.test(commit) || !/^[0-9a-f]{64}$/.test(artifactDigest)) throw new Error("Deployment release identity is invalid.");
  return `v${version}-r2-${commit.slice(0, 12)}-${artifactDigest.slice(0, 32)}`;
}

export async function sha256File(file) { return createHash("sha256").update(await readFile(file)).digest("hex"); }
export function manifestDigest(manifest) { return createHash("sha256").update(canonicalJson(manifest)).digest("hex"); }

function assertExactKeys(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} is invalid.`);
  const actual = Object.keys(value).sort();
  if (actual.length !== keys.length || actual.some((key, index) => key !== [...keys].sort()[index])) throw new Error(`${label} has unknown or missing fields.`);
}

function assertNoSecrets(value, key = "") {
  if (secretPattern.test(key)) throw new Error("Deployment manifest contains a prohibited secret-like field.");
  if (Array.isArray(value)) return value.forEach((item) => assertNoSecrets(item));
  if (value && typeof value === "object") for (const [name, item] of Object.entries(value)) assertNoSecrets(item, name);
}

function assertHash(value, label) {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/.test(value)) throw new Error(`${label} must be a lowercase SHA-256.`);
}

function assertCommit(value, label) {
  if (typeof value !== "string" || !/^[0-9a-f]{40}$/.test(value)) throw new Error(`${label} must be a lowercase full commit.`);
}

function validateArtifactSet(artifactSet) {
  assertExactKeys(artifactSet, ["algorithm", "digest", "fileCount", "files", "totalBytes"], "artifactSet");
  if (artifactSet.algorithm !== artifactDigestAlgorithm || !Number.isSafeInteger(artifactSet.fileCount) || !Number.isSafeInteger(artifactSet.totalBytes) || !Array.isArray(artifactSet.files) || artifactSet.fileCount !== artifactSet.files.length) throw new Error("artifactSet is invalid.");
  assertHash(artifactSet.digest, "artifactSet.digest");
  let bytes = 0;
  for (const file of artifactSet.files) {
    assertExactKeys(file, ["component", "path", "sha256", "size"], "artifact file");
    if (typeof file.component !== "string" || !file.component || !Number.isSafeInteger(file.size) || file.size < 0) throw new Error("artifact file is invalid.");
    assertHash(file.sha256, "artifact file SHA-256");
    bytes += file.size;
  }
  assertArtifactPathSet(artifactSet.files);
  if (bytes !== artifactSet.totalBytes) throw new Error("artifactSet byte total is invalid.");
}

export function validateDeploymentManifest(manifest, expectedDsh) {
  assertExactKeys(manifest, manifestKeys, "Deployment manifest");
  if (manifest.manifestSchemaVersion !== 2 || manifest.releaseIdentitySchemaVersion !== 2 || !releaseIdPattern.test(manifest.releaseId || "")) throw new Error("Deployment manifest v2 schema or release ID is invalid.");
  assertNoSecrets(manifest);
  assertExactKeys(manifest.assetHub, ["commit", "sourceArchiveSha256", "version"], "assetHub");
  assertCommit(manifest.assetHub.commit, "assetHub.commit");
  assertHash(manifest.assetHub.sourceArchiveSha256, "assetHub.sourceArchiveSha256");
  if (typeof manifest.assetHub.version !== "string") throw new Error("assetHub.version is invalid.");
  validateArtifactSet(manifest.artifactSet);
  if (createReleaseId({ version: manifest.assetHub.version, commit: manifest.assetHub.commit, artifactDigest: manifest.artifactSet.digest }) !== manifest.releaseId) throw new Error("Release ID does not bind the v2 source commit and release tree digest.");
  assertExactKeys(manifest.dsh, ["commit", "sourceFingerprint", "version"], "dsh");
  assertCommit(manifest.dsh.commit, "dsh.commit");
  assertHash(manifest.dsh.sourceFingerprint, "dsh.sourceFingerprint");
  if (typeof manifest.dsh.version !== "string") throw new Error("dsh.version is invalid.");
  if (expectedDsh && (manifest.dsh.version !== expectedDsh.version || manifest.dsh.commit !== expectedDsh.commit || manifest.dsh.sourceFingerprint !== expectedDsh.sourceFingerprint)) throw new Error("Deployment manifest DSH binding mismatch.");
  assertExactKeys(manifest.components, requiredComponents, "components");
  for (const component of requiredComponents) {
    const value = manifest.components[component];
    assertExactKeys(value, ["path", "sha256", "version"], `component ${component}`);
    assertHash(value.sha256, `component ${component} SHA-256`);
    if (typeof value.path !== "string" || typeof value.version !== "string" || !manifest.artifactSet.files.some((file) => file.component === component && file.path === value.path && file.sha256 === value.sha256)) throw new Error(`Component binding is invalid: ${component}`);
  }
  for (const [section, key] of [["build", "buildId"], ["runtime", "metadataSchemaVersion"], ["operationalStorage", "schemaVersion"], ["formalData", "contractVersion"]]) {
    assertExactKeys(manifest[section], [key], section);
    if (typeof manifest[section][key] !== "string") throw new Error(`${section}.${key} is invalid.`);
  }
  if (!Array.isArray(manifest.requiredEvidenceTypes) || !manifest.requiredEvidenceTypes.length || manifest.requiredEvidenceTypes.some((item) => typeof item !== "string" || !item)) throw new Error("Required evidence types are invalid.");
  return manifest;
}

export function assertWindowsProductionPath(value, root) {
  if (typeof value !== "string" || !/^[A-Za-z]:\\(?!$)/.test(value) || value.startsWith("\\\\") || value.startsWith("\\\\?\\") || /^[A-Za-z]:[^\\]/.test(value)) throw new Error("Deployment path must be an absolute local drive path.");
  const normalized = path.win32.normalize(value);
  const normalizedRoot = path.win32.normalize(root);
  if (normalized !== normalizedRoot && !normalized.toLowerCase().startsWith(`${normalizedRoot.toLowerCase()}\\`)) throw new Error("Deployment path escapes its production root.");
  return normalized;
}

async function readManifest(releasePath, expectedDsh) {
  const manifest = validateDeploymentManifest(JSON.parse(await readFile(path.join(releasePath, manifestFile), "utf8")), expectedDsh);
  const digest = manifestDigest(manifest);
  const sidecar = await readFile(path.join(releasePath, manifestSidecar), "utf8");
  if (sidecar !== `${digest}  ${manifestFile}\n`) throw new Error("Deployment manifest digest sidecar is invalid.");
  return { manifest, digest };
}

export async function verifyRelease(releasePath, expectedDsh, { requireDirectoryIdentity = false } = {}) {
  const canonicalRelease = await realpath(releasePath);
  const { manifest, digest } = await readManifest(canonicalRelease, expectedDsh);
  if (requireDirectoryIdentity && path.basename(canonicalRelease) !== manifest.releaseId) throw new Error("Release directory identity does not match its manifest.");
  const actual = await calculateReleaseArtifactSet(canonicalRelease);
  if (actual.algorithm !== manifest.artifactSet.algorithm || actual.digest !== manifest.artifactSet.digest || actual.fileCount !== manifest.artifactSet.fileCount || actual.totalBytes !== manifest.artifactSet.totalBytes || !artifactFilesMatch(actual.files, manifest.artifactSet.files)) throw new Error("Release tree does not match its v2 artifact identity.");
  return { releasePath: canonicalRelease, manifest, digest, artifactSet: actual };
}

export async function writeDeploymentManifest(releasePath, manifest) {
  validateDeploymentManifest(manifest);
  const digest = manifestDigest(manifest);
  await writeFile(path.join(releasePath, manifestFile), `${canonicalJson(manifest)}\n`, "utf8");
  await writeFile(path.join(releasePath, manifestSidecar), `${digest}  ${manifestFile}\n`, "utf8");
  return digest;
}

export async function promoteVerifiedStage({ stagingPath, releasesPath, expectedDsh, dryRun = false }) {
  const staged = await verifyRelease(stagingPath, expectedDsh);
  const releasePath = path.join(releasesPath, staged.manifest.releaseId);
  try {
    const existing = await verifyRelease(releasePath, expectedDsh, { requireDirectoryIdentity: true });
    if (existing.digest !== staged.digest || existing.artifactSet.digest !== staged.artifactSet.digest) throw new Error("Immutable release ID already exists with conflicting content.");
    return { status: "idempotent", ...existing };
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (dryRun) return { status: "planned", ...staged, releasePath };
  await mkdir(releasesPath, { recursive: true });
  await rename(stagingPath, releasePath);
  const promoted = await verifyRelease(releasePath, expectedDsh, { requireDirectoryIdentity: true });
  if (promoted.digest !== staged.digest || promoted.artifactSet.digest !== staged.artifactSet.digest) throw new Error("Promoted release identity mismatch.");
  return { status: "promoted", ...promoted };
}

export async function verifyCurrentTarget({ currentPath, releasesPath, expectedDsh }) {
  const releaseRoot = await realpath(releasesPath);
  const target = await realpath(currentPath);
  if (path.dirname(target) !== releaseRoot) throw new Error("Current deployment target must be a direct releases child.");
  return verifyRelease(target, expectedDsh, { requireDirectoryIdentity: true });
}

export async function boundedCurrentSwitch({ currentPath, releasesPath, targetReleasePath, expectedDsh, convergence, dryRun = false }) {
  const target = await verifyRelease(targetReleasePath, expectedDsh, { requireDirectoryIdentity: true });
  if (path.dirname(target.releasePath) !== await realpath(releasesPath)) throw new Error("Current target is outside releases.");
  if (!convergence?.ok) throw new Error("Runtime convergence is required before current switch.");
  if (dryRun) return { status: "planned", target };
  const temporary = `${currentPath}.deployment-next`;
  const previous = `${currentPath}.deployment-previous`;
  for (const candidate of [temporary, previous]) {
    try { await lstat(candidate); throw new Error("Deployment switch has an unexpected temporary junction."); } catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  await symlink(target.releasePath, temporary, process.platform === "win32" ? "junction" : "dir");
  await verifyCurrentTarget({ currentPath: temporary, releasesPath, expectedDsh });
  await rename(currentPath, previous);
  try { await rename(temporary, currentPath); } catch (error) { await rename(previous, currentPath); throw error; }
  const active = await verifyCurrentTarget({ currentPath, releasesPath, expectedDsh });
  await rm(previous, { recursive: false, force: false });
  return { status: "switched-bounded", active, semantics: "bounded rename/swap; Windows atomicity requires Block E evidence" };
}

export function validateCheckpoint(checkpoint, formalDataIdentity) {
  if (!checkpoint || typeof checkpoint.checkpointId !== "string" || checkpoint.formalDataRootIdentity !== formalDataIdentity || typeof checkpoint.timestamp !== "string" || typeof checkpoint.backupTarget !== "string" || checkpoint.verificationStatus !== "verified") throw new Error("Verified external backup checkpoint evidence is required.");
  return checkpoint;
}

function compatibility(manifest) {
  return { formalDataContractVersion: manifest.formalData.contractVersion, runtimeMetadataSchemaVersion: manifest.runtime.metadataSchemaVersion, operationalStorageSchemaVersion: manifest.operationalStorage.schemaVersion };
}

export function createDeploymentTransaction({ from, to, checkpointId }) {
  if (!from?.manifest || !to?.manifest || typeof checkpointId !== "string") throw new Error("Deployment transaction inputs are invalid.");
  return { transactionSchemaVersion: 1, fromReleaseId: from.manifest.releaseId, toReleaseId: to.manifest.releaseId, checkpointId, rollbackCandidateReleaseId: from.manifest.releaseId, fromManifestDigest: from.digest, toManifestDigest: to.digest, compatibility: compatibility(to.manifest) };
}

export function validateDeploymentTransaction(transaction) {
  assertExactKeys(transaction, ["checkpointId", "compatibility", "fromManifestDigest", "fromReleaseId", "rollbackCandidateReleaseId", "toManifestDigest", "toReleaseId", "transactionSchemaVersion"], "deployment transaction");
  if (transaction.transactionSchemaVersion !== 1 || !releaseIdPattern.test(transaction.fromReleaseId) || !releaseIdPattern.test(transaction.toReleaseId) || transaction.rollbackCandidateReleaseId !== transaction.fromReleaseId || typeof transaction.checkpointId !== "string") throw new Error("Deployment transaction is invalid.");
  assertHash(transaction.fromManifestDigest, "transaction.fromManifestDigest");
  assertHash(transaction.toManifestDigest, "transaction.toManifestDigest");
  assertExactKeys(transaction.compatibility, ["formalDataContractVersion", "operationalStorageSchemaVersion", "runtimeMetadataSchemaVersion"], "transaction compatibility");
  if (Object.values(transaction.compatibility).some((value) => typeof value !== "string")) throw new Error("Deployment transaction compatibility is invalid.");
  return transaction;
}

export async function planDeploymentUpgrade({ currentPath, stagingPath, releasesPath, expectedDsh, checkpoint, formalDataIdentity }) {
  const current = await verifyCurrentTarget({ currentPath, releasesPath, expectedDsh });
  const staged = await verifyRelease(stagingPath, expectedDsh);
  validateCheckpoint(checkpoint, formalDataIdentity);
  const transaction = createDeploymentTransaction({ from: current, to: staged, checkpointId: checkpoint.checkpointId });
  return { currentRelease: current.manifest.releaseId, targetRelease: staged.manifest.releaseId, transaction, steps: ["validate deployment/admin privilege", "validate production roots and DSH binding", "validate credentials/security prerequisites", "verify staged manifest and canonical release tree", "require checkpoint evidence", "managed shutdown and RuntimeLifecycleCore convergence", "bounded current switch", "managed startup/readiness/post-start verification", "record non-secret deployment evidence"] };
}

export async function evaluateRollbackCandidate({ failedReleasePath, candidateReleasePath, expectedDsh, transaction, checkpoint, formalDataIdentity }) {
  const [failed, candidate] = await Promise.all([verifyRelease(failedReleasePath, expectedDsh, { requireDirectoryIdentity: true }), verifyRelease(candidateReleasePath, expectedDsh, { requireDirectoryIdentity: true })]);
  validateCheckpoint(checkpoint, formalDataIdentity);
  validateDeploymentTransaction(transaction);
  if (transaction.checkpointId !== checkpoint.checkpointId || transaction.toReleaseId !== failed.manifest.releaseId || transaction.fromReleaseId !== candidate.manifest.releaseId || transaction.rollbackCandidateReleaseId !== candidate.manifest.releaseId || transaction.toManifestDigest !== failed.digest || transaction.fromManifestDigest !== candidate.digest) throw new Error("Rollback transaction does not bind these immutable releases.");
  if (canonicalJson(transaction.compatibility) !== canonicalJson(compatibility(failed.manifest)) || canonicalJson(transaction.compatibility) !== canonicalJson(compatibility(candidate.manifest))) throw new Error("Rollback would be incompatible with Formal DATA or runtime state.");
  return candidate;
}

export async function writeDeploymentEvidence(logPath, evidence) {
  assertNoSecrets(evidence);
  await mkdir(path.dirname(logPath), { recursive: true });
  await writeFile(logPath, `${canonicalJson(evidence)}\n`, "utf8");
}
