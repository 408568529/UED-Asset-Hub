import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFile, mkdtemp, mkdir, readFile, rm, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { calculateNativeSourceInputs, canonicalManifestBytes, commandFingerprint, createNativeBuildId, createNativeSetManifestV2, createNativeSetRunBinding, nativeComponentDefinitions, nativeSourceIdentity, nativeSourceInputs, promoteNativeCandidate, validateNativeSetManifest, validateNativeSetRunBindingFile, verifyFrozenNativeSet, writeCanonicalManifest } from "./native-artifact-contract.mjs";
import { assertFrozenNativeSetBinding, resolveFrozenNativeSetPath } from "./windows-release-constructor.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const commitA = "9fff3374f26f2b303b7535d81962feef53211f41";
const commitB = "e303222d30df0a8e50c1d8b29b3aecc69dda2bb1";
const archiveA = "a".repeat(64);
const archiveB = "b".repeat(64);
const toolchain = Object.freeze({ buildToolsVersion: "17.12.0", compilerVersion: "19.42.34436", linkerVersion: "14.42.34436", windowsSdkVersion: "10.0.26100.0" });
const nativePaths = [...new Set(Object.values(nativeSourceInputs).flat())].sort();
const projectRoot = path.resolve(import.meta.dirname, "..");
let cases = 0;
let passed = 0;
let fixture = 0;

function component(definition, bytes, sourceCommit, currentToolchain = toolchain) {
  const binary = { fileName: path.basename(definition.executableRelativePath), imports: ["KERNEL32.dll"], peMachine: "AMD64", runtimeDependencyClassification: "A", sha256: sha256(bytes), size: bytes.length };
  return { manifestSchemaVersion: 1, version: 1, componentName: definition.componentName, componentType: "windows-native-helper", assetHubCommit: sourceCommit, architecture: "x64", sha256: binary.sha256, source: { relativePath: `native/${definition.componentName}/source.cpp`, sha256: sha256(`${definition.componentName}:source`) }, buildScript: { relativePath: `scripts/build-${definition.componentName}.mjs`, sha256: sha256(`${definition.componentName}:script`) }, toolchain: { compilerName: "cl.exe", compilerVersion: currentToolchain.compilerVersion, linkerVersion: currentToolchain.linkerVersion, windowsSdkVersion: currentToolchain.windowsSdkVersion }, build: { commandFingerprint: commandFingerprint({ component: definition.componentName, output: binary.fileName }), configuration: "release-native" }, binary, verification: { componentLocalGateVersion: "fixture-v1", passedChecks: ["fixture-pass"], deferredChecks: ["service-context"] } };
}

async function rejects(action) { cases += 1; await assert.rejects(action); passed += 1; }
async function source(root, marker = "same") {
  for (const relativePath of nativePaths) {
    const target = path.join(root, ...relativePath.split("/"));
    await mkdir(path.dirname(target), { recursive: true });
    if (relativePath.endsWith(".mjs")) await copyFile(path.join(projectRoot, ...relativePath.split("/")), target);
    else await writeFile(target, `${marker}:${relativePath}`);
  }
  assert.deepEqual((await calculateNativeSourceInputs(root)).map(({ relativePath }) => relativePath), nativePaths, "fixture must contain every contracted Native source member");
}
async function outputs(root, sourceCommit, marker = "same") {
  for (const definition of nativeComponentDefinitions) {
    const executable = path.join(root, ...definition.executableRelativePath.split("/"));
    const integrity = path.join(root, ...definition.integrityManifestRelativePath.split("/"));
    const bytes = Buffer.from(`${marker}:${definition.componentName}`);
    await mkdir(path.dirname(executable), { recursive: true });
    await writeFile(executable, bytes);
    await writeCanonicalManifest(integrity, component(definition, bytes, sourceCommit));
  }
}
async function generated(root, { sourceCommit = commitA, sourceArchiveSha256 = archiveA, sourceMarker = "same", outputMarker = "same", inputFiles } = {}) {
  fixture += 1;
  const sourceRoot = path.join(root, `source-${fixture}-${sourceCommit}-${sourceMarker}`);
  const nativeOutputRoot = path.join(root, `outputs-${fixture}-${sourceCommit}-${outputMarker}`);
  await source(sourceRoot, sourceMarker);
  await outputs(nativeOutputRoot, sourceCommit, outputMarker);
  const manifest = await createNativeSetManifestV2({ sourceCommit, sourceArchiveSha256, ...(inputFiles ? { nativeSourceInputs: inputFiles } : { sourceRoot }), toolchain, configuration: "release-native", nativeOutputRoot });
  return { sourceRoot, nativeOutputRoot, manifest };
}

