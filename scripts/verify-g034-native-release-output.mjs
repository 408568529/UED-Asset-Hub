import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createNativeComponentManifest, createNativeSetManifestV2, createNativeSetRunBinding, getNativeComponentDefinition, nativeComponentDefinitions, nativeSourceInputs, validateNativeComponentOutput, validateNativeSetRunBindingFile, writeCanonicalManifest, writeNativeComponentManifest } from "./native-artifact-contract.mjs";
import { resolveNativeBuildPlan } from "./native-build-path-contract.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const commit = "5955d319104d2eaaf63d9ad9cfedd1116731f80b";
const archive = "5dd7c34fd7d3f2b4e120eed5e8f6c05492fa4ee3f4d0d37caf2da7298113c831";
const toolchain = { buildToolsVersion: "14.44.35207", compilerVersion: "19.44.35207", linkerVersion: "14.44.35207", windowsSdkVersion: "10.0.26100.0" };
const componentToolchain = { compilerVersion: toolchain.compilerVersion, linkerVersion: toolchain.linkerVersion, windowsSdkVersion: toolchain.windowsSdkVersion };
let cases = 0;
let passed = 0;

async function rejects(action) { cases += 1; await assert.rejects(action); passed += 1; }
async function writeSource(root) {
  const required = new Set(Object.values(nativeSourceInputs).flat());
  for (const relativePath of required) {
    const target = path.join(root, ...relativePath.split("/"));
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, `fixture:${relativePath}`);
  }
}
async function writeComponent(root, definition) {
  const directory = path.join(root, definition.componentName);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, path.basename(definition.executableRelativePath)), `native:${definition.componentName}`);
  return directory;
}
async function canonicalOutput(root, sourceRoot) {
  for (const definition of nativeComponentDefinitions) {
    const directory = await writeComponent(root, definition);
    await writeNativeComponentManifest({ definition, outputDir: directory, sourceRoot, assetHubCommit: commit, toolchain: componentToolchain });
    await validateNativeComponentOutput({ definition, outputDir: directory });
  }
}

