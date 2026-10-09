import { assertDshBundleAuthorityConsumption } from "./dsh-bundle-authority-consumption.mjs";
import { inventoryHistoricalRoots, assertHistoricalPreservation, assertExecutionRootsPreserveHistory } from "./release-history-inventory.mjs";
import { withReleaseJournalLock, appendProtectedReleaseJournal } from "./release-journal-lock.mjs";
import { assertReleaseReceiptProjections } from "./release-receipt-contract.mjs";
import { assertNativeBuildReceiptSet, inspectNativeExecutable } from "./native-build-authority.mjs";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { access, cp, lstat, mkdir, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { calculateNativeSourceInputs, nativeBuildIdForManifest, nativeSourceIdentity, validateNativeSetRunBindingFile, verifyFrozenNativeSet } from "./native-artifact-contract.mjs";
import { calculateReleaseArtifactSet, canonicalJson } from "./release-artifact-tree.mjs";
import { createDeploymentManifest, preflightDeploymentManifest, verifyRelease, writeDeploymentManifest } from "./windows-deployment-contract.mjs";
import { componentPaths, dshPayloadFiles, nativePayloadMap, releasePayloadSchemaVersion, servicePayloadFiles, sourceReleaseComponentPaths } from "./windows-release-payload.mjs";
import { validateArchiveMemberPath as validateArchiveMemberPathContract } from "./archive-member-contract.mjs";
import { deriveHostRuntimeModuleClosure, verifyCandidateHostRuntimeClosure } from "./host-runtime-module-closure.mjs";
import { requiredCandidateRuntimeFiles, verifyRequiredCandidateRuntimeFiles } from "./candidate-runtime-closure.mjs";
import { assertCandidateRuntimeClosureManifest, createCandidateRuntimeClosureManifest, deriveCandidateRuntimeClosureSourcePaths } from "./candidate-runtime-closure-manifest.mjs";
import { assertHostRuntimeClosureBinding, createHostRuntimeClosureBinding } from "./release-runtime-closure-contract.mjs";
import { loadProtectedReleaseSecuritySet, materializeNextSecurityCache, releaseSecuritySetMetadata, secureReleaseSecurityDirectory, verifyNextSecurityAdoption } from "./release-security-set.mjs";
import { normalizeNextManifestTree } from "./next-manifest-normalizer.mjs";
import { assertExecutionEvidenceOutsideCandidate, createCandidateExecutionEvidence, createCandidateProvenance, serializeCandidateExecutionEvidence, serializeCandidateProvenance } from "./release-provenance.mjs";
import { loadTrustedReleaseSelection, loadProtectedHistoricalRoots } from "./release-approval-store.mjs";
import { parseStrictJson } from "./release-json-contract.mjs";
import { validateFrozenSourceManifest } from "./frozen-source-authority.mjs";
import { assertExecutionBinding } from "./release-execution-binding.mjs";
import { calculateCompleteByteTreeInventory } from "./release-byte-comparison.mjs";

export const buildContract = Object.freeze({
  version: "ued-asset-hub-next-build-v1",
  nodeVersion: "22.23.3",
  nodeArtifactSha256: "9c9245166b4a8e182e0b797da9c20136117ff24368eaff1fec8343a123c8db0e",
  npmVersion: "10.9.9",
  lockfileSha256: "5a34f95705fc4c3dcc0289c434f9abdb90ed6dc0fa0c62f78881d356ab06121b",
  nextVersion: "15.5.19",
  reactVersion: "19.2.7",
  reactDomVersion: "19.2.7",
  eslintConfigNextVersion: "15.5.19",
  windowsSwc: "@next/swc-win32-x64-msvc@15.5.19",
  sharp: "sharp@0.34.5",
  windowsSharp: "@img/sharp-win32-x64@0.34.5",
  backend: "WEBPACK",
  sourceClassification: "R3_TEST_ONLY_NOT_RELEASE_PROVENANCE",
});

export const sourceClassificationPolicy = Object.freeze({
  R3_TEST_ONLY_NOT_RELEASE_PROVENANCE: Object.freeze({ productionEligible: false, purpose: "historical-verification" }),
  SNAPSHOT_WITH_UNCOMMITTED_CHANGES: Object.freeze({ productionEligible: false, purpose: "r2g-isolated-verification", requiresSnapshotManifest: true }),
  COMMITTED_CLEAN_SOURCE: Object.freeze({ productionEligible: true, purpose: "clean-release", requiresSnapshotManifest: true }),
});


const required = ["staging-root", "execution-run-id", "experiment-id", "candidate-label", "phase", "phase-journal", "authority-root", "approval-identity", "execution-plan-identity", "execution-binding", "receipt-files", "source-archive", "source-commit", "source-archive-sha256", "source-classification", "source-snapshot-manifest", "source-snapshot-manifest-sha256", "dsh-source-root", "dsh-version", "dsh-commit", "dsh-provenance-evidence", "native-set-root", "native-build-id", "native-set-digest", "native-set-run-binding", "node-root", "output-dir", "temp-dir", "evidence-root", "security-set", "security-set-id", "security-set-authorization-id"];
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const hashFile = async (file) => sha256(await readFile(file));
const compareUtf8 = (left, right) => Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));

export function assertApprovedNodeArtifactSha256(actual) {
  if (actual !== buildContract.nodeArtifactSha256) throw new Error("staged node.exe SHA-256 mismatch.");
}

export function assertApprovedNodeNpmVersions(nodeVersion, npmVersion) {
  if (nodeVersion !== buildContract.nodeVersion || npmVersion !== buildContract.npmVersion) throw new Error("staged Node/npm version mismatch.");
}

export async function assertPackageLockContract(lockfilePath, expectedLockfileSha256 = buildContract.lockfileSha256) {
  const bytes = await readFile(lockfilePath);
  const lockfile = JSON.parse(bytes.toString("utf8"));
  if (lockfile.lockfileVersion !== 3 || sha256(bytes) !== expectedLockfileSha256) throw new Error("package-lock contract mismatch.");
  return sha256(bytes);
}

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || !value || values[key.slice(2)]) throw new Error("constructor arguments are invalid.");
    values[key.slice(2)] = value;
  }
  for (const key of required) if (!values[key]) throw new Error(`missing --${key}`);
  return values;
}

export function assertPinnedIdentity(identity, { lockfileSha256 = buildContract.lockfileSha256 } = {}) {
  const expected = {
    nodeVersion: buildContract.nodeVersion,
    npmVersion: buildContract.npmVersion,
    lockfileSha256,
    nextVersion: buildContract.nextVersion,
    reactVersion: buildContract.reactVersion,
    reactDomVersion: buildContract.reactDomVersion,
    eslintConfigNextVersion: buildContract.eslintConfigNextVersion,
    windowsSwc: buildContract.windowsSwc,
    sharp: buildContract.sharp,
    windowsSharp: buildContract.windowsSharp,
    backend: buildContract.backend,
  };
  for (const [key, value] of Object.entries(expected)) if (identity[key] !== value) throw new Error(`pinned build contract mismatch: ${key}`);
  return identity;
}

export function sourcePolicy(classification) {
  const policy = sourceClassificationPolicy[classification];
  if (!policy) throw new Error("unsupported source classification.");
  return policy;
}

export function validateSourceClassificationInput(values) {
  const policy = sourcePolicy(values["source-classification"]);
  const promotion = values["production-promotion"] === "true" || values["production-mode"] === "true";
  if (promotion && !policy.productionEligible) throw new Error("source classification is not eligible for production promotion.");
  if (policy.requiresSnapshotManifest && (!values["source-snapshot-manifest"] || !/^[a-f0-9]{64}$/.test(values["source-snapshot-manifest-sha256"] || ""))) throw new Error("source snapshot manifest identity is required for this classification.");
  return policy;
}