const root = await mkdtemp(path.join(os.tmpdir(), "ued-g033-"));
try {
  const first = await generated(root);
  assert.doesNotThrow(() => validateNativeSetManifest(first.manifest));
  const firstBytes = canonicalManifestBytes(first.manifest);
  await writeFile(path.join(first.nativeOutputRoot, "native-components.manifest.json"), firstBytes);
  const verified = await verifyFrozenNativeSet(first.nativeOutputRoot, { requireDirectoryIdentity: false });
  assert.equal(verified.manifest.nativeBuildId, createNativeBuildId(first.manifest.nativeSourceIdentity, toolchain));
  const reloaded = JSON.parse(await readFile(path.join(first.nativeOutputRoot, "native-components.manifest.json"), "utf8"));
  assert.doesNotThrow(() => validateNativeSetManifest(reloaded));

  const second = await generated(root, { sourceMarker: "same", outputMarker: "same" });
  assert.deepEqual(canonicalManifestBytes(second.manifest), firstBytes);
  await utimes(second.sourceRoot, new Date(0), new Date(0));
  assert.deepEqual(canonicalManifestBytes(await createNativeSetManifestV2({ sourceCommit: commitA, sourceArchiveSha256: archiveA, sourceRoot: second.sourceRoot, toolchain, configuration: "release-native", nativeOutputRoot: second.nativeOutputRoot })), firstBytes);

  const sourceB = await generated(root, { sourceCommit: commitB, sourceArchiveSha256: archiveB, sourceMarker: "same", outputMarker: "same" });
  assert.equal(sourceB.manifest.nativeSourceIdentity, first.manifest.nativeSourceIdentity);
  assert.equal(sourceB.manifest.nativeBuildId, first.manifest.nativeBuildId);
  assert.notDeepEqual(canonicalManifestBytes(sourceB.manifest), firstBytes);

  const mutatedInput = path.join(second.sourceRoot, "native", "windows-job-helper", "ued_windows_job_helper.cpp");
  await writeFile(mutatedInput, "one-byte mutation");
  const inputChanged = await createNativeSetManifestV2({ sourceCommit: commitA, sourceArchiveSha256: archiveA, sourceRoot: second.sourceRoot, toolchain, configuration: "release-native", nativeOutputRoot: second.nativeOutputRoot });
  assert.notEqual(inputChanged.nativeSourceIdentity, first.manifest.nativeSourceIdentity);
  assert.notEqual(inputChanged.nativeBuildId, first.manifest.nativeBuildId);
  await writeFile(mutatedInput, "same:native/windows-job-helper/ued_windows_job_helper.cpp");
  const changedToolchain = { ...toolchain, linkerVersion: "14.42.34437" };
  const toolchainOutput = await generated(root, { sourceMarker: "toolchain", outputMarker: "toolchain" });
  for (const definition of nativeComponentDefinitions) { const executable = path.join(toolchainOutput.nativeOutputRoot, ...definition.executableRelativePath.split("/")); await writeCanonicalManifest(path.join(toolchainOutput.nativeOutputRoot, ...definition.integrityManifestRelativePath.split("/")), component(definition, await readFile(executable), commitA, changedToolchain)); }
  const toolchainChanged = await createNativeSetManifestV2({ sourceCommit: commitA, sourceArchiveSha256: archiveA, sourceRoot: toolchainOutput.sourceRoot, toolchain: changedToolchain, configuration: "release-native", nativeOutputRoot: toolchainOutput.nativeOutputRoot });
  assert.notEqual(toolchainChanged.nativeBuildId, first.manifest.nativeBuildId);
  const changedExecutable = path.join(second.nativeOutputRoot, "job-helper", "ued-windows-job-helper.exe");
  await writeFile(changedExecutable, "new legitimate output");
  await writeCanonicalManifest(path.join(second.nativeOutputRoot, "job-helper", "ued-windows-job-helper.manifest.json"), component(nativeComponentDefinitions[0], Buffer.from("new legitimate output"), commitA));
  const outputChanged = await createNativeSetManifestV2({ sourceCommit: commitA, sourceArchiveSha256: archiveA, sourceRoot: second.sourceRoot, toolchain, configuration: "release-native", nativeOutputRoot: second.nativeOutputRoot });
  assert.notEqual(outputChanged.nativeSetDigest, first.manifest.nativeSetDigest);

  const baselineInputs = await calculateNativeSourceInputs(second.sourceRoot);
  for (const input of [
    { ...first, sourceCommit: undefined },
    { ...first, sourceArchiveSha256: "bad" },
  ]) await rejects(async () => createNativeSetManifestV2({ sourceCommit: input.sourceCommit, sourceArchiveSha256: input.sourceArchiveSha256, sourceRoot: second.sourceRoot, toolchain, configuration: "release-native", nativeOutputRoot: second.nativeOutputRoot }));
  for (const files of [[], baselineInputs.slice(1), [...baselineInputs, structuredClone(baselineInputs[0])], baselineInputs.map((item, index) => index === 0 ? { ...item, sha256: "bad" } : item), baselineInputs.map((item, index) => index === 0 ? { ...item, size: -1 } : item)]) await rejects(async () => createNativeSetManifestV2({ sourceCommit: commitA, sourceArchiveSha256: archiveA, nativeSourceInputs: files, toolchain, configuration: "release-native", nativeOutputRoot: second.nativeOutputRoot }));
  const missingOutput = await generated(root, { sourceMarker: "missing-output", outputMarker: "missing-output" });
  await rm(path.join(missingOutput.nativeOutputRoot, "job-helper", "ued-windows-job-helper.exe"));
  await rejects(async () => createNativeSetManifestV2({ sourceCommit: commitA, sourceArchiveSha256: archiveA, sourceRoot: missingOutput.sourceRoot, toolchain, configuration: "release-native", nativeOutputRoot: missingOutput.nativeOutputRoot }));
  const extraOutput = await generated(root, { sourceMarker: "extra-output", outputMarker: "extra-output" });
  await writeFile(path.join(extraOutput.nativeOutputRoot, "job-helper", "extra.exe"), "extra");
  await rejects(async () => createNativeSetManifestV2({ sourceCommit: commitA, sourceArchiveSha256: archiveA, sourceRoot: extraOutput.sourceRoot, toolchain, configuration: "release-native", nativeOutputRoot: extraOutput.nativeOutputRoot }));
  await rejects(async () => createNativeSetManifestV2({ sourceCommit: commitA, sourceArchiveSha256: archiveA, sourceRoot: second.sourceRoot, toolchain: { ...toolchain, compilerVersion: "" }, configuration: "release-native", nativeOutputRoot: second.nativeOutputRoot }));
  await rejects(async () => createNativeSetManifestV2({ sourceCommit: commitA, sourceArchiveSha256: archiveA, sourceRoot: second.sourceRoot, toolchain, configuration: "debug", nativeOutputRoot: second.nativeOutputRoot }));
  await rejects(async () => createNativeSetManifestV2({ sourceCommit: commitA, sourceArchiveSha256: archiveA, sourceRoot: second.sourceRoot, toolchain, configuration: "release-native", nativeOutputRoot: second.nativeOutputRoot, nativeBuildId: "nb2-forged" }));

  const formal = await generated(root, { sourceMarker: "pipeline", outputMarker: "pipeline" });
  await writeCanonicalManifest(path.join(formal.nativeOutputRoot, "native-components.manifest.json"), formal.manifest);
  const manifestSha = sha256(await readFile(path.join(formal.nativeOutputRoot, "native-components.manifest.json")));
  const binding = path.join(root, "native-set.run-binding.json");
  await createNativeSetRunBinding({ runId: "r2g-g033-fixture", sourceCommit: commitA, sourceArchiveSha256: archiveA, nativeSetManifestSha256: manifestSha, nativeSourceIdentity: formal.manifest.nativeSourceIdentity, nativeBuildId: formal.manifest.nativeBuildId, outputPath: binding });
  await validateNativeSetRunBindingFile({ bindingPath: binding, runId: "r2g-g033-fixture", sourceCommit: commitA, sourceArchiveSha256: archiveA, nativeSetManifestSha256: manifestSha, nativeSourceIdentity: formal.manifest.nativeSourceIdentity, nativeBuildId: formal.manifest.nativeBuildId });
  const staging = path.join(root, "staging");
  const frozenRoot = path.join(staging, "frozen", "native-components");
  const promotedNative = await promoteNativeCandidate({ candidateDirectory: formal.nativeOutputRoot, frozenRoot });
  const promotedVerified = await verifyFrozenNativeSet(promotedNative.directory);
  await assertFrozenNativeSetBinding({ stagingRoot: staging, nativeBuildId: formal.manifest.nativeBuildId, nativeSetDigest: promotedVerified.set.digest, nativeSetRoot: promotedNative.directory, native: promotedVerified, sourceRoot: formal.sourceRoot, sourceCommit: commitA, sourceArchiveSha256: archiveA });
  console.log(JSON.stringify({ result: "PASS", FORMAL_NATIVE_SET_GENERATOR: "PASS", GENERATOR_NATIVE_SOURCE_AUTHORITY: "PASS", GENERATOR_TOOLCHAIN_AUTHORITY: "PASS", GENERATOR_NATIVE_BUILD_ID: "PASS", GENERATOR_OUTPUT_EXACT_SET: "PASS", GENERATOR_VALIDATOR_ROUND_TRIP: "PASS", SERIALIZED_ROUND_TRIP: "PASS", FORMAL_GENERATOR_DETERMINISM: "PASS", FORMAL_SOURCE_PROVENANCE_BINDING: "PASS", GENERATOR_NATIVE_INPUT_CHANGE: "PASS", GENERATOR_TOOLCHAIN_CHANGE: "PASS", GENERATOR_OUTPUT_CHANGE: "PASS", GENERATOR_FAIL_CLOSED_CASE_COUNT: cases, GENERATOR_FAIL_CLOSED_PASS_COUNT: passed, GENERATOR_FAIL_CLOSED_FAILURE_COUNT: cases - passed, NATIVE_SET_SCHEMA_AUTHORITY: "SINGLE_CANONICAL_CONTRACT", FORMAL_NATIVE_SET_PIPELINE: "PASS", G033_CONSTRUCTOR_INTEGRATION: "PASS", HISTORICAL_NATIVE_GENERATOR_AUTHORITY_COUNT: 0 }));
} finally {
  await rm(root, { recursive: true, force: true });
}
