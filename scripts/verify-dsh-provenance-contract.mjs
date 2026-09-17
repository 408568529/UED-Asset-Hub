import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFile, mkdtemp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { dshProvenanceContractVersion, serializeDshProvenanceEvidence, validateDshAcquisitionEvidence, validateDshSourceIdentity } from "../agent-integration/scripts/dsh-source-validator.mjs";
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
  git(directory, ["init", "-q"]);
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

const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "ued-dsh-provenance-contract-"));
const root = await realpath(temporaryRoot);
try {
  const staged = path.join(root, "staged");
  await mkdir(staged);
  const contract = await createFixture(staged);
  const stagedIdentity = await validateDshSourceIdentity(staged, contract, { readOnly: true });
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
  console.log("[DSH Provenance] bundle, HTTPS, sidecar, staged binding, and forged evidence cases: PASS");
} finally {
  await rm(root, { recursive: true, force: true });
}