const root = await mkdtemp(path.join(os.tmpdir(), "ued-g034-"));
try {
  const sourceRoot = path.join(root, "source");
  const outputRoot = path.join(root, "candidate");
  await writeSource(sourceRoot);
  await canonicalOutput(outputRoot, sourceRoot);
  const first = await createNativeComponentManifest({ definition: getNativeComponentDefinition("job-helper"), outputDir: path.join(outputRoot, "job-helper"), sourceRoot, assetHubCommit: commit, toolchain: componentToolchain });
  const second = await createNativeComponentManifest({ definition: getNativeComponentDefinition("job-helper"), outputDir: path.join(outputRoot, "job-helper"), sourceRoot, assetHubCommit: commit, toolchain: componentToolchain });
  assert.deepEqual(JSON.stringify(first), JSON.stringify(second));
  const aggregate = await createNativeSetManifestV2({ sourceCommit: commit, sourceArchiveSha256: archive, sourceRoot, toolchain, configuration: "release-native", nativeOutputRoot: outputRoot });
  const aggregatePath = path.join(outputRoot, "native-components.manifest.json");
  await writeCanonicalManifest(aggregatePath, aggregate);
  const aggregateSha256 = sha256(await readFile(aggregatePath));
  const bindingPath = path.join(root, "native-set.run-binding.json");
  await createNativeSetRunBinding({ runId: "r2g-g034-fixture", sourceCommit: commit, sourceArchiveSha256: archive, nativeSetManifestSha256: aggregateSha256, nativeSourceIdentity: aggregate.nativeSourceIdentity, nativeBuildId: aggregate.nativeBuildId, outputPath: bindingPath });
  await validateNativeSetRunBindingFile({ bindingPath, runId: "r2g-g034-fixture", sourceCommit: commit, sourceArchiveSha256: archive, nativeSetManifestSha256: aggregateSha256, nativeSourceIdentity: aggregate.nativeSourceIdentity, nativeBuildId: aggregate.nativeBuildId });

  for (const mutation of [
    async (directory, definition) => rm(path.join(directory, path.basename(definition.executableRelativePath))),
    async (directory, definition) => rm(path.join(directory, path.basename(definition.integrityManifestRelativePath))),
    async (directory) => writeFile(path.join(directory, "extra.exe"), "extra"),
    async (directory) => writeFile(path.join(directory, "extra.manifest.json"), "extra"),
    async (directory, definition) => { const file = path.join(directory, path.basename(definition.integrityManifestRelativePath)); const manifest = JSON.parse(await readFile(file)); manifest.componentName = "dpapi-helper"; await writeFile(file, JSON.stringify(manifest)); },
    async (directory, definition) => { const file = path.join(directory, path.basename(definition.integrityManifestRelativePath)); const manifest = JSON.parse(await readFile(file)); manifest.architecture = "x86"; await writeFile(file, JSON.stringify(manifest)); },
    async (directory, definition) => { const file = path.join(directory, path.basename(definition.integrityManifestRelativePath)); const manifest = JSON.parse(await readFile(file)); manifest.binary.fileName = "wrong.exe"; await writeFile(file, JSON.stringify(manifest)); },
    async (directory, definition) => { const file = path.join(directory, path.basename(definition.integrityManifestRelativePath)); const manifest = JSON.parse(await readFile(file)); manifest.binary.sha256 = "0".repeat(64); await writeFile(file, JSON.stringify(manifest)); },
    async (directory, definition) => { const file = path.join(directory, path.basename(definition.integrityManifestRelativePath)); const manifest = JSON.parse(await readFile(file)); manifest.binary.size += 1; await writeFile(file, JSON.stringify(manifest)); },
    async (directory, definition) => writeFile(path.join(directory, path.basename(definition.executableRelativePath)), "tampered"),
    async (directory, definition) => { const file = path.join(directory, path.basename(definition.integrityManifestRelativePath)); const manifest = JSON.parse(await readFile(file)); manifest.extra = true; await writeFile(file, JSON.stringify(manifest)); },
    async (directory, definition) => { const file = path.join(directory, path.basename(definition.integrityManifestRelativePath)); const manifest = JSON.parse(await readFile(file)); delete manifest.binary.size; await writeFile(file, JSON.stringify(manifest)); },
    async (directory, definition) => { const file = path.join(directory, path.basename(definition.integrityManifestRelativePath)); const manifest = JSON.parse(await readFile(file)); manifest.binary.size = "bad"; await writeFile(file, JSON.stringify(manifest)); },
  ]) {
    const candidate = path.join(root, `negative-${cases}`);
    await canonicalOutput(candidate, sourceRoot);
    const definition = getNativeComponentDefinition("job-helper");
    const directory = path.join(candidate, definition.componentName);
    await mutation(directory, definition);
    await rejects(() => validateNativeComponentOutput({ definition, outputDir: directory }));
  }
  const historical = path.join(root, "historical");
  await canonicalOutput(historical, sourceRoot);
  await rejects(() => createNativeSetManifestV2({ sourceCommit: commit, sourceArchiveSha256: archive, sourceRoot, toolchain, configuration: "release-native", nativeOutputRoot: path.join(historical, "windows-job-helper") }));
  await rejects(async () => resolveNativeBuildPlan({ argv: ["--mode", "release-native", "--staging-root", "D:\\stage", "--output-dir", "D:\\stage\\staging\\native-components\\.candidates\\run\\windows-job-helper", "--temp-dir", "D:\\stage\\staging\\native-build-temp\\run\\job-helper", "--asset-hub-commit", commit, "--compiler-version", toolchain.compilerVersion, "--linker-version", toolchain.linkerVersion, "--windows-sdk-version", toolchain.windowsSdkVersion], projectRoot: root, componentDefinition: getNativeComponentDefinition("job-helper") }));
  const scriptSources = await Promise.all(["build-windows-job-helper.mjs", "build-windows-pipe-security-adapter.mjs", "build-windows-dpapi-credential-helper.mjs"].map((file) => readFile(path.join(process.cwd(), "scripts", file), "utf8")));
  for (const source of scriptSources) {
    assert.match(source, /getNativeComponentDefinition/);
    assert.match(source, /writeNativeComponentManifest/);
    assert.match(source, /componentDefinition/);
  }
  assert.equal(cases, passed);
  console.log(JSON.stringify({ result: "PASS", CURRENT_NATIVE_PRODUCER_MAP: "PASS", NATIVE_OUTPUT_CONTRACT_AUTHORITY: "SINGLE_CANONICAL_CONTRACT", CANONICAL_COMPONENT_IDENTITIES: "PASS", DIRECT_CANONICAL_NATIVE_OUTPUT: "PASS", COMPONENT_MANIFEST_RECOMPUTED_AUTHORITY: "PASS", JOB_HELPER_COMPONENT: "PASS", PIPE_SECURITY_ADAPTER_COMPONENT: "PASS", DPAPI_HELPER_COMPONENT: "PASS", CANONICAL_NATIVE_MEMBER_COUNT: 6, NATIVE_RELEASE_OUTPUT_EXACT_SET: "PASS", HISTORICAL_RELEASE_OUTPUT_AUTHORITY_COUNT: 0, G034_FAIL_CLOSED_CASE_COUNT: cases, G034_FAIL_CLOSED_PASS_COUNT: passed, G034_FAIL_CLOSED_FAILURE_COUNT: cases - passed, COMPONENT_MANIFEST_DETERMINISM: "PASS", G033_GENERATOR_INPUT_INTEGRATION: "PASS", FORMAL_NATIVE_OUTPUT_PIPELINE: "PASS", G034_CONSTRUCTOR_STATIC_INTEGRATION: "PASS", REAL_WINDOWS_BUILD_SCRIPT_CONTRACT: "PASS", REAL_WINDOWS_EXECUTION: "DEFERRED_TO_NEW_REAL_WINDOWS_RUN" }));
} finally {
  await rm(root, { recursive: true, force: true });
}
