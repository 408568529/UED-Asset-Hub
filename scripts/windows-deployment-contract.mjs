import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, realpath, rename, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { artifactDigestAlgorithm, artifactFilesMatch, assertArtifactPathSet, calculateReleaseArtifactSet, canonicalJson } from "./release-artifact-tree.mjs";
import { assertHostRuntimeClosureBinding } from "./release-runtime-closure-contract.mjs";
import { assertCandidateRuntimeClosureManifest } from "./candidate-runtime-closure-manifest.mjs";
import { assertCandidateProvenance, assertHistoricalCandidateProvenance, serializeCandidateProvenance } from "./release-provenance.mjs";
import { nativeSetMembers } from "./native-artifact-contract.mjs";
import { nativePayloadMap } from "./windows-release-payload.mjs";
import { assertTrustedAdmission } from "./release-approval-store.mjs";

const manifestFile = "deployment.manifest.json";
const manifestSidecar = "deployment.manifest.sha256";
const releaseIdPattern = /^v\d+\.\d+\.\d+(?:[-.][a-z0-9]+)*-r2-[0-9a-f]{12}-[0-9a-f]{32}$/;
const secretPattern = /(api.?key|password|secret|token|private.?key|pfx)/i;
const requiredComponents = ["dshOverlay", "dshVersion", "edgeTemplate", "genuiPlugin", "genuiRestrictedAgentPreset", "genuiRestrictedPreset", "hostSupervisor", "managedShutdownClient", "nodeArtifact", "releaseProvenance", "restrictedAgentPreset", "restrictedPreset", "serviceTemplate", "standaloneServer", "windowsDpapiHelper", "windowsJobHelper", "windowsPipeSecurityAdapter", "winswArtifact"];
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

export function createDeploymentManifest({ version, commit, sourceArchiveSha256, artifactSet, dsh, components, buildId, runtimeMetadataSchemaVersion, operationalStorageSchemaVersion, formalDataContractVersion, requiredEvidenceTypes }) {
  const manifest = {
    manifestSchemaVersion: 2,
    releaseIdentitySchemaVersion: 2,
    releaseId: createReleaseId({ version, commit, artifactDigest: artifactSet.digest }),
    assetHub: { version, commit, sourceArchiveSha256 },
    artifactSet,
    dsh,
    components,
    build: { buildId },
    runtime: { metadataSchemaVersion: runtimeMetadataSchemaVersion },
    operationalStorage: { schemaVersion: operationalStorageSchemaVersion },
    formalData: { contractVersion: formalDataContractVersion },
    requiredEvidenceTypes,
  };
  return validateDeploymentManifest(manifest, dsh);
}

