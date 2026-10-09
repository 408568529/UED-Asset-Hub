import path from "node:path";
import { canonicalJson, sha256 } from "./release-artifact-tree.mjs";

const provenanceKeys = ["schemaVersion", "payloadSchemaVersion", "releaseIdentity", "inputAuthorityIdentity", "constructor", "source", "security", "runtimeClosure", "candidateRuntimeClosure", "dsh", "native", "build"];
const executionOnlyKeys = new Set(["executionRunId", "buildRunId", "runId", "createdAt", "candidateLabel", "evidencePath", "executionId", "invocationId", "machineId", "hostname", "user", "account", "workspace", "workspacePath", "tempRoot", "outputRoot", "diagnosticPath", "attempt", "session", "nonce", "pid", "absolutePath", "executionPath"]);
const secretKeys = new Set(["previewModeId", "previewModeSigningKey", "previewModeEncryptionKey", "serverActionsEncryptionKey", "encryptionKey", "secretDigest", "dpapiPlaintext"]);
const compareUtf8 = (left, right) => Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
const fail = (reason) => { throw new Error("CANDIDATE_PROVENANCE_INVALID:" + reason); };
const exactKeys = (value, expected) => value && typeof value === "object" && !Array.isArray(value) && canonicalJson(Object.keys(value).sort(compareUtf8)) === canonicalJson([...expected].sort(compareUtf8));
const digest = (value) => sha256(Buffer.from(canonicalJson(value), "utf8"));
const hashPattern = /^[a-f0-9]{64}$/u;
const commitPattern = /^[a-f0-9]{40}$/u;
function assertNoForbiddenKeys(value) {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (executionOnlyKeys.has(key)) fail("execution metadata is present: " + key);
    if (secretKeys.has(key)) fail("secret material field is present");
    assertNoForbiddenKeys(child);
  }
}
function hash(value, label) { if (!hashPattern.test(value || "")) fail(label); }
function text(value, label) { if (typeof value !== "string" || !value) fail(label); }
function validateModuleGraph(value, keys, label) {
  if (!exactKeys(value, keys) || typeof value.kind !== "string" || !Array.isArray(value.entrypoints) || !Array.isArray(value.modules) || !Array.isArray(value.edges) || !Number.isSafeInteger(value.moduleCount) || value.moduleCount !== value.modules.length) fail(label + " schema");
  hash(value.graphDigest, label + " digest");
  if (!commitPattern.test(value.sourceCommit || "") || !hashPattern.test(value.sourceArchiveSha256 || "")) fail(label + " source");
  for (const module of value.modules) {
    if (!exactKeys(module, ["path", "sha256", "size"]) || typeof module.path !== "string" || !module.path || !Number.isSafeInteger(module.size) || module.size < 0) fail(label + " module");
    hash(module.sha256, label + " module hash");
  }
  for (const edge of value.edges) if (!exactKeys(edge, ["from", "to", "specifier"]) || typeof edge.from !== "string" || typeof edge.to !== "string" || typeof edge.specifier !== "string") fail(label + " edge");
}
function validateRuntimeClosure(value) {
  if (!exactKeys(value, ["schemaVersion", "entrypoint", "graphDigest", "moduleCount", "modules", "edges", "sourceCommit", "sourceArchiveSha256"]) || value.schemaVersion !== 1 || typeof value.entrypoint !== "string" || !Array.isArray(value.modules) || !Array.isArray(value.edges) || !Number.isSafeInteger(value.moduleCount) || value.moduleCount !== value.modules.length) fail("runtime closure schema");
  hash(value.graphDigest, "runtime closure digest");
  if (!commitPattern.test(value.sourceCommit || "")) fail("runtime closure source commit");
  hash(value.sourceArchiveSha256, "runtime closure source archive");
  for (const module of value.modules) {
    if (!exactKeys(module, ["path", "sha256", "size"]) || typeof module.path !== "string" || !module.path || !Number.isSafeInteger(module.size) || module.size < 0) fail("runtime closure module");
    hash(module.sha256, "runtime closure module hash");
  }
  for (const edge of value.edges) if (!exactKeys(edge, ["from", "to", "specifier"]) || typeof edge.from !== "string" || typeof edge.to !== "string" || typeof edge.specifier !== "string") fail("runtime closure edge");
}

