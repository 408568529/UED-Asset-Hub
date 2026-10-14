import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { link, mkdtemp, mkdir, readFile, rm, symlink, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { calculateReleaseArtifactSet, normalizeArtifactPath, windowsFilesystemEvidenceStatus } from "./release-artifact-tree.mjs";
import { createHostRuntimeClosureBinding } from "./release-runtime-closure-contract.mjs";
import { assertWindowsProductionPath, boundedCurrentSwitch, createDeploymentManifest, createReleaseId, evaluateRollbackCandidate, manifestDigest, planDeploymentUpgrade, promoteVerifiedStage, validateCheckpoint, validateDeploymentManifest, verifyCurrentTarget, verifyRelease, writeDeploymentManifest } from "./windows-deployment-contract.mjs";

const root = await mkdtemp(path.join(os.tmpdir(), "ued-release-identity-v2-"));
const hash = (value) => createHash("sha256").update(value).digest("hex");
const dsh = { version: "0.1.1-rc.2", commit: "b150a551b8d465e31e418e1b2eaf5e79bbb7d28e", sourceFingerprint: "a".repeat(64) };
const componentPaths = {
  standaloneServer: "server.js", hostSupervisor: "scripts/host-supervisor.mjs", managedShutdownClient: "scripts/windows-managed-shutdown-client.mjs",
  windowsJobHelper: "native/windows-job-helper/bin/ued-windows-job-helper.exe", windowsPipeSecurityAdapter: "native/windows-pipe-security-adapter/bin/ued-windows-pipe-security-adapter.exe", windowsDpapiHelper: "native/windows-dpapi-credential-helper/bin/ued-windows-dpapi-credential-helper.exe",
  serviceTemplate: "service/windows/UEDAssetHub.xml.template", edgeTemplate: "service/windows/UEDAssetHubEdge.web.config.template", nodeArtifact: "service/windows/node-22.23.3-x64.artifact.json", winswArtifact: "service/windows/winsw-2.12.0-x64.artifact.json",
  dshVersion: "agent-integration/dsh/version.json", genuiPlugin: "agent-integration/dsh/genui-plugin.json", dshOverlay: "agent-integration/dsh/asset-hub-agent.overlay.yml", restrictedAgentPreset: "agent-integration/dsh/agent-presets/asset-hub-restricted/agent.cordis.yml", restrictedPreset: "agent-integration/dsh/agent-presets/asset-hub-restricted/preset.yml", genuiRestrictedAgentPreset: "agent-integration/dsh/agent-presets/asset-hub-genui-restricted/agent.cordis.yml", genuiRestrictedPreset: "agent-integration/dsh/agent-presets/asset-hub-genui-restricted/preset.yml", releaseProvenance: "release.provenance.json",
};
const checkpoint = { checkpointId: "checkpoint-fixture", formalDataRootIdentity: "fixture-data", timestamp: "2026-09-01T00:00:00Z", backupTarget: "fixture-backup", verificationStatus: "verified" };

function componentForPath(filePath) {
  return Object.entries(componentPaths).find(([, value]) => value === filePath)?.[0] ?? "assetHub";
}

async function stage(name, { seed = "stable", sourceCommit = "1".repeat(40), sourceArchiveSha256 = hash("source-a") } = {}) {
  const directory = path.join(root, "staging", name);
  await mkdir(directory, { recursive: true });
  const entrypointBytes = Buffer.from(`start-host:${seed}`);
  const runtimeClosure = createHostRuntimeClosureBinding({ entrypoint: "scripts/start-host.mjs", modules: [{ path: "scripts/start-host.mjs", sha256: hash(entrypointBytes), size: entrypointBytes.length }], edges: [], sourceCommit, sourceArchiveSha256 });
  const contents = { ".next/BUILD_ID": `build-${seed}`, "scripts/host-supervisor.mjs": "host-supervisor", "scripts/start-host.mjs": entrypointBytes, "release.provenance.json": JSON.stringify({ payloadSchemaVersion: 2, runtimeClosure }) };
  for (const [component, filePath] of Object.entries(componentPaths)) contents[filePath] = `${component}:${seed}`;
  contents["release.provenance.json"] = JSON.stringify({ payloadSchemaVersion: 2, runtimeClosure });
  for (const [filePath, content] of Object.entries(contents)) {
    const destination = path.join(directory, filePath); await mkdir(path.dirname(destination), { recursive: true }); await writeFile(destination, content);
  }
  const actual = await calculateReleaseArtifactSet(directory);
  const artifactSet = { ...actual, files: actual.files.map((file) => ({ ...file, component: componentForPath(file.path) })) };
  const components = Object.fromEntries(Object.entries(componentPaths).map(([component, filePath]) => {
    const file = artifactSet.files.find((item) => item.path === filePath);
    return [component, { path: filePath, sha256: file.sha256, version: "fixture" }];
  }));
  const manifest = createDeploymentManifest({ version: "0.1.0", commit: sourceCommit, sourceArchiveSha256, artifactSet, dsh, components, buildId: "fixture-build", runtimeMetadataSchemaVersion: "3", operationalStorageSchemaVersion: "1", formalDataContractVersion: "1", requiredEvidenceTypes: ["windows-native-staging", "formal-data-hash"] });
  await writeDeploymentManifest(directory, manifest);
  return { directory, manifest };
}

try {
  assert.equal(assertWindowsProductionPath("D:\\UED-Asset-Hub\\releases\\x", "D:\\UED-Asset-Hub"), "D:\\UED-Asset-Hub\\releases\\x");
  assert.throws(() => assertWindowsProductionPath("\\\\server\\share", "D:\\UED-Asset-Hub"));
  for (const unsafe of ["../x", "/x", "CON", "name.", ".env.local", "x:y"]) assert.throws(() => normalizeArtifactPath(unsafe));

  const first = await stage("first");
  const duplicate = await stage("duplicate");
  assert.equal(first.manifest.artifactSet.digest, duplicate.manifest.artifactSet.digest);
  assert.equal(first.manifest.releaseId, duplicate.manifest.releaseId);
  await utimes(path.join(first.directory, componentPaths.nodeArtifact), new Date(0), new Date());
  assert.equal((await calculateReleaseArtifactSet(first.directory)).digest, first.manifest.artifactSet.digest);
  const byteMutated = await stage("byte-mutated");
  await writeFile(path.join(byteMutated.directory, componentPaths.nodeArtifact), "one-byte-change");
  const mutatedTree = await calculateReleaseArtifactSet(byteMutated.directory);
  assert.notEqual(mutatedTree.digest, first.manifest.artifactSet.digest);
  assert.notEqual(createReleaseId({ version: "0.1.0", commit: "1".repeat(40), artifactDigest: mutatedTree.digest }), first.manifest.releaseId);
  await assert.doesNotReject(verifyRelease(first.directory, dsh));
  await assert.rejects(verifyRelease(first.directory, { ...dsh, commit: "b".repeat(40) }));
  const sameBytesDifferentSource = await stage("source-b", { sourceCommit: "2".repeat(40), sourceArchiveSha256: hash("source-b") });
  assert.notEqual(sameBytesDifferentSource.manifest.artifactSet.digest, first.manifest.artifactSet.digest);
  assert.notEqual(sameBytesDifferentSource.manifest.releaseId, first.manifest.releaseId);

  const legacy = { manifestSchemaVersion: 1, releaseId: "v0.1.0-111111111111-2222222222222222" };
  assert.throws(() => validateDeploymentManifest(legacy, dsh));
  assert.throws(() => validateDeploymentManifest({ ...first.manifest, compatiblePreviousRelease: first.manifest.releaseId }, dsh));
  const malformed = structuredClone(first.manifest); malformed.artifactSet.files.push({ ...malformed.artifactSet.files[0], path: malformed.artifactSet.files[0].path.toUpperCase() }); malformed.artifactSet.fileCount += 1; malformed.artifactSet.totalBytes += malformed.artifactSet.files[0].size;
  assert.throws(() => validateDeploymentManifest(malformed, dsh));
  const historicalG026 = structuredClone(first.manifest); historicalG026.assetHub.sourceClassification = "COMMITTED_CLEAN_SOURCE"; historicalG026.assetHub.productionEligible = true;
  assert.throws(() => validateDeploymentManifest(historicalG026, dsh), /assetHub has unknown or missing fields/);
  assert.deepEqual(Object.keys(first.manifest.assetHub).sort(), ["commit", "sourceArchiveSha256", "version"]);
  for (const missingField of ["version", "commit", "sourceArchiveSha256"]) { const invalid = structuredClone(first.manifest); delete invalid.assetHub[missingField]; assert.throws(() => validateDeploymentManifest(invalid, dsh)); }
  for (const unknownField of ["sourceClassification", "productionEligible", "unexpected"]) { const invalid = structuredClone(first.manifest); invalid.assetHub[unknownField] = unknownField === "productionEligible"; assert.throws(() => validateDeploymentManifest(invalid, dsh)); }
  for (const [field, value] of [["version", 1], ["commit", 1], ["sourceArchiveSha256", "bad"]]) { const invalid = structuredClone(first.manifest); invalid.assetHub[field] = value; assert.throws(() => validateDeploymentManifest(invalid, dsh)); }
  const roundTrip = JSON.parse(JSON.stringify(createDeploymentManifest({ version: first.manifest.assetHub.version, commit: first.manifest.assetHub.commit, sourceArchiveSha256: first.manifest.assetHub.sourceArchiveSha256, artifactSet: first.manifest.artifactSet, dsh: first.manifest.dsh, components: first.manifest.components, buildId: first.manifest.build.buildId, runtimeMetadataSchemaVersion: first.manifest.runtime.metadataSchemaVersion, operationalStorageSchemaVersion: first.manifest.operationalStorage.schemaVersion, formalDataContractVersion: first.manifest.formalData.contractVersion, requiredEvidenceTypes: first.manifest.requiredEvidenceTypes })));
  assert.deepEqual(validateDeploymentManifest(roundTrip, dsh), roundTrip);

  const releases = path.join(root, "releases");
  assert.equal((await promoteVerifiedStage({ stagingPath: first.directory, releasesPath: releases, expectedDsh: dsh, dryRun: true })).status, "planned");
  const promoted = await promoteVerifiedStage({ stagingPath: first.directory, releasesPath: releases, expectedDsh: dsh });
  assert.equal(promoted.status, "promoted");
  assert.equal((await promoteVerifiedStage({ stagingPath: duplicate.directory, releasesPath: releases, expectedDsh: dsh })).status, "idempotent");

  const second = await stage("second", { seed: "second" });
  assert.notEqual(second.manifest.artifactSet.digest, first.manifest.artifactSet.digest);
  assert.notEqual(second.manifest.releaseId, first.manifest.releaseId);
  await writeFile(path.join(second.directory, "unexpected.txt"), "contamination");
  await assert.rejects(verifyRelease(second.directory, dsh));
  await rm(path.join(second.directory, "unexpected.txt"));
  const promotedSecond = await promoteVerifiedStage({ stagingPath: second.directory, releasesPath: releases, expectedDsh: dsh });
  const current = path.join(root, "current"); await symlink(promoted.releasePath, current, "dir");
  const plan = await planDeploymentUpgrade({ currentPath: current, stagingPath: promotedSecond.releasePath, releasesPath: releases, expectedDsh: dsh, checkpoint, formalDataIdentity: "fixture-data" });
  assert.equal(plan.transaction.fromReleaseId, promoted.manifest.releaseId);
  assert.equal(plan.transaction.toReleaseId, promotedSecond.manifest.releaseId);
  await assert.rejects(boundedCurrentSwitch({ currentPath: current, releasesPath: releases, targetReleasePath: promotedSecond.releasePath, expectedDsh: dsh, convergence: { ok: false } }));
  const switched = await boundedCurrentSwitch({ currentPath: current, releasesPath: releases, targetReleasePath: promotedSecond.releasePath, expectedDsh: dsh, convergence: { ok: true } });
  assert.equal(switched.active.manifest.releaseId, promotedSecond.manifest.releaseId);
  assert.equal((await evaluateRollbackCandidate({ failedReleasePath: promotedSecond.releasePath, candidateReleasePath: promoted.releasePath, expectedDsh: dsh, transaction: plan.transaction, checkpoint, formalDataIdentity: "fixture-data" })).manifest.releaseId, promoted.manifest.releaseId);
  await assert.rejects(evaluateRollbackCandidate({ failedReleasePath: promotedSecond.releasePath, candidateReleasePath: promoted.releasePath, expectedDsh: dsh, transaction: { ...plan.transaction, rollbackCandidateReleaseId: promotedSecond.manifest.releaseId }, checkpoint, formalDataIdentity: "fixture-data" }));

  const forged = await stage("forged", { seed: "forged" }); forged.manifest.releaseId = `v0.1.0-r2-${"1".repeat(12)}-${"0".repeat(32)}`; const forgedDigest = manifestDigest(forged.manifest); await writeFile(path.join(forged.directory, "deployment.manifest.json"), `${JSON.stringify(forged.manifest)}\n`); await writeFile(path.join(forged.directory, "deployment.manifest.sha256"), `${forgedDigest}  deployment.manifest.json\n`); await assert.rejects(verifyRelease(forged.directory, dsh));
  const missing = await stage("missing", { seed: "missing" }); await rm(path.join(missing.directory, componentPaths.nodeArtifact)); await assert.rejects(verifyRelease(missing.directory, dsh));
  const altered = await stage("altered", { seed: "altered" }); altered.manifest.build.buildId = "different"; await writeFile(path.join(altered.directory, "deployment.manifest.json"), `${JSON.stringify(altered.manifest)}\n`); await assert.rejects(verifyRelease(altered.directory, dsh));
  const symlinkRoot = path.join(root, "symlink-hazard"); await mkdir(symlinkRoot); await writeFile(path.join(symlinkRoot, "target"), "x"); await symlink("target", path.join(symlinkRoot, "linked")); await assert.rejects(calculateReleaseArtifactSet(symlinkRoot));
  const hardlinkRoot = path.join(root, "hardlink-hazard"); await mkdir(hardlinkRoot); await writeFile(path.join(hardlinkRoot, "a"), "x"); await link(path.join(hardlinkRoot, "a"), path.join(hardlinkRoot, "b")); await assert.rejects(calculateReleaseArtifactSet(hardlinkRoot));
  assert.deepEqual(windowsFilesystemEvidenceStatus(), { reparsePoints: "DEFERRED_TO_WINDOWS_NATIVE_VALIDATION", alternateDataStreams: "DEFERRED_TO_WINDOWS_NATIVE_VALIDATION" });
  assert.throws(() => validateCheckpoint(null, "fixture-data"));
  assert.throws(() => validateDeploymentManifest({ ...promoted.manifest, apiKey: "prohibited" }, dsh));
  assert.equal(manifestDigest(promoted.manifest).length, 64);
  assert.equal(JSON.parse(await readFile(path.join(promoted.releasePath, "deployment.manifest.json"), "utf8")).releaseId, promoted.manifest.releaseId);
  console.log("[UED Deploy] release identity v2 canonical tree, manifest, transaction, rollback, and negative gates passed.");
} finally { await rm(root, { recursive: true, force: true }); }
