import { inspectNativeExecutable, nativeRuntimeDependencyClassification, nativeComponentArgv } from "./native-build-authority.mjs";
import { createHash } from "node:crypto";
import { copyFile, lstat, mkdir, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { canonicalJson, normalizeArtifactPath } from "./release-artifact-tree.mjs";

export const nativeSetDigestAlgorithm = "ued-asset-hub-native-set-v1";
export const nativeSetManifestSchemaVersion = 3;
export const nativeSetMembers = [
  "job-helper/ued-windows-job-helper.exe", "job-helper/ued-windows-job-helper.manifest.json",
  "pipe-security-adapter/ued-windows-pipe-security-adapter.exe", "pipe-security-adapter/ued-windows-pipe-security-adapter.manifest.json",
  "dpapi-helper/ued-windows-dpapi-credential-helper.exe", "dpapi-helper/ued-windows-dpapi-credential-helper.manifest.json",
];
export const nativeComponentDefinitions = Object.freeze([
  { componentName: "job-helper", developerOutputDirectory: "windows-job-helper", executableRelativePath: "job-helper/ued-windows-job-helper.exe", integrityManifestRelativePath: "job-helper/ued-windows-job-helper.manifest.json", sourceRelativePath: "native/windows-job-helper/ued_windows_job_helper.cpp", buildScriptRelativePath: "scripts/build-windows-job-helper.mjs" },
  { componentName: "pipe-security-adapter", developerOutputDirectory: "windows-pipe-security-adapter", executableRelativePath: "pipe-security-adapter/ued-windows-pipe-security-adapter.exe", integrityManifestRelativePath: "pipe-security-adapter/ued-windows-pipe-security-adapter.manifest.json", sourceRelativePath: "native/windows-pipe-security-adapter/ued_windows_pipe_security_adapter.cpp", buildScriptRelativePath: "scripts/build-windows-pipe-security-adapter.mjs" },
  { componentName: "dpapi-helper", developerOutputDirectory: "windows-dpapi-credential-helper", executableRelativePath: "dpapi-helper/ued-windows-dpapi-credential-helper.exe", integrityManifestRelativePath: "dpapi-helper/ued-windows-dpapi-credential-helper.manifest.json", sourceRelativePath: "native/windows-dpapi-credential-helper/ued_windows_dpapi_credential_helper.cpp", buildScriptRelativePath: "scripts/build-windows-dpapi-credential-helper.mjs" },
]);
const componentNames = nativeComponentDefinitions.map(({ componentName }) => componentName);
export const nativeSourceInputs = Object.freeze({
  "job-helper": ["native/windows-job-helper/ued_windows_job_helper.cpp", "scripts/build-windows-job-helper.mjs", "scripts/native-build-path-contract.mjs", "scripts/native-build-authority.mjs", "scripts/native-build-capture.mjs", "scripts/frozen-source-authority.mjs", "scripts/archive-member-contract.mjs", "scripts/release-json-contract.mjs", "scripts/release-artifact-tree.mjs", "scripts/release-byte-comparison.mjs", "scripts/native-artifact-contract.mjs"],
  "pipe-security-adapter": ["native/windows-pipe-security-adapter/ued_windows_pipe_security_adapter.cpp", "scripts/build-windows-pipe-security-adapter.mjs", "scripts/native-build-path-contract.mjs", "scripts/native-build-authority.mjs", "scripts/native-build-capture.mjs", "scripts/frozen-source-authority.mjs", "scripts/archive-member-contract.mjs", "scripts/release-json-contract.mjs", "scripts/release-artifact-tree.mjs", "scripts/release-byte-comparison.mjs", "scripts/native-artifact-contract.mjs"],
  "dpapi-helper": ["native/windows-dpapi-credential-helper/ued_windows_dpapi_credential_helper.cpp", "scripts/build-windows-dpapi-credential-helper.mjs", "scripts/native-build-path-contract.mjs", "scripts/native-build-authority.mjs", "scripts/native-build-capture.mjs", "scripts/frozen-source-authority.mjs", "scripts/archive-member-contract.mjs", "scripts/release-json-contract.mjs", "scripts/release-artifact-tree.mjs", "scripts/release-byte-comparison.mjs", "scripts/native-artifact-contract.mjs"],
});
const digest = (value) => createHash("sha256").update(value).digest("hex");
const utf8 = (value) => Buffer.from(value, "utf8");
const compareUtf8 = (left, right) => Buffer.compare(utf8(left), utf8(right));

function exactKeys(value, keys, label) { const actual = Object.keys(value || {}).sort(); if (actual.length !== keys.length || actual.some((key, index) => key !== [...keys].sort()[index])) throw new Error(`${label} has unknown or missing fields.`); }
function onlyKeys(value, keys, label) { if (!value || typeof value !== "object" || Object.keys(value).some((key) => !keys.includes(key))) throw new Error(`${label} has unknown fields.`); }
function hash(value, label) { if (!/^[a-f0-9]{64}$/.test(value || "")) throw new Error(`${label} must be a lowercase SHA-256.`); }
function commit(value) { if (!/^[a-f0-9]{40}$/.test(value || "")) throw new Error("assetHubCommit must be a lowercase full commit."); }
function logicalPath(value, label) { const normalized = normalizeArtifactPath(value); if (normalized !== value || value !== value.normalize("NFC")) throw new Error(`${label} must be normalized NFC slash path.`); return value; }
function string(value, label) { if (typeof value !== "string" || !value) throw new Error(`${label} must be a non-empty string.`); }
function sortedStrings(values, label) { if (!Array.isArray(values) || values.some((value) => typeof value !== "string") || [...values].sort(compareUtf8).some((value, index) => value !== values[index])) throw new Error(`${label} must be sorted strings.`); }
function exactNativeSourceInputs(files) {
  const expected = [...new Set(Object.values(nativeSourceInputs).flat())].sort(compareUtf8);
  const actual = (files || []).map((file) => file?.relativePath).sort(compareUtf8);
  if (canonicalJson(actual) !== canonicalJson(expected)) throw new Error("native source input set does not match the formal native source contract.");
}
function canonicalToolchain(toolchain) {
  exactKeys(toolchain, ["buildToolsVersion", "compilerVersion", "linkerVersion", "windowsSdkVersion"], "native set toolchain");
  for (const key of Object.keys(toolchain)) string(toolchain[key], `native set toolchain ${key}`);
  return toolchain;
}
async function assertNativeComponentClaims({ nativeOutputRoot, inputs, sourceCommit, toolchain, configuration }) {
  const byPath = new Map(inputs.map((file) => [file.relativePath, file]));
  for (const definition of nativeComponentDefinitions) {
    const helperPath = path.join(nativeOutputRoot, ...definition.integrityManifestRelativePath.split("/"));
    const helper = validateComponentManifest(JSON.parse(await readFile(helperPath, "utf8")));
    const source = byPath.get(definition.sourceRelativePath);
    const buildScript = byPath.get(definition.buildScriptRelativePath);
    if (!source || !buildScript || helper.componentName !== definition.componentName || helper.source.relativePath !== source.relativePath || helper.source.sha256 !== source.sha256 || helper.buildScript.relativePath !== buildScript.relativePath || helper.buildScript.sha256 !== buildScript.sha256 || helper.assetHubCommit !== sourceCommit || helper.build.configuration !== configuration || helper.build.commandFingerprint !== commandFingerprint({ componentName: definition.componentName, configuration, executableRelativePath: definition.executableRelativePath, ...(helper.verification.componentLocalGateVersion === "native-release-v2" ? { normalizedArgv: nativeComponentArgv(definition) } : {}) }) || helper.toolchain.compilerName !== "cl.exe" || helper.toolchain.compilerVersion !== toolchain.compilerVersion || helper.toolchain.linkerVersion !== toolchain.linkerVersion || helper.toolchain.windowsSdkVersion !== toolchain.windowsSdkVersion) throw new Error("native component claims do not match approved source, role, build recipe, and toolchain.");
  }
}

export function getNativeComponentDefinition(componentName) {
  const definition = nativeComponentDefinitions.find((candidate) => candidate.componentName === componentName);
  if (!definition) throw new Error("native component identity is invalid.");
  return definition;
}

export function canonicalManifestBytes(manifest) { return Buffer.from(`${canonicalJson(manifest)}\n`, "utf8"); }
export function commandFingerprint(model) { return digest(canonicalJson(model)); }
export function validateComponentManifest(manifest) {
  exactKeys(manifest, ["architecture", "assetHubCommit", "binary", "build", "buildScript", "componentName", "componentType", "manifestSchemaVersion", "sha256", "source", "toolchain", "verification", "version"], "component manifest");
  if (manifest.manifestSchemaVersion !== 1 || manifest.version !== 1 || manifest.architecture !== "x64" || !componentNames.includes(manifest.componentName) || typeof manifest.componentType !== "string") throw new Error("component manifest identity is invalid.");
  commit(manifest.assetHubCommit); hash(manifest.sha256, "component sha256");
  exactKeys(manifest.source, ["relativePath", "sha256"], "component source"); exactKeys(manifest.buildScript, ["relativePath", "sha256"], "component buildScript"); logicalPath(manifest.source.relativePath, "source path"); logicalPath(manifest.buildScript.relativePath, "build script path"); hash(manifest.source.sha256, "source sha256"); hash(manifest.buildScript.sha256, "build script sha256");
  exactKeys(manifest.toolchain, ["compilerName", "compilerVersion", "linkerVersion", "windowsSdkVersion"], "component toolchain"); for (const key of Object.keys(manifest.toolchain)) string(manifest.toolchain[key], `component toolchain ${key}`); exactKeys(manifest.build, ["commandFingerprint", "configuration"], "component build"); hash(manifest.build.commandFingerprint, "command fingerprint"); string(manifest.build.configuration, "component build configuration");
  exactKeys(manifest.binary, ["fileName", "imports", "peMachine", "runtimeDependencyClassification", "sha256", "size"], "component binary"); if (typeof manifest.binary.fileName !== "string" || !Number.isSafeInteger(manifest.binary.size) || manifest.binary.size < 0 || manifest.binary.peMachine !== "AMD64" || !["A", "B", "C"].includes(manifest.binary.runtimeDependencyClassification)) throw new Error("component binary is invalid."); sortedStrings(manifest.binary.imports, "component binary imports"); hash(manifest.binary.sha256, "binary sha256"); if (manifest.sha256 !== manifest.binary.sha256) throw new Error("component top-level sha256 must equal binary sha256.");
  exactKeys(manifest.verification, ["componentLocalGateVersion", "deferredChecks", "passedChecks"], "component verification"); for (const key of ["passedChecks", "deferredChecks"]) { if (!Array.isArray(manifest.verification[key]) || [...manifest.verification[key]].sort(compareUtf8).some((value, index) => value !== manifest.verification[key][index]) || manifest.verification[key].some((value) => typeof value !== "string" || !/^[a-z0-9.-]+$/u.test(value))) throw new Error(`component ${key} is invalid.`); }
  return manifest;
}

function componentOutputDirectory(outputDir, definition) {
  if (typeof outputDir !== "string" || !outputDir || path.basename(path.resolve(outputDir)) !== definition.componentName) throw new Error("native component output directory is not canonical.");
  return path.resolve(outputDir);
}

export async function createNativeComponentManifest({ definition, outputDir, sourceRoot, assetHubCommit, toolchain, inspection = null }) {
  if (!nativeComponentDefinitions.includes(definition)) throw new Error("native component definition is not canonical.");
  commit(assetHubCommit);
  exactKeys(toolchain, ["compilerVersion", "linkerVersion", "windowsSdkVersion"], "component toolchain input");
  for (const key of Object.keys(toolchain)) string(toolchain[key], `component toolchain input ${key}`);
  const directory = componentOutputDirectory(outputDir, definition);
  const executablePath = path.join(directory, path.basename(definition.executableRelativePath));
  const executable = await readFile(executablePath);
  const details = await lstat(executablePath);
  if (!details.isFile() || details.isSymbolicLink()) throw new Error("native component executable is not a regular file.");
  const sourcePath = path.join(sourceRoot, ...definition.sourceRelativePath.split("/"));
  const buildScriptPath = path.join(sourceRoot, ...definition.buildScriptRelativePath.split("/"));
  const [source, buildScript] = await Promise.all([readFile(sourcePath), readFile(buildScriptPath)]);
  if (inspection && canonicalJson(inspection) !== canonicalJson(inspectNativeExecutable(executable))) throw new Error("Native actual executable inspection mismatch.");
  const binary = { fileName: path.basename(definition.executableRelativePath), imports: inspection?.imports ?? [], peMachine: inspection?.machine ?? "AMD64", runtimeDependencyClassification: inspection ? nativeRuntimeDependencyClassification(inspection) : "A", sha256: digest(executable), size: details.size };
  return validateComponentManifest({
    manifestSchemaVersion: 1,
    version: 1,
    componentName: definition.componentName,
    componentType: "windows-native-helper",
    assetHubCommit,
    architecture: "x64",
    sha256: binary.sha256,
    source: { relativePath: definition.sourceRelativePath, sha256: digest(source) },
    buildScript: { relativePath: definition.buildScriptRelativePath, sha256: digest(buildScript) },
    toolchain: { compilerName: "cl.exe", compilerVersion: toolchain.compilerVersion, linkerVersion: toolchain.linkerVersion, windowsSdkVersion: toolchain.windowsSdkVersion },
    build: { commandFingerprint: commandFingerprint({ componentName: definition.componentName, configuration: "release-native", executableRelativePath: definition.executableRelativePath, ...(inspection ? { normalizedArgv: nativeComponentArgv(definition) } : {}) }), configuration: "release-native" },
    binary,
    verification: { componentLocalGateVersion: inspection ? "native-release-v2" : "native-release-v1", passedChecks: inspection ? ["binary.identity", "canonical.output", "pe.amd64", "pe.imports", "normalized.argv"] : ["binary.identity", "canonical.output"], deferredChecks: ["service-context"] },
  });
}

export async function writeNativeComponentManifest({ definition, outputDir, sourceRoot, assetHubCommit, toolchain, inspection = null }) {
  const directory = componentOutputDirectory(outputDir, definition);
  const manifest = await createNativeComponentManifest({ definition, outputDir: directory, sourceRoot, assetHubCommit, toolchain, inspection });
  const target = path.join(directory, path.basename(definition.integrityManifestRelativePath));
  await writeCanonicalManifest(target, manifest);
  return { manifest, manifestPath: target, manifestSha256: digest(await readFile(target)) };
}

export async function validateNativeComponentOutput({ definition, outputDir }) {
  const directory = componentOutputDirectory(outputDir, definition);
  const names = (await readdir(directory, { withFileTypes: true })).map((entry) => entry.isFile() ? entry.name : `${entry.name}::<unsupported>`).sort(compareUtf8);
  const expected = [path.basename(definition.executableRelativePath), path.basename(definition.integrityManifestRelativePath)].sort(compareUtf8);
  if (canonicalJson(names) !== canonicalJson(expected)) throw new Error("native component output exact set is invalid.");
  const executablePath = path.join(directory, expected.find((name) => name.endsWith(".exe")));
  const details = await lstat(executablePath);
  if (!details.isFile() || details.isSymbolicLink() || details.nlink > 1) throw new Error("native component executable is not a regular unlinked file.");
  const manifest = validateComponentManifest(JSON.parse(await readFile(path.join(directory, path.basename(definition.integrityManifestRelativePath)), "utf8")));
  if (manifest.componentName !== definition.componentName || manifest.binary.fileName !== path.basename(definition.executableRelativePath) || manifest.binary.size !== details.size || manifest.binary.sha256 !== digest(await readFile(executablePath))) throw new Error("native component output binding is invalid.");
  return { definition, manifest };
}

export async function calculateNativeSourceInputs(sourceRoot) {
  const paths = [...new Set(Object.values(nativeSourceInputs).flat())].sort(compareUtf8);
  const files = [];
  for (const relativePath of paths) {
    const absolute = path.join(sourceRoot, ...relativePath.split("/")); const details = await lstat(absolute);
    if (!details.isFile() || details.isSymbolicLink()) throw new Error(`native source input is not a regular file: ${relativePath}`);
    files.push({ relativePath, size: details.size, sha256: digest(await readFile(absolute)) });
  }
  return files;
}
export function nativeSourceIdentity(files) {
  if (!Array.isArray(files) || !files.length) throw new Error("native source input manifest is empty.");
  const canonical = files.map(({ relativePath, size, sha256 }) => ({ relativePath, size, sha256 })).sort((left, right) => compareUtf8(left.relativePath, right.relativePath));
  for (const [index, file] of canonical.entries()) {
    logicalPath(file.relativePath, "native source input path");
    if (!Number.isSafeInteger(file.size) || file.size < 0) throw new Error("native source input manifest is invalid.");
    hash(file.sha256, "native source input SHA-256");
    if (index > 0 && canonical[index - 1].relativePath === file.relativePath) throw new Error("native source input manifest is invalid.");
  }
  return digest(Buffer.from(canonicalJson(canonical), "utf8"));
}
export function createNativeBuildId(nativeSource, toolchain, configuration = "release-native") {
  hash(nativeSource, "native source identity"); string(configuration, "native build configuration");
  const toolchainIdentity = digest(Buffer.from(canonicalJson(toolchain), "utf8"));
  return `nb2-${nativeSource.slice(0, 16)}-${toolchainIdentity.slice(0, 16)}-${digest(Buffer.from(configuration, "utf8")).slice(0, 16)}`;
}
export function createNativeBuildIdV3({ sourceCommit, sourceArchiveSha256, nativeSourceIdentity: identity, toolchain, configuration = "release-native" }) {
  commit(sourceCommit); hash(sourceArchiveSha256, "source archive SHA-256"); hash(identity, "native source identity"); canonicalToolchain(toolchain); string(configuration, "native build configuration");
  const toolchainIdentity = digest(Buffer.from(canonicalJson(toolchain), "utf8"));
  const identityDomain = { configuration, nativeSourceIdentity: identity, schemaVersion: nativeSetManifestSchemaVersion, sourceArchiveSha256, sourceCommit, toolchainIdentity };
  return `nb3-${digest(Buffer.from(canonicalJson(identityDomain), "utf8"))}`;
}
export function nativeBuildIdForManifest(manifest) {
  if (manifest?.manifestSchemaVersion === 1) return `nb1-${manifest.assetHubCommit.slice(0, 12)}-${manifest.nativeSetDigest.slice(0, 32)}`;
  if (manifest?.manifestSchemaVersion === 2) return createNativeBuildId(manifest.nativeSourceIdentity, manifest.toolchain);
  if (manifest?.manifestSchemaVersion === nativeSetManifestSchemaVersion) return createNativeBuildIdV3({ sourceCommit: manifest.sourceCommit, sourceArchiveSha256: manifest.sourceArchiveSha256, nativeSourceIdentity: manifest.nativeSourceIdentity, toolchain: manifest.toolchain });
  throw new Error("native set schema version is unsupported.");
}
function nativeBuildIdSchema(binding) {
  if (binding.schemaVersion === 1 && /^(?:nb1-[a-f0-9]{12}-[a-f0-9]{32}|nb2-[a-f0-9]{16}(?:-[a-f0-9]{16}){2})$/.test(binding.nativeBuildId || "")) return true;
  return binding.schemaVersion === 2 && /^nb3-[a-f0-9]{64}$/.test(binding.nativeBuildId || "");
}
export function validateNativeSetRunBinding(binding) {
  exactKeys(binding, ["nativeBuildId", "nativeSetManifestSha256", "nativeSourceIdentity", "runId", "schemaVersion", "sourceArchiveSha256", "sourceCommit"], "native set run binding");
  if (!nativeBuildIdSchema(binding) || !/^[A-Za-z0-9-]+$/.test(binding.runId)) throw new Error("native set run binding is invalid.");
  commit(binding.sourceCommit); hash(binding.sourceArchiveSha256, "native set run binding archive SHA-256"); hash(binding.nativeSetManifestSha256, "native set run binding manifest SHA-256"); hash(binding.nativeSourceIdentity, "native set run binding native source identity");
  return binding;
}
export async function createNativeSetRunBinding({ runId, sourceCommit, sourceArchiveSha256, nativeSetManifestSha256, nativeSourceIdentity: sourceIdentity, nativeBuildId, outputPath }) {
  const binding = validateNativeSetRunBinding({ schemaVersion: nativeBuildId.startsWith("nb3-") ? 2 : 1, runId, sourceCommit, sourceArchiveSha256, nativeSetManifestSha256, nativeSourceIdentity: sourceIdentity, nativeBuildId });
  const bytes = canonicalManifestBytes(binding); await writeFile(outputPath, bytes); await writeFile(`${outputPath}.sha256`, `${digest(bytes)}  ${path.basename(outputPath)}\n`);
  return { ...binding, bindingSha256: digest(bytes) };
}
export async function validateNativeSetRunBindingFile({ bindingPath, runId, sourceCommit, sourceArchiveSha256, nativeSetManifestSha256, nativeSourceIdentity: sourceIdentity, nativeBuildId }) {
  const bytes = await readFile(bindingPath); const sidecar = await readFile(`${bindingPath}.sha256`, "utf8"); const bindingSha256 = digest(bytes);
  if (sidecar !== `${bindingSha256}  ${path.basename(bindingPath)}\n`) throw new Error("native set run binding sidecar is invalid.");
  const binding = validateNativeSetRunBinding(JSON.parse(bytes.toString("utf8")));
  const expected = { schemaVersion: nativeBuildId.startsWith("nb3-") ? 2 : 1, runId, sourceCommit, sourceArchiveSha256, nativeSetManifestSha256, nativeSourceIdentity: sourceIdentity, nativeBuildId };
  if (canonicalJson(binding) !== canonicalJson(expected)) throw new Error("native set run binding does not match current formal inputs.");
  return { ...binding, bindingSha256 };
}
export async function inspectNativeMemberSet(root) {
  const entries = [];
  for (const relativePath of nativeSetMembers) {
    const absolute = path.join(root, ...relativePath.split("/")); const details = await lstat(absolute);
    if (!details.isFile() || details.nlink > 1 || details.isSymbolicLink()) throw new Error(`native member is not a regular unlinked file: ${relativePath}`);
    entries.push({ path: relativePath, size: details.size, sha256: digest(await readFile(absolute)) });
  }
  entries.sort((left, right) => compareUtf8(left.path, right.path));
  return entries;
}
export async function inspectNativeOutputSet(root) {
  const names = [];
  async function visit(relative = "") {
    for (const entry of await readdir(path.join(root, relative), { withFileTypes: true })) {
      const next = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await visit(next);
      else if (entry.isFile()) names.push(next);
      else throw new Error("native output set contains an unsupported entry.");
    }
  }
  await visit();
  if (canonicalJson(names.sort(compareUtf8)) !== canonicalJson([...nativeSetMembers].sort(compareUtf8))) throw new Error("native output set is missing, extra, or contains duplicate members.");
  const files = await inspectNativeMemberSet(root);
  const bindings = [];
  for (const definition of nativeComponentDefinitions) {
    const executable = files.find((file) => file.path === definition.executableRelativePath);
    const integrity = files.find((file) => file.path === definition.integrityManifestRelativePath);
    if (!executable || !integrity) throw new Error("native output exact set is incomplete.");
    const helper = validateComponentManifest(JSON.parse(await readFile(path.join(root, ...definition.integrityManifestRelativePath.split("/")), "utf8")));
    if (helper.componentName !== definition.componentName || helper.architecture !== "x64" || helper.binary.fileName !== path.basename(definition.executableRelativePath) || helper.binary.sha256 !== executable.sha256 || helper.binary.size !== executable.size) throw new Error("native output component binding is invalid.");
    bindings.push({ componentName: definition.componentName, executableRelativePath: definition.executableRelativePath, executableSha256: executable.sha256, executableSize: executable.size, integrityManifestRelativePath: definition.integrityManifestRelativePath, integrityManifestSha256: integrity.sha256 });
  }
  return { files, components: bindings.sort((left, right) => compareUtf8(left.componentName, right.componentName)) };
}
export async function calculateNativeSet(root) {
  const files = await inspectNativeMemberSet(root);
  const bytes = Buffer.concat([Buffer.from("UED-ASSET-HUB-NATIVE-SET-V1\n", "utf8"), ...files.map((file) => Buffer.from(`${Buffer.byteLength(file.path, "utf8")}\t${file.size}\t${file.sha256}\t${file.path}\n`, "utf8"))]);
  return { algorithm: nativeSetDigestAlgorithm, digest: digest(bytes), files };
}
export async function createNativeSetManifestV2({ sourceCommit, sourceArchiveSha256, nativeSourceInputs: inputFiles, sourceRoot, toolchain, configuration = "release-native", nativeOutputRoot }) {
  onlyKeys(arguments[0], ["configuration", "nativeOutputRoot", "nativeSourceInputs", "sourceArchiveSha256", "sourceCommit", "sourceRoot", "toolchain"], "native set generator input");
  if ((inputFiles == null) === (sourceRoot == null)) throw new Error("native set generator requires exactly one native source authority.");
  commit(sourceCommit); hash(sourceArchiveSha256, "native set generator source archive SHA-256");
  string(configuration, "native set generator build configuration");
  if (configuration !== "release-native") throw new Error("native set generator build configuration is invalid.");
  canonicalToolchain(toolchain);
  if (typeof nativeOutputRoot !== "string" || !nativeOutputRoot) throw new Error("native set generator native output root is invalid.");
  const files = inputFiles == null ? await calculateNativeSourceInputs(sourceRoot) : structuredClone(inputFiles);
  const identity = nativeSourceIdentity(files);
  exactNativeSourceInputs(files);
  const outputs = await inspectNativeOutputSet(nativeOutputRoot);
  for (const binding of outputs.components) {
    const helper = validateComponentManifest(JSON.parse(await readFile(path.join(nativeOutputRoot, ...binding.integrityManifestRelativePath.split("/")), "utf8")));
    if (helper.assetHubCommit !== sourceCommit || helper.build.configuration !== configuration || helper.toolchain.compilerVersion !== toolchain.compilerVersion || helper.toolchain.linkerVersion !== toolchain.linkerVersion || helper.toolchain.windowsSdkVersion !== toolchain.windowsSdkVersion) throw new Error("native output provenance does not match formal generator inputs.");
  }
  const bytes = Buffer.concat([Buffer.from("UED-ASSET-HUB-NATIVE-SET-V1\n", "utf8"), ...outputs.files.map((file) => Buffer.from(`${Buffer.byteLength(file.path, "utf8")}\t${file.size}\t${file.sha256}\t${file.path}\n`, "utf8"))]);
  const manifest = {
    manifestSchemaVersion: 2,
    nativeArtifactSetSchemaVersion: 2,
    sourceCommit,
    sourceArchiveSha256,
    nativeSourceInputs: files.sort((left, right) => compareUtf8(left.relativePath, right.relativePath)),
    nativeSourceIdentity: identity,
    architecture: "x64",
    toolchain: structuredClone(toolchain),
    nativeBuildId: createNativeBuildId(identity, toolchain, configuration),
    components: outputs.components,
    nativeSetDigestAlgorithm,
    nativeSetDigest: digest(bytes),
  };
  return validateNativeSetManifest(manifest);
}
export async function createNativeSetManifestV3({ sourceCommit, sourceArchiveSha256, nativeSourceInputs: inputFiles, sourceRoot, toolchain, configuration = "release-native", nativeOutputRoot }) {
  onlyKeys(arguments[0], ["configuration", "nativeOutputRoot", "nativeSourceInputs", "sourceArchiveSha256", "sourceCommit", "sourceRoot", "toolchain"], "native set generator input");
  if ((inputFiles == null) === (sourceRoot == null)) throw new Error("native set generator requires exactly one native source authority.");
  commit(sourceCommit); hash(sourceArchiveSha256, "native set generator source archive SHA-256");
  string(configuration, "native set generator build configuration");
  if (configuration !== "release-native") throw new Error("native set generator build configuration is invalid.");
  canonicalToolchain(toolchain);
  if (typeof nativeOutputRoot !== "string" || !nativeOutputRoot) throw new Error("native set generator native output root is invalid.");
  const files = inputFiles == null ? await calculateNativeSourceInputs(sourceRoot) : structuredClone(inputFiles);
  const identity = nativeSourceIdentity(files);
  exactNativeSourceInputs(files);
  const outputs = await inspectNativeOutputSet(nativeOutputRoot);
  await assertNativeComponentClaims({ nativeOutputRoot, inputs: files, sourceCommit, toolchain, configuration });
  const bytes = Buffer.concat([Buffer.from("UED-ASSET-HUB-NATIVE-SET-V1\n", "utf8"), ...outputs.files.map((file) => Buffer.from(`${Buffer.byteLength(file.path, "utf8")}\t${file.size}\t${file.sha256}\t${file.path}\n`, "utf8"))]);
  const manifest = {
    manifestSchemaVersion: nativeSetManifestSchemaVersion,
    nativeArtifactSetSchemaVersion: nativeSetManifestSchemaVersion,
    sourceCommit,
    sourceArchiveSha256,
    nativeSourceInputs: files.sort((left, right) => compareUtf8(left.relativePath, right.relativePath)),
    nativeSourceIdentity: identity,
    architecture: "x64",
    toolchain: structuredClone(toolchain),
    nativeBuildId: createNativeBuildIdV3({ sourceCommit, sourceArchiveSha256, nativeSourceIdentity: identity, toolchain, configuration }),
    components: outputs.components,
    nativeSetDigestAlgorithm,
    nativeSetDigest: digest(bytes),
  };
  return validateNativeSetManifest(manifest);
}
export function validateNativeSetManifest(manifest) {
  if (manifest?.manifestSchemaVersion === 1) {
    exactKeys(manifest, ["architecture", "assetHubCommit", "components", "manifestSchemaVersion", "nativeArtifactSetSchemaVersion", "nativeSetDigest", "nativeSetDigestAlgorithm", "sourceArchiveSha256", "toolchain"], "legacy native set manifest");
    if (manifest.nativeArtifactSetSchemaVersion !== 1 || manifest.architecture !== "x64" || manifest.nativeSetDigestAlgorithm !== nativeSetDigestAlgorithm) throw new Error("legacy native set manifest identity is invalid.");
    commit(manifest.assetHubCommit); hash(manifest.sourceArchiveSha256, "source archive sha256"); hash(manifest.nativeSetDigest, "native set digest"); canonicalToolchain(manifest.toolchain);
  } else {
    exactKeys(manifest, ["architecture", "components", "manifestSchemaVersion", "nativeArtifactSetSchemaVersion", "nativeBuildId", "nativeSetDigest", "nativeSetDigestAlgorithm", "nativeSourceIdentity", "nativeSourceInputs", "sourceArchiveSha256", "sourceCommit", "toolchain"], "native set manifest");
    const schema = manifest.manifestSchemaVersion;
    if (![2, nativeSetManifestSchemaVersion].includes(schema) || manifest.nativeArtifactSetSchemaVersion !== schema || manifest.architecture !== "x64" || manifest.nativeSetDigestAlgorithm !== nativeSetDigestAlgorithm) throw new Error("native set manifest identity is invalid.");
    commit(manifest.sourceCommit); hash(manifest.sourceArchiveSha256, "source archive sha256"); hash(manifest.nativeSetDigest, "native set digest"); hash(manifest.nativeSourceIdentity, "native source identity");
    if (nativeSourceIdentity(manifest.nativeSourceInputs) !== manifest.nativeSourceIdentity) throw new Error("native source identity mismatch.");
    exactNativeSourceInputs(manifest.nativeSourceInputs); canonicalToolchain(manifest.toolchain);
    const expectedId = schema === 2 ? createNativeBuildId(manifest.nativeSourceIdentity, manifest.toolchain) : createNativeBuildIdV3({ sourceCommit: manifest.sourceCommit, sourceArchiveSha256: manifest.sourceArchiveSha256, nativeSourceIdentity: manifest.nativeSourceIdentity, toolchain: manifest.toolchain });
    if (manifest.nativeBuildId !== expectedId) throw new Error("native build ID does not match native source and toolchain identity.");
  }
  if (!Array.isArray(manifest.components) || manifest.components.length !== 3) throw new Error("native components must contain exactly three entries."); const names = manifest.components.map((component) => component.componentName); if (canonicalJson(names) !== canonicalJson([...componentNames].sort(compareUtf8))) throw new Error("native components are invalid.");
  for (const component of manifest.components) { exactKeys(component, ["componentName", "executableRelativePath", "executableSha256", "executableSize", "integrityManifestRelativePath", "integrityManifestSha256"], "native component binding"); const definition = nativeComponentDefinitions.find((item) => item.componentName === component.componentName); if (!definition || component.executableRelativePath !== definition.executableRelativePath || component.integrityManifestRelativePath !== definition.integrityManifestRelativePath) throw new Error("native component role binding is invalid."); logicalPath(component.executableRelativePath, "native executable path"); logicalPath(component.integrityManifestRelativePath, "native manifest path"); hash(component.executableSha256, "native executable sha256"); hash(component.integrityManifestSha256, "native manifest sha256"); if (!Number.isSafeInteger(component.executableSize) || component.executableSize < 0) throw new Error("native executable size is invalid."); }
  return manifest;
}
export async function writeCanonicalManifest(file, manifest) { const bytes = canonicalManifestBytes(manifest); await writeFile(file, bytes); return digest(bytes); }
export async function verifyFrozenNativeSet(directory, { requireDirectoryIdentity = true, sourceRoot = null, sourceCommit = null, sourceArchiveSha256 = null, configuration = "release-native", toolchain = null } = {}) {
  const names = [];
  async function visit(relative = "") { for (const entry of await readdir(path.join(directory, relative), { withFileTypes: true })) { const next = relative ? `${relative}/${entry.name}` : entry.name; if (entry.isDirectory()) await visit(next); else if (entry.isFile()) names.push(next); else throw new Error("native set contains an unsupported entry."); } }
  await visit(); const expected = [...nativeSetMembers, "native-components.manifest.json"].sort(compareUtf8); if (canonicalJson(names.sort(compareUtf8)) !== canonicalJson(expected)) throw new Error("native set contains unexpected files.");
  const aggregateDetails = await lstat(path.join(directory, "native-components.manifest.json")); if (!aggregateDetails.isFile() || aggregateDetails.nlink > 1 || aggregateDetails.isSymbolicLink()) throw new Error("native aggregate manifest is not a regular unlinked file.");
  const set = await calculateNativeSet(directory); const manifest = validateNativeSetManifest(JSON.parse(await readFile(path.join(directory, "native-components.manifest.json"), "utf8"))); if (manifest.nativeSetDigest !== set.digest) throw new Error("native set digest mismatch.");
  for (const component of manifest.components) { const executable = set.files.find((file) => file.path === component.executableRelativePath); const integrity = set.files.find((file) => file.path === component.integrityManifestRelativePath); if (!executable || !integrity || executable.sha256 !== component.executableSha256 || executable.size !== component.executableSize || integrity.sha256 !== component.integrityManifestSha256) throw new Error("native aggregate binding mismatch."); const helper = validateComponentManifest(JSON.parse(await readFile(path.join(directory, ...component.integrityManifestRelativePath.split("/")), "utf8"))); if (helper.componentName !== component.componentName || helper.binary.sha256 !== executable.sha256 || helper.binary.size !== executable.size || helper.binary.fileName !== path.basename(component.executableRelativePath)) throw new Error("native component manifest binding mismatch."); }
  const buildId = nativeBuildIdForManifest(manifest);
  if (manifest.manifestSchemaVersion === nativeSetManifestSchemaVersion && sourceRoot) {
    const inputs = await calculateNativeSourceInputs(sourceRoot);
    if (canonicalJson(inputs) !== canonicalJson(manifest.nativeSourceInputs) || manifest.sourceCommit !== sourceCommit || manifest.sourceArchiveSha256 !== sourceArchiveSha256 || canonicalJson(manifest.toolchain) !== canonicalJson(toolchain ?? manifest.toolchain)) throw new Error("native aggregate does not match the consuming source/archive/toolchain authority.");
    await assertNativeComponentClaims({ nativeOutputRoot: directory, inputs, sourceCommit, toolchain: toolchain ?? manifest.toolchain, configuration });
  } else if ((sourceRoot || sourceCommit || sourceArchiveSha256 || toolchain) && !(sourceRoot && sourceCommit && sourceArchiveSha256 && toolchain)) throw new Error("complete Native source authority inputs are required together.");
  if (manifest.nativeSetDigest !== set.digest || (manifest.nativeBuildId && manifest.nativeBuildId !== buildId) || (requireDirectoryIdentity && path.basename(directory) !== buildId)) throw new Error("native build ID mismatch."); return { manifest, set };
}
export async function promoteNativeCandidate({ candidateDirectory, frozenRoot }) {
  const candidate = await verifyFrozenNativeSet(candidateDirectory, { requireDirectoryIdentity: false }); const destination = path.join(frozenRoot, candidate.manifest.nativeBuildId);
  try { const existing = await verifyFrozenNativeSet(destination); if (existing.set.digest !== candidate.set.digest || existing.manifest.sourceCommit !== candidate.manifest.sourceCommit || existing.manifest.sourceArchiveSha256 !== candidate.manifest.sourceArchiveSha256 || existing.manifest.manifestSchemaVersion !== candidate.manifest.manifestSchemaVersion) throw new Error("native build ID collision."); return { status: "idempotent", directory: destination, ...existing }; } catch (error) { if (error?.code !== "ENOENT") throw error; }
  await mkdir(frozenRoot, { recursive: true }); if ((await stat(candidateDirectory)).dev !== (await stat(frozenRoot)).dev) throw new Error("native promotion must remain on one volume."); await rename(candidateDirectory, destination); return { status: "promoted", directory: destination, ...(await verifyFrozenNativeSet(destination)) };
}
export async function copyNativeSetMembers({ frozenDirectory, releaseDirectory }) {
  const verified = await verifyFrozenNativeSet(frozenDirectory);
  for (const member of nativeSetMembers) {
    const source = path.join(frozenDirectory, ...member.split("/"));
    const target = path.join(releaseDirectory, ...member.split("/"));
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(source, target);
    if (digest(await readFile(target)) !== digest(await readFile(source))) throw new Error("native member copy changed bytes.");
  }
  return verified;
}