function validateCandidateClosure(value) {
  if (!exactKeys(value, ["schemaVersion", "source", "closures", "union", "manifestDigest"]) || value.schemaVersion !== 1 || !exactKeys(value.source, ["commit", "archiveSha256"]) || !exactKeys(value.closures, ["host", "assetHubChild", "shutdown"]) || !exactKeys(value.union, ["memberCount", "members", "graphDigest"])) fail("Candidate closure schema");
  if (!commitPattern.test(value.source.commit || "")) fail("Candidate closure commit");
  hash(value.source.archiveSha256, "Candidate closure archive");
  hash(value.manifestDigest, "Candidate closure digest");
  validateModuleGraph(value.closures.host, ["kind", "entrypoints", "modules", "edges", "moduleCount", "graphDigest", "sourceCommit", "sourceArchiveSha256"], "host closure");
  validateModuleGraph(value.closures.shutdown, ["kind", "entrypoints", "modules", "edges", "moduleCount", "graphDigest", "sourceCommit", "sourceArchiveSha256"], "shutdown closure");
  validateModuleGraph(value.closures.assetHubChild, ["kind", "entrypoints", "modules", "edges", "moduleCount", "graphDigest", "sourceCommit", "sourceArchiveSha256", "generatedServer", "runtimeArtifacts"], "child closure");
  const child = value.closures.assetHubChild;
  if (!exactKeys(child.generatedServer, ["path", "sha256", "size", "buildId", "nextOutputDigest"]) || !exactKeys(child.runtimeArtifacts, ["nextOutput", "nodeModules"]) || !exactKeys(child.runtimeArtifacts.nextOutput, ["digest", "fileCount"]) || !exactKeys(child.runtimeArtifacts.nodeModules, ["digest", "fileCount"])) fail("Candidate generated server");
  hash(child.generatedServer.sha256, "generated server hash"); hash(child.generatedServer.nextOutputDigest, "generated Next output hash");
  for (const entry of Object.values(child.runtimeArtifacts)) { hash(entry.digest, "runtime artifact digest"); if (!Number.isSafeInteger(entry.fileCount) || entry.fileCount < 0) fail("runtime artifact file count"); }
  if (!Number.isSafeInteger(value.union.memberCount) || value.union.memberCount !== value.union.members.length) fail("Candidate closure union");
  hash(value.union.graphDigest, "Candidate closure union digest");
  for (const member of value.union.members) {
    if (!exactKeys(member, ["path", "sha256", "size"]) || typeof member.path !== "string" || !Number.isSafeInteger(member.size) || member.size < 0) fail("Candidate closure union member");
    hash(member.sha256, "Candidate closure union member hash");
  }
}
function validateProvenance(provenance, expected = null) {
  if (!exactKeys(provenance, provenanceKeys) || provenance.schemaVersion !== 4 || provenance.payloadSchemaVersion !== 4) fail("schema");
  hash(provenance.inputAuthorityIdentity, "input authority identity");
  if (!exactKeys(provenance.constructor, ["version"])) fail("constructor schema");
  text(provenance.constructor.version, "constructor version");
  if (!exactKeys(provenance.source, ["classification", "productionEligible", "commit", "archiveSha256", "lockfileSha256", "snapshot"]) || typeof provenance.source.classification !== "string" || typeof provenance.source.productionEligible !== "boolean" || !commitPattern.test(provenance.source.commit || "")) fail("source authority");
  for (const key of ["archiveSha256", "lockfileSha256"]) hash(provenance.source[key], "source " + key);
  if (provenance.source.snapshot !== null && (!exactKeys(provenance.source.snapshot, ["workingTreeManifestSha256", "trackedDiffSha256", "untrackedInventorySha256"]) || Object.values(provenance.source.snapshot).some((value) => !hashPattern.test(value || "")))) fail("source snapshot authority");
  if (!exactKeys(provenance.security, ["authorizationId", "securitySetId"]) || typeof provenance.security.authorizationId !== "string" || !provenance.security.authorizationId || !/^[a-f0-9]{32}$/u.test(provenance.security.securitySetId || "")) fail("security authority");
  validateRuntimeClosure(provenance.runtimeClosure);
  validateCandidateClosure(provenance.candidateRuntimeClosure);
  const dshKeys = provenance.dsh?.acquisition === undefined ? ["version", "commit", "sourceFingerprint"] : ["version", "commit", "sourceFingerprint", "acquisition"];
  if (!exactKeys(provenance.dsh, dshKeys) || typeof provenance.dsh.version !== "string" || !commitPattern.test(provenance.dsh.commit || "")) fail("DSH authority");
  hash(provenance.dsh.sourceFingerprint, "DSH fingerprint");
  if (provenance.dsh.acquisition !== undefined) {
    const acquisition = provenance.dsh.acquisition;
    if (!exactKeys(acquisition, ["archiveSha256", "manifestSha256", "materializationMode", "materializedRootIdentity", "method", "repository", "sourceRef"]) || !["verified-offline", "validated-dereference"].includes(acquisition.method) || typeof acquisition.repository !== "string" || typeof acquisition.sourceRef !== "string" || typeof acquisition.materializationMode !== "string") fail("DSH acquisition");
    for (const key of ["archiveSha256", "manifestSha256", "materializedRootIdentity"]) hash(acquisition[key], "DSH acquisition " + key);
  }
  if (!exactKeys(provenance.native, ["buildId", "setDigest", "aggregateManifestSha256", "members"]) || typeof provenance.native.buildId !== "string" || !Array.isArray(provenance.native.members)) fail("native authority");
  for (const key of ["setDigest", "aggregateManifestSha256"]) hash(provenance.native[key], "native " + key);
  let previous = "";
  for (const member of provenance.native.members) {
    if (!exactKeys(member, ["path", "size", "sha256", "releasePath"]) || typeof member.path !== "string" || typeof member.releasePath !== "string" || member.path <= previous || !Number.isSafeInteger(member.size) || member.size < 0) fail("native member");
    previous = member.path; hash(member.sha256, "native member hash");
  }
  if (provenance.native.members.length !== 6) fail("native member count");
  const buildKeys = ["contractVersion", "nodeVersion", "nodeArtifactSha256", "npmVersion", "backend", "packageManager", "deterministicBuildId", "derivationVersion", "nextOutputArtifact", "runtimeDependencyArtifact"];
  if (!exactKeys(provenance.build, buildKeys) || typeof provenance.build.contractVersion !== "string" || typeof provenance.build.nodeVersion !== "string" || typeof provenance.build.npmVersion !== "string" || provenance.build.backend !== "WEBPACK" || typeof provenance.build.packageManager !== "string" || provenance.build.derivationVersion !== 1) fail("build authority");
  hash(provenance.build.nodeArtifactSha256, "Node artifact hash");
  if (!exactKeys(provenance.build.nextOutputArtifact, ["digest", "fileCount"]) || !exactKeys(provenance.build.runtimeDependencyArtifact, ["npmTreeDigest", "nodeModulesManifestSha256", "fileCount"])) fail("build artifact schemas");
  hash(provenance.build.nextOutputArtifact.digest, "Next output digest");
  hash(provenance.build.runtimeDependencyArtifact.npmTreeDigest, "npm tree digest");
  hash(provenance.build.runtimeDependencyArtifact.nodeModulesManifestSha256, "node_modules digest");
  if (![provenance.build.nextOutputArtifact.fileCount, provenance.build.runtimeDependencyArtifact.fileCount].every((count) => Number.isSafeInteger(count) && count >= 0)) fail("build artifact counts");
  text(provenance.build.deterministicBuildId, "deterministic build ID");
  assertNoForbiddenKeys(provenance);
  const { releaseIdentity, ...identity } = provenance;
  hash(releaseIdentity, "release identity");
  if (digest(identity) !== releaseIdentity) fail("release identity");
  if (expected) {
    for (const key of ["inputAuthorityIdentity", "sourceCommit", "sourceArchiveSha256", "dshCommit", "dshVersion", "dshFingerprint", "securitySetId", "authorizationId", "nativeSetDigest", "nativeManifestSha256", "buildId"]) {
      const expectedValue = expected[key];
      if (expectedValue === undefined) continue;
      const actual = ({ inputAuthorityIdentity: provenance.inputAuthorityIdentity, sourceCommit: provenance.source.commit, sourceArchiveSha256: provenance.source.archiveSha256, dshCommit: provenance.dsh.commit, dshVersion: provenance.dsh.version, dshFingerprint: provenance.dsh.sourceFingerprint, securitySetId: provenance.security.securitySetId, authorizationId: provenance.security.authorizationId, nativeSetDigest: provenance.native.setDigest, nativeManifestSha256: provenance.native.aggregateManifestSha256, buildId: provenance.build.deterministicBuildId })[key];
      if (actual !== expectedValue) fail("approved authority mismatch: " + key);
    }
  }
  return provenance;
}
export function createCandidateProvenance({ inputAuthorityIdentity, constructorVersion, source, authorizationId, securitySetId, runtimeClosure, candidateRuntimeClosure, dsh, native, build }) {
  const value = { schemaVersion: 4, payloadSchemaVersion: 4, inputAuthorityIdentity, constructor: { version: constructorVersion }, source, security: { authorizationId, securitySetId }, runtimeClosure, candidateRuntimeClosure, dsh, native, build };
  assertNoForbiddenKeys(value);
  const provenance = { ...value, releaseIdentity: digest(value) };
  return validateProvenance(provenance);
}
export function candidateProvenanceBytes(provenance) {
  return Buffer.from(serializeCandidateProvenance(provenance), "utf8");
}
export function serializeCandidateProvenance(provenance) {
  validateProvenance(provenance);
  return canonicalJson(provenance) + "\n";
}
export function assertCandidateProvenance(provenance, expected = null) { return validateProvenance(provenance, expected); }
export function assertHistoricalCandidateProvenance(provenance) {
  if (provenance?.schemaVersion !== 3 || provenance?.payloadSchemaVersion !== 3) fail("historical schema");
  const { releaseIdentity, ...identity } = provenance;
  if (!hashPattern.test(releaseIdentity || "") || digest(identity) !== releaseIdentity) fail("historical release identity");
  return provenance;
}
const evidenceKeys = ["schemaVersion", "artifactCreation", "execution", "observations", "logicalRelease", "candidate"];
export function createCandidateExecutionEvidence({ artifactCreation, execution, observations, logicalRelease, candidate, approval, expected }) {
  const evidence = { schemaVersion: approval ? 3 : 2, artifactCreation, execution, observations, logicalRelease, candidate, ...(approval ? { approval } : {}) };
  assertCandidateExecutionEvidence(evidence, expected);
  return evidence;
}
export function serializeCandidateExecutionEvidence(evidence) {
  assertCandidateExecutionEvidence(evidence, null, { serializationOnly: true });
  return canonicalJson(evidence) + "\n";
}
export function assertCandidateExecutionEvidence(evidence, expected, options = {}) {
  const live = evidence.schemaVersion === 3;
  if (!exactKeys(evidence, live ? [...evidenceKeys, "approval"] : evidenceKeys) || ![2, 3].includes(evidence.schemaVersion)) fail("execution evidence schema");
  if (live) {
    const keys = ["approvalIdentity", "logicalReleaseAuthoritySha256", "executionPlanIdentity", "experimentPermissionDigest", "journalIdentity"];
    if (!exactKeys(evidence.approval, keys) || keys.some((key) => !hashPattern.test(evidence.approval[key] || ""))) fail("execution approval selection");
    if (!options.serializationOnly && (!expected || keys.some((key) => expected[key] !== evidence.approval[key]))) fail("expected approval selection");
  }
  if (!exactKeys(evidence.artifactCreation, ["sourceManifestSha256", "sourceCreationReceiptSha256", "creatorRunId", "createdAt"]) || !hashPattern.test(evidence.artifactCreation.sourceManifestSha256 || "") || !hashPattern.test(evidence.artifactCreation.sourceCreationReceiptSha256 || "") || typeof evidence.artifactCreation.creatorRunId !== "string" || !Number.isFinite(Date.parse(evidence.artifactCreation.createdAt))) fail("artifactCreation");
  if (!exactKeys(evidence.execution, ["experimentId", "executionRunId", "candidateLabel", "inputAuthorityIdentity", "executionBindingSha256", "phase", "receiptHashes", "nativeRunBindingSha256", "dshMode", "dshRunBindingSha256"]) || typeof evidence.execution.experimentId !== "string" || typeof evidence.execution.executionRunId !== "string" || !["A", "B", "single", "pre-r3"].includes(evidence.execution.candidateLabel) || !hashPattern.test(evidence.execution.inputAuthorityIdentity || "") || !hashPattern.test(evidence.execution.executionBindingSha256 || "") || typeof evidence.execution.phase !== "string") fail("execution");
  const receiptKeys = ["sourceManifestSha256", "sourceCreationReceiptSha256", "toolchainReceiptSha256", "environmentReceiptSha256", "dependencyReceiptSha256", "nativeManifestSha256", "nativeCreationReceiptSha256", "dshBundleAuthoritySha256", "dshProvenanceSha256", "securityProtectedArtifactSha256"];
  if (!exactKeys(evidence.execution.receiptHashes, receiptKeys) || receiptKeys.some((key) => !hashPattern.test(evidence.execution.receiptHashes[key] || "")) || !hashPattern.test(evidence.execution.nativeRunBindingSha256 || "") || !["bundle", "offline"].includes(evidence.execution.dshMode) || (evidence.execution.dshMode === "offline" ? !hashPattern.test(evidence.execution.dshRunBindingSha256 || "") : evidence.execution.dshRunBindingSha256 !== null)) fail("execution receipt bindings");
  if (!exactKeys(evidence.observations, ["createdAt", "evidencePath", "hostname", "account", "workspace", "attempt", "exitCode", "stdoutSha256", "stderrSha256", "diagnosticsSha256", "observerSha256", "candidateInventorySha256", "runtimeInventorySha256"]) || !Number.isFinite(Date.parse(evidence.observations.createdAt)) || typeof evidence.observations.evidencePath !== "string" || !path.isAbsolute(evidence.observations.evidencePath) || typeof evidence.observations.hostname !== "string" || typeof evidence.observations.account !== "string" || typeof evidence.observations.workspace !== "string" || !Number.isSafeInteger(evidence.observations.attempt) || !Number.isSafeInteger(evidence.observations.exitCode)) fail("observations");
  for (const key of ["stdoutSha256", "stderrSha256", "diagnosticsSha256", "observerSha256", "candidateInventorySha256", "runtimeInventorySha256"]) if (evidence.observations[key] !== null && !hashPattern.test(evidence.observations[key])) fail("observation hash " + key);
  if (!exactKeys(evidence.logicalRelease, ["releaseIdentity", "authorizationId", "securitySetId"]) || !hashPattern.test(evidence.logicalRelease.releaseIdentity || "") || typeof evidence.logicalRelease.authorizationId !== "string" || !/^[a-f0-9]{32}$/u.test(evidence.logicalRelease.securitySetId || "")) fail("logicalRelease");
  if (!exactKeys(evidence.candidate, ["artifactDigest"]) || !hashPattern.test(evidence.candidate.artifactDigest || "")) fail("candidate");
  if (expected !== null && expected !== undefined) {
    for (const key of ["experimentId", "executionRunId", "candidateLabel", "inputAuthorityIdentity", "executionBindingSha256", "phase", "nativeRunBindingSha256", "dshMode", "dshRunBindingSha256"]) if (expected[key] !== evidence.execution[key]) fail("expected execution " + key);
    if (expected.receiptHashes === undefined || canonicalJson(expected.receiptHashes) !== canonicalJson(evidence.execution.receiptHashes)) fail("expected execution receipt hashes");
    if (expected.sourceCreationReceiptSha256 !== evidence.artifactCreation.sourceCreationReceiptSha256) fail("expected source creation receipt");
    if (expected.creatorRunId !== undefined && expected.creatorRunId !== evidence.artifactCreation.creatorRunId) fail("source creator");
    for (const key of ["releaseIdentity", "authorizationId", "securitySetId", "candidateDigest"]) {
      const actual = ({ releaseIdentity: evidence.logicalRelease.releaseIdentity, authorizationId: evidence.logicalRelease.authorizationId, securitySetId: evidence.logicalRelease.securitySetId, candidateDigest: evidence.candidate.artifactDigest })[key];
      if (expected[key] !== actual) fail("expected " + key);
    }
  } else if (!options.serializationOnly) fail("mandatory expected execution identity missing");
  return evidence;
}
export function assertExecutionEvidenceOutsideCandidate(candidateRoot, evidencePath) {
  const relative = path.relative(path.resolve(candidateRoot), path.resolve(evidencePath));
  if (!relative || (!relative.startsWith("..") && !path.isAbsolute(relative))) fail("execution evidence must be outside Candidate");
  return evidencePath;
}
