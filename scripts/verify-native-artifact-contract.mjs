import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFile, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { calculateNativeSet, canonicalManifestBytes, commandFingerprint, copyNativeSetMembers, createNativeSetManifestV2, createNativeSetRunBinding, nativeSetDigestAlgorithm, nativeSetMembers, nativeSourceInputs, promoteNativeCandidate, validateComponentManifest, validateNativeSetRunBindingFile, verifyFrozenNativeSet, writeCanonicalManifest } from "./native-artifact-contract.mjs";
import { parseNativeBuildArgs, validateReleaseNativePathShape } from "./native-build-path-contract.mjs";
import { verifyWindowsJobHelper } from "./windows-job-helper-client.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const commit = "0890c522c0e4c7eef89f741db7d653d7f60b9939";
const sourceArchive = sha256("source-provenance");
const toolchain = { buildToolsVersion: "fixture", compilerVersion: "fixture", linkerVersion: "fixture", windowsSdkVersion: "10.0.26100.0" };
const sourcePaths = [...new Set(Object.values(nativeSourceInputs).flat())];
const component = (name, fileName, binarySha256, size) => ({ manifestSchemaVersion: 1, version: 1, componentName: name, componentType: "windows-native-helper", assetHubCommit: commit, architecture: "x64", sha256: binarySha256, source: { relativePath: `native/${name}/source.cpp`, sha256: sha256(`${name}:source`) }, buildScript: { relativePath: `scripts/build-${name}.mjs`, sha256: sha256(`${name}:script`) }, toolchain: { compilerName: "cl.exe", compilerVersion: toolchain.compilerVersion, linkerVersion: toolchain.linkerVersion, windowsSdkVersion: toolchain.windowsSdkVersion }, build: { commandFingerprint: commandFingerprint({ architecture: "x64", flags: ["/O2"], output: fileName, source: `native/${name}/source.cpp` }), configuration: "release-native" }, binary: { fileName, size, sha256: binarySha256, peMachine: "AMD64", imports: ["KERNEL32.dll"], runtimeDependencyClassification: "A" }, verification: { componentLocalGateVersion: "fixture-v1", passedChecks: ["fixture-pass"], deferredChecks: ["service-context"] } });
const names = [["job-helper", "ued-windows-job-helper.exe"], ["pipe-security-adapter", "ued-windows-pipe-security-adapter.exe"], ["dpapi-helper", "ued-windows-dpapi-credential-helper.exe"]];

async function makeCandidate(root) {
  const candidate = path.join(root, "candidate"); await mkdir(candidate);
  for (const [name, executableName] of names) { const directory = path.join(candidate, name); await mkdir(directory); const bytes = Buffer.from(`fixture-${name}`); const executable = path.join(directory, executableName); await writeFile(executable, bytes); const manifest = component(name, executableName, sha256(bytes), bytes.length); const manifestPath = path.join(directory, executableName.replace(/\.exe$/, ".manifest.json")); await writeCanonicalManifest(manifestPath, manifest); }
  const sourceRoot = path.join(root, "source");
  for (const relativePath of sourcePaths) {
    const target = path.join(sourceRoot, ...relativePath.split("/"));
    await mkdir(path.dirname(target), { recursive: true });
    if (relativePath.endsWith(".mjs")) await copyFile(path.join(import.meta.dirname, "..", ...relativePath.split("/")), target);
    else await writeFile(target, `fixture:${relativePath}`);
  }
  const aggregate = await createNativeSetManifestV2({ sourceCommit: commit, sourceArchiveSha256: sourceArchive, sourceRoot, toolchain, configuration: "release-native", nativeOutputRoot: candidate }); await writeCanonicalManifest(path.join(candidate, "native-components.manifest.json"), aggregate); return { candidate, set: await calculateNativeSet(candidate), aggregate };
}

