import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFile, mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { dshProvenanceContractVersion, serializeDshProvenanceEvidence, validateDshAcquisitionEvidence, validateDshSourceIdentity } from "../agent-integration/scripts/dsh-source-validator.mjs";
import { createOfflineDshRunBinding, generateOfflineDshPackage, materializeOfflineDshGitCheckout, materializeOfflineDshPackage, readOfflineDshArchive, validateOfflineDshGitCheckout, validateOfflineDshMaterialization } from "../agent-integration/scripts/dsh-offline-package.mjs";
import { bindDshConstructorProvenance } from "./windows-release-constructor.mjs";

const upstream = "https://github.com/deepseek-ai/deepseek-harness.git";
const sourceRef = "refs/tags/dsh-v0.1.1-rc.2";
const hashFile = async (file) => createHash("sha256").update(await readFile(file)).digest("hex");

function git(directory, args) {
  return execFileSync("git", ["-C", directory, ...args], { encoding: "utf8" }).trim();
}

async function createFixture(directory, version = "0.1.1-rc.2") {
  const files = {
    "package.json": `${JSON.stringify({ name: "deepseek-harness", version })}\n`,
    "pnpm-workspace.yaml": "packages:\n  - packages/*\n",
    "pnpm-lock.yaml": "lockfileVersion: '9.0'\n",
    "apps/cli/package.json": "{}\n",
    "apps/cli/src/bin.ts": "export {};\n",
    "packages/bundle/base/cordis.patch.yml": "plugins: []\n",
    "packages/bundle/web-app/cordis.patch.yml": "plugins: []\n",
    "packages/mcp/mcp-client/src/index.ts": "export {};\n"
  };
  for (const [relative, content] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(directory, relative)), { recursive: true });
    await writeFile(path.join(directory, relative), content);
  }
  await symlink("package.json", path.join(directory, "linked-package.json"));
  git(directory, ["init", "-q"]);
  git(directory, ["config", "core.autocrlf", "false"]);
  git(directory, ["config", "user.name", "UED Fixture"]);
  git(directory, ["config", "user.email", "fixture@example.invalid"]);
  git(directory, ["add", "."]);
  git(directory, ["commit", "-qm", "fixture"]);
  git(directory, ["tag", "dsh-v0.1.1-rc.2"]);
  const sourceCommit = git(directory, ["rev-parse", "HEAD"]);
  const sourceTree = git(directory, ["rev-parse", "HEAD^{tree}"]);
  const provisional = await validateDshSourceIdentity(directory, { sourceRepository: upstream, sourceCommit, sourceTree, sourceVersion: version }, { readOnly: true });
  return { sourceRepository: upstream, sourceRef, sourceCommit, sourceTree, sourceVersion: version, sourceFingerprint: provisional.fingerprint };
}

async function writeEvidence(directory, name, evidence) {
  const evidencePath = path.join(directory, name);
  const serialized = serializeDshProvenanceEvidence(evidence);
  await writeFile(evidencePath, serialized);
  await writeFile(`${evidencePath}.sha256`, `${createHash("sha256").update(serialized).digest("hex")}  ${name}\n`);
  return evidencePath;
}

async function expectRejectedOfflineLink(root, label, target, extraLinks = []) {
  const source = path.join(root, `invalid-link-${label}`); await mkdir(source);
  const initial = await createFixture(source);
  for (const [link, linkTarget] of [["invalid-link", target], ...extraLinks]) await symlink(linkTarget, path.join(source, link));
  git(source, ["add", "."]); git(source, ["commit", "-qm", "invalid link"]);
  const base = { ...initial, sourceCommit: git(source, ["rev-parse", "HEAD"]), sourceTree: git(source, ["rev-parse", "HEAD^{tree}"]) };
  const identity = await validateDshSourceIdentity(source, base, { readOnly: true });
  const contract = { ...base, sourceFingerprint: identity.fingerprint };
  await assert.rejects(generateOfflineDshPackage({ sourceDir: source, outputDir: path.join(root, `invalid-package-${label}`), expected: contract }));
}

function evidenceFor(contract, staged, verification, method = "bundle") {
  return {
    provenanceContractVersion: dshProvenanceContractVersion,
    method,
    upstreamCanonicalUrl: contract.sourceRepository,
    sourceRef: contract.sourceRef,
    sourceCommit: contract.sourceCommit,
    sourceTree: contract.sourceTree,
    sourceVersion: contract.sourceVersion,
    sourceFingerprint: contract.sourceFingerprint,
    stagedSource: { commit: staged.commit, tree: staged.tree, version: staged.version, fingerprint: staged.fingerprint },
    verification
  };
}

