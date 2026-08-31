import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { assertWindowsProductionPath, boundedCurrentSwitch, createReleaseId, evaluateRollbackCandidate, planDeploymentUpgrade, promoteVerifiedStage, validateCheckpoint, validateDeploymentManifest, verifyCurrentTarget, verifyRelease } from "./windows-deployment-contract.mjs";

const root = await mkdtemp(path.join(os.tmpdir(), "ued-deployment-contract-"));
const dsh = { version: "0.1.1-rc.2", commit: "b150a551b8d465e31e418e1b2eaf5e79bbb7d28e", sourceFingerprint: "a".repeat(64) };
const hash = (value) => createHash("sha256").update(value).digest("hex");
async function stage(name, previous = null) {
  const directory = path.join(root, "staging", name); await mkdir(directory, { recursive: true });
  const artifacts = ["asset-hub", "node", "winsw", "windows-job-helper", "windows-pipe-security-adapter", "windows-dpapi-helper", "reverse-proxy", "production-config"].map((artifact) => ({ name: artifact, version: "fixture", source: "fixture", path: `artifacts/${artifact}`, sha256: hash(`${name}:${artifact}`) }));
  for (const artifact of artifacts) { const file = path.join(directory, artifact.path); await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, `${name}:${artifact.name}`); }
  const releaseId = createReleaseId({ version: "0.1.0", commit: "1".repeat(40), artifactDigest: hash(name) });
  const manifest = { manifestSchemaVersion: 1, releaseId, assetHub: { version: "0.1.0", commit: "1".repeat(40) }, dsh, node: { version: "22.23.2", arch: "x64", sha256: hash("node") }, winsw: { version: "2.12.0", arch: "x64", sha256: hash("winsw") }, windowsJobHelper: { sha256: hash("job") }, windowsPipeSecurityAdapter: { sha256: hash("pipe") }, windowsDpapiHelper: { sha256: hash("dpapi") }, reverseProxy: { iis: "required", arr: "required", urlRewrite: "required" }, config: { schemaVersion: 1, hash: hash("config") }, runtime: { metadataSchemaVersion: 3 }, operationalStorage: { schemaVersion: 1 }, formalData: { contractVersion: 1 }, artifacts, compatiblePreviousRelease: previous, requiredEvidenceIds: ["checkpoint-fixture"], createdAt: "2026-08-31T00:00:00.000Z" };
  await writeFile(path.join(directory, "deployment.manifest.json"), JSON.stringify(manifest)); return { directory, manifest };
}
try {
  assert.equal(assertWindowsProductionPath("D:\\UED-Asset-Hub\\releases\\x", "D:\\UED-Asset-Hub"), "D:\\UED-Asset-Hub\\releases\\x");
  assert.throws(() => assertWindowsProductionPath("\\\\server\\share", "D:\\UED-Asset-Hub"));
  const first = await stage("first"); validateDeploymentManifest(first.manifest, dsh); await assert.doesNotReject(verifyRelease(first.directory, dsh));
  assert.throws(() => validateDeploymentManifest({ ...first.manifest, manifestSchemaVersion: 2 }, dsh));
  assert.throws(() => validateDeploymentManifest({ ...first.manifest, node: {} }, dsh));
  await assert.rejects(verifyRelease(first.directory, { ...dsh, commit: "b".repeat(40) }));
  const releases = path.join(root, "releases"); const dryRun = await promoteVerifiedStage({ stagingPath: first.directory, releasesPath: releases, expectedDsh: dsh, dryRun: true }); assert.equal(dryRun.status, "planned");
  const promoted = await promoteVerifiedStage({ stagingPath: first.directory, releasesPath: releases, expectedDsh: dsh }); assert.equal(promoted.status, "promoted");
  assert.equal((await promoteVerifiedStage({ stagingPath: promoted.releasePath, releasesPath: releases, expectedDsh: dsh })).status, "idempotent");
  const conflicting = await stage("conflict"); conflicting.manifest.releaseId = first.manifest.releaseId; await writeFile(path.join(conflicting.directory, "deployment.manifest.json"), JSON.stringify(conflicting.manifest)); await assert.rejects(promoteVerifiedStage({ stagingPath: conflicting.directory, releasesPath: releases, expectedDsh: dsh }));
  const second = await stage("second", first.manifest.releaseId); const promotedSecond = await promoteVerifiedStage({ stagingPath: second.directory, releasesPath: releases, expectedDsh: dsh });
  const current = path.join(root, "current"); await symlink(promoted.releasePath, current, "dir");
  const plan = await planDeploymentUpgrade({ currentPath: current, stagingPath: promotedSecond.releasePath, releasesPath: releases, expectedDsh: dsh, checkpoint: { checkpointId: "checkpoint-fixture", formalDataRootIdentity: "fixture-data", timestamp: "2026-08-31T00:00:00Z", backupTarget: "fixture-backup", verificationStatus: "verified" }, formalDataIdentity: "fixture-data" }); assert.equal(plan.currentRelease, first.manifest.releaseId);
  await assert.rejects(boundedCurrentSwitch({ currentPath: current, releasesPath: releases, targetReleasePath: promotedSecond.releasePath, expectedDsh: dsh, convergence: { ok: false } }));
  const before = await verifyCurrentTarget({ currentPath: current, releasesPath: releases, expectedDsh: dsh }); assert.equal(before.manifest.releaseId, first.manifest.releaseId);
  const switched = await boundedCurrentSwitch({ currentPath: current, releasesPath: releases, targetReleasePath: promotedSecond.releasePath, expectedDsh: dsh, convergence: { ok: true } }); assert.equal(switched.active.manifest.releaseId, second.manifest.releaseId);
  assert.equal((await evaluateRollbackCandidate({ failedReleasePath: promotedSecond.releasePath, candidateReleasePath: promoted.releasePath, expectedDsh: dsh })).manifest.releaseId, first.manifest.releaseId);
  const outside = path.join(root, "outside"); await mkdir(outside); const outsideCurrent = path.join(root, "outside-current"); await symlink(outside, outsideCurrent, "dir"); await assert.rejects(verifyCurrentTarget({ currentPath: outsideCurrent, releasesPath: releases, expectedDsh: dsh }));
  assert.throws(() => validateCheckpoint(null, "fixture-data")); assert.doesNotThrow(() => validateCheckpoint({ checkpointId: "checkpoint-fixture", formalDataRootIdentity: "fixture-data", timestamp: "2026-08-31T00:00:00Z", backupTarget: "fixture-backup", verificationStatus: "verified" }, "fixture-data"));
  const manifest = JSON.parse(await readFile(path.join(promotedSecond.releasePath, "deployment.manifest.json"), "utf8")); manifest.apiKey = "prohibited"; assert.throws(() => validateDeploymentManifest(manifest, dsh));
  await writeFile(path.join(promotedSecond.releasePath, "artifacts", "node"), "tampered"); await assert.rejects(verifyRelease(promotedSecond.releasePath, dsh));
  console.log("[UED Deploy] isolated manifest, immutable promotion, bounded switch, rollback eligibility, and checkpoint gates passed.");
} finally { await rm(root, { recursive: true, force: true }); }