const root = await mkdtemp(path.join(os.tmpdir(), "ued-native-contract-"));
try {
  assert.throws(() => parseNativeBuildArgs([]), /mode/);
  assert.throws(() => validateReleaseNativePathShape({ stagingRoot: "D:\\stage", outputDir: "relative", tempDir: "D:\\stage\\staging\\native-build-temp\\x" }), /absolute/);
  assert.throws(() => validateReleaseNativePathShape({ stagingRoot: "D:\\stage", outputDir: "D:\\stage\\staging\\native-components\\.candidates\\x", tempDir: "D:\\stage\\staging\\native-components\\.candidates\\x\\temp" }), /native-build-temp|overlap/);
  const accepted = validateReleaseNativePathShape({ stagingRoot: "D:\\stage", outputDir: "D:\\stage\\staging\\native-components\\.candidates\\fixture\\job-helper", tempDir: "D:\\stage\\staging\\native-build-temp\\fixture\\job-helper", protectedRoots: ["D:\\production"] }); assert.equal(accepted.stagingRoot, "D:\\stage");
  for (const protectedRoot of ["D:\\source", "D:\\dsh", "D:\\data", "D:\\production", "D:\\recovery", "D:\\old-release", "D:\\current", "D:\\frozen"]) assert.throws(() => validateReleaseNativePathShape({ stagingRoot: "D:\\stage", outputDir: `${protectedRoot}\\child`, tempDir: "D:\\stage\\staging\\native-build-temp\\fixture\\job-helper", protectedRoots: [protectedRoot] }), /protected|native-components/);
  assert.throws(() => validateReleaseNativePathShape({ stagingRoot: "\\\\server\\share", outputDir: "D:\\stage\\staging\\native-components\\.candidates\\fixture\\job-helper", tempDir: "D:\\stage\\staging\\native-build-temp\\fixture\\job-helper" }), /absolute/);
  const { candidate, set, aggregate } = await makeCandidate(root); assert.equal(set.algorithm, nativeSetDigestAlgorithm); assert.equal(set.files.length, 6); assert.equal((await calculateNativeSet(candidate)).digest, set.digest);
  const componentBytes = canonicalManifestBytes(component("job-helper", "ued-windows-job-helper.exe", sha256("x"), 1)); assert.equal(componentBytes.at(-1), 10); assert.doesNotThrow(() => validateComponentManifest(JSON.parse(componentBytes)));
  const forged = JSON.parse(componentBytes); forged.unexpected = true; assert.throws(() => validateComponentManifest(forged), /unknown/);
  await writeFile(path.join(candidate, "job-helper", "unexpected.tmp"), "no"); await assert.rejects(() => verifyFrozenNativeSet(candidate, { requireDirectoryIdentity: false }), /unexpected/); await rm(path.join(candidate, "job-helper", "unexpected.tmp"));
  const beforeMutation = set.digest; await writeFile(path.join(candidate, "job-helper", "ued-windows-job-helper.exe"), "changed"); assert.notEqual((await calculateNativeSet(candidate)).digest, beforeMutation); await writeFile(path.join(candidate, "job-helper", "ued-windows-job-helper.exe"), "fixture-job-helper");
  const jobBinary = path.join(candidate, "job-helper", "ued-windows-job-helper.exe"); const jobManifest = path.join(candidate, "job-helper", "ued-windows-job-helper.manifest.json"); const jobHash = sha256(await readFile(jobBinary)); const compatibility = await verifyWindowsJobHelper({ helperPath: jobBinary, manifestPath: jobManifest, expectedSha256: jobHash }); assert.equal(compatibility.sha256, jobHash);
  const frozenRoot = path.join(root, "frozen"); const promoted = await promoteNativeCandidate({ candidateDirectory: candidate, frozenRoot }); assert.equal(promoted.status, "promoted"); assert.equal(path.basename(promoted.directory), promoted.manifest.nativeBuildId); await verifyFrozenNativeSet(promoted.directory);
  const runBinding = path.join(root, "native-set.run-binding.json"); const manifestSha256 = sha256(await readFile(path.join(promoted.directory, "native-components.manifest.json"))); await createNativeSetRunBinding({ runId: "r2g-fixture", sourceCommit: commit, sourceArchiveSha256: sourceArchive, nativeSetManifestSha256: manifestSha256, nativeSourceIdentity: aggregate.nativeSourceIdentity, nativeBuildId: aggregate.nativeBuildId, outputPath: runBinding }); await validateNativeSetRunBindingFile({ bindingPath: runBinding, runId: "r2g-fixture", sourceCommit: commit, sourceArchiveSha256: sourceArchive, nativeSetManifestSha256: manifestSha256, nativeSourceIdentity: aggregate.nativeSourceIdentity, nativeBuildId: aggregate.nativeBuildId }); await assert.rejects(() => validateNativeSetRunBindingFile({ bindingPath: runBinding, runId: "wrong-run", sourceCommit: commit, sourceArchiveSha256: sourceArchive, nativeSetManifestSha256: manifestSha256, nativeSourceIdentity: aggregate.nativeSourceIdentity, nativeBuildId: aggregate.nativeBuildId }));
  const replay = await makeCandidate(root); const repeated = await promoteNativeCandidate({ candidateDirectory: replay.candidate, frozenRoot }); assert.equal(repeated.status, "idempotent");
  const release = path.join(root, "release"); await mkdir(release); await copyNativeSetMembers({ frozenDirectory: promoted.directory, releaseDirectory: release }); assert.equal(await readFile(path.join(release, "native-components.manifest.json")).catch(() => null), null); assert.equal(nativeSetMembers.length, 6);
  console.log("[UED Native] cross-platform native artifact contract: PASS");
  console.log(`[UED Native] Windows-native filesystem contract: ${process.platform === "win32" ? "NOT RUN (requires explicit staging harness)" : "NOT RUN"}`);
} finally { await rm(root, { recursive: true, force: true }); }