export async function validateSourceSnapshotManifest(values, sourceManifest = null) {
  const policy = validateSourceClassificationInput(values);
  if (!policy.requiresSnapshotManifest) return { policy, snapshot: null, expectedLockfileSha256: buildContract.lockfileSha256 };
  const bytes = await readFile(path.resolve(values["source-snapshot-manifest"]));
  if (sha256(bytes) !== values["source-snapshot-manifest-sha256"]) throw new Error("source snapshot manifest SHA-256 mismatch.");
  const snapshot = JSON.parse(bytes.toString("utf8"));
  if (snapshot.frozenSourceIdentity !== undefined) {
    if (!values["source-archive"]) throw new Error("Frozen source archive required for full derivation.");
    const { projection } = validateFrozenSourceManifest(bytes, await readFile(values["source-archive"]));
    if (projection.sourceCommit !== values["source-commit"] || projection.sourceArchiveSha256 !== values["source-archive-sha256"] || projection.sourceClassification !== values["source-classification"] || projection.productionEligible !== policy.productionEligible) throw new Error("Frozen source selection mismatch.");
    if (sourceManifest && canonicalJson(sourceManifest.files.map(({ path: relativePath, size, sha256 }) => ({ relativePath, size, sha256 }))) !== canonicalJson(snapshot.files.map(({ relativePath, size, sha256 }) => ({ relativePath, size, sha256 })))) throw new Error("Frozen source extracted inventory mismatch.");
    return { policy, snapshot, expectedLockfileSha256: projection.lockfileSha256 };
  }
  requireExactObject(snapshot, ["schemaVersion", "sourceClassification", "productionEligible", "sourceCommit", "sourceArchiveSha256", "workingTreeManifestSha256", "trackedDiffSha256", "untrackedInventorySha256", "creationRunId", "createdAt", "sourceRootIdentity", "files", "exclusions"], "source snapshot manifest");
  if (snapshot.schemaVersion !== 1 || !Array.isArray(snapshot.files) || !Array.isArray(snapshot.exclusions)) throw new Error("source snapshot manifest schema is unsupported.");
  if (snapshot.sourceClassification !== values["source-classification"] || snapshot.productionEligible !== policy.productionEligible || snapshot.sourceCommit !== values["source-commit"] || snapshot.sourceArchiveSha256 !== values["source-archive-sha256"] || typeof snapshot.creationRunId !== "string" || !/^[A-Za-z0-9-]+$/u.test(snapshot.creationRunId) || !Number.isFinite(Date.parse(snapshot.createdAt))) throw new Error("source snapshot creation receipt or authority identity is invalid.");
  for (const key of ["sourceArchiveSha256", "workingTreeManifestSha256", "trackedDiffSha256", "untrackedInventorySha256", "sourceRootIdentity"]) if (!/^[a-f0-9]{64}$/u.test(snapshot[key] || "")) throw new Error("source snapshot manifest hashes are invalid.");
  let previousPath = "";
  for (const file of snapshot.files) {
    requireExactObject(file, ["relativePath", "fileType", "size", "sha256", "classification", "includedReason"], "source snapshot file");
    if (typeof file.relativePath !== "string" || file.relativePath.normalize("NFC") !== file.relativePath || file.relativePath <= previousPath || file.fileType !== "file" || !Number.isSafeInteger(file.size) || file.size < 0 || !/^[a-f0-9]{64}$/u.test(file.sha256 || "") || !["tracked", "untracked"].includes(file.classification) || file.includedReason !== "release-relevant-worktree") throw new Error("source snapshot file entry is invalid.");
    previousPath = file.relativePath;
  }
  for (const item of snapshot.exclusions) {
    requireExactObject(item, ["relativePath", "reason"], "source snapshot exclusion");
    if (typeof item.relativePath !== "string" || item.relativePath.normalize("NFC") !== item.relativePath || item.reason !== "policy-excluded") throw new Error("source snapshot exclusion is invalid.");
  }
  if (snapshot.exclusions.map((item) => item.relativePath).some((item, index, all) => index > 0 && item <= all[index - 1])) throw new Error("source snapshot exclusions must be uniquely sorted.");
  const workingTreeManifestSha256 = sha256(Buffer.from(canonicalJson(snapshot.files.map(({ relativePath, size, sha256: fileSha, classification }) => ({ relativePath, size, sha256: fileSha, classification }))), "utf8"));
  if (snapshot.workingTreeManifestSha256 !== workingTreeManifestSha256) throw new Error("source snapshot working tree manifest identity is invalid.");
  const untrackedInventorySha256 = sha256(Buffer.from(canonicalJson(snapshot.files.filter((file) => file.classification === "untracked").map(({ relativePath, size, sha256: fileSha }) => ({ relativePath, size, sha256: fileSha }))), "utf8"));
  if (snapshot.sourceClassification === "COMMITTED_CLEAN_SOURCE" ? snapshot.untrackedInventorySha256 !== sha256(Buffer.from("[]", "utf8")) : snapshot.untrackedInventorySha256 !== untrackedInventorySha256) throw new Error("source snapshot untracked inventory identity is invalid.");
  const lockfile = snapshot.files.find((file) => file.relativePath === "package-lock.json" && file.fileType === "file");
  if (!lockfile || !/^[a-f0-9]{64}$/.test(lockfile.sha256)) throw new Error("source snapshot manifest does not bind package-lock.json.");
  if (values["source-classification"] === "COMMITTED_CLEAN_SOURCE") {
    if (snapshot.trackedDiffSha256 !== sha256(Buffer.alloc(0)) || snapshot.untrackedInventorySha256 !== sha256(Buffer.from("[]", "utf8")) || snapshot.files.some((file) => file.classification !== "tracked")) throw new Error("clean source classification requires a clean release-relevant tree.");
  }
  if (sourceManifest && canonicalJson(sourceManifest.files.map(({ path: filePath, size, sha256: fileSha }) => ({ relativePath: filePath, size, sha256: fileSha }))) !== canonicalJson(snapshot.files.map(({ relativePath, size, sha256: fileSha }) => ({ relativePath, size, sha256: fileSha })).sort((a, b) => compareUtf8(a.relativePath, b.relativePath)))) throw new Error("source archive logical manifest does not match source snapshot manifest.");
  return { policy, snapshot, expectedLockfileSha256: lockfile.sha256 };
}

export function assertBuildPlatform(platform = process.platform, architecture = process.arch, version = os.version()) {
  if (platform !== "win32" || architecture !== "x64" || !/Windows 11/i.test(version)) throw new Error("formal release construction requires the approved Windows 11 x64 host.");
}

export function deterministicBuildId(commit, archiveSha) {
  if (!/^[a-f0-9]{40}$/.test(commit) || !/^[a-f0-9]{64}$/.test(archiveSha)) throw new Error("source identity is invalid.");
  return `rb1-${sha256(`ued-asset-hub-next-build-v1\n${commit}\n${archiveSha}\n`)}`;
}

export function assertContained(root, candidate, label) {
  const relative = path.relative(root, candidate);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error(`${label} must be a strict child of the staging root.`);
}

export function resolveFrozenNativeSetPath(stagingRoot, nativeBuildId) {
  if (!/^(?:nb1-[a-f0-9]{12}-[a-f0-9]{32}|nb2-[a-f0-9]{16}(?:-[a-f0-9]{16}){2}|nb3-[a-f0-9]{64})$/.test(nativeBuildId)) throw new Error("native build ID is invalid.");
  const root = path.resolve(stagingRoot);
  const directory = path.resolve(root, "frozen", "native-components", nativeBuildId);
  assertContained(root, directory, "Native Set");
  if (path.basename(directory) !== nativeBuildId) throw new Error("native set path does not exactly match native build ID.");
  return directory;
}

export async function assertFrozenNativeSetBinding({ stagingRoot, nativeBuildId, nativeSetDigest, nativeSetRoot, native, sourceRoot, sourceCommit, sourceArchiveSha256 }) {
  const directory = resolveFrozenNativeSetPath(stagingRoot, nativeBuildId);
  if (path.resolve(nativeSetRoot) !== directory) throw new Error("native set root does not exactly match the frozen native build ID binding.");
  if (!native || !sourceRoot || !sourceCommit || !sourceArchiveSha256) throw new Error("native set provenance inputs are incomplete.");
  const verified = await verifyFrozenNativeSet(directory, { sourceRoot, sourceCommit, sourceArchiveSha256, toolchain: native.manifest.toolchain, configuration: "release-native" });
  const inputs = await calculateNativeSourceInputs(sourceRoot); const identity = nativeSourceIdentity(inputs);
  if (nativeSetDigest !== native.set.digest || native.set.digest !== verified.set.digest || native.manifest.sourceCommit !== sourceCommit || native.manifest.sourceArchiveSha256 !== sourceArchiveSha256 || native.manifest.nativeSourceIdentity !== identity || canonicalJson(native.manifest.nativeSourceInputs) !== canonicalJson(inputs) || native.manifest.nativeBuildId !== nativeBuildId || nativeBuildId !== nativeBuildIdForManifest(native.manifest)) throw new Error("native set identity or authoritative binding mismatch.");
  return directory;
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: options.cwd, env: options.env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      const output = Buffer.concat(stdout);
      const errors = Buffer.concat(stderr).toString("utf8");
      code === 0 ? resolve(output) : reject(new Error(`${path.basename(command)} failed (${code}): ${errors || output.toString("utf8")}`));
    });
  });
}

async function assertRegularTree(root, relative = "") {
  for (const entry of await readdir(path.join(root, relative), { withFileTypes: true })) {
    const next = relative ? `${relative}/${entry.name}` : entry.name;
    const details = await lstat(path.join(root, ...next.split("/")));
    if (details.isSymbolicLink() || (!details.isDirectory() && details.nlink > 1)) throw new Error(`links are not allowed in constructor input: ${next}`);
    if (details.isDirectory()) await assertRegularTree(root, next);
    else if (!details.isFile()) throw new Error(`unsupported constructor input: ${next}`);
  }
}

async function treeManifest(root, relative = "", include = () => true) {
  const files = [];
  async function visit(directory, prefix) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const child = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (!include(child)) continue;
      const absolute = path.join(root, ...child.split("/"));
      const details = await lstat(absolute);
      if (details.isSymbolicLink() || (!details.isDirectory() && details.nlink > 1)) throw new Error(`links are not allowed in manifest input: ${child}`);
      if (details.isDirectory()) await visit(absolute, child);
      else if (details.isFile()) files.push({ path: child, size: details.size, sha256: await hashFile(absolute) });
      else throw new Error(`unsupported manifest entry: ${child}`);
    }
  }
  await visit(path.join(root, ...relative.split("/").filter(Boolean)), relative);
  files.sort((left, right) => compareUtf8(left.path, right.path));
  return { files, digest: sha256(Buffer.from(canonicalJson(files), "utf8")) };
}

export function includeCandidateDependencyPath(relativePath) {
  return relativePath !== ".bin" && !relativePath.startsWith(".bin/");
}

export async function candidateDependencyProjection(nodeModulesRoot) {
  return treeManifest(nodeModulesRoot, "", includeCandidateDependencyPath);
}

export async function copyCandidateDependencyTree(nodeModulesRoot, destination) {
  await cp(nodeModulesRoot, destination, {
    recursive: true,
    filter: (source) => {
      const relative = path.relative(nodeModulesRoot, source).replaceAll("\\", "/");
      return !relative || includeCandidateDependencyPath(relative);
    },
  });
}

export async function verifyCandidateDependencyTree(expected, candidateRoot) {
  const actual = await treeManifest(candidateRoot);
  if (canonicalJson(actual.files) !== canonicalJson(expected.files)) throw new Error("Candidate node_modules differ from the verified runtime dependency artifact.");
  return actual;
}

export async function archiveEntries(archive) {
  const bytes = await readFile(archive);
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const entries = [];
  const decodeField = (header, start, length) => {
    const field = header.subarray(start, start + length);
    const terminator = field.indexOf(0);
    return decoder.decode(terminator === -1 ? field : field.subarray(0, terminator));
  };
  for (let offset = 0; offset + 512 <= bytes.length;) {
    const header = bytes.subarray(offset, offset + 512);
    if (header.every((value) => value === 0)) break;
    const sizeField = decodeField(header, 124, 12).trim();
    if (!/^[0-7]*$/.test(sizeField)) throw new Error("source archive has an invalid tar size field.");
    const size = Number.parseInt(sizeField || "0", 8);
    if (!Number.isSafeInteger(size) || size < 0) throw new Error("source archive has an invalid tar member size.");
    const type = String.fromCharCode(header[156] || 48);
    const name = decodeField(header, 0, 100);
    const prefix = decodeField(header, 345, 155);
    const member = prefix ? `${prefix}/${name}` : name;
    const bodyStart = offset + 512;
    const nextOffset = bodyStart + Math.ceil(size / 512) * 512;
    if (nextOffset > bytes.length) throw new Error("source archive is truncated.");
    if (type === "g") {
      const globalAttributes = decoder.decode(bytes.subarray(bodyStart, bodyStart + size));
      if (/(?:^|\n)\d+\s+(?:path|linkpath)=/u.test(globalAttributes)) throw new Error("source archive global PAX path overrides are prohibited.");
    } else {
      if (!member || !["0", "5"].includes(type)) throw new Error(`source archive entry type is prohibited: ${type}`);
      const normalized = type === "5" && member.endsWith("/") ? member.slice(0, -1) : member;
      validateArchiveMemberPath(normalized);
      entries.push({ path: normalized, type, bytes: bytes.subarray(bodyStart, bodyStart + size) });
    }
    offset = nextOffset;
  }
  if (!entries.length || new Set(entries.map((entry) => entry.path)).size !== entries.length) throw new Error("source archive member set is empty or duplicated.");
  return entries;
}

