import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { access, cp, lstat, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { verifyFrozenNativeSet } from "./native-artifact-contract.mjs";
import { calculateReleaseArtifactSet, canonicalJson } from "./release-artifact-tree.mjs";
import { createDeploymentManifest, preflightDeploymentManifest, writeDeploymentManifest } from "./windows-deployment-contract.mjs";
import { componentPaths, dshPayloadFiles, nativePayloadMap, releasePayloadSchemaVersion, runtimeScripts, servicePayloadFiles } from "./windows-release-payload.mjs";

export const buildContract = Object.freeze({
  version: "ued-asset-hub-next-build-v1",
  nodeVersion: "22.23.2",
  nodeArtifactSha256: "0d0f5e39f9f3d9587bc19f73eab3c2c9c4903fd02d6dbf9c853dd81b3d95fad4",
  npmVersion: "10.9.8",
  lockfileSha256: "94da6e178dd5f8ea8b715abb430ad4bc47bfb5eb5be46a142f67cb17a863a5e0",
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

const frozenNativeBinding = Object.freeze({
  buildId: "nb1-5932a1dff20b-c9f4e7ea1bc84836ae7f87ebb3640324",
  setDigest: "c9f4e7ea1bc84836ae7f87ebb36403243a25b0ffe68a75e079b9f99ce671ab2e",
  assetHubCommit: "5932a1dff20b00fb8ee5ba76af08616709e50367",
  sourceArchiveSha256: "01e40784790345e2e8942475802007963faf68b2aa59f6b9a39bbddf9ced7ece",
});

const required = ["staging-root", "creation-run-id", "source-archive", "source-commit", "source-archive-sha256", "source-classification", "dsh-source-root", "dsh-version", "dsh-commit", "dsh-provenance-evidence", "native-set-root", "native-build-id", "native-set-digest", "node-root", "output-dir", "temp-dir"];
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const hashFile = async (file) => sha256(await readFile(file));
const compareUtf8 = (left, right) => Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));

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
  const requiredSnapshotFields = ["sourceClassification", "productionEligible", "sourceCommit", "workingTreeManifestSha256", "trackedDiffSha256", "untrackedInventorySha256", "sourceArchiveSha256", "creationRunId", "createdAt", "sourceRootIdentity", "files"];
  for (const key of requiredSnapshotFields) if (snapshot[key] === undefined || snapshot[key] === null || snapshot[key] === "") throw new Error(`source snapshot manifest is missing ${key}.`);
  if (snapshot.sourceClassification !== values["source-classification"] || snapshot.productionEligible !== policy.productionEligible || snapshot.sourceCommit !== values["source-commit"] || snapshot.sourceArchiveSha256 !== values["source-archive-sha256"] || snapshot.creationRunId !== values["creation-run-id"]) throw new Error("source snapshot manifest identity does not match constructor input.");
  if (!/^[a-f0-9]{64}$/.test(snapshot.workingTreeManifestSha256) || !/^[a-f0-9]{64}$/.test(snapshot.trackedDiffSha256) || !/^[a-f0-9]{64}$/.test(snapshot.untrackedInventorySha256)) throw new Error("source snapshot manifest hashes are invalid.");
  const workingTreeManifestSha256 = sha256(Buffer.from(canonicalJson(snapshot.files.map(({ relativePath, size, sha256: fileSha, classification }) => ({ relativePath, size, sha256: fileSha, classification }))), "utf8"));
  if (snapshot.workingTreeManifestSha256 !== workingTreeManifestSha256) throw new Error("source snapshot working tree manifest identity is invalid.");
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

function assertContained(root, candidate, label) {
  const relative = path.relative(root, candidate);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error(`${label} must be a strict child of the staging root.`);
}

export function resolveFrozenNativeSetPath(stagingRoot, nativeBuildId) {
  if (nativeBuildId !== frozenNativeBinding.buildId) throw new Error("native build ID does not match the frozen binding.");
  const root = path.resolve(stagingRoot);
  const directory = path.resolve(root, "frozen", "native-components", nativeBuildId);
  assertContained(root, directory, "Native Set");
  if (path.basename(directory) !== nativeBuildId) throw new Error("native set path does not exactly match native build ID.");
  return directory;
}

export function assertFrozenNativeSetBinding({ stagingRoot, nativeBuildId, nativeSetDigest, nativeSetRoot, native = null, sourceClassification = buildContract.sourceClassification }) {
  const directory = resolveFrozenNativeSetPath(stagingRoot, nativeBuildId);
  if (path.resolve(nativeSetRoot) !== directory) throw new Error("native set root does not exactly match the frozen native build ID binding.");
  if (nativeSetDigest !== frozenNativeBinding.setDigest || (native && (native.set.digest !== frozenNativeBinding.setDigest || native.manifest.assetHubCommit !== frozenNativeBinding.assetHubCommit || (sourceClassification === buildContract.sourceClassification && native.manifest.sourceArchiveSha256 !== frozenNativeBinding.sourceArchiveSha256)))) throw new Error("frozen native set identity or authoritative binding mismatch.");
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

async function treeManifest(root, relative = "") {
  const files = [];
  async function visit(directory, prefix) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const child = prefix ? `${prefix}/${entry.name}` : entry.name;
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

export function validateArchiveMemberPath(member) {
  const reserved = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/iu;
  if (!member || path.win32.isAbsolute(member) || path.posix.isAbsolute(member) || member.includes("\\")) throw new Error("source archive tree is unsafe.");
  for (const part of member.split("/")) {
    if (!part || part === "." || part === ".." || /[<>:"|?*\x00-\x1f]/u.test(part) || /[. ]$/u.test(part) || reserved.test(part)) throw new Error("source archive tree is unsafe.");
  }
  return member;
}

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

function validateValues(values) {
  for (const key of required) if (!values[key]) throw new Error(`missing --${key}`);
  if (!/^[a-f0-9]{40}$/.test(values["source-commit"]) || !/^[a-f0-9]{64}$/.test(values["source-archive-sha256"]) || !/^[a-f0-9]{40}$/.test(values["dsh-commit"]) || !/^[a-f0-9]{64}$/.test(values["native-set-digest"]) || !/^nb1-[a-f0-9]{12}-[a-f0-9]{32}$/.test(values["native-build-id"])) throw new Error("constructor identity argument is invalid.");
  validateSourceClassificationInput(values);
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
  for (const [candidate, label] of [[archive, "source archive"], [outputDir, "output directory"], [tempRoot, "temporary directory"], [nodeRoot, "staged Node root"], [path.resolve(values["dsh-source-root"]), "DSH source"], [path.resolve(values["native-set-root"]), "Native Set"], ...(snapshotManifest ? [[snapshotManifest, "source snapshot manifest"]] : [])]) assertContained(stagingRoot, candidate, label);
  await rm(tempRoot, { recursive: true, force: true });
  await rm(outputDir, { recursive: true, force: true });
  await mkdir(tempRoot, { recursive: true });
  await checkpoint("BUILD_TEMP_READY");
  await writeFile(path.join(tempRoot, ".ued-r3-owner.json"), `${canonicalJson({ block: "B3R-B2B-R3", creationRunId: values["creation-run-id"], testOnly: true })}\n`, "utf8");
  await checkpoint("OWNER_MARKER_WRITTEN");
  await checkpoint("SOURCE_ARCHIVE_SHA_BEGIN");
  if (await hashFile(archive) !== values["source-archive-sha256"]) throw new Error("source archive SHA-256 mismatch.");
  await checkpoint("SOURCE_ARCHIVE_SHA_COMPLETE");
  const nodeExe = path.join(nodeRoot, "node.exe");
  const npmCli = path.join(nodeRoot, "node_modules", "npm", "bin", "npm-cli.js");
  await checkpoint("NODE_ARTIFACT_SHA_BEGIN");
  if (await hashFile(nodeExe) !== buildContract.nodeArtifactSha256) throw new Error("staged node.exe SHA-256 mismatch.");
  await checkpoint("NODE_ARTIFACT_SHA_COMPLETE");
  await checkpoint("CLEAN_OS_ENV_BEGIN");
  const osEnv = cleanOsEnvironment();
  await checkpoint("CLEAN_OS_ENV_COMPLETE");
  await checkpoint("NODE_VERSION_BEGIN");
  const nodeVersion = (await run(nodeExe, ["--version"], { env: osEnv })).toString("utf8").trim().replace(/^v/, "");
  await checkpoint("NODE_VERSION_COMPLETE");
  await checkpoint("NPM_VERSION_BEGIN");
  const npmVersion = (await run(nodeExe, [npmCli, "--version"], { env: osEnv })).toString("utf8").trim();
  await checkpoint("NPM_VERSION_COMPLETE");
  if (nodeVersion !== buildContract.nodeVersion || npmVersion !== buildContract.npmVersion) throw new Error("staged Node/npm version mismatch.");
  const sourceRoot = path.join(tempRoot, "source");
  const workspace = path.join(tempRoot, "workspace");
  await checkpoint("ARCHIVE_MATERIALIZE_BEGIN");
  const source = await materializeArchive({ archive, sourceRoot, workspace, checkpoint });
  await checkpoint("ARCHIVE_MATERIALIZE_COMPLETE");
  const sourceProvenance = await validateSourceSnapshotManifest(values, source);
  await checkpoint("LOCKFILE_VALIDATE_BEGIN");
  const lockfile = JSON.parse(await readFile(path.join(workspace, "package-lock.json"), "utf8"));
  if (lockfile.lockfileVersion !== 3 || await hashFile(path.join(workspace, "package-lock.json")) !== sourceProvenance.expectedLockfileSha256) throw new Error("package-lock contract mismatch.");
  await checkpoint("LOCKFILE_VALIDATE_COMPLETE");
  const buildId = deterministicBuildId(values["source-commit"], values["source-archive-sha256"]);
  await checkpoint("ISOLATED_BUILD_ENV_BEGIN");
  const buildEnvironment = await createBuildEnvironment(tempRoot, buildId);
  assertNoForbiddenEnvironment(buildEnvironment.env);
  const envEvidence = environmentEvidence(buildEnvironment.env, tempRoot);
  await checkpoint("ISOLATED_BUILD_ENV_COMPLETE");
  await checkpoint("BEFORE_NPM_CI");
  if (diagnostic.stopBeforeNpmCi === true) return { values, stagingRoot, archive, outputDir, tempRoot, sourceRoot, workspace, source, sourceProvenance, nodeRoot, nodeExe, npmCli, buildId, buildEnvironment, envEvidence, dependencies: null, diagnostic: { stoppedBeforeNpmCi: true }, toolchain: { contractVersion: buildContract.version, os: os.version(), release: os.release(), arch: process.arch, filesystem: "NTFS", nodeVersion, nodeArtifactSha256: await hashFile(nodeExe), npmVersion, backend: buildContract.backend } };
  await run(nodeExe, [npmCli, "ci", "--include=dev", "--ignore-scripts", "--no-audit", "--no-fund"], { cwd: workspace, env: buildEnvironment.env });
  if (await hashFile(path.join(workspace, "package-lock.json")) !== sourceProvenance.expectedLockfileSha256) throw new Error("npm ci mutated package-lock.json.");
  const dependencies = await dependencyEvidence({ workspace, nodeExe, npmCli, env: buildEnvironment.env, nodeVersion, npmVersion, expectedLockfileSha256: sourceProvenance.expectedLockfileSha256, onNpmTree: diagnostic.onNpmTree });
  return { values, stagingRoot, archive, outputDir, tempRoot, sourceRoot, workspace, source, sourceProvenance, nodeRoot, nodeExe, npmCli, buildId, buildEnvironment, envEvidence, dependencies, toolchain: { contractVersion: buildContract.version, os: os.version(), release: os.release(), arch: process.arch, filesystem: "NTFS", nodeVersion, nodeArtifactSha256: await hashFile(nodeExe), npmVersion, backend: buildContract.backend } };
}

export async function runWindowsNextBuild(prepared, diagnostic = null) {
  assertNoForbiddenEnvironment(prepared.buildEnvironment.env);
  const buildEnv = { ...prepared.buildEnvironment.env, NODE_ENV: "production" };
  const nextArguments = [path.join(prepared.workspace, "node_modules", "next", "dist", "bin", "next"), "build"];
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
  await run(prepared.nodeExe, nextArguments, { cwd: prepared.workspace, env: buildEnv });
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

export async function finalizeWindowsRelease(prepared) {
  if (!prepared.rawNext || !prepared.native || !prepared.dsh) throw new Error("verified bindings and Next build are required before payload finalization.");
  const { values, workspace, sourceRoot, nodeExe, npmCli, buildEnvironment } = prepared;
  await run(nodeExe, [npmCli, "prune", "--omit=dev", "--ignore-scripts"], { cwd: workspace, env: buildEnvironment.env });
  if (await hashFile(path.join(sourceRoot, "package-lock.json")) !== prepared.sourceProvenance.expectedLockfileSha256) throw new Error("frozen source package-lock.json mutated during dependency assembly.");
  const postPruneTree = normalizeNpmTree(JSON.parse((await run(nodeExe, [npmCli, "ls", "--all", "--omit=dev", "--json"], { cwd: workspace, env: buildEnvironment.env })).toString("utf8")));
  const postPruneDependencyDigest = sha256(Buffer.from(canonicalJson(postPruneTree), "utf8"));
  await rm(path.join(workspace, "node_modules", ".bin"), { recursive: true, force: true });
  const runtimeDependencyArtifact = await treeManifest(path.join(workspace, "node_modules"));
  const destination = path.join(prepared.outputDir, "candidate");
  await mkdir(destination, { recursive: true });
  await cp(path.join(workspace, ".next", "standalone"), destination, { recursive: true, filter: (item) => path.basename(item) !== ".bin" });
  await cp(path.join(workspace, ".next", "static"), path.join(destination, ".next", "static"), { recursive: true });
  await cp(path.join(workspace, "node_modules"), path.join(destination, "node_modules"), { recursive: true, filter: (item) => path.basename(item) !== ".bin" });
  await copyRequired(workspace, destination, ["package.json", ...runtimeScripts, ...dshPayloadFiles, ...servicePayloadFiles]);
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
  if (dsh.method === "offline-package") dshProvenance.acquisition = { archiveSha256: dsh.packageArchiveSha256, manifestSha256: dsh.packageManifestSha256, materializationMode: dsh.materializationMode, materializedRootIdentity: dsh.materializedRootIdentity, method: "verified-offline", repository: dsh.repository, sourceRef: dsh.sourceRef, runBindingSha256: dsh.runBindingSha256 };
  const provenance = { schemaVersion: 2, constructor: { version: buildContract.version, creationRunId: values["creation-run-id"], createdAt: new Date().toISOString() }, source: { classification: values["source-classification"], productionEligible: prepared.sourceProvenance.policy.productionEligible, commit: values["source-commit"], archiveSha256: values["source-archive-sha256"], lockfileSha256: prepared.sourceProvenance.expectedLockfileSha256, snapshotManifestSha256: values["source-snapshot-manifest-sha256"] ?? null, snapshot: prepared.sourceProvenance.snapshot ? { workingTreeManifestSha256: prepared.sourceProvenance.snapshot.workingTreeManifestSha256, trackedDiffSha256: prepared.sourceProvenance.snapshot.trackedDiffSha256, untrackedInventorySha256: prepared.sourceProvenance.snapshot.untrackedInventorySha256, sourceRootIdentity: prepared.sourceProvenance.snapshot.sourceRootIdentity } : null }, dsh: dshProvenance, native: { buildId: values["native-build-id"], setDigest: native.set.digest, aggregateManifestSha256: await hashFile(path.join(path.resolve(values["native-set-root"]), "native-components.manifest.json")), members: native.set.files.map((file) => ({ ...file, releasePath: nativePayloadMap[file.path] })) }, build: { contractVersion: buildContract.version, nodeVersion: prepared.toolchain.nodeVersion, nodeArtifactSha256: prepared.toolchain.nodeArtifactSha256, npmVersion: prepared.toolchain.npmVersion, backend: buildContract.backend, packageManager: "node.exe npm-cli.js ci --include=dev --ignore-scripts --no-audit --no-fund; node.exe npm-cli.js prune --omit=dev --ignore-scripts", deterministicBuildId: prepared.buildId, derivationVersion: 1, runtimeDependencyArtifact: { npmTreeDigest: postPruneDependencyDigest, nodeModulesManifestSha256: runtimeDependencyArtifact.digest, fileCount: runtimeDependencyArtifact.files.length } }, payloadSchemaVersion: releasePayloadSchemaVersion };
  await writeFile(path.join(destination, "release.provenance.json"), `${canonicalJson(provenance)}\n`);
  const calculatedArtifactSet = await calculateReleaseArtifactSet(destination);
  const artifactSet = { ...calculatedArtifactSet, files: calculatedArtifactSet.files.map((file) => ({ ...file, component: Object.entries(componentPaths).find(([, relative]) => relative === file.path)?.[0] ?? "assetHub" })) };
  const version = JSON.parse(await readFile(path.join(workspace, "package.json"), "utf8")).version;
  const components = Object.fromEntries(Object.entries(componentPaths).map(([name, relative]) => {
    const file = artifactSet.files.find((item) => item.path === relative);
    if (!file) throw new Error(`required release component missing: ${name}`);
    return [name, { path: relative, sha256: file.sha256, version: name.startsWith("windows") ? "frozen-native" : "release" }];
  }));
  const manifest = createDeploymentManifest({ version, commit: values["source-commit"], sourceArchiveSha256: values["source-archive-sha256"], artifactSet, dsh: { version: dsh.version, commit: dsh.commit, sourceFingerprint: dsh.fingerprint }, components, buildId: prepared.buildId, runtimeMetadataSchemaVersion: "3", operationalStorageSchemaVersion: "1", formalDataContractVersion: "1", requiredEvidenceTypes: ["windows-native-staging", "formal-data-hash"] });
  preflightDeploymentManifest(manifest, dsh);
  await writeDeploymentManifest(destination, manifest);
  if (await hashFile(prepared.archive) !== values["source-archive-sha256"]) throw new Error("constructor changed source archive.");
  return { destination, manifest, provenance, postPruneDependencyDigest };
}

export async function bindWindowsReleaseInputs(prepared) {
  const { values } = prepared;
  const nativeRoot = assertFrozenNativeSetBinding({ stagingRoot: values["staging-root"], nativeBuildId: values["native-build-id"], nativeSetDigest: values["native-set-digest"], nativeSetRoot: values["native-set-root"], sourceClassification: values["source-classification"] });
  const native = await verifyFrozenNativeSet(nativeRoot);
  assertFrozenNativeSetBinding({ stagingRoot: values["staging-root"], nativeBuildId: values["native-build-id"], nativeSetDigest: values["native-set-digest"], nativeSetRoot: nativeRoot, native, sourceClassification: values["source-classification"] });
  const dshRoot = path.resolve(values["dsh-source-root"]);
  const dshVersion = JSON.parse(await readFile(path.join(dshRoot, "package.json"), "utf8")).version;
  const dshContract = JSON.parse(await readFile(path.join(prepared.workspace, "agent-integration", "dsh", "version.json"), "utf8"));
  const offlinePackage = values["dsh-offline-package-archive"] ? { archivePath: values["dsh-offline-package-archive"], manifestPath: values["dsh-offline-package-manifest"], provenancePath: values["dsh-offline-package-provenance"], runBindingPath: values["dsh-offline-run-binding"], targetRunId: values["creation-run-id"] } : null;
  const dsh = await bindDshConstructorProvenance({ dshRoot, dshContract, dshVersion, dshCommit: values["dsh-commit"], evidencePath: values["dsh-provenance-evidence"], bundlePath: values["dsh-acquisition-artifact"] ?? null, offlinePackage });
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
  const prepared = await prepareWindowsRelease(values);
  await bindWindowsReleaseInputs(prepared);
  await runWindowsNextBuild(prepared);
  return finalizeWindowsRelease(prepared);
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