function tarEntry(name, { type = "0", target = "" } = {}) {
  const header = Buffer.alloc(512); Buffer.from(name, "utf8").copy(header, 0); Buffer.from("00000000000\0", "ascii").copy(header, 124); header[156] = type.charCodeAt(0); Buffer.from(target, "utf8").copy(header, 157);
  return Buffer.concat([header, Buffer.alloc(1024)]);
}

const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "ued-dsh-provenance-contract-"));
const root = await realpath(temporaryRoot);
try {
  const sourceOnlyRoot = path.join(root, "source-only");
  const sourceOnlyScripts = path.join(sourceOnlyRoot, "agent-integration", "scripts");
  await mkdir(sourceOnlyScripts, { recursive: true });
  await mkdir(path.join(sourceOnlyRoot, "scripts"), { recursive: true });
  for (const relative of ["agent-integration/scripts/dsh-offline-package.mjs", "agent-integration/scripts/dsh-source-validator.mjs", "scripts/archive-member-contract.mjs"]) await copyFile(path.join(process.cwd(), relative), path.join(sourceOnlyRoot, relative));
  const sourceOnlyModule = path.join(sourceOnlyScripts, "dsh-offline-package.mjs");
  const importModule = "await import(" + JSON.stringify(new URL("file://" + sourceOnlyModule.replaceAll("\\", "/")).href) + ")";
  execFileSync(process.execPath, ["--input-type=module", "-e", importModule], { cwd: sourceOnlyRoot, env: { ...process.env, NODE_PATH: "", NODE_OPTIONS: "" } });
  const staged = path.join(root, "staged");
  await mkdir(staged);
  const contract = await createFixture(staged);
  const stagedIdentity = await validateDshSourceIdentity(staged, contract, { readOnly: true });
  for (const unsafe of ["/absolute", "../escape", "nested/../../escape", "C:/drive", "\\\\server\\share", "\\\\?\\C:\\device", "CON", "dir/trailing.", "dir/trailing ", "a\\b"]) {
    const archive = path.join(root, `${createHash("sha256").update(unsafe).digest("hex")}.tar`); await writeFile(archive, tarEntry(unsafe)); await assert.rejects(readOfflineDshArchive(archive));
  }
  const duplicateArchive = path.join(root, "duplicate.tar"); await writeFile(duplicateArchive, Buffer.concat([tarEntry("same.txt").subarray(0, 512), tarEntry("same.txt")])); await assert.rejects(readOfflineDshArchive(duplicateArchive));
  const specialArchive = path.join(root, "special.tar"); await writeFile(specialArchive, tarEntry("special", { type: "3" })); await assert.rejects(readOfflineDshArchive(specialArchive));
  for (const [label, target] of [["absolute", "/outside"], ["escape", "../outside"], ["nested-escape", "../../outside"], ["drive", "C:/outside"], ["unc", "//server/share"], ["device", "\\\\?\\C:\\outside"], ["dangling", "missing"], ["self-cycle", "invalid-link"]]) await expectRejectedOfflineLink(root, label, target);
  await expectRejectedOfflineLink(root, "multi-hop-cycle", "second-link", [["second-link", "invalid-link"]]);
  await expectRejectedOfflineLink(root, "multi-hop-escape", "second-link", [["second-link", "../../outside"]]);
  const bundle = path.join(root, "fixture.bundle");
  git(staged, ["bundle", "create", bundle, sourceRef]);
  const bundleSha256 = await hashFile(bundle);
  const evidenceRoot = path.join(root, "evidence");
  await mkdir(evidenceRoot);
  const validEvidence = evidenceFor(contract, stagedIdentity, { bundleSha256, advertisedRef: sourceRef, advertisedCommit: contract.sourceCommit, advertisedTree: contract.sourceTree, artifactRetained: true });
  const evidencePath = await writeEvidence(evidenceRoot, "provenance.json", validEvidence);
  const bundleIdentity = await validateDshAcquisitionEvidence({ evidencePath, bundlePath: bundle, stagedSourceDir: staged, expected: contract });
  const constructorIdentity = await bindDshConstructorProvenance({ dshRoot: staged, dshContract: { ...contract, version: contract.sourceVersion }, dshVersion: contract.sourceVersion, dshCommit: contract.sourceCommit, evidencePath, bundlePath: bundle });
  assert.deepEqual({ version: bundleIdentity.version, commit: bundleIdentity.commit, sourceFingerprint: bundleIdentity.fingerprint }, { version: constructorIdentity.version, commit: constructorIdentity.commit, sourceFingerprint: constructorIdentity.fingerprint });

  const renamedBundle = path.join(root, "renamed.bundle");
  await copyFile(bundle, renamedBundle);
  await assert.doesNotReject(validateDshAcquisitionEvidence({ evidencePath, bundlePath: renamedBundle, stagedSourceDir: staged, expected: contract }));
  await assert.rejects(validateDshAcquisitionEvidence({ evidencePath, stagedSourceDir: staged, expected: contract }));
  await assert.rejects(validateDshAcquisitionEvidence({ evidencePath, bundlePath: path.join(root, "missing.bundle"), stagedSourceDir: staged, expected: contract }));

  const tamperedBundle = path.join(root, "tampered.bundle");
  await writeFile(tamperedBundle, "not a bundle\n");
  await assert.rejects(validateDshAcquisitionEvidence({ evidencePath, bundlePath: tamperedBundle, stagedSourceDir: staged, expected: contract }));
  await assert.rejects(validateDshAcquisitionEvidence({ evidencePath, bundlePath: bundle, stagedSourceDir: staged, expected: { ...contract, sourceCommit: "0".repeat(40) } }));
  await assert.rejects(validateDshAcquisitionEvidence({ evidencePath, bundlePath: bundle, stagedSourceDir: staged, expected: { ...contract, sourceTree: "0".repeat(40) } }));
  await assert.rejects(validateDshAcquisitionEvidence({ evidencePath, bundlePath: bundle, stagedSourceDir: staged, expected: { ...contract, sourceVersion: "0.0.0" } }));
  await assert.rejects(validateDshAcquisitionEvidence({ evidencePath, bundlePath: bundle, stagedSourceDir: staged, expected: { ...contract, sourceFingerprint: "0".repeat(64) } }));

  const wrongRef = await writeEvidence(evidenceRoot, "wrong-ref.json", evidenceFor(contract, stagedIdentity, { ...validEvidence.verification, advertisedRef: "refs/tags/wrong" }));
  await assert.rejects(validateDshAcquisitionEvidence({ evidencePath: wrongRef, bundlePath: bundle, stagedSourceDir: staged, expected: contract }));
  const forged = { ...validEvidence, verification: { ...validEvidence.verification, bundleVerify: "PASS" } };
  const forgedPath = await writeEvidence(evidenceRoot, "forged.json", forged);
  await assert.rejects(validateDshAcquisitionEvidence({ evidencePath: forgedPath, bundlePath: bundle, stagedSourceDir: staged, expected: contract }));
  await writeFile(`${evidencePath}.sha256`, `${"0".repeat(64)}  provenance.json\n`);
  await assert.rejects(validateDshAcquisitionEvidence({ evidencePath, bundlePath: bundle, stagedSourceDir: staged, expected: contract }));
  await writeFile(`${evidencePath}.sha256`, `${createHash("sha256").update(await readFile(evidencePath)).digest("hex")}  provenance.json\n`);

  const otherStaged = path.join(root, "other-staged");
  await mkdir(otherStaged);
  await createFixture(otherStaged);
  await assert.rejects(validateDshAcquisitionEvidence({ evidencePath, bundlePath: bundle, stagedSourceDir: otherStaged, expected: contract }));
  const httpsEvidence = evidenceFor(contract, stagedIdentity, { transport: "git-https", resolvedRef: sourceRef, resolvedCommit: contract.sourceCommit, resolvedTree: contract.sourceTree }, "upstream-https");
  const httpsEvidencePath = await writeEvidence(evidenceRoot, "https.json", httpsEvidence);
  const httpsIdentity = await validateDshAcquisitionEvidence({ evidencePath: httpsEvidencePath, stagedSourceDir: staged, expected: contract });
  assert.deepEqual({ version: bundleIdentity.version, commit: bundleIdentity.commit, sourceFingerprint: bundleIdentity.fingerprint }, { version: httpsIdentity.version, commit: httpsIdentity.commit, sourceFingerprint: httpsIdentity.fingerprint });
  await assert.rejects(bindDshConstructorProvenance({ dshRoot: staged, dshContract: { ...contract, version: contract.sourceVersion }, dshVersion: contract.sourceVersion, dshCommit: contract.sourceCommit, evidencePath: path.join(evidenceRoot, "missing.json"), bundlePath: bundle }));
  await assert.rejects(bindDshConstructorProvenance({ dshRoot: staged, dshContract: { ...contract, version: contract.sourceVersion }, dshVersion: contract.sourceVersion, dshCommit: "0".repeat(40), evidencePath, bundlePath: bundle }));
  const offlinePackage = await generateOfflineDshPackage({ sourceDir: staged, outputDir: path.join(root, "offline-package"), expected: contract });
  assert.equal(offlinePackage.entries.filter((entry) => entry.type === "symlink").length, 1);
  const offlineRoot = path.join(root, "offline-materialized");
  const offlineMaterialized = await materializeOfflineDshPackage({ archivePath: offlinePackage.archivePath, bundlePath: offlinePackage.bundlePath, manifestPath: offlinePackage.manifestPath, provenancePath: offlinePackage.provenancePath, expected: contract, outputDir: offlineRoot });
  const checkoutRoot = path.join(root, "offline-git-checkout");
  const checkout = await materializeOfflineDshGitCheckout({ packageResult: offlinePackage, outputDir: checkoutRoot, expected: contract });
  assert.equal(checkout.identity.commit, contract.sourceCommit);
  assert.equal(checkout.identity.tree, contract.sourceTree);
  await assert.doesNotReject(validateOfflineDshGitCheckout({ packageResult: offlinePackage, outputDir: checkoutRoot, expected: contract }));
  const runBindingPath = path.join(root, "offline-run-binding.json");
  const runBinding = await createOfflineDshRunBinding({ packageResult: offlinePackage, targetRunId: "g029-fixture", materializedRootIdentity: offlineMaterialized.materializedIdentity.materializedRootIdentity, outputPath: runBindingPath });
  const offlineEvidence = evidenceFor(contract, offlinePackage.identity, { archiveSha256: offlinePackage.archiveSha256, bundleSha256: offlinePackage.bundleSha256, bundleSize: offlinePackage.bundleSize, manifestSha256: offlinePackage.manifestSha256, materializationMode: "validated-dereference", packageSchemaVersion: 2, requiredCommit: offlinePackage.sourceCommit, runBindingSha256: runBinding.bindingSha256, sourceMemberCount: offlinePackage.sourceMemberCount }, "offline-package");
  const offlineEvidencePath = await writeEvidence(evidenceRoot, "offline.json", offlineEvidence);
  const offlineInput = { archivePath: offlinePackage.archivePath, bundlePath: offlinePackage.bundlePath, manifestPath: offlinePackage.manifestPath, provenancePath: offlinePackage.provenancePath, runBindingPath, targetRunId: "g029-fixture" };
  const offlineIdentity = await validateDshAcquisitionEvidence({ evidencePath: offlineEvidencePath, offlinePackage: offlineInput, stagedSourceDir: offlineRoot, expected: contract });
  const offlineConstructorIdentity = await bindDshConstructorProvenance({ dshRoot: offlineRoot, dshContract: { ...contract, version: contract.sourceVersion }, dshVersion: contract.sourceVersion, dshCommit: contract.sourceCommit, evidencePath: offlineEvidencePath, offlinePackage: offlineInput });
  assert.deepEqual(offlineIdentity, offlineConstructorIdentity);
  await assert.doesNotReject(validateOfflineDshMaterialization({ packageResult: offlinePackage, outputDir: offlineRoot }));
  await assert.rejects(validateDshAcquisitionEvidence({ evidencePath: offlineEvidencePath, stagedSourceDir: offlineRoot, expected: contract }));
  await assert.rejects(validateDshAcquisitionEvidence({ evidencePath: offlineEvidencePath, offlinePackage: { ...offlineInput, bundlePath: path.join(root, "missing.bundle") }, stagedSourceDir: offlineRoot, expected: contract }));
  await assert.rejects(validateDshAcquisitionEvidence({ evidencePath: offlineEvidencePath, offlinePackage: { ...offlineInput, targetRunId: "other-run" }, stagedSourceDir: offlineRoot, expected: contract }));
  const wrongBindingPath = path.join(root, "wrong-binding.json");
  const wrongBinding = JSON.parse(await readFile(runBindingPath, "utf8")); wrongBinding.packageArchiveSha256 = "0".repeat(64); const wrongBindingBytes = Buffer.from(`${JSON.stringify(wrongBinding)}\n`); await writeFile(wrongBindingPath, wrongBindingBytes); await writeFile(`${wrongBindingPath}.sha256`, `${createHash("sha256").update(wrongBindingBytes).digest("hex")}  wrong-binding.json\n`);
  await assert.rejects(validateDshAcquisitionEvidence({ evidencePath: offlineEvidencePath, offlinePackage: { ...offlineInput, runBindingPath: wrongBindingPath }, stagedSourceDir: offlineRoot, expected: contract }));
  await assert.rejects(validateDshAcquisitionEvidence({ evidencePath: offlineEvidencePath, offlinePackage: offlineInput, stagedSourceDir: offlineRoot, expected: { ...contract, sourceRepository: "https://example.invalid/dsh.git" } }));
  await assert.rejects(validateDshAcquisitionEvidence({ evidencePath: offlineEvidencePath, offlinePackage: offlineInput, stagedSourceDir: offlineRoot, expected: { ...contract, sourceRef: "refs/tags/wrong" } }));
  await assert.rejects(validateDshAcquisitionEvidence({ evidencePath: offlineEvidencePath, offlinePackage: offlineInput, stagedSourceDir: offlineRoot, expected: { ...contract, sourceCommit: "0".repeat(40) } }));
  const tamperedArchive = path.join(root, "tampered-dsh-source.tar");
  await copyFile(offlinePackage.archivePath, tamperedArchive);
  await writeFile(tamperedArchive, Buffer.concat([await readFile(tamperedArchive), Buffer.from("x")]));
  await assert.rejects(validateDshAcquisitionEvidence({ evidencePath: offlineEvidencePath, offlinePackage: { ...offlineInput, archivePath: tamperedArchive }, stagedSourceDir: offlineRoot, expected: contract }));
  const tamperedOfflineBundle = path.join(root, "tampered-dsh-source.bundle");
  await copyFile(offlinePackage.bundlePath, tamperedOfflineBundle);
  await writeFile(tamperedOfflineBundle, Buffer.concat([await readFile(tamperedOfflineBundle), Buffer.from("x")]));
  await assert.rejects(validateDshAcquisitionEvidence({ evidencePath: offlineEvidencePath, offlinePackage: { ...offlineInput, bundlePath: tamperedOfflineBundle }, stagedSourceDir: offlineRoot, expected: contract }));
  const tamperedManifest = path.join(root, "tampered-dsh-source.manifest.json");
  const manifest = JSON.parse(await readFile(offlinePackage.manifestPath, "utf8")); manifest.sourceMemberCount += 1; await writeFile(tamperedManifest, `${JSON.stringify(manifest)}\n`);
  await assert.rejects(validateDshAcquisitionEvidence({ evidencePath: offlineEvidencePath, offlinePackage: { ...offlineInput, manifestPath: tamperedManifest }, stagedSourceDir: offlineRoot, expected: contract }));
  const tamperedProvenance = path.join(root, "tampered-dsh-source.provenance.json");
  const provenance = JSON.parse(await readFile(offlinePackage.provenancePath, "utf8")); provenance.repository = "https://example.invalid/dsh.git"; await writeFile(tamperedProvenance, `${JSON.stringify(provenance)}\n`);
  await assert.rejects(validateDshAcquisitionEvidence({ evidencePath: offlineEvidencePath, offlinePackage: { ...offlineInput, provenancePath: tamperedProvenance }, stagedSourceDir: offlineRoot, expected: contract }));
  const wrongModeEvidence = await writeEvidence(evidenceRoot, "offline-wrong-mode.json", { ...offlineEvidence, method: "bundle" });
  await assert.rejects(validateDshAcquisitionEvidence({ evidencePath: wrongModeEvidence, offlinePackage: offlineInput, stagedSourceDir: offlineRoot, expected: contract }));
  await writeFile(path.join(offlineRoot, "unexpected.txt"), "unexpected\n");
  await assert.rejects(validateOfflineDshMaterialization({ packageResult: offlinePackage, outputDir: offlineRoot }));
  await rm(path.join(offlineRoot, "unexpected.txt"));
  const nativeRoot = path.join(root, "offline-native");
  await assert.rejects(materializeOfflineDshPackage({ archivePath: offlinePackage.archivePath, bundlePath: offlinePackage.bundlePath, manifestPath: offlinePackage.manifestPath, provenancePath: offlinePackage.provenancePath, expected: contract, outputDir: nativeRoot, mode: "native" }));
  await writeFile(path.join(offlineRoot, "package.json"), "tampered\n");
  await assert.rejects(validateDshAcquisitionEvidence({ evidencePath: offlineEvidencePath, offlinePackage: offlineInput, stagedSourceDir: offlineRoot, expected: contract }));
  console.log("[DSH Provenance] bundle, HTTPS, sidecar, staged binding, and forged evidence cases: PASS");
} finally {
  await rm(root, { recursive: true, force: true });
}
