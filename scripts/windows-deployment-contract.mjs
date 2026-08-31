import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, realpath, rename, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";

const manifestFile = "deployment.manifest.json";
const releaseIdPattern = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const secretPattern = /(api.?key|password|secret|token|private.?key|pfx)/i;
const requiredArtifacts = ["asset-hub", "node", "winsw", "windows-job-helper", "windows-pipe-security-adapter", "windows-dpapi-helper", "reverse-proxy", "production-config"];

export function createReleaseId({ version, commit, artifactDigest }) {
  if (!/^\d+\.\d+\.\d+(?:[-.][a-z0-9]+)*$/i.test(version) || !/^[0-9a-f]{40}$/i.test(commit) || !/^[0-9a-f]{64}$/i.test(artifactDigest)) throw new Error("Deployment release identity is invalid.");
  return `v${version}-${commit.slice(0, 12)}-${artifactDigest.slice(0, 16)}`.toLowerCase();
}

export async function sha256File(file) { return createHash("sha256").update(await readFile(file)).digest("hex"); }
export function manifestDigest(manifest) { return createHash("sha256").update(JSON.stringify(manifest)).digest("hex"); }

function assertNoSecrets(value, key = "") {
  if (secretPattern.test(key)) throw new Error("Deployment manifest contains a prohibited secret-like field.");
  if (Array.isArray(value)) return value.forEach((item) => assertNoSecrets(item));
  if (value && typeof value === "object") for (const [name, item] of Object.entries(value)) assertNoSecrets(item, name);
}

export function validateDeploymentManifest(manifest, expectedDsh) {
  if (!manifest || manifest.manifestSchemaVersion !== 1 || !releaseIdPattern.test(manifest.releaseId || "")) throw new Error("Deployment manifest schema or release ID is invalid.");
  assertNoSecrets(manifest);
  for (const value of [manifest.assetHub?.version, manifest.assetHub?.commit, manifest.dsh?.version, manifest.dsh?.commit, manifest.dsh?.sourceFingerprint, manifest.node?.version, manifest.node?.arch, manifest.node?.sha256, manifest.winsw?.version, manifest.winsw?.arch, manifest.winsw?.sha256, manifest.config?.schemaVersion, manifest.config?.hash, manifest.runtime?.metadataSchemaVersion, manifest.operationalStorage?.schemaVersion, manifest.formalData?.contractVersion, manifest.createdAt]) if (typeof value !== "string" && typeof value !== "number") throw new Error("Deployment manifest has a missing required field.");
  if (!/^[0-9a-f]{40}$/i.test(manifest.assetHub.commit) || !/^[0-9a-f]{40}$/i.test(manifest.dsh.commit) || !/^[0-9a-f]{64}$/i.test(manifest.dsh.sourceFingerprint)) throw new Error("Deployment manifest source binding is invalid.");
  if (expectedDsh && (manifest.dsh.version !== expectedDsh.version || manifest.dsh.commit !== expectedDsh.commit || manifest.dsh.sourceFingerprint !== expectedDsh.sourceFingerprint)) throw new Error("Deployment manifest DSH binding mismatch.");
  if (!Array.isArray(manifest.artifacts) || manifest.artifacts.length === 0) throw new Error("Deployment manifest artifacts are required.");
  const names = new Set();
  for (const artifact of manifest.artifacts) {
    if (!artifact || typeof artifact.name !== "string" || typeof artifact.source !== "string" || typeof artifact.version !== "string" || !/^[0-9a-f]{64}$/i.test(artifact.sha256 || "") || !artifact.path || path.isAbsolute(artifact.path) || artifact.path.includes("..")) throw new Error("Deployment artifact declaration is invalid.");
    names.add(artifact.name);
  }
  for (const name of requiredArtifacts) if (!names.has(name)) throw new Error(`Deployment artifact is missing: ${name}`);
  if (manifest.compatiblePreviousRelease != null && !releaseIdPattern.test(manifest.compatiblePreviousRelease)) throw new Error("Compatible previous release is invalid.");
  if (!Array.isArray(manifest.requiredEvidenceIds) || manifest.requiredEvidenceIds.length === 0) throw new Error("Deployment checkpoint evidence requirements are missing.");
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
  return { manifest, digest: manifestDigest(manifest) };
}

