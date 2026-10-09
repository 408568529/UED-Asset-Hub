import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFile, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createNativeSetManifestV2, createNativeSetManifestV3, createNativeSetRunBinding, nativeComponentDefinitions, nativeSourceInputs, validateNativeSetManifest, validateNativeSetRunBindingFile, verifyFrozenNativeSet, writeCanonicalManifest, writeNativeComponentManifest } from "./native-artifact-contract.mjs";
import { resolveFrozenNativeSetPath } from "./windows-release-constructor.mjs";

const sha256 = value => createHash("sha256").update(value).digest("hex");
const sourceCommit = "e3f597c831bb6a592007367354cd24fe49b79f7a";
const archiveA = "d8c2c224ed4abfcbecb1009acba62d3e0ad8c5921b514f73cc0dd6fb2414c64e";
const archiveB = "1f5e0ab8fb95d2c6e19cff714fd8bc20e666f8f68f0aba9cfaa6bf3b56d56a3e";
const toolchain = { buildToolsVersion: "17.14.37614.0", compilerVersion: "19.44.35228", linkerVersion: "14.44.35228", windowsSdkVersion: "10.0.26100.0" };
const componentToolchain = { compilerVersion: toolchain.compilerVersion, linkerVersion: toolchain.linkerVersion, windowsSdkVersion: toolchain.windowsSdkVersion };

async function writeFixtureSource(root) {
  for (const relativePath of new Set(Object.values(nativeSourceInputs).flat())) {
    const target = path.join(root, ...relativePath.split("/"));
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, `fixture:${relativePath}`);
  }
}

async function createFixture(root, name, archiveSha256, generator) {
  const sourceRoot = path.join(root, `${name}-source`);
  const outputRoot = path.join(root, `${name}-native`);
  await writeFixtureSource(sourceRoot);
  for (const definition of nativeComponentDefinitions) {
    const outputDir = path.join(outputRoot, definition.componentName);
    await mkdir(outputDir, { recursive: true });
    await writeFile(path.join(outputDir, path.basename(definition.executableRelativePath)), `fresh:${definition.componentName}`);
    await writeNativeComponentManifest({ definition, outputDir, sourceRoot, assetHubCommit: sourceCommit, toolchain: componentToolchain });
  }
  const manifest = await generator({ sourceCommit, sourceArchiveSha256: archiveSha256, sourceRoot, toolchain, configuration: "release-native", nativeOutputRoot: outputRoot });
  await writeCanonicalManifest(path.join(outputRoot, "native-components.manifest.json"), manifest);
  return { sourceRoot, outputRoot, manifest };
}