export async function archiveMembers(archive) {
  return (await archiveEntries(archive)).filter((entry) => entry.type === "0").map((entry) => entry.path).sort(compareUtf8);
}

export const validateArchiveMemberPath = validateArchiveMemberPathContract;

export async function findDotenvFiles(root) {
  const matches = [];
  async function visit(directory, relative = "") {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const child = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.name.toLowerCase().startsWith(".env")) matches.push(child);
      if (entry.isDirectory()) await visit(path.join(directory, entry.name), child);
    }
  }
  await visit(root);
  return matches.sort(compareUtf8);
}

async function safeMaterializeDirectory(root, relative = "") {
  const rootPath = path.resolve(root); const target = path.resolve(rootPath, ...relative.split("/").filter(Boolean));
  const relativeToRoot = path.relative(rootPath, target);
  if (relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) throw new Error("source archive target escapes materialization root.");
  await mkdir(rootPath, { recursive: true });
  let cursor = rootPath;
  for (const part of relativeToRoot ? relativeToRoot.split(path.sep) : []) {
    cursor = path.join(cursor, part);
    try { await mkdir(cursor); } catch (error) { if (error?.code !== "EEXIST") throw error; }
    const details = await lstat(cursor);
    if (!details.isDirectory() || details.isSymbolicLink()) throw new Error("source archive materialization encountered a reparse-point or conflicting target.");
  }
  const details = await lstat(target);
  if (!details.isDirectory() || details.isSymbolicLink()) throw new Error("source archive materialization encountered a reparse-point or conflicting target.");
  return target;
}

export async function materializeArchive({ archive, sourceRoot, workspace, checkpoint = async () => {} }) {
  const entries = await archiveEntries(archive); const members = entries.filter((entry) => entry.type === "0").map((entry) => entry.path).sort(compareUtf8);
  await safeMaterializeDirectory(sourceRoot);
  for (const entry of entries.sort((left, right) => compareUtf8(left.path, right.path))) {
    const target = path.resolve(sourceRoot, ...entry.path.split("/"));
    const relative = path.relative(sourceRoot, target);
    if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("source archive target escapes materialization root.");
    await safeMaterializeDirectory(sourceRoot, path.posix.dirname(entry.path) === "." ? "" : path.posix.dirname(entry.path));
    if (entry.type === "5") await safeMaterializeDirectory(sourceRoot, entry.path);
    else {
      try { await lstat(target); throw new Error("source archive materialization encountered an existing conflicting target."); } catch (error) { if (error?.code !== "ENOENT") throw error; }
      await writeFile(target, entry.bytes, { flag: "wx" });
    }
  }
  await assertRegularTree(sourceRoot);
  const extracted = await treeManifest(sourceRoot);
  if (canonicalJson(extracted.files.map((file) => file.path)) !== canonicalJson(members)) throw new Error("source archive member set does not match extracted source.");
  await checkpoint("DOTENV_GATE_BEGIN");
  const sourceDotenv = await findDotenvFiles(sourceRoot);
  if (sourceDotenv.some((item) => item !== ".env.example")) throw new Error(`source archive contains prohibited dotenv file: ${sourceDotenv.join(", ")}`);
  await cp(sourceRoot, workspace, { recursive: true, filter: (item) => path.basename(item).toLowerCase() !== ".env.example" });
  const workspaceDotenv = await findDotenvFiles(workspace);
  if (workspaceDotenv.length) throw new Error(`build workspace contains prohibited dotenv file: ${workspaceDotenv.join(", ")}`);
  await checkpoint("DOTENV_GATE_COMPLETE");
  return extracted;
}

function cleanOsEnvironment() {
  const systemRoot = process.env.SystemRoot || process.env.WINDIR;
  const comSpec = process.env.ComSpec || (systemRoot ? path.join(systemRoot, "System32", "cmd.exe") : undefined);
  if (!systemRoot || !comSpec) throw new Error("required Windows OS environment is unavailable.");
  return { SystemRoot: systemRoot, WINDIR: systemRoot, ComSpec: comSpec };
}

async function createBuildEnvironment(tempRoot, buildId) {
  const roots = {
    home: path.join(tempRoot, "profile", "home"), appData: path.join(tempRoot, "profile", "appdata"), localAppData: path.join(tempRoot, "profile", "localappdata"), temp: path.join(tempRoot, "temp"), cache: path.join(tempRoot, "npm-cache"), prefix: path.join(tempRoot, "npm-prefix"),
  };
  await Promise.all(Object.values(roots).map((directory) => mkdir(directory, { recursive: true })));
  const userConfig = path.join(tempRoot, "npm-user.ini");
  const globalConfig = path.join(tempRoot, "npm-global.ini");
  await writeFile(userConfig, "registry=https://registry.npmjs.org/\nalways-auth=false\naudit=false\nfund=false\nignore-scripts=true\n", "utf8");
  await writeFile(globalConfig, "", "utf8");
  const env = { ...cleanOsEnvironment(), TEMP: roots.temp, TMP: roots.temp, HOME: roots.home, USERPROFILE: roots.home, APPDATA: roots.appData, LOCALAPPDATA: roots.localAppData, CI: "1", TZ: "UTC", LANG: "C.UTF-8", LC_ALL: "C.UTF-8", NEXT_TELEMETRY_DISABLED: "1", UED_RELEASE_BUILD_ID: buildId, NPM_CONFIG_CACHE: roots.cache, NPM_CONFIG_USERCONFIG: userConfig, NPM_CONFIG_GLOBALCONFIG: globalConfig, NPM_CONFIG_PREFIX: roots.prefix, NPM_CONFIG_IGNORE_SCRIPTS: "true" };
  return { env, roots, userConfig, globalConfig };
}

function environmentEvidence(env, tempRoot) {
  const normalized = Object.fromEntries(Object.entries(env).sort(([left], [right]) => compareUtf8(left, right)).map(([key, value]) => [key, value.toLowerCase().startsWith(tempRoot.toLowerCase()) ? `<BUILD_ROOT>${value.slice(tempRoot.length).replaceAll("\\", "/")}` : value]));
  return { keys: Object.keys(normalized), normalized, digest: sha256(Buffer.from(canonicalJson(normalized), "utf8")) };
}

function assertNoForbiddenEnvironment(env) {
  const forbidden = ["ADMIN_PASSWORD", "ADMIN_SESSION_SECRET", "DEEPSEEK_API_KEY", "AGENT_GATEWAY_TOKEN", "DATA_DIR", "AGENT_RUNTIME_DIR", "ASSET_HUB_RUNTIME_DIR", "TRAINING_MEDIA_DIR", "NEXT_PUBLIC_R3_SENTINEL", "NODE_OPTIONS", "HTTPS_PROXY", "NPM_TOKEN", "NODE_AUTH_TOKEN"];
  for (const key of forbidden) if (Object.hasOwn(env, key)) throw new Error(`forbidden environment variable reached build child: ${key}`);
  if (Object.keys(env).some((key) => /(?:TOKEN|PASSWORD|SECRET|_AUTH)$/i.test(key))) throw new Error("secret-like environment variable reached build child.");
}

async function readPackageVersion(root, packageName) {
  return JSON.parse(await readFile(path.join(root, "node_modules", ...packageName.split("/"), "package.json"), "utf8")).version;
}

export function normalizeNpmTree(value) {
  if (Array.isArray(value)) return value.map(normalizeNpmTree);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).filter((key) => !["path", "_id", "problems"].includes(key)).sort(compareUtf8).map((key) => [key, normalizeNpmTree(value[key])]));
}

export function npmTreeDigest(value) {
  return sha256(Buffer.from(canonicalJson(normalizeNpmTree(value)), "utf8"));
}

export function assertNpmTreeHasNoSecrets(value, field = "$") {
  if (Array.isArray(value)) return value.forEach((entry, index) => assertNpmTreeHasNoSecrets(entry, `${field}[${index}]`));
  if (!value || typeof value !== "object") return;
  for (const [key, entry] of Object.entries(value)) {
    if (!field.endsWith(".dependencies") && /^(?:token|password|secret|authorization|cookie)$/i.test(key)) throw new Error(`npm ls raw evidence contains prohibited credential field: ${field}.${key}`);
    assertNpmTreeHasNoSecrets(entry, `${field}.${key}`);
  }
}

async function dependencyEvidence({ workspace, nodeExe, npmCli, env, nodeVersion, npmVersion, expectedLockfileSha256 = buildContract.lockfileSha256, onNpmTree = null }) {
  const versions = { nodeVersion, npmVersion, lockfileSha256: await hashFile(path.join(workspace, "package-lock.json")), nextVersion: await readPackageVersion(workspace, "next"), reactVersion: await readPackageVersion(workspace, "react"), reactDomVersion: await readPackageVersion(workspace, "react-dom"), eslintConfigNextVersion: await readPackageVersion(workspace, "eslint-config-next"), windowsSwc: `@next/swc-win32-x64-msvc@${await readPackageVersion(workspace, "@next/swc-win32-x64-msvc")}`, sharp: `sharp@${await readPackageVersion(workspace, "sharp")}`, windowsSharp: `@img/sharp-win32-x64@${await readPackageVersion(workspace, "@img/sharp-win32-x64")}`, backend: buildContract.backend };
  assertPinnedIdentity(versions, { lockfileSha256: expectedLockfileSha256 });
  const rawNpmTree = JSON.parse((await run(nodeExe, [npmCli, "ls", "--all", "--json"], { cwd: workspace, env })).toString("utf8"));
  assertNpmTreeHasNoSecrets(rawNpmTree);
  const npmTree = normalizeNpmTree(rawNpmTree);
  const canonicalNpmTree = canonicalJson(npmTree);
  const npmTreeDigest = sha256(Buffer.from(canonicalNpmTree, "utf8"));
  if (typeof onNpmTree === "function") await onNpmTree({ raw: rawNpmTree, normalized: npmTree, canonical: canonicalNpmTree, digest: npmTreeDigest });
  const installedLock = JSON.parse(await readFile(path.join(workspace, "node_modules", ".package-lock.json"), "utf8"));
  return { versions, npmTreeDigest, installedLockDigest: sha256(Buffer.from(canonicalJson(installedLock), "utf8")) };
}

function graphFieldPath(field, key) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? `${field}.${key}` : `${field}[${JSON.stringify(key)}]`;
}