export async function verifyRelease(releasePath, expectedDsh) {
  const canonicalRelease = await realpath(releasePath);
  const { manifest, digest } = await readManifest(canonicalRelease, expectedDsh);
  for (const artifact of manifest.artifacts) if (await sha256File(path.join(canonicalRelease, artifact.path)) !== artifact.sha256) throw new Error(`Deployment artifact hash mismatch: ${artifact.name}`);
  return { releasePath: canonicalRelease, manifest, digest };
}

export async function promoteVerifiedStage({ stagingPath, releasesPath, expectedDsh, dryRun = false }) {
  const staged = await verifyRelease(stagingPath, expectedDsh);
  const releasePath = path.join(releasesPath, staged.manifest.releaseId);
  try {
    const existing = await verifyRelease(releasePath, expectedDsh);
    if (existing.digest !== staged.digest) throw new Error("Immutable release ID already exists with conflicting content.");
    return { status: "idempotent", ...existing };
  } catch (error) {
    if (!String(error.message).includes("ENOENT")) throw error;
  }
  if (dryRun) return { status: "planned", ...staged, releasePath };
  await mkdir(releasesPath, { recursive: true });
  await rename(stagingPath, releasePath);
  const promoted = await verifyRelease(releasePath, expectedDsh);
  if (promoted.digest !== staged.digest) throw new Error("Promoted release digest mismatch.");
  return { status: "promoted", ...promoted };
}

export async function verifyCurrentTarget({ currentPath, releasesPath, expectedDsh }) {
  const releaseRoot = await realpath(releasesPath);
  const target = await realpath(currentPath);
  if (path.dirname(target) !== releaseRoot) throw new Error("Current deployment target must be a direct releases child.");
  return verifyRelease(target, expectedDsh);
}

export async function boundedCurrentSwitch({ currentPath, releasesPath, targetReleasePath, expectedDsh, convergence, dryRun = false }) {
  const target = await verifyRelease(targetReleasePath, expectedDsh);
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

export async function planDeploymentUpgrade({ currentPath, stagingPath, releasesPath, expectedDsh, checkpoint, formalDataIdentity }) {
  const current = await verifyCurrentTarget({ currentPath, releasesPath, expectedDsh });
  const staged = await verifyRelease(stagingPath, expectedDsh);
  validateCheckpoint(checkpoint, formalDataIdentity);
  return { currentRelease: current.manifest.releaseId, targetRelease: staged.manifest.releaseId, manifestDigest: staged.digest, checkpointId: checkpoint.checkpointId, steps: ["validate deployment/admin privilege", "validate production roots and DSH binding", "validate credentials/security prerequisites", "verify staged manifest and SHA-256 artifacts", "require checkpoint evidence", "managed shutdown and RuntimeLifecycleCore convergence", "bounded current switch", "managed startup/readiness/post-start verification", "record non-secret deployment evidence"] };
}

export async function evaluateRollbackCandidate({ failedReleasePath, candidateReleasePath, expectedDsh }) {
  const [failed, candidate] = await Promise.all([verifyRelease(failedReleasePath, expectedDsh), verifyRelease(candidateReleasePath, expectedDsh)]);
  if (failed.manifest.compatiblePreviousRelease !== candidate.manifest.releaseId) throw new Error("Rollback candidate is not the manifest-compatible previous release.");
  for (const key of ["contractVersion"]) if (failed.manifest.formalData[key] !== candidate.manifest.formalData[key]) throw new Error("Rollback would be incompatible with Formal DATA.");
  for (const [section, key] of [["runtime", "metadataSchemaVersion"], ["operationalStorage", "schemaVersion"]]) if (failed.manifest[section][key] !== candidate.manifest[section][key]) throw new Error("Rollback would be incompatible with runtime state.");
  return candidate;
}

export async function writeDeploymentEvidence(logPath, evidence) {
  assertNoSecrets(evidence);
  await mkdir(path.dirname(logPath), { recursive: true });
  await writeFile(logPath, JSON.stringify(evidence) + "\n", "utf8");
}
