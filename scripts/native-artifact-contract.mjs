import { createHash } from "node:crypto";
import { copyFile, lstat, mkdir, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { canonicalJson, normalizeArtifactPath } from "./release-artifact-tree.mjs";

export const nativeSetDigestAlgorithm = "ued-asset-hub-native-set-v1";
export const nativeSetMembers = [
  "job-helper/ued-windows-job-helper.exe", "job-helper/ued-windows-job-helper.manifest.json",
  "pipe-security-adapter/ued-windows-pipe-security-adapter.exe", "pipe-security-adapter/ued-windows-pipe-security-adapter.manifest.json",
  "dpapi-helper/ued-windows-dpapi-credential-helper.exe", "dpapi-helper/ued-windows-dpapi-credential-helper.manifest.json",
];
const componentNames = ["job-helper", "pipe-security-adapter", "dpapi-helper"];
const digest = (value) => createHash("sha256").update(value).digest("hex");
const utf8 = (value) => Buffer.from(value, "utf8");
const compareUtf8 = (left, right) => Buffer.compare(utf8(left), utf8(right));

function exactKeys(value, keys, label) { const actual = Object.keys(value || {}).sort(); if (actual.length !== keys.length || actual.some((key, index) => key !== [...keys].sort()[index])) throw new Error(`${label} has unknown or missing fields.`); }
function hash(value, label) { if (!/^[a-f0-9]{64}$/.test(value || "")) throw new Error(`${label} must be a lowercase SHA-256.`); }
function commit(value) { if (!/^[a-f0-9]{40}$/.test(value || "")) throw new Error("assetHubCommit must be a lowercase full commit."); }
function logicalPath(value, label) { const normalized = normalizeArtifactPath(value); if (normalized !== value || value !== value.normalize("NFC")) throw new Error(`${label} must be normalized NFC slash path.`); return value; }
function string(value, label) { if (typeof value !== "string" || !value) throw new Error(`${label} must be a non-empty string.`); }
function sortedStrings(values, label) { if (!Array.isArray(values) || values.some((value) => typeof value !== "string") || [...values].sort(compareUtf8).some((value, index) => value !== values[index])) throw new Error(`${label} must be sorted strings.`); }

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

export function createNativeBuildId(assetHubCommit, nativeSetDigest) { commit(assetHubCommit); hash(nativeSetDigest, "native set digest"); return `nb1-${assetHubCommit.slice(0, 12)}-${nativeSetDigest.slice(0, 32)}`; }
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
export async function calculateNativeSet(root) {
  const files = await inspectNativeMemberSet(root);
  const bytes = Buffer.concat([Buffer.from("UED-ASSET-HUB-NATIVE-SET-V1\n", "utf8"), ...files.map((file) => Buffer.from(`${Buffer.byteLength(file.path, "utf8")}\t${file.size}\t${file.sha256}\t${file.path}\n`, "utf8"))]);
  return { algorithm: nativeSetDigestAlgorithm, digest: digest(bytes), files };
}
export function validateNativeSetManifest(manifest) {
  exactKeys(manifest, ["architecture", "assetHubCommit", "components", "manifestSchemaVersion", "nativeArtifactSetSchemaVersion", "nativeSetDigest", "nativeSetDigestAlgorithm", "sourceArchiveSha256", "toolchain"], "native set manifest");
  if (manifest.manifestSchemaVersion !== 1 || manifest.nativeArtifactSetSchemaVersion !== 1 || manifest.architecture !== "x64" || manifest.nativeSetDigestAlgorithm !== nativeSetDigestAlgorithm) throw new Error("native set manifest identity is invalid."); commit(manifest.assetHubCommit); hash(manifest.sourceArchiveSha256, "source archive sha256"); hash(manifest.nativeSetDigest, "native set digest");
  exactKeys(manifest.toolchain, ["buildToolsVersion", "compilerVersion", "linkerVersion", "windowsSdkVersion"], "native set toolchain"); for (const key of Object.keys(manifest.toolchain)) string(manifest.toolchain[key], `native set toolchain ${key}`);
  if (!Array.isArray(manifest.components) || manifest.components.length !== 3) throw new Error("native components must contain exactly three entries."); const names = manifest.components.map((component) => component.componentName); if (canonicalJson(names) !== canonicalJson([...componentNames].sort(compareUtf8))) throw new Error("native components are invalid.");
  for (const component of manifest.components) { exactKeys(component, ["componentName", "executableRelativePath", "executableSha256", "executableSize", "integrityManifestRelativePath", "integrityManifestSha256"], "native component binding"); logicalPath(component.executableRelativePath, "native executable path"); logicalPath(component.integrityManifestRelativePath, "native manifest path"); hash(component.executableSha256, "native executable sha256"); hash(component.integrityManifestSha256, "native manifest sha256"); if (!Number.isSafeInteger(component.executableSize) || component.executableSize < 0) throw new Error("native executable size is invalid."); }
  return manifest;
}
export async function writeCanonicalManifest(file, manifest) { const bytes = canonicalManifestBytes(manifest); await writeFile(file, bytes); return digest(bytes); }
export async function verifyFrozenNativeSet(directory, { requireDirectoryIdentity = true } = {}) {
  const names = [];
  async function visit(relative = "") { for (const entry of await readdir(path.join(directory, relative), { withFileTypes: true })) { const next = relative ? `${relative}/${entry.name}` : entry.name; if (entry.isDirectory()) await visit(next); else if (entry.isFile()) names.push(next); else throw new Error("native set contains an unsupported entry."); } }
  await visit(); const expected = [...nativeSetMembers, "native-components.manifest.json"].sort(compareUtf8); if (canonicalJson(names.sort(compareUtf8)) !== canonicalJson(expected)) throw new Error("native set contains unexpected files.");
  const aggregateDetails = await lstat(path.join(directory, "native-components.manifest.json")); if (!aggregateDetails.isFile() || aggregateDetails.nlink > 1 || aggregateDetails.isSymbolicLink()) throw new Error("native aggregate manifest is not a regular unlinked file.");
  const set = await calculateNativeSet(directory); const manifest = validateNativeSetManifest(JSON.parse(await readFile(path.join(directory, "native-components.manifest.json"), "utf8"))); if (manifest.nativeSetDigest !== set.digest) throw new Error("native set digest mismatch.");
  for (const component of manifest.components) { const executable = set.files.find((file) => file.path === component.executableRelativePath); const integrity = set.files.find((file) => file.path === component.integrityManifestRelativePath); if (!executable || !integrity || executable.sha256 !== component.executableSha256 || executable.size !== component.executableSize || integrity.sha256 !== component.integrityManifestSha256) throw new Error("native aggregate binding mismatch."); const helper = validateComponentManifest(JSON.parse(await readFile(path.join(directory, ...component.integrityManifestRelativePath.split("/")), "utf8"))); if (helper.componentName !== component.componentName || helper.binary.sha256 !== executable.sha256 || helper.binary.size !== executable.size || helper.binary.fileName !== path.basename(component.executableRelativePath)) throw new Error("native component manifest binding mismatch."); }
  if (requireDirectoryIdentity && path.basename(directory) !== createNativeBuildId(manifest.assetHubCommit, set.digest)) throw new Error("native build ID mismatch."); return { manifest, set };
}
export async function promoteNativeCandidate({ candidateDirectory, frozenRoot }) {
  const candidate = await verifyFrozenNativeSet(candidateDirectory, { requireDirectoryIdentity: false }); const destination = path.join(frozenRoot, createNativeBuildId(candidate.manifest.assetHubCommit, candidate.set.digest));
  try { const existing = await verifyFrozenNativeSet(destination); if (existing.set.digest !== candidate.set.digest || existing.manifest.assetHubCommit !== candidate.manifest.assetHubCommit) throw new Error("native build ID collision."); return { status: "idempotent", directory: destination, ...existing }; } catch (error) { if (error?.code !== "ENOENT") throw error; }
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