function classifyGraphDifference(field, kind) {
  if (/\.version$/.test(field)) return "PACKAGE_VERSION";
  if (/\.(?:optional|optionalDependencies)$/.test(field)) return "OPTIONAL_DEPENDENCY";
  if (/\.(?:peer|peerDependencies|peerDependenciesMeta)$/.test(field)) return "PEER_DEPENDENCY";
  if (/\.extraneous$/.test(field)) return "EXTRANEOUS";
  if (/\.invalid$/.test(field)) return "INVALID";
  if (/\.missing$/.test(field)) return "MISSING";
  if (/\.resolved$/.test(field)) return "RESOLVED_METADATA";
  if (/\.(?:path|location)$/.test(field)) return "ABSOLUTE_PATH";
  if (/\.(?:problems|error|errors)$/.test(field)) return "NPM_OUTPUT_METADATA";
  if (kind !== "changed" && /\.dependencies(?:\[|\.)/.test(field)) return "PACKAGE_PRESENCE";
  if (/\.dependencies(?:\[|\.)/.test(field)) return "DEPENDENCY_EDGE";
  return "UNKNOWN";
}

const nonSemanticGraphClasses = new Set(["ABSOLUTE_PATH", "WORKSPACE_PATH", "CACHE_PATH", "ORDERING_ONLY", "OBJECT_KEY_ORDER", "ARRAY_ORDER", "NPM_OUTPUT_METADATA"]);

export function compareNpmLsGraphs(left, right) {
  const differences = [];
  const visit = (a, b, field, hasA = true, hasB = true) => {
    if (hasA && hasB && canonicalJson(a) === canonicalJson(b)) return;
    if (hasA && hasB && Array.isArray(a) && Array.isArray(b)) {
      for (let index = 0; index < Math.max(a.length, b.length); index += 1) visit(a[index], b[index], `${field}[${index}]`, index < a.length, index < b.length);
      return;
    }
    if (hasA && hasB && a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b)) {
      for (const key of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort(compareUtf8)) visit(a[key], b[key], graphFieldPath(field, key), Object.hasOwn(a, key), Object.hasOwn(b, key));
      return;
    }
    const kind = hasA ? hasB ? "changed" : "removed" : "added";
    const classification = classifyGraphDifference(field, kind);
    differences.push({ path: field, kind, a: hasA ? a : null, b: hasB ? b : null, classification, semantic: !nonSemanticGraphClasses.has(classification) });
  };
  visit(left, right, "$");
  return { match: differences.length === 0, differenceCount: differences.length, firstDifference: differences[0] ?? null, firstSemanticDifference: differences.find((difference) => difference.semantic) ?? null, differences };
}

export function compareDependencyEvidence(left, right) {
  const differences = [];
  const visit = (a, b, field) => {
    if (canonicalJson(a) === canonicalJson(b)) return;
    if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b)) {
      for (const key of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort(compareUtf8)) visit(a[key], b[key], field ? `${field}.${key}` : key);
      return;
    }
    differences.push({ path: field, a: a ?? null, b: b ?? null, classification: field === "versions.lockfileSha256" ? "LOCKFILE" : field === "npmTreeDigest" ? "NPM_LS_GRAPH" : field === "installedLockDigest" ? "NODE_MODULES_PACKAGE_LOCK" : field.startsWith("versions.") ? "PACKAGE_METADATA" : "UNKNOWN" });
  };
  visit(left, right, "");
  return { match: differences.length === 0, firstDifference: differences[0] ?? null, differences };
}

async function copyRequired(source, destination, files) {
  for (const relative of files) {
    const from = path.join(source, ...relative.split("/"));
    await access(from);
    const to = path.join(destination, ...relative.split("/"));
    await mkdir(path.dirname(to), { recursive: true });
    await cp(from, to, { force: true, errorOnExist: false, recursive: false });
  }
}

const authorityReceiptKeys = ["sourceManifestSha256", "sourceCreationReceiptSha256", "toolchainReceiptSha256", "environmentReceiptSha256", "dependencyReceiptSha256", "nativeManifestSha256", "nativeCreationReceiptSha256", "dshBundleAuthoritySha256", "dshProvenanceSha256", "securityProtectedArtifactSha256"];
function requireExactObject(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value) || canonicalJson(Object.keys(value).sort(compareUtf8)) !== canonicalJson([...keys].sort(compareUtf8))) throw new Error(label + " has unknown or missing fields.");
}
function sameResolvedPath(left, right, label) {
  if (path.resolve(left).toLowerCase() !== path.resolve(right).toLowerCase()) throw new Error(label + " does not match ExecutionBinding locator.");
}
export function parseReleasePhaseJournal(journalBytes, selection) {
  const journalLines = journalBytes.toString("utf8").split(/\r?\n/u).filter(Boolean).map((line) => parseStrictJson(Buffer.from(line)));
  if (!journalLines.length) throw new Error("append-only phase journal is empty.");
  const journalHeader = journalLines.shift();
  requireExactObject(journalHeader, ["schemaVersion", "identity", "experimentId", "labelBudget", "experimentPermissionDigest"], "phase journal header");
  if (journalHeader.schemaVersion !== 1 || journalHeader.experimentId !== selection.experimentId || !Number.isSafeInteger(journalHeader.labelBudget) || journalHeader.labelBudget < 1 || !/^[a-f0-9]{64}$/u.test(journalHeader.experimentPermissionDigest || "") || !/^[a-f0-9]{64}$/u.test(journalHeader.identity || "") || sha256(Buffer.from(canonicalJson({ schemaVersion: 1, experimentId: journalHeader.experimentId, labelBudget: journalHeader.labelBudget, experimentPermissionDigest: journalHeader.experimentPermissionDigest }), "utf8")) !== journalHeader.identity) throw new Error("phase journal header identity is invalid.");
  let previousSha256 = journalHeader.identity;
  const journalEntries = [];
  for (const entry of journalLines) {
    requireExactObject(entry, ["schemaVersion", "sequence", "event", "executionRunId", "candidateLabel", "phase", "previousSha256", "entrySha256"], "phase journal entry");
    const { entrySha256, ...entryBody } = entry;
    if (entry.schemaVersion !== 1 || entry.sequence !== journalEntries.length + 1 || !["started", "completed"].includes(entry.event) || entry.previousSha256 !== previousSha256 || !["A", "B", "single", "pre-r3"].includes(entry.candidateLabel) || typeof entry.executionRunId !== "string" || typeof entry.phase !== "string" || sha256(Buffer.from(canonicalJson(entryBody), "utf8")) !== entrySha256) throw new Error("phase journal chain is invalid.");
    previousSha256 = entrySha256;
    journalEntries.push(entry);
  }
  const usedBudget = journalEntries.filter((entry) => entry.event === "started" && entry.candidateLabel === selection.candidateLabel).length;
  const currentEntries = journalEntries.filter((entry) => entry.executionRunId === selection.executionRunId);
  const lastCurrent = currentEntries.at(-1);
  const journal = { identity: journalHeader.identity, experimentId: journalHeader.experimentId, executionRunId: selection.executionRunId, completedPhase: lastCurrent?.event === "completed" ? lastCurrent.phase : null, usedBudget };
  return { journalHeader, journalEntries, previousSha256, journal };
}
export function assertReleaseJournalHead(bytes, admission) {
  const lines = bytes.toString("utf8").split(/\r?\n/u).filter(Boolean);
  if (!lines.length) throw new Error("Journal head missing");
  const latest = parseStrictJson(Buffer.from(lines.at(-1)));
  if ((latest.entrySha256 ?? latest.identity) !== admission.previousJournalEntrySha256 || lines.length !== admission.journalEntries.length + 1) throw new Error("Journal head changed; concurrent/replayed execution claim rejected");
}

export async function validateAuthorityAdmission(values, paths) {
  const authorityBytes = await readFile(path.resolve(values["authority-root"]));
  const bindingBytes = await readFile(path.resolve(values["execution-binding"]));
  const receiptPaths = parseStrictJson(await readFile(path.resolve(values["receipt-files"])));
  requireExactObject(receiptPaths, authorityReceiptKeys, "receipt file map");
  const receiptBytes = {};
  for (const key of authorityReceiptKeys) {
    const receiptPath = path.resolve(receiptPaths[key]);
    assertContained(paths.stagingRoot, receiptPath, "approved receipt " + key);
    const details = await lstat(receiptPath);
    if (!details.isFile() || details.isSymbolicLink() || details.nlink !== 1) throw new Error("approved receipt file type: " + key);
    receiptBytes[key] = await readFile(receiptPath);
  }
  const admissionContext = await loadTrustedReleaseSelection({ approvalIdentity: values["approval-identity"], planIdentity: values["execution-plan-identity"], authorityBytes, receiptBytes, bindingBytes, executionRunId: values["execution-run-id"], candidateLabel: values["candidate-label"], phase: values["phase"] });
  const { authority, binding } = admissionContext;
  sameResolvedPath(values["phase-journal"], admissionContext.journalPath, "protected phase journal");
  const executionBindingSha256 = sha256(bindingBytes);
  const { journalHeader, journalEntries, previousSha256, journal } = parseReleasePhaseJournal(await readFile(path.resolve(values["phase-journal"])), { experimentId: values["experiment-id"], executionRunId: values["execution-run-id"], candidateLabel: values["candidate-label"] });
  requireExactObject(authority.receipts, authorityReceiptKeys, "authority receipts");
  requireExactObject(binding.receipts, authorityReceiptKeys, "binding receipts");
  if (canonicalJson(authority.receipts) !== canonicalJson(binding.receipts)) throw new Error("ExecutionBinding does not bind the selected authority receipts.");
  for (const key of authorityReceiptKeys) {
    const receiptPath = path.resolve(receiptPaths[key]);
    assertContained(paths.stagingRoot, receiptPath, "approved receipt " + key);
    const details = await lstat(receiptPath);
    if (!details.isFile() || details.isSymbolicLink() || details.nlink > 1 || await hashFile(receiptPath) !== authority.receipts[key]) throw new Error("approved receipt bytes mismatch: " + key);
  }
  if (authority.source.sourceCommit !== values["source-commit"] || authority.source.sourceArchiveSha256 !== values["source-archive-sha256"] || authority.source.sourceClassification !== values["source-classification"] || authority.dsh.commit !== values["dsh-commit"] || authority.dsh.version !== values["dsh-version"] || authority.native.nativeSetId !== values["native-build-id"] || authority.native.setDigest !== values["native-set-digest"] || authority.security.securitySetId !== values["security-set-id"] || authority.security.authorizationId !== values["security-set-authorization-id"]) throw new Error("Constructor input diverges from LogicalReleaseAuthority.");
  const locators = binding.locators;
  sameResolvedPath(locators.stagingRoot, paths.stagingRoot, "stagingRoot");
  sameResolvedPath(locators.canonicalWorkspace, path.join(paths.tempRoot, "workspace"), "canonicalWorkspace");
  sameResolvedPath(locators.tempRoot, paths.tempRoot, "tempRoot");
  sameResolvedPath(locators.outputRoot, paths.outputDir, "outputRoot");
  sameResolvedPath(locators.evidenceRoot, paths.evidenceRoot, "evidenceRoot");
  sameResolvedPath(locators.sourceArtifact, paths.archive, "sourceArtifact");
  sameResolvedPath(locators.nativeRoot, path.resolve(values["native-set-root"]), "nativeRoot");
  sameResolvedPath(locators.dshMaterializationRoot, path.resolve(values["dsh-source-root"]), "dshMaterializationRoot");
  sameResolvedPath(locators.toolchainRoot, paths.nodeRoot, "toolchainRoot");
  sameResolvedPath(locators.securityArtifact, paths.securitySetPath, "securityArtifact");
  if (binding.inputAuthorityIdentity !== authority.inputAuthorityIdentity) throw new Error("ExecutionBinding core identity mismatch.");
  if (values["source-snapshot-manifest-sha256"] !== authority.receipts.sourceManifestSha256) throw new Error("Source manifest is not the approved authority receipt.");
  const expected = { experimentId: values["experiment-id"], executionRunId: values["execution-run-id"], candidateLabel: values["candidate-label"], inputAuthorityIdentity: authority.inputAuthorityIdentity, phase: values["phase"], receipts: authority.receipts, bindings: binding.bindings, journal: { identity: journal.identity, executionRunId: journal.executionRunId, completedPhase: journal.completedPhase, usedBudget: journal.usedBudget } };
  assertExecutionBinding(binding, expected);
  if (binding.permission.experimentPermissionDigest !== journalHeader.experimentPermissionDigest || binding.permission.labelBudget !== journalHeader.labelBudget) throw new Error("Execution permission is not selected by the append-only phase journal.");
  const currentRunUsed = journalEntries.some((entry) => entry.executionRunId === values["execution-run-id"]);
  if (currentRunUsed) throw new Error("Execution Run has already been claimed; completed or interrupted phase replay is prohibited.");
  return { authority, binding, approvalIdentity: admissionContext.approval.approvalIdentity, admissionContext, receiptBytes, receiptPaths, executionBindingSha256, phaseJournal: journal, journalPath: path.resolve(values["phase-journal"]), journalEntries, previousJournalEntrySha256: previousSha256 };
}