const root = await mkdtemp(path.join(os.tmpdir(), "ued-native-set-v3-"));
try {
  const first = await createFixture(root, "same-a", archiveA, createNativeSetManifestV3);
  const same = await createFixture(root, "same-b", archiveA, createNativeSetManifestV3);
  assert.equal(first.manifest.nativeBuildId, same.manifest.nativeBuildId);
  assert.deepEqual(await readFile(path.join(first.outputRoot, "native-components.manifest.json")), await readFile(path.join(same.outputRoot, "native-components.manifest.json")));
  const otherArchive = await createFixture(root, "archive-b", archiveB, createNativeSetManifestV3);
  assert.equal(otherArchive.manifest.nativeSourceIdentity, first.manifest.nativeSourceIdentity);
  assert.equal(otherArchive.manifest.nativeSetDigest, first.manifest.nativeSetDigest);
  assert.notEqual(otherArchive.manifest.nativeBuildId, first.manifest.nativeBuildId);
  assert.match(first.manifest.nativeBuildId, /^nb3-[a-f0-9]{64}$/u);
  assert.equal((await verifyFrozenNativeSet(first.outputRoot, { requireDirectoryIdentity: false })).manifest.nativeBuildId, first.manifest.nativeBuildId);

  const wrongArchive = structuredClone(first.manifest);
  wrongArchive.sourceArchiveSha256 = archiveB;
  assert.throws(() => validateNativeSetManifest(wrongArchive));

  const legacyV2 = await createFixture(root, "legacy-v2", archiveA, createNativeSetManifestV2);
  assert.match(legacyV2.manifest.nativeBuildId, /^nb2-/u);
  assert.equal((await verifyFrozenNativeSet(legacyV2.outputRoot, { requireDirectoryIdentity: false })).manifest.nativeBuildId, legacyV2.manifest.nativeBuildId);
  const legacyV1Root = path.join(root, `nb1-${sourceCommit.slice(0, 12)}-${legacyV2.manifest.nativeSetDigest.slice(0, 32)}`);
  await mkdir(legacyV1Root);
  for (const definition of nativeComponentDefinitions) {
    for (const member of [definition.executableRelativePath, definition.integrityManifestRelativePath]) {
      const target = path.join(legacyV1Root, ...member.split("/"));
      await mkdir(path.dirname(target), { recursive: true });
      await copyFile(path.join(legacyV2.outputRoot, ...member.split("/")), target);
    }
  }
  await writeCanonicalManifest(path.join(legacyV1Root, "native-components.manifest.json"), {
    manifestSchemaVersion: 1,
    nativeArtifactSetSchemaVersion: 1,
    assetHubCommit: sourceCommit,
    sourceArchiveSha256: archiveA,
    architecture: "x64",
    toolchain,
    components: legacyV2.manifest.components,
    nativeSetDigestAlgorithm: legacyV2.manifest.nativeSetDigestAlgorithm,
    nativeSetDigest: legacyV2.manifest.nativeSetDigest,
  });
  assert.equal((await verifyFrozenNativeSet(legacyV1Root)).manifest.manifestSchemaVersion, 1);

  const bindingPath = path.join(root, "v3.run-binding.json");
  const manifestSha = sha256(await readFile(path.join(first.outputRoot, "native-components.manifest.json")));
  await createNativeSetRunBinding({ runId: "v4-run-fixture", sourceCommit, sourceArchiveSha256: archiveA, nativeSetManifestSha256: manifestSha, nativeSourceIdentity: first.manifest.nativeSourceIdentity, nativeBuildId: first.manifest.nativeBuildId, outputPath: bindingPath });
  await validateNativeSetRunBindingFile({ bindingPath, runId: "v4-run-fixture", sourceCommit, sourceArchiveSha256: archiveA, nativeSetManifestSha256: manifestSha, nativeSourceIdentity: first.manifest.nativeSourceIdentity, nativeBuildId: first.manifest.nativeBuildId });
  const legacyBindingPath = path.join(root, "nb2.run-binding.json");
  const legacyManifestSha = sha256(await readFile(path.join(legacyV2.outputRoot, "native-components.manifest.json")));
  await createNativeSetRunBinding({ runId: "v3-run-fixture", sourceCommit, sourceArchiveSha256: archiveA, nativeSetManifestSha256: legacyManifestSha, nativeSourceIdentity: legacyV2.manifest.nativeSourceIdentity, nativeBuildId: legacyV2.manifest.nativeBuildId, outputPath: legacyBindingPath });
  await copyFile(legacyBindingPath, bindingPath);
  await copyFile(`${legacyBindingPath}.sha256`, `${bindingPath}.sha256`);
  await assert.rejects(() => validateNativeSetRunBindingFile({ bindingPath, runId: "v4-run-fixture", sourceCommit, sourceArchiveSha256: archiveA, nativeSetManifestSha256: manifestSha, nativeSourceIdentity: first.manifest.nativeSourceIdentity, nativeBuildId: first.manifest.nativeBuildId }));

  await assert.rejects(() => createNativeSetManifestV3({ sourceCommit, sourceArchiveSha256: archiveA, sourceRoot: first.sourceRoot, toolchain: { ...toolchain, compilerVersion: "wrong" }, configuration: "release-native", nativeOutputRoot: first.outputRoot }));
  const tamperedExecutable = path.join(first.outputRoot, "job-helper", "ued-windows-job-helper.exe");
  const originalExecutable = await readFile(tamperedExecutable);
  await writeFile(tamperedExecutable, Buffer.concat([originalExecutable, Buffer.from("x")]));
  await assert.rejects(() => verifyFrozenNativeSet(first.outputRoot, { requireDirectoryIdentity: false }));
  await writeFile(tamperedExecutable, originalExecutable);

  assert.equal(resolveFrozenNativeSetPath("D:\\UED-Asset-Hub-Staging", first.manifest.nativeBuildId), path.resolve("D:\\UED-Asset-Hub-Staging", "frozen", "native-components", first.manifest.nativeBuildId));
  console.log(JSON.stringify({ result: "PASS", SAME_ARCHIVE_ID_DETERMINISM: "PASS", DIFFERENT_ARCHIVE_ID_SEPARATION: "PASS", LEGACY_NB1_VERIFICATION: "PASS", LEGACY_NB2_VERIFICATION: "PASS", WRONG_ARCHIVE_REJECTED: "PASS", TAMPERED_ARTIFACT_REJECTED: "PASS", WRONG_TOOLCHAIN_REJECTED: "PASS", WRONG_NB2_SIDECAR_REJECTED: "PASS", NB3_CONSTRUCTOR_PATH: "PASS" }));
} finally {
  await rm(root, { recursive: true, force: true });
}
