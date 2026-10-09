import assert from "node:assert/strict";
import path from "node:path";
import { candidateProvenanceBytes, assertCandidateExecutionEvidence, assertCandidateProvenance, createCandidateExecutionEvidence, createCandidateProvenance, serializeCandidateExecutionEvidence } from "./release-provenance.mjs";
import { canonicalJson, sha256 } from "./release-artifact-tree.mjs";

const H = (value) => sha256(Buffer.from(String(value), "utf8"));
const commit = "1".repeat(40);
const archive = H("archive");
const module = (p) => ({ path: p, sha256: H(p), size: 1 });
const graph = (kind, sourceFields = true) => ({
  kind, entrypoints: ["scripts/start-host.mjs"], modules: [module("scripts/start-host.mjs")], edges: [], moduleCount: 1,
  graphDigest: H(kind), ...(sourceFields ? { sourceCommit: commit, sourceArchiveSha256: archive } : {}),
});
const closure = {
  schemaVersion: 1, source: { commit, archiveSha256: archive },
  closures: {
    host: { ...graph("host"), sourceCommit: commit, sourceArchiveSha256: archive },
    assetHubChild: {
      ...graph("assetHubChild"), sourceCommit: commit, sourceArchiveSha256: archive,
      entrypoints: ["scripts/windows-graceful-bootstrap.mjs", "server.js"],
      modules: [module("scripts/windows-graceful-bootstrap.mjs"), module("server.js")], moduleCount: 2,
      generatedServer: { path: "server.js", sha256: H("server.js"), size: 1, buildId: "rb1-" + H("build"), nextOutputDigest: H("next") },
      runtimeArtifacts: { nextOutput: { digest: H("next"), fileCount: 1 }, nodeModules: { digest: H("mods"), fileCount: 1 } },
    },
    shutdown: { ...graph("shutdown"), entrypoints: ["scripts/windows-managed-shutdown-client.mjs"], modules: [module("scripts/windows-managed-shutdown-client.mjs")] },
  },
  union: { memberCount: 1, members: [module("scripts/start-host.mjs")], graphDigest: H("union") },
};
const identity = { schemaVersion: closure.schemaVersion, source: closure.source, closures: closure.closures, union: closure.union };
closure.manifestDigest = H(canonicalJson(identity));
const nativePaths = [
  "job-helper/ued-windows-job-helper.exe", "job-helper/ued-windows-job-helper.manifest.json",
  "pipe-security-adapter/ued-windows-pipe-security-adapter.exe", "pipe-security-adapter/ued-windows-pipe-security-adapter.manifest.json",
  "dpapi-helper/ued-windows-dpapi-credential-helper.exe", "dpapi-helper/ued-windows-dpapi-credential-helper.manifest.json",
];
nativePaths.sort();
const base = {
  inputAuthorityIdentity: H("input"),
  constructorVersion: "constructor-v1",
  source: { classification: "COMMITTED_CLEAN_SOURCE", productionEligible: true, commit, archiveSha256: archive, lockfileSha256: H("lock"), snapshot: { workingTreeManifestSha256: H("tree"), trackedDiffSha256: H("diff"), untrackedInventorySha256: H("untracked") } },
  authorizationId: "authorization-v5",
  securitySetId: "a".repeat(32),
  runtimeClosure: { schemaVersion: 1, entrypoint: "scripts/start-host.mjs", graphDigest: H("host"), moduleCount: 1, modules: [module("scripts/start-host.mjs")], edges: [], sourceCommit: commit, sourceArchiveSha256: archive },
  candidateRuntimeClosure: closure,
  dsh: { version: "0.1.1-rc.2", commit: "2".repeat(40), sourceFingerprint: H("dsh") },
  native: { buildId: "nb3-" + H("native"), setDigest: H("native-set"), aggregateManifestSha256: H("native-manifest"), members: nativePaths.map((p) => ({ path: p, size: 1, sha256: H(p), releasePath: "native/" + p })) },
  build: { contractVersion: "build-v1", nodeVersion: "22.23.3", nodeArtifactSha256: H("node"), npmVersion: "10.9.9", backend: "WEBPACK", packageManager: "pinned-ci-prune-v1", deterministicBuildId: "rb1-" + H("build"), derivationVersion: 1, nextOutputArtifact: { digest: H("next"), fileCount: 1 }, runtimeDependencyArtifact: { npmTreeDigest: H("npm-tree"), nodeModulesManifestSha256: H("modules"), fileCount: 1 } },
};
const provenance = createCandidateProvenance(base);
assertCandidateProvenance(provenance, { inputAuthorityIdentity: base.inputAuthorityIdentity, sourceCommit: commit, sourceArchiveSha256: archive, dshCommit: base.dsh.commit, securitySetId: base.securitySetId, nativeSetDigest: base.native.setDigest, buildId: base.build.deterministicBuildId });
assert.equal(candidateProvenanceBytes(provenance).equals(candidateProvenanceBytes(createCandidateProvenance(base))), true);
for (const key of ["executionRunId", "hostname", "workspace", "generatedAt", "timestamp"]) {
  const bad = structuredClone(provenance);
  bad.build[key] = "injected";
  const { releaseIdentity: _old, ...body } = bad;
  bad.releaseIdentity = H(canonicalJson(body));
  assert.throws(() => assertCandidateProvenance(bad), /CANDIDATE_PROVENANCE_INVALID/u, key);
}
const unknown = structuredClone(provenance);
unknown.native.extra = true;
const { releaseIdentity: _old, ...body } = unknown;
unknown.releaseIdentity = H(canonicalJson(body));
assert.throws(() => assertCandidateProvenance(unknown), /CANDIDATE_PROVENANCE_INVALID/u);