function validateValues(values) {
  for (const key of required) if (!values[key]) throw new Error(`missing --${key}`);
  if (values["creation-run-id"] || values["authority-root-sha256"] || values["execution-binding-sha256"]) throw new Error("Legacy caller authority/creation inputs cannot enter live admission.");
  if (!/^[a-f0-9]{40}$/.test(values["source-commit"]) || !/^[a-f0-9]{64}$/.test(values["source-archive-sha256"]) || !/^[a-f0-9]{40}$/.test(values["dsh-commit"]) || !/^[a-f0-9]{64}$/.test(values["native-set-digest"]) || !/^(?:nb1-[a-f0-9]{12}-[a-f0-9]{32}|nb2-[a-f0-9]{16}(?:-[a-f0-9]{16}){2}|nb3-[a-f0-9]{64})$/.test(values["native-build-id"])) throw new Error("constructor identity argument is invalid.");
  validateSourceClassificationInput(values);
}

async function appendPhaseJournal(admission, { event, runId, label, phase }) {
  return withReleaseJournalLock(admission.journalPath, async () => {
  assertReleaseJournalHead(await readFile(admission.journalPath), admission);
  const entryBody = { schemaVersion: 1, sequence: admission.journalEntries.length + 1, event, executionRunId: runId, candidateLabel: label, phase, previousSha256: admission.previousJournalEntrySha256 };
  const entry = { ...entryBody, entrySha256: sha256(Buffer.from(canonicalJson(entryBody), "utf8")) };
  await appendProtectedReleaseJournal(admission.journalPath, Buffer.from(canonicalJson(entry) + "\n"));
  admission.journalEntries.push(entry);
  admission.previousJournalEntrySha256 = entry.entrySha256;
  });
}

