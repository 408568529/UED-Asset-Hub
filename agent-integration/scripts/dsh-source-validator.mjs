import { createHash } from "node:crypto";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { access, lstat, readFile, readlink, realpath } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const fingerprintFiles = ["package.json", "pnpm-workspace.yaml", "pnpm-lock.yaml", "apps/cli/package.json", "apps/cli/src/bin.ts", "packages/bundle/base/cordis.patch.yml", "packages/bundle/web-app/cordis.patch.yml", "packages/mcp/mcp-client/src/index.ts"];
const provenanceContractVersion = "ued-asset-hub-dsh-provenance-v1";
const hashPattern = /^[a-f0-9]{64}$/;
const commitPattern = /^[a-f0-9]{40}$/;

function runGit(sourceDir, args, message, { readOnly = false } = {}) {
  const result = spawnSync("git", ["-C", sourceDir, ...args], {
    encoding: "utf8",
    env: readOnly ? { ...process.env, GIT_OPTIONAL_LOCKS: "0" } : process.env
  });
  if (result.status !== 0) throw new Error(message);
  return result.stdout.trim();
}

function optionalOrigin(sourceDir, { readOnly = false } = {}) {
  const result = spawnSync("git", ["-C", sourceDir, "remote", "get-url", "origin"], {
    encoding: "utf8",
    env: readOnly ? { ...process.env, GIT_OPTIONAL_LOCKS: "0" } : process.env
  });
  return result.status === 0 ? result.stdout.trim() : null;
}

function classifyOrigin(origin, upstream) {
  if (!origin) return "absent";
  if (origin === upstream) return "official-upstream";
  if (origin.startsWith("file:") || origin.startsWith("/") || /^[a-z]:[\\/]/i.test(origin) || /\.bundle$/i.test(origin)) return "local-bundle";
  return "other";
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function isInside(parentPath, candidatePath) {
  const relative = path.relative(parentPath, candidatePath);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== "..");
}