export function preflightDeploymentManifest(manifest, expectedDsh) {
  return validateDeploymentManifest(manifest, expectedDsh);
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

async function assertAuthorityBoundProvenance(provenance, manifest, actual, authority, canonicalRelease, admissionContext) {
  assertTrustedAdmission(admissionContext, authority);
  assertCandidateProvenance(provenance, {
    inputAuthorityIdentity: authority.inputAuthorityIdentity,
    sourceCommit: authority.source.sourceCommit,
    sourceArchiveSha256: authority.source.sourceArchiveSha256,
    dshCommit: authority.dsh.commit,
    dshVersion: authority.dsh.version,
    dshFingerprint: authority.dsh.fingerprint,
    securitySetId: authority.security.securitySetId,
    authorizationId: authority.security.authorizationId,
    nativeSetDigest: authority.native.setDigest,
    nativeManifestSha256: authority.native.manifestSha256,
    buildId: manifest.build.buildId,
  });
  if (manifest.assetHub.commit !== authority.source.sourceCommit || manifest.assetHub.sourceArchiveSha256 !== authority.source.sourceArchiveSha256 || provenance.source.classification !== authority.source.sourceClassification || provenance.source.productionEligible !== authority.source.productionEligible || provenance.source.commit !== authority.source.sourceCommit || provenance.source.archiveSha256 !== authority.source.sourceArchiveSha256 || provenance.source.lockfileSha256 !== authority.source.lockfileSha256) throw new Error("Candidate source claims do not match the approved authority.");
  if (manifest.dsh.version !== authority.dsh.version || manifest.dsh.commit !== authority.dsh.commit || manifest.dsh.sourceFingerprint !== authority.dsh.fingerprint || provenance.dsh.commit !== manifest.dsh.commit || provenance.dsh.version !== manifest.dsh.version || provenance.dsh.sourceFingerprint !== manifest.dsh.sourceFingerprint) throw new Error("Candidate DSH claims do not match the approved authority.");
  if (manifest.build.buildId !== provenance.build.deterministicBuildId || provenance.candidateRuntimeClosure.closures.assetHubChild.generatedServer.buildId !== manifest.build.buildId) throw new Error("Candidate build identity claims do not agree.");
  if ((await readFile(path.join(canonicalRelease, ".next", "BUILD_ID"), "utf8")).trim() !== manifest.build.buildId) throw new Error("Candidate .next/BUILD_ID does not match the deployment build identity.");
  const derive = (value) => createHash("sha256").update(value).digest("hex");
  if (manifest.build.buildId !== "rb1-" + derive(`ued-asset-hub-next-build-v1\n${authority.source.sourceCommit}\n${authority.source.sourceArchiveSha256}\n`)) throw new Error("Candidate build identity derivation mismatch");
  const sourceManifest = admissionContext.selectedReceipts.sourceManifestSha256;
  if (!provenance.source.snapshot || provenance.source.snapshot.workingTreeManifestSha256 !== sourceManifest.workingTreeManifestSha256 || provenance.source.snapshot.trackedDiffSha256 !== sourceManifest.trackedDiffSha256 || provenance.source.snapshot.untrackedInventorySha256 !== sourceManifest.untrackedInventorySha256) throw new Error("Candidate approved source snapshot projection mismatch");
  for (const module of provenance.runtimeClosure.modules) {
    const source = sourceManifest.files.find((file) => file.relativePath === module.path);
    if (!source || source.sha256 !== module.sha256 || source.size !== module.size) throw new Error("Candidate runtime closure differs from approved source bytes");
  }
  const dependency = admissionContext.selectedReceipts.dependencyReceiptSha256;
  if (provenance.build.runtimeDependencyArtifact.nodeModulesManifestSha256 !== authority.dependency.byteTreeIdentity || provenance.build.runtimeDependencyArtifact.npmTreeDigest !== dependency.postPruneGraphIdentity || provenance.build.nodeArtifactSha256 !== authority.toolchain.nodeSha256 || provenance.build.nodeVersion !== authority.toolchain.nodeVersion || provenance.build.npmVersion !== authority.toolchain.npmVersion) throw new Error("Candidate approved dependency/toolchain mismatch");
  const nativeManifest = admissionContext.selectedReceipts.nativeManifestSha256;
  const originalMembers = nativeManifest.components.flatMap((component) => [{ path: component.executableRelativePath, sha256: component.executableSha256, size: component.executableSize }, { path: component.integrityManifestRelativePath, sha256: component.integrityManifestSha256 }]);
  const approvedMembers = [...nativeSetMembers].sort();
  const claimedMembers = provenance.native.members.map(({ path: memberPath }) => memberPath).sort();
  if (canonicalJson(claimedMembers) !== canonicalJson(approvedMembers)) throw new Error("Candidate Native member roles do not match the approved six-member set.");
  for (const member of provenance.native.members) {
    const releasePath = nativePayloadMap[member.path];
    if (member.releasePath !== releasePath) throw new Error("Candidate Native role path is invalid.");
    const file = actual.files.find((candidate) => candidate.path === releasePath);
    const original = originalMembers.find((entry) => entry.path === member.path);
    if (!original || original.sha256 !== member.sha256 || (original.size !== undefined && original.size !== member.size)) throw new Error("Candidate Native member differs from approved original bytes");
    if (!file || file.sha256 !== member.sha256 || file.size !== member.size) throw new Error("Candidate Native bytes do not match the approved set.");
  }
}

export async function verifyRelease(releasePath, expectedDsh, { requireDirectoryIdentity = false, authority = null, admissionContext = null, requireLiveAuthority = false } = {}) {
  const canonicalRelease = await realpath(releasePath);
  const { manifest, digest } = await readManifest(canonicalRelease, expectedDsh);
  if (requireDirectoryIdentity && path.basename(canonicalRelease) !== manifest.releaseId) throw new Error("Release directory identity does not match its manifest.");
  const actual = await calculateReleaseArtifactSet(canonicalRelease);
  if (actual.algorithm !== manifest.artifactSet.algorithm || actual.digest !== manifest.artifactSet.digest || actual.fileCount !== manifest.artifactSet.fileCount || actual.totalBytes !== manifest.artifactSet.totalBytes || !artifactFilesMatch(actual.files, manifest.artifactSet.files)) throw new Error("Release tree does not match its v2 artifact identity.");
  const releaseProvenanceBytes = await readFile(path.join(canonicalRelease, "release.provenance.json"));
  const releaseProvenance = JSON.parse(releaseProvenanceBytes.toString("utf8"));
  let historicalOnly = false;
  if (releaseProvenance.payloadSchemaVersion === 4) {
    if (!authority) throw new Error("Candidate provenance v4 requires an approved LogicalReleaseAuthority.");
    await assertAuthorityBoundProvenance(releaseProvenance, manifest, actual, authority, canonicalRelease, admissionContext);
    if (!releaseProvenanceBytes.equals(Buffer.from(serializeCandidateProvenance(releaseProvenance), "utf8"))) throw new Error("Release provenance serialization is not canonical.");
    assertHostRuntimeClosureBinding({ runtimeClosure: releaseProvenance.runtimeClosure, artifactSet: actual, sourceCommit: manifest.assetHub.commit, sourceArchiveSha256: manifest.assetHub.sourceArchiveSha256 });
    await assertCandidateRuntimeClosureManifest({ manifest: releaseProvenance.candidateRuntimeClosure, candidateRoot: canonicalRelease, artifactSet: actual, sourceCommit: manifest.assetHub.commit, sourceArchiveSha256: manifest.assetHub.sourceArchiveSha256, runtimeArtifacts: { nextOutput: releaseProvenance.build?.nextOutputArtifact, nodeModules: { digest: releaseProvenance.build?.runtimeDependencyArtifact?.nodeModulesManifestSha256, fileCount: releaseProvenance.build?.runtimeDependencyArtifact?.fileCount } } });
  } else if ([1, 2, 3].includes(releaseProvenance.payloadSchemaVersion)) {
    if (requireLiveAuthority) throw new Error("Historical Candidate provenance cannot enter a live Constructor path.");
    historicalOnly = true;
    if (releaseProvenance.payloadSchemaVersion === 3) assertHistoricalCandidateProvenance(releaseProvenance);
    else if (releaseProvenance.payloadSchemaVersion === 2) assertHostRuntimeClosureBinding({ runtimeClosure: releaseProvenance.runtimeClosure, artifactSet: actual, sourceCommit: manifest.assetHub.commit, sourceArchiveSha256: manifest.assetHub.sourceArchiveSha256 });
  } else throw new Error("Release payload provenance schema is unsupported.");
  return { releasePath: canonicalRelease, manifest, digest, artifactSet: actual, releaseProvenance, historicalOnly };
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