const creatorRunId = "source-creator-v4";
const receiptHashes = Object.fromEntries(["sourceManifestSha256", "sourceCreationReceiptSha256", "toolchainReceiptSha256", "environmentReceiptSha256", "dependencyReceiptSha256", "nativeManifestSha256", "nativeCreationReceiptSha256", "dshBundleAuthoritySha256", "dshProvenanceSha256", "securityProtectedArtifactSha256"].map((key) => [key, H(key)]));
const sourceCreationReceiptSha256 = receiptHashes.sourceCreationReceiptSha256;
const execution = { experimentId: "experiment-v5", executionRunId: "run-v5-a", candidateLabel: "A", inputAuthorityIdentity: base.inputAuthorityIdentity, executionBindingSha256: H("binding-a"), phase: "constructor", receiptHashes, nativeRunBindingSha256: H("native-run-binding"), dshMode: "bundle", dshRunBindingSha256: null };
const evidenceInput = {
  artifactCreation: { sourceManifestSha256: H("source-manifest"), sourceCreationReceiptSha256, creatorRunId, createdAt: "2026-09-30T00:00:00.000Z" },
  execution,
  observations: { createdAt: "2026-09-30T01:00:00.000Z", evidencePath: path.resolve("/private/tmp/evidence-a.json"), hostname: "host-a", account: "account-a", workspace: "C:\\staging\\workspace-a", attempt: 1, exitCode: 0, stdoutSha256: null, stderrSha256: null, diagnosticsSha256: null, observerSha256: null, candidateInventorySha256: H("candidate-inventory"), runtimeInventorySha256: H("runtime-inventory") },
  logicalRelease: { releaseIdentity: provenance.releaseIdentity, authorizationId: base.authorizationId, securitySetId: base.securitySetId },
  candidate: { artifactDigest: H("candidate-digest") },
};
const expected = { ...execution, sourceCreationReceiptSha256, creatorRunId, releaseIdentity: provenance.releaseIdentity, authorizationId: base.authorizationId, securitySetId: base.securitySetId, candidateDigest: H("candidate-digest") };
const evidence = createCandidateExecutionEvidence({ ...evidenceInput, expected });
assertCandidateExecutionEvidence(JSON.parse(serializeCandidateExecutionEvidence(evidence)), expected);
assert.notEqual(evidence.artifactCreation.creatorRunId, evidence.execution.executionRunId);
assert.throws(() => assertCandidateExecutionEvidence(evidence), /CANDIDATE_PROVENANCE_INVALID/u);
assert.throws(() => assertCandidateExecutionEvidence(evidence, { ...expected, executionRunId: "run-v5-b" }), /CANDIDATE_PROVENANCE_INVALID/u);
assert.throws(() => assertCandidateExecutionEvidence(evidence, { ...expected, candidateLabel: "B" }), /CANDIDATE_PROVENANCE_INVALID/u);
const approval = { approvalIdentity: H("approval"), logicalReleaseAuthoritySha256: H("raw-lra"), executionPlanIdentity: H("plan"), experimentPermissionDigest: H("permission"), journalIdentity: H("journal") };
const liveExpected = { ...expected, ...approval };
const live = createCandidateExecutionEvidence({ ...evidenceInput, approval, expected: liveExpected });
assert.equal(live.schemaVersion, 3);
assertCandidateExecutionEvidence(JSON.parse(serializeCandidateExecutionEvidence(live)), liveExpected);
for (const key of Object.keys(approval)) assert.throws(() => assertCandidateExecutionEvidence(live, { ...liveExpected, [key]: H("wrong") }), /expected approval/u);
process.stdout.write("Candidate provenance v4 and execution evidence v2/v3: PASS\n");