function assertExactKeys(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} is invalid.`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) throw new Error(`${label} has unexpected fields.`);
}

function assertIdentity(identity, expected, label) {
  for (const [key, pattern] of [["sourceCommit", commitPattern], ["sourceTree", commitPattern], ["sourceVersion", /^\S+$/], ["sourceFingerprint", hashPattern]]) {
    if (typeof identity[key] !== "string" || !pattern.test(identity[key])) throw new Error(`${label}.${key} is invalid.`);
    const expectedKey = key === "sourceFingerprint" ? "fingerprint" : key === "sourceVersion" ? "version" : key;
    const expectedValue = expected[key] ?? expected[expectedKey];
    if (expectedValue && identity[key] !== expectedValue) throw new Error(`${label}.${key} does not match the frozen contract.`);
  }
}

async function calculateFingerprint(sourceDir) {
  const hash = createHash("sha256");
  for (const relative of fingerprintFiles) {
    try {
      hash.update(relative);
      hash.update(await readFile(path.join(sourceDir, relative)));
    } catch (error) {
      if (relative !== "pnpm-lock.yaml") throw error;
    }
  }
  return hash.digest("hex");
}

export async function validateDshSourceIdentity(sourceDir, expected, { readOnly = false } = {}) {
  const configuredSourceDir = path.resolve(sourceDir);
  const canonicalSourceDir = await realpath(configuredSourceDir);
  if (configuredSourceDir !== canonicalSourceDir) throw new Error("DSH Source 不允许使用符号链接或路径别名。");
  const gitDir = path.join(canonicalSourceDir, ".git");
  let gitDirectory;
  try { gitDirectory = await lstat(gitDir); } catch { throw new Error("DSH Source 必须包含独立的 .git 目录。"); }
  if (!gitDirectory.isDirectory() || gitDirectory.isSymbolicLink()) throw new Error("DSH Source 必须包含独立的 .git 目录。");
  if (runGit(canonicalSourceDir, ["rev-parse", "--is-inside-work-tree"], "无法验证 DSH Git Repository。", { readOnly }) !== "true") throw new Error("DSH Source 不是有效 Git Repository。");
  const topLevel = await realpath(runGit(canonicalSourceDir, ["rev-parse", "--show-toplevel"], "无法读取 DSH Git 根目录。", { readOnly }));
  if (topLevel !== canonicalSourceDir) throw new Error("DSH Source 必须是独立 Git Repository 根目录。");
  const identity = {
    sourceCommit: runGit(canonicalSourceDir, ["rev-parse", "HEAD"], "无法读取 DSH Git HEAD。", { readOnly }),
    sourceTree: runGit(canonicalSourceDir, ["rev-parse", "HEAD^{tree}"], "无法读取 DSH Git tree。", { readOnly }),
    sourceVersion: JSON.parse(await readFile(path.join(canonicalSourceDir, "package.json"), "utf8")).version,
    sourceFingerprint: await calculateFingerprint(canonicalSourceDir)
  };
  assertIdentity(identity, expected, "DSH identity");
  if (runGit(canonicalSourceDir, ["status", "--porcelain=v1", "--untracked-files=all"], "无法读取 DSH Git working tree 状态。", { readOnly })) throw new Error("DSH Git working tree 必须保持 clean，且不得包含 untracked 文件。");
  for (const required of ["pnpm-workspace.yaml", "apps/cli/package.json", "apps/cli/src/bin.ts", "packages/mcp/mcp-client/src/index.ts"]) {
    try { await access(path.join(canonicalSourceDir, required)); } catch { throw new Error(`DSH Source 缺少必要结构：${required}`); }
  }
  const origin = optionalOrigin(canonicalSourceDir, { readOnly });
  return { sourceType: "git", version: identity.sourceVersion, commit: identity.sourceCommit, tree: identity.sourceTree, fingerprint: identity.sourceFingerprint, compatibilityBaseline: expected.compatibilityBaseline, originClassification: classifyOrigin(origin, expected.sourceRepository) };
}

async function trackedSourceFiles(sourceDir) {
  const listed = runGit(sourceDir, ["ls-files", "--stage", "-z"], "无法读取 DSH Git tracked source。", { readOnly: true });
  return listed.split("\0").filter(Boolean).map((record) => {
    const match = /^(100644|100755|120000) [a-f0-9]{40} \d\t(.+)$/u.exec(record);
    if (!match) throw new Error("DSH Git tracked source contains an unsupported entry.");
    return { mode: match[1], relativePath: match[2] };
  });
}

export async function validateDshRuntimeSource(authoritySourceDir, runtimeSourceDir) {
  const [authorityRoot, runtimeRoot] = await Promise.all([realpath(path.resolve(authoritySourceDir)), realpath(path.resolve(runtimeSourceDir))]);
  if (authorityRoot === runtimeRoot || isInside(authorityRoot, runtimeRoot) || isInside(runtimeRoot, authorityRoot)) throw new Error("DSH runtime source must be isolated from the authoritative DSH checkout.");
  if (path.resolve(runtimeSourceDir) !== runtimeRoot) throw new Error("DSH runtime source does not allow a symbolic link or path alias.");
  try {
    await lstat(path.join(runtimeRoot, ".git"));
    throw new Error("DSH runtime source must not contain .git.");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const tracked = await trackedSourceFiles(authorityRoot);
  for (const entry of tracked) {
    const authoritativePath = path.join(authorityRoot, entry.relativePath);
    const runtimePath = path.join(runtimeRoot, entry.relativePath);
    const [authoritative, runtime] = await Promise.all([lstat(authoritativePath), lstat(runtimePath)]);
    if (entry.mode === "120000") {
      if (!authoritative.isSymbolicLink() || !runtime.isSymbolicLink() || await readlink(authoritativePath) !== await readlink(runtimePath)) throw new Error(`DSH runtime source symlink does not match authority: ${entry.relativePath}`);
    } else if (!authoritative.isFile() || !runtime.isFile() || !Buffer.from(await readFile(authoritativePath)).equals(await readFile(runtimePath))) {
      throw new Error(`DSH runtime source file does not match authority: ${entry.relativePath}`);
    }
  }
  return { runtimeSourceDir: runtimeRoot, trackedSourceFileCount: tracked.length };
}

async function verifyEvidenceSidecar(evidencePath) {
  const evidenceBytes = await readFile(evidencePath);
  const digest = createHash("sha256").update(evidenceBytes).digest("hex");
  const sidecar = await readFile(`${evidencePath}.sha256`, "utf8");
  if (sidecar !== `${digest}  ${path.basename(evidencePath)}\n`) throw new Error("DSH provenance evidence sidecar does not match.");
  return { digest, evidence: JSON.parse(evidenceBytes.toString("utf8")) };
}

function assertEvidenceCommon(evidence, expected) {
  assertExactKeys(evidence, ["method", "provenanceContractVersion", "sourceCommit", "sourceFingerprint", "sourceRef", "sourceTree", "sourceVersion", "stagedSource", "upstreamCanonicalUrl", "verification"], "DSH provenance evidence");
  if (evidence.provenanceContractVersion !== provenanceContractVersion) throw new Error("DSH provenance contract version is invalid.");
  if (evidence.upstreamCanonicalUrl !== expected.sourceRepository || evidence.sourceRef !== expected.sourceRef) throw new Error("DSH provenance upstream binding is invalid.");
  assertIdentity(evidence, expected, "DSH provenance evidence");
  assertExactKeys(evidence.stagedSource, ["commit", "fingerprint", "tree", "version"], "DSH provenance stagedSource");
  if (canonicalJson(evidence.stagedSource) !== canonicalJson({ commit: evidence.sourceCommit, tree: evidence.sourceTree, version: evidence.sourceVersion, fingerprint: evidence.sourceFingerprint })) throw new Error("DSH provenance staged identity does not match evidence identity.");
}

function assertMethodEvidence(evidence) {
  if (evidence.method === "bundle") {
    assertExactKeys(evidence.verification, ["advertisedCommit", "advertisedRef", "advertisedTree", "artifactRetained", "bundleSha256"], "DSH bundle provenance");
    if (!hashPattern.test(evidence.verification.bundleSha256) || evidence.verification.advertisedRef !== evidence.sourceRef || evidence.verification.advertisedCommit !== evidence.sourceCommit || evidence.verification.advertisedTree !== evidence.sourceTree || evidence.verification.artifactRetained !== true) throw new Error("DSH bundle provenance is invalid.");
    return;
  }
  if (evidence.method === "upstream-https") {
    assertExactKeys(evidence.verification, ["resolvedCommit", "resolvedRef", "resolvedTree", "transport"], "DSH HTTPS provenance");
    if (evidence.verification.transport !== "git-https" || evidence.verification.resolvedRef !== evidence.sourceRef || evidence.verification.resolvedCommit !== evidence.sourceCommit || evidence.verification.resolvedTree !== evidence.sourceTree) throw new Error("DSH HTTPS provenance is invalid.");
    return;
  }
  if (evidence.method === "offline-package") {
    assertExactKeys(evidence.verification, ["archiveSha256", "bundleSha256", "bundleSize", "materializationMode", "manifestSha256", "packageSchemaVersion", "requiredCommit", "runBindingSha256", "sourceMemberCount"], "DSH offline package provenance");
    if (!hashPattern.test(evidence.verification.archiveSha256) || !hashPattern.test(evidence.verification.bundleSha256) || !Number.isSafeInteger(evidence.verification.bundleSize) || evidence.verification.bundleSize < 1 || evidence.verification.requiredCommit !== evidence.sourceCommit || !hashPattern.test(evidence.verification.manifestSha256) || !hashPattern.test(evidence.verification.runBindingSha256) || evidence.verification.materializationMode !== "validated-dereference" || evidence.verification.packageSchemaVersion !== 2 || !Number.isInteger(evidence.verification.sourceMemberCount) || evidence.verification.sourceMemberCount < 1) throw new Error("DSH offline package provenance is invalid.");
    return;
  }
  throw new Error("DSH provenance method is invalid.");
}

function verifyBundle(bundlePath, evidence) {
  if (!bundlePath) throw new Error("DSH bundle provenance requires an acquisition artifact.");
  const absoluteBundle = path.resolve(bundlePath);
  if (createHash("sha256").update(readFileSync(absoluteBundle)).digest("hex") !== evidence.verification.bundleSha256) throw new Error("DSH bundle SHA-256 does not match evidence.");
  const temporaryRepo = mkdtempSync(path.join(os.tmpdir(), "ued-dsh-bundle-verify-"));
  try {
    runGit(temporaryRepo, ["init", "--bare", "-q"], "无法创建隔离 DSH bundle 验证仓库。");
    runGit(temporaryRepo, ["bundle", "verify", absoluteBundle], "DSH bundle verify failed.");
    const listed = runGit(temporaryRepo, ["bundle", "list-heads", absoluteBundle], "DSH bundle list-heads failed.");
    if (!listed.split("\n").some((line) => line === `${evidence.sourceCommit} ${evidence.sourceRef}`)) throw new Error("DSH bundle advertised ref does not match evidence.");
    runGit(temporaryRepo, ["bundle", "unbundle", absoluteBundle], "DSH bundle could not be inspected in an isolated repository.");
    if (runGit(temporaryRepo, ["rev-parse", `${evidence.sourceCommit}^{tree}`], "DSH bundle tree could not be verified.") !== evidence.sourceTree) throw new Error("DSH bundle tree does not match evidence.");
  } finally {
    rmSync(temporaryRepo, { recursive: true, force: true });
  }
}

export async function validateDshAcquisitionEvidence({ evidencePath, bundlePath = null, offlinePackage = null, stagedSourceDir, expected }) {
  const { digest, evidence } = await verifyEvidenceSidecar(path.resolve(evidencePath));
  assertEvidenceCommon(evidence, expected);
  assertMethodEvidence(evidence);
  if (evidence.method === "offline-package") {
    if (!offlinePackage?.archivePath || !offlinePackage.manifestPath || !offlinePackage.provenancePath || !offlinePackage.bundlePath || !offlinePackage.runBindingPath || !offlinePackage.targetRunId) throw new Error("DSH offline package provenance requires package, Git authority, and run binding inputs.");
    const { validateOfflineDshMaterialization, validateOfflineDshPackage, validateOfflineDshRunBinding } = await import("./dsh-offline-package.mjs");
    const verified = await validateOfflineDshPackage({ archivePath: offlinePackage.archivePath, manifestPath: offlinePackage.manifestPath, provenancePath: offlinePackage.provenancePath, bundlePath: offlinePackage.bundlePath, expected });
    const materialized = await validateOfflineDshMaterialization({ packageResult: verified, outputDir: stagedSourceDir });
    const binding = await validateOfflineDshRunBinding({ bindingPath: offlinePackage.runBindingPath, packageResult: verified, targetRunId: offlinePackage.targetRunId, materializedRootIdentity: materialized.materializedRootIdentity });
    const identity = { version: verified.sourceVersion, commit: verified.sourceCommit, tree: verified.sourceTree, fingerprint: verified.sourceFingerprint };
    if (canonicalJson(evidence.stagedSource) !== canonicalJson({ commit: identity.commit, tree: identity.tree, version: identity.version, fingerprint: identity.fingerprint }) || evidence.verification.archiveSha256 !== verified.archiveSha256 || evidence.verification.bundleSha256 !== verified.bundleSha256 || evidence.verification.bundleSize !== verified.bundleSize || evidence.verification.requiredCommit !== verified.sourceCommit || evidence.verification.manifestSha256 !== verified.manifestSha256 || evidence.verification.sourceMemberCount !== verified.sourceMemberCount || evidence.verification.runBindingSha256 !== binding.bindingSha256) throw new Error("DSH offline package evidence does not match verified package identity.");
    return { ...identity, evidenceDigest: digest, method: evidence.method, materializationMode: materialized.materializationMode, materializedRootIdentity: materialized.materializedRootIdentity, packageArchiveSha256: verified.archiveSha256, packageBundleSha256: verified.bundleSha256, packageBundleSize: verified.bundleSize, packageManifestSha256: verified.manifestSha256, repository: verified.provenance.repository, sourceRef: verified.provenance.tag, runBindingSha256: binding.bindingSha256 };
  }
  const staged = await validateDshSourceIdentity(stagedSourceDir, expected, { readOnly: true });
  if (canonicalJson(evidence.stagedSource) !== canonicalJson({ commit: staged.commit, tree: staged.tree, version: staged.version, fingerprint: staged.fingerprint })) throw new Error("DSH provenance evidence does not match staged source identity.");
  if (evidence.method === "bundle") verifyBundle(bundlePath, evidence);
  return { ...staged, evidenceDigest: digest, method: evidence.method };
}

export function serializeDshProvenanceEvidence(evidence) {
  return `${canonicalJson(evidence)}\n`;
}

export const dshProvenanceContractVersion = provenanceContractVersion;

export async function validateDshSource(sourceDir, expected, options = {}) {
  return validateDshSourceIdentity(sourceDir, expected, options);
}