export async function prepareWindowsRelease(values, diagnostic = {}) {
  const checkpoint = typeof diagnostic.onCheckpoint === "function" ? diagnostic.onCheckpoint : async () => {};
  validateValues(values);
  assertBuildPlatform();
  await checkpoint("PREPARE_ENTERED");
  const stagingRoot = path.resolve(values["staging-root"]);
  const archive = path.resolve(values["source-archive"]);
  const outputDir = path.resolve(values["output-dir"]);
  const tempRoot = path.resolve(values["temp-dir"]);
  const nodeRoot = path.resolve(values["node-root"]);
  const snapshotManifest = values["source-snapshot-manifest"] ? path.resolve(values["source-snapshot-manifest"]) : null;
  const securitySetPath = path.resolve(values["security-set"]);
  const evidenceRoot = path.resolve(values["evidence-root"]);
  const paths = { stagingRoot, archive, outputDir, tempRoot, nodeRoot, securitySetPath, evidenceRoot };
  for (const [candidate, label] of [[archive, "source archive"], [outputDir, "output directory"], [tempRoot, "temporary directory"], [nodeRoot, "staged Node root"], [evidenceRoot, "evidence root"], [path.resolve(values["dsh-source-root"]), "DSH source"], [path.resolve(values["native-set-root"]), "Native Set"], [securitySetPath, "Release Security Set"], ...(snapshotManifest ? [[snapshotManifest, "source snapshot manifest"]] : [])]) assertContained(stagingRoot, candidate, label);
  for (const locator of [stagingRoot, ...Object.values(paths).slice(1), path.resolve(values["native-set-root"]), path.resolve(values["dsh-source-root"]), path.resolve(values["receipt-files"]), path.resolve(values["authority-root"]), path.resolve(values["execution-binding"])]) {
    let cursor = locator;
    while (true) {
      try { const details = await lstat(cursor); if (details.isSymbolicLink() || (details.isFile() && details.nlink !== 1)) throw new Error("Execution locator crosses a link"); } catch (error) { if (error.code !== "ENOENT") throw error; }
      const parent = path.dirname(cursor); if (parent === cursor) break; cursor = parent;
    }
  }
  const volume = path.parse(stagingRoot).root[0];
  const { stdout: filesystem } = await (await import("node:util")).promisify((await import("node:child_process")).execFile)("C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `(Get-Volume -DriveLetter '${volume}').FileSystemType.ToString()`], { windowsHide: true });
  if (filesystem.trim() !== "NTFS") throw new Error("Approved staging filesystem must be NTFS");
  assertContained(stagingRoot, await realpath(securitySetPath), "Resolved Release Security Set");
  const admission = await validateAuthorityAdmission(values, paths);
  assertExecutionRootsPreserveHistory(admission.binding, await loadProtectedHistoricalRoots());
  const receiptProjections = assertReleaseReceiptProjections(admission.authority, admission.receiptBytes, await readFile(archive));
  admission.receiptProjections = receiptProjections;
  const approvedNativeManifest = parseStrictJson(admission.receiptBytes.nativeManifestSha256);
  const frozenNative = await verifyFrozenNativeSet(path.resolve(values["native-set-root"]));
  if (frozenNative.set.digest !== admission.authority.native.setDigest || await hashFile(path.join(values["native-set-root"], "native-components.manifest.json")) !== admission.authority.receipts.nativeManifestSha256) throw new Error("Native original aggregate raw bytes mismatch");
  if (approvedNativeManifest.nativeBuildId !== admission.authority.native.nativeSetId || approvedNativeManifest.nativeSourceIdentity !== admission.authority.native.nativeSourceIdentity || sha256(Buffer.from(canonicalJson(approvedNativeManifest.toolchain))) !== admission.authority.native.toolchainIdentity) throw new Error("Native approved manifest projection");
  const nativeMembers = [];
  const { nativeComponentDefinitions } = await import("./native-artifact-contract.mjs");
  for (const role of nativeComponentDefinitions) {
    const bytes = await readFile(path.join(path.resolve(values["native-set-root"]), ...role.executableRelativePath.split("/")));
    const inspection = inspectNativeExecutable(bytes);
    nativeMembers.push({ path: role.executableRelativePath, size: bytes.length, sha256: inspection.observedSha256, inspection });
  }
  assertNativeBuildReceiptSet(admission.receiptBytes.nativeCreationReceiptSha256, { approvedSha256: admission.authority.receipts.nativeCreationReceiptSha256, nativeManifest: approvedNativeManifest, actualMembers: nativeMembers, sourceInputs: approvedNativeManifest.nativeSourceInputs });
  for (const input of approvedNativeManifest.nativeSourceInputs) { const frozen = receiptProjections.frozen.manifest.files.find((file) => file.relativePath === input.relativePath); if (!frozen || frozen.sha256 !== input.sha256 || frozen.size !== input.size) throw new Error("Native frozen source member mismatch"); }

  const securitySet = await loadProtectedReleaseSecuritySet(securitySetPath, { sourceCommit: values["source-commit"], sourceArchiveSha256: values["source-archive-sha256"], authorizationId: values["security-set-authorization-id"], now: Date.now(), nextVersion: buildContract.nextVersion });
  if (securitySet.securitySetId !== values["security-set-id"] || securitySet.securitySetId !== admission.authority.security.securitySetId || securitySet.nextVersion !== admission.authority.security.nextVersion || sha256(Buffer.from(canonicalJson(securitySet.epoch), "utf8")) !== admission.authority.security.epochId || await hashFile(securitySetPath) !== admission.authority.receipts.securityProtectedArtifactSha256) throw new Error("SECURITY_SET_AUTHORITY_MISMATCH");
  const securitySetMetadata = releaseSecuritySetMetadata(securitySet, { sourceCommit: values["source-commit"], sourceArchiveSha256: values["source-archive-sha256"], authorizationId: values["security-set-authorization-id"], now: Date.now(), nextVersion: buildContract.nextVersion });
  const nodeExe = path.join(nodeRoot, "node.exe");
  const npmCli = path.join(nodeRoot, "node_modules", "npm", "bin", "npm-cli.js");
  const npmRoot = path.join(nodeRoot, "node_modules", "npm");
  await checkpoint("NODE_ARTIFACT_SHA_BEGIN");
  assertApprovedNodeArtifactSha256(await hashFile(nodeExe));
  await checkpoint("NODE_ARTIFACT_SHA_COMPLETE");
  await checkpoint("CLEAN_OS_ENV_BEGIN");
  const osEnv = cleanOsEnvironment();
  await checkpoint("CLEAN_OS_ENV_COMPLETE");
  await checkpoint("NODE_VERSION_BEGIN");
  const nodeVersion = (await run(nodeExe, ["--version"], { env: osEnv })).toString("utf8").trim().replace(/^v/, "");
  await checkpoint("NODE_VERSION_COMPLETE");
  if (await hashFile(path.join(npmRoot, "package.json")) !== admission.authority.toolchain.npmPackageJsonSha256 || await hashFile(path.join(npmRoot, "node_modules", "tar", "package.json")) !== admission.authority.toolchain.bundledTarPackageSha256 || parseStrictJson(await readFile(path.join(npmRoot, "node_modules", "tar", "package.json"))).version !== admission.authority.toolchain.bundledTarVersion) throw new Error("approved npm/tar package bytes mismatch");
  if (await hashFile(npmCli) !== admission.authority.toolchain.npmCliSha256) throw new Error("approved npm CLI SHA-256 mismatch.");
  if ((await calculateCompleteByteTreeInventory(npmRoot)).sha256 !== admission.authority.toolchain.npmDistributionSha256) throw new Error("approved npm distribution byte identity mismatch.");
  await checkpoint("NPM_VERSION_BEGIN");
  const npmVersion = (await run(nodeExe, [npmCli, "--version"], { env: osEnv })).toString("utf8").trim();
  await checkpoint("NPM_VERSION_COMPLETE");
  assertApprovedNodeNpmVersions(nodeVersion, npmVersion);
  await appendPhaseJournal(admission, { event: "started", runId: values["execution-run-id"], label: values["candidate-label"], phase: values["phase"] });
  for (const directory of [tempRoot, outputDir]) {
    try { await lstat(directory); } catch (error) { if (error.code === "ENOENT") continue; throw error; }
    throw new Error("Fresh execution directory already exists; retained outputs cannot be replaced");
  }
  await mkdir(tempRoot, { recursive: true });
  await mkdir(outputDir, { recursive: true });
  await secureReleaseSecurityDirectory(tempRoot);
  await secureReleaseSecurityDirectory(outputDir);
  await checkpoint("BUILD_TEMP_READY");
  await writeFile(path.join(tempRoot, ".ued-r3-owner.json"), `${canonicalJson({ schemaVersion: 2, block: "V2.1.0.13", executionRunId: values["execution-run-id"], testOnly: false })}\n`, "utf8");
  await checkpoint("OWNER_MARKER_WRITTEN");
  await checkpoint("SOURCE_ARCHIVE_SHA_BEGIN");
  if (await hashFile(archive) !== values["source-archive-sha256"]) throw new Error("source archive SHA-256 mismatch.");
  await checkpoint("SOURCE_ARCHIVE_SHA_COMPLETE");
  const sourceRoot = path.join(tempRoot, "source");
  const workspace = path.join(tempRoot, "workspace");
  await checkpoint("ARCHIVE_MATERIALIZE_BEGIN");
  const source = await materializeArchive({ archive, sourceRoot, workspace, checkpoint });
  await checkpoint("ARCHIVE_MATERIALIZE_COMPLETE");
  const sourceProvenance = await validateSourceSnapshotManifest(values, source);
  await checkpoint("LOCKFILE_VALIDATE_BEGIN");
  await assertPackageLockContract(path.join(workspace, "package-lock.json"), sourceProvenance.expectedLockfileSha256);
  await checkpoint("LOCKFILE_VALIDATE_COMPLETE");
  const buildId = deterministicBuildId(values["source-commit"], values["source-archive-sha256"]);
  await checkpoint("ISOLATED_BUILD_ENV_BEGIN");
  const buildEnvironment = await createBuildEnvironment(tempRoot, buildId);
  assertNoForbiddenEnvironment(buildEnvironment.env);
  const envEvidence = environmentEvidence(buildEnvironment.env, tempRoot);
  await checkpoint("ISOLATED_BUILD_ENV_COMPLETE");
  await checkpoint("BEFORE_NPM_CI");
  if (diagnostic.stopBeforeNpmCi === true) return { ...admission, values, stagingRoot, archive, outputDir, tempRoot, sourceRoot, workspace, source, sourceProvenance, securitySet, securitySetMetadata, nodeRoot, nodeExe, npmCli, buildId, buildEnvironment, envEvidence, dependencies: null, diagnostic: { stoppedBeforeNpmCi: true }, toolchain: { contractVersion: buildContract.version, os: os.version(), release: os.release(), arch: process.arch, filesystem: "NTFS", nodeVersion, nodeArtifactSha256: await hashFile(nodeExe), npmVersion, backend: buildContract.backend } };
  await run(nodeExe, [npmCli, "ci", "--include=dev", "--ignore-scripts", "--no-audit", "--no-fund"], { cwd: workspace, env: buildEnvironment.env });
  if (await hashFile(path.join(workspace, "package-lock.json")) !== sourceProvenance.expectedLockfileSha256) throw new Error("npm ci mutated package-lock.json.");
  const dependencies = await dependencyEvidence({ workspace, nodeExe, npmCli, env: buildEnvironment.env, nodeVersion, npmVersion, expectedLockfileSha256: sourceProvenance.expectedLockfileSha256, onNpmTree: diagnostic.onNpmTree });
  if (dependencies.npmTreeDigest !== admission.authority.dependency.graphIdentity) throw new Error("approved dependency graph identity mismatch.");
  return { ...admission, values, stagingRoot, archive, outputDir, tempRoot, sourceRoot, workspace, source, sourceProvenance, securitySet, securitySetMetadata, nodeRoot, nodeExe, npmCli, buildId, buildEnvironment, envEvidence, dependencies, toolchain: { contractVersion: buildContract.version, os: os.version(), release: os.release(), arch: process.arch, filesystem: "NTFS", nodeVersion, nodeArtifactSha256: await hashFile(nodeExe), npmVersion, backend: buildContract.backend } };
}

export async function runWindowsNextBuild(prepared, diagnostic = null) {
  assertNoForbiddenEnvironment(prepared.buildEnvironment.env);
  const buildEnv = { ...prepared.buildEnvironment.env, NODE_ENV: "production" };
  const nextArguments = [path.join(prepared.workspace, "node_modules", "next", "dist", "bin", "next"), "build"];
  const actualNextVersion = prepared.dependencies?.versions?.nextVersion ?? buildContract.nextVersion;
  if (actualNextVersion !== buildContract.nextVersion) throw new Error("SECURITY_SET_NEXT_VERSION_UNSUPPORTED");
  const securitySetOptions = { sourceCommit: prepared.values["source-commit"], sourceArchiveSha256: prepared.values["source-archive-sha256"], authorizationId: prepared.values["security-set-authorization-id"], now: Date.now(), nextVersion: actualNextVersion };
  await materializeNextSecurityCache({ workspace: prepared.workspace, securitySet: prepared.securitySet, nextVersion: securitySetOptions.nextVersion, sourceCommit: securitySetOptions.sourceCommit, sourceArchiveSha256: securitySetOptions.sourceArchiveSha256, authorizationId: securitySetOptions.authorizationId, now: securitySetOptions.now });
  if (diagnostic) {
    if (diagnostic.kind === "r3b2d-env" || diagnostic.kind === "r3b2d") {
      if (!path.isAbsolute(diagnostic.observerPath) || !path.isAbsolute(diagnostic.evidenceDir) || !/^[a-z0-9-]+$/i.test(diagnostic.label) || !/^P(?:0b|[1-9])$/.test(diagnostic.rung || "")) throw new Error("R3B2D diagnostic observation arguments are invalid.");
      buildEnv.UED_DIAGNOSTIC_RUNG = diagnostic.rung;
      buildEnv.UED_R3B2D_OBSERVER_PATH = diagnostic.observerPath;
      buildEnv.UED_R3B2D_OBSERVER_DIR = diagnostic.evidenceDir;
      buildEnv.UED_R3B2D_OBSERVER_LABEL = diagnostic.label;
    }
    if (diagnostic.kind === "r3b2d") {
      const compilerPath = path.join(prepared.workspace, "node_modules", "next", "dist", "build", "compiler.js");
      const original = await readFile(compilerPath, "utf8");
      const target = "        const compiler = (0, _getwebpackbundler.default)()(config);";
      if (original.split(target).length - 1 !== 1) throw new Error("R3B2D diagnostic patch target is ambiguous.");
      const replacement = `        const webpack = (0, _getwebpackbundler.default)();
        const compiler = webpack(config);
        require(process.env.UED_R3B2D_OBSERVER_PATH).attachIsolationObserver({ webpack, compiler, config });`;
      const patched = original.replace(target, replacement);
      await writeFile(compilerPath, patched, "utf8");
      diagnostic.patch = { targetOccurrence: 1, originalSha256: sha256(Buffer.from(original, "utf8")), patchedSha256: sha256(Buffer.from(patched, "utf8")), target, replacement };
    }
    if (diagnostic.kind === "r3b2b") {
      if (!path.isAbsolute(diagnostic.observerPath) || !path.isAbsolute(diagnostic.evidenceDir) || !/^[ab]$/.test(diagnostic.label)) throw new Error("R3B2B diagnostic observation arguments are invalid.");
      const compilerPath = path.join(prepared.workspace, "node_modules", "next", "dist", "build", "compiler.js");
      const original = await readFile(compilerPath, "utf8");
      const target = "        const compiler = (0, _getwebpackbundler.default)()(config);";
      if (original.split(target).length - 1 !== 1) throw new Error("R3B2B diagnostic patch target is ambiguous.");
      const replacement = `        const webpack = (0, _getwebpackbundler.default)();
        const compiler = webpack(config);
        require(process.env.UED_R3B2B_OBSERVER_PATH).attachWebpackObserver({ webpack, compiler, config });`;
      const patched = original.replace(target, replacement);
      await writeFile(compilerPath, patched, "utf8");
      diagnostic.patch = { targetOccurrence: 1, originalSha256: sha256(Buffer.from(original, "utf8")), patchedSha256: sha256(Buffer.from(patched, "utf8")), target, replacement };
      buildEnv.UED_R3B2B_OBSERVER_PATH = diagnostic.observerPath;
      buildEnv.UED_R3B2B_OBSERVER_DIR = diagnostic.evidenceDir;
      buildEnv.UED_R3B2B_OBSERVER_LABEL = diagnostic.label;
    } else {
    if (!path.isAbsolute(diagnostic.preloadPath) || !path.isAbsolute(diagnostic.evidenceDir) || !/^[ab]$/.test(diagnostic.label)) throw new Error("R3B diagnostic observation arguments are invalid.");
    buildEnv.UED_R3B_OBSERVER_DIR = diagnostic.evidenceDir;
    buildEnv.UED_R3B_OBSERVER_LABEL = diagnostic.label;
    buildEnv.NODE_OPTIONS = "--require=" + (diagnostic.preloadPath.includes(" ") ? JSON.stringify(diagnostic.preloadPath) : diagnostic.preloadPath);
    }
  }
  try {
    await run(prepared.nodeExe, nextArguments, { cwd: prepared.workspace, env: buildEnv });
  } catch {
    throw new Error("NEXT_BUILD_FAILED_WITH_RELEASE_SECURITY_SET");
  }
  prepared.securitySetAdoption = await verifyNextSecurityAdoption({ workspace: prepared.workspace, securitySet: prepared.securitySet, options: securitySetOptions });
  prepared.manifestNormalization = {
    buildOutput: await normalizeNextManifestTree(path.join(prepared.workspace, ".next")),
    standaloneOutput: await normalizeNextManifestTree(path.join(prepared.workspace, ".next", "standalone", ".next")),
  };
  const rawNext = await treeManifest(prepared.workspace, ".next");
  const serverReferencePath = path.join(prepared.workspace, ".next", "server", "server-reference-manifest.json");
  let serverActions = "ABSENT";
  try {
    const reference = JSON.parse(await readFile(serverReferencePath, "utf8"));
    if (Object.values(reference).some((value) => value && typeof value === "object" && Object.keys(value).length)) serverActions = "PRESENT";
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (serverActions === "PRESENT") throw new Error("generated server action map is not empty.");
  prepared.rawNext = rawNext;
  prepared.serverActions = serverActions;
  return rawNext;
}

export async function finalizeWindowsRelease(prepared, { candidateLabel = prepared.values["candidate-label"], executionEvidencePath: requestedEvidencePath = null } = {}) {
  if (!prepared.rawNext || !prepared.native || !prepared.dsh) throw new Error("verified bindings and Next build are required before payload finalization.");
  const { values, workspace, sourceRoot, nodeExe, npmCli, buildEnvironment } = prepared;
  await run(nodeExe, [npmCli, "prune", "--omit=dev", "--ignore-scripts"], { cwd: workspace, env: buildEnvironment.env });
  if (await hashFile(path.join(sourceRoot, "package-lock.json")) !== prepared.sourceProvenance.expectedLockfileSha256) throw new Error("frozen source package-lock.json mutated during dependency assembly.");
  const postPruneTree = normalizeNpmTree(JSON.parse((await run(nodeExe, [npmCli, "ls", "--all", "--omit=dev", "--json"], { cwd: workspace, env: buildEnvironment.env })).toString("utf8")));
  const postPruneDependencyDigest = sha256(Buffer.from(canonicalJson(postPruneTree), "utf8"));
  if (postPruneDependencyDigest !== prepared.receiptProjections.dependency.postPruneGraphIdentity) throw new Error("approved post-prune graph mismatch");
  const runtimeDependencyArtifact = await candidateDependencyProjection(path.join(workspace, "node_modules"));
  if (runtimeDependencyArtifact.digest !== prepared.authority.dependency.byteTreeIdentity) throw new Error("approved dependency byte-tree identity mismatch.");
  const sourceRuntimeClosure = await deriveHostRuntimeModuleClosure(workspace);
  const destination = path.join(prepared.outputDir, "candidate");
  await mkdir(destination, { recursive: true });
  await cp(path.join(workspace, ".next", "standalone"), destination, { recursive: true, filter: (item) => path.basename(item) !== ".bin" });
  await cp(path.join(workspace, ".next", "static"), path.join(destination, ".next", "static"), { recursive: true });
  await copyCandidateDependencyTree(path.join(workspace, "node_modules"), path.join(destination, "node_modules"));
  const allRuntimeSourcePaths = await deriveCandidateRuntimeClosureSourcePaths(workspace);
  const requiredPayload = [...new Set(["package.json", ...sourceRuntimeClosure.modules.map((module) => module.path), ...allRuntimeSourcePaths, ...requiredCandidateRuntimeFiles.filter((relative) => relative !== "server.js"), ...dshPayloadFiles, ...servicePayloadFiles, ...sourceReleaseComponentPaths()])];
  await copyRequired(workspace, destination, requiredPayload);
  await verifyRequiredCandidateRuntimeFiles({ sourceRoot: workspace, candidateRoot: destination });
  await verifyCandidateHostRuntimeClosure({ sourceRoot: workspace, candidateRoot: destination, environment: {} });
  const runtimeClosure = createHostRuntimeClosureBinding({ entrypoint: sourceRuntimeClosure.entrypoint, modules: sourceRuntimeClosure.modules, edges: sourceRuntimeClosure.edges, sourceCommit: values["source-commit"], sourceArchiveSha256: values["source-archive-sha256"] });
  try { await cp(path.join(workspace, "public"), path.join(destination, "public"), { recursive: true }); } catch (error) { if (error.code !== "ENOENT") throw error; }
  for (const [from, to] of Object.entries(nativePayloadMap)) {
    const source = path.join(path.resolve(values["native-set-root"]), ...from.split("/"));
    const target = path.join(destination, ...to.split("/"));
    await mkdir(path.dirname(target), { recursive: true });
    await cp(source, target);
    if (await hashFile(source) !== await hashFile(target)) throw new Error(`native member bytes changed: ${from}`);
  }
  const { native, dsh } = prepared;
  const dshProvenance = { version: dsh.version, commit: dsh.commit, sourceFingerprint: dsh.fingerprint };
  if (dsh.method === "offline-package") dshProvenance.acquisition = { archiveSha256: dsh.packageArchiveSha256, manifestSha256: dsh.packageManifestSha256, materializationMode: dsh.materializationMode, materializedRootIdentity: dsh.materializedRootIdentity, method: "verified-offline", repository: dsh.repository, sourceRef: dsh.sourceRef };
  const candidateNextOutput = await treeManifest(destination, ".next");
  const candidateNodeModules = await verifyCandidateDependencyTree(runtimeDependencyArtifact, path.join(destination, "node_modules"));
  const runtimeArtifacts = { nextOutput: { digest: candidateNextOutput.digest, fileCount: candidateNextOutput.files.length }, nodeModules: { digest: candidateNodeModules.digest, fileCount: candidateNodeModules.files.length } };
  const candidateRuntimeClosure = await createCandidateRuntimeClosureManifest({ sourceRoot: workspace, candidateRoot: destination, sourceCommit: values["source-commit"], sourceArchiveSha256: values["source-archive-sha256"], buildId: prepared.buildId, nextOutput: candidateNextOutput, nodeModules: candidateNodeModules });
  const provenance = createCandidateProvenance({
    inputAuthorityIdentity: prepared.authority.inputAuthorityIdentity,
    constructorVersion: buildContract.version,
    source: { classification: values["source-classification"], productionEligible: prepared.sourceProvenance.policy.productionEligible, commit: values["source-commit"], archiveSha256: values["source-archive-sha256"], lockfileSha256: prepared.sourceProvenance.expectedLockfileSha256, snapshot: prepared.sourceProvenance.snapshot ? { workingTreeManifestSha256: prepared.sourceProvenance.snapshot.workingTreeManifestSha256, trackedDiffSha256: prepared.sourceProvenance.snapshot.trackedDiffSha256, untrackedInventorySha256: prepared.sourceProvenance.snapshot.untrackedInventorySha256 } : null },
    authorizationId: prepared.securitySet.authority.authorizationId,
    securitySetId: prepared.securitySet.securitySetId,
    runtimeClosure,
    candidateRuntimeClosure,
    dsh: dshProvenance,
    native: { buildId: values["native-build-id"], setDigest: native.set.digest, aggregateManifestSha256: await hashFile(path.join(path.resolve(values["native-set-root"]), "native-components.manifest.json")), members: native.set.files.map((file) => ({ ...file, releasePath: nativePayloadMap[file.path] })) },
    build: { contractVersion: buildContract.version, nodeVersion: prepared.toolchain.nodeVersion, nodeArtifactSha256: prepared.toolchain.nodeArtifactSha256, npmVersion: prepared.toolchain.npmVersion, backend: buildContract.backend, packageManager: "node.exe npm-cli.js ci --include=dev --no-audit --no-fund; node.exe npm-cli.js prune --omit=dev --ignore-scripts", deterministicBuildId: prepared.buildId, derivationVersion: 1, nextOutputArtifact: runtimeArtifacts.nextOutput, runtimeDependencyArtifact: { npmTreeDigest: postPruneDependencyDigest, nodeModulesManifestSha256: runtimeArtifacts.nodeModules.digest, fileCount: runtimeArtifacts.nodeModules.fileCount } },
  });
  await writeFile(path.join(destination, "release.provenance.json"), serializeCandidateProvenance(provenance), "utf8");
  const calculatedArtifactSet = await calculateReleaseArtifactSet(destination);
  assertHostRuntimeClosureBinding({ runtimeClosure, artifactSet: calculatedArtifactSet, sourceCommit: values["source-commit"], sourceArchiveSha256: values["source-archive-sha256"] });
  await assertCandidateRuntimeClosureManifest({ manifest: candidateRuntimeClosure, candidateRoot: destination, artifactSet: calculatedArtifactSet, sourceCommit: values["source-commit"], sourceArchiveSha256: values["source-archive-sha256"], runtimeArtifacts });
  const artifactSet = { ...calculatedArtifactSet, files: calculatedArtifactSet.files.map((file) => ({ ...file, component: Object.entries(componentPaths).find(([, relative]) => relative === file.path)?.[0] ?? "assetHub" })) };
  const version = JSON.parse(await readFile(path.join(workspace, "package.json"), "utf8")).version;
  const components = Object.fromEntries(Object.entries(componentPaths).map(([name, relative]) => {
    const file = artifactSet.files.find((item) => item.path === relative);
    if (!file) throw new Error(`required release component missing: ${name}`);
    return [name, { path: relative, sha256: file.sha256, version: name.startsWith("windows") ? "frozen-native" : "release" }];
  }));
  const manifest = createDeploymentManifest({ version, commit: values["source-commit"], sourceArchiveSha256: values["source-archive-sha256"], artifactSet, dsh: { version: dsh.version, commit: dsh.commit, sourceFingerprint: dsh.fingerprint }, components, buildId: prepared.buildId, runtimeMetadataSchemaVersion: "3", operationalStorageSchemaVersion: "1", formalDataContractVersion: "1", requiredEvidenceTypes: ["windows-native-staging", "formal-data-hash"] });
  preflightDeploymentManifest(manifest, { version: dsh.version, commit: dsh.commit, sourceFingerprint: dsh.fingerprint });
  await writeDeploymentManifest(destination, manifest);
  const verifiedRelease = await verifyRelease(destination, { version: dsh.version, commit: dsh.commit, sourceFingerprint: dsh.fingerprint }, { authority: prepared.authority, admissionContext: prepared.admissionContext, requireLiveAuthority: true });
  if (verifiedRelease.manifest.artifactSet.digest !== manifest.artifactSet.digest) throw new Error("final Candidate verification changed the artifact-set binding.");
  if (await hashFile(prepared.archive) !== values["source-archive-sha256"]) throw new Error("constructor changed source archive.");
  const snapshot = prepared.sourceProvenance.snapshot;
  const executionEvidencePath = assertExecutionEvidenceOutsideCandidate(destination, requestedEvidencePath ?? path.join(prepared.binding.locators.evidenceRoot, "candidate-execution-evidence-" + values["execution-run-id"] + ".json"));
  if (candidateLabel !== values["candidate-label"]) throw new Error("candidate label differs from ExecutionBinding.");
  const completeInventory = await calculateCompleteByteTreeInventory(destination);
  const runtimeNextInventory = await calculateCompleteByteTreeInventory(path.join(workspace, ".next"));
  const runtimeDependencyInventory = await calculateCompleteByteTreeInventory(path.join(workspace, "node_modules"));
  const runtimeInventorySha256 = sha256(Buffer.from(canonicalJson({ next: runtimeNextInventory.sha256, dependencies: runtimeDependencyInventory.sha256 }), "utf8"));
  const evidenceRelative = path.relative(prepared.binding.locators.evidenceRoot, executionEvidencePath);
  if (!evidenceRelative || evidenceRelative.startsWith("..") || path.isAbsolute(evidenceRelative)) throw new Error("execution evidence escapes its ExecutionBinding evidence root.");
  const approvalSelection = { approvalIdentity: prepared.approvalIdentity, logicalReleaseAuthoritySha256: prepared.admissionContext.approval.logicalReleaseAuthoritySha256, executionPlanIdentity: prepared.admissionContext.plan.planIdentity, experimentPermissionDigest: prepared.binding.permission.experimentPermissionDigest, journalIdentity: prepared.binding.permission.journalIdentity };
  const executionEvidence = createCandidateExecutionEvidence({
    approval: approvalSelection,
    artifactCreation: { sourceManifestSha256: values["source-snapshot-manifest-sha256"], sourceCreationReceiptSha256: prepared.authority.receipts.sourceCreationReceiptSha256, creatorRunId: snapshot.creationRunId, createdAt: snapshot.createdAt },
    execution: { experimentId: values["experiment-id"], executionRunId: values["execution-run-id"], candidateLabel, inputAuthorityIdentity: prepared.authority.inputAuthorityIdentity, executionBindingSha256: prepared.executionBindingSha256, phase: prepared.binding.permission.expectedPhase, receiptHashes: prepared.binding.receipts, nativeRunBindingSha256: prepared.binding.bindings.nativeRunBindingSha256, dshMode: prepared.binding.bindings.dshMode, dshRunBindingSha256: prepared.binding.bindings.dshRunBindingSha256 },
    observations: { createdAt: new Date().toISOString(), evidencePath: executionEvidencePath, hostname: os.hostname(), account: process.env.USER || process.env.USERNAME || "unknown", workspace: prepared.workspace, attempt: prepared.phaseJournal.usedBudget + 1, exitCode: 0, stdoutSha256: null, stderrSha256: null, diagnosticsSha256: null, observerSha256: null, candidateInventorySha256: completeInventory.sha256, runtimeInventorySha256 },
    logicalRelease: { releaseIdentity: provenance.releaseIdentity, authorizationId: provenance.security.authorizationId, securitySetId: provenance.security.securitySetId },
    candidate: { artifactDigest: manifest.artifactSet.digest },
    expected: { ...approvalSelection, experimentId: values["experiment-id"], executionRunId: values["execution-run-id"], candidateLabel, inputAuthorityIdentity: prepared.authority.inputAuthorityIdentity, executionBindingSha256: prepared.executionBindingSha256, phase: prepared.binding.permission.expectedPhase, receiptHashes: prepared.binding.receipts, nativeRunBindingSha256: prepared.binding.bindings.nativeRunBindingSha256, dshMode: prepared.binding.bindings.dshMode, dshRunBindingSha256: prepared.binding.bindings.dshRunBindingSha256, sourceCreationReceiptSha256: prepared.authority.receipts.sourceCreationReceiptSha256, creatorRunId: snapshot.creationRunId, releaseIdentity: provenance.releaseIdentity, authorizationId: provenance.security.authorizationId, securitySetId: provenance.security.securitySetId, candidateDigest: manifest.artifactSet.digest },
  });
  await mkdir(path.dirname(executionEvidencePath), { recursive: true });
  await writeFile(executionEvidencePath, serializeCandidateExecutionEvidence(executionEvidence), { encoding: "utf8", flag: "wx" });
  await appendPhaseJournal(prepared, { event: "completed", runId: values["execution-run-id"], label: candidateLabel, phase: prepared.binding.permission.expectedPhase });
  return { destination, manifest, provenance, executionEvidence, executionEvidencePath, postPruneDependencyDigest };
}

export async function bindWindowsReleaseInputs(prepared) {
  const { values } = prepared;
  const nativeRoot = resolveFrozenNativeSetPath(values["staging-root"], values["native-build-id"]);
  const native = await verifyFrozenNativeSet(nativeRoot);
  await assertFrozenNativeSetBinding({ stagingRoot: values["staging-root"], nativeBuildId: values["native-build-id"], nativeSetDigest: values["native-set-digest"], nativeSetRoot: nativeRoot, native, sourceRoot: prepared.sourceRoot, sourceCommit: values["source-commit"], sourceArchiveSha256: values["source-archive-sha256"] });
  if (await hashFile(values["native-set-run-binding"]) !== prepared.binding.bindings.nativeRunBindingSha256) throw new Error("Native current run binding raw SHA mismatch");
  prepared.nativeRunBinding = await validateNativeSetRunBindingFile({ bindingPath: values["native-set-run-binding"], runId: values["execution-run-id"], sourceCommit: values["source-commit"], sourceArchiveSha256: values["source-archive-sha256"], nativeSetManifestSha256: await hashFile(path.join(nativeRoot, "native-components.manifest.json")), nativeSourceIdentity: native.manifest.nativeSourceIdentity, nativeBuildId: values["native-build-id"] });
  const dshRoot = path.resolve(values["dsh-source-root"]);
  const dshVersion = JSON.parse(await readFile(path.join(dshRoot, "package.json"), "utf8")).version;
  const dshContract = JSON.parse(await readFile(path.join(prepared.workspace, "agent-integration", "dsh", "version.json"), "utf8"));
  const offlinePackage = values["dsh-offline-package-archive"] ? { archivePath: values["dsh-offline-package-archive"], bundlePath: values["dsh-offline-package-bundle"], manifestPath: values["dsh-offline-package-manifest"], provenancePath: values["dsh-offline-package-provenance"], runBindingPath: values["dsh-offline-run-binding"], targetRunId: values["execution-run-id"] } : null;
  if ((offlinePackage ? "offline" : "bundle") !== prepared.binding.bindings.dshMode) throw new Error("DSH binding mode mismatch");
  if (offlinePackage && await hashFile(offlinePackage.runBindingPath) !== prepared.binding.bindings.dshRunBindingSha256) throw new Error("DSH current run binding raw SHA mismatch");
  const actualBundle = offlinePackage?.bundlePath ?? values["dsh-acquisition-artifact"];
  if (!actualBundle || await hashFile(actualBundle) !== prepared.authority.dsh.bundleSha256) throw new Error("DSH approved immutable bundle mismatch");
  const dsh = await bindDshConstructorProvenance({ dshRoot, dshContract, dshVersion, dshCommit: values["dsh-commit"], evidencePath: values["dsh-provenance-evidence"], bundlePath: values["dsh-acquisition-artifact"] ?? null, offlinePackage });
  if (dshContract.sourceTree !== prepared.authority.dsh.tree || dshContract.sourceFingerprint !== prepared.authority.dsh.fingerprint) throw new Error("DSH approved tree/fingerprint projection mismatch");
  await assertDshBundleAuthorityConsumption({ authority: prepared.receiptProjections.dsh.authority, dsh: prepared.authority.dsh, bundlePath: actualBundle, sourceDir: dshRoot });
  prepared.native = native;
  prepared.dsh = dsh;
  return prepared;
}

export async function bindDshConstructorProvenance({ dshRoot, dshContract, dshVersion, dshCommit, evidencePath, bundlePath = null, offlinePackage = null }) {
  if (dshVersion !== dshContract.version) throw new Error("DSH version argument does not match source.");
  if (dshCommit !== dshContract.sourceCommit) throw new Error("DSH constructor arguments do not match the frozen provenance contract.");
  const { validateDshAcquisitionEvidence } = await import("../agent-integration/scripts/dsh-source-validator.mjs");
  return validateDshAcquisitionEvidence({ evidencePath, bundlePath, offlinePackage, stagedSourceDir: dshRoot, expected: dshContract });
}

export async function constructWindowsRelease(values) {
  const roots = await loadProtectedHistoricalRoots();
  const before = await inventoryHistoricalRoots(roots);
  try {
    const prepared = await prepareWindowsRelease(values);
    await bindWindowsReleaseInputs(prepared);
    await runWindowsNextBuild(prepared);
    return await finalizeWindowsRelease(prepared);
  } finally {
    assertHistoricalPreservation(before, await inventoryHistoricalRoots(roots));
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const result = await constructWindowsRelease(parseArgs(process.argv.slice(2)));
    process.stdout.write(`${canonicalJson({ releaseId: result.manifest.releaseId, artifactDigest: result.manifest.artifactSet.digest, output: result.destination })}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

export async function loadWindowsExecutionSelection(values) {
  validateValues(values); assertBuildPlatform();
  const paths = { stagingRoot: path.resolve(values["staging-root"]), archive: path.resolve(values["source-archive"]), outputDir: path.resolve(values["output-dir"]), tempRoot: path.resolve(values["temp-dir"]), nodeRoot: path.resolve(values["node-root"]), securitySetPath: path.resolve(values["security-set"]), evidenceRoot: path.resolve(values["evidence-root"]) };
  return validateAuthorityAdmission(values, paths);
}
