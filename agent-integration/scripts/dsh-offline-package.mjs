import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { lstat, mkdir, mkdtemp, readFile, readdir, readlink, realpath, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { validateDshSourceIdentity } from "./dsh-source-validator.mjs";
import { validateArchiveMemberPath } from "../../scripts/archive-member-contract.mjs";

export const offlineDshPackageSchemaVersion = 2;
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const canonicalJson = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
};
const safe = (value) => {
  const raw = String(value ?? "");
  if (raw.includes("\\")) throw new Error("offline DSH package path has ambiguous separators.");
  const p = raw.replace(/\/+$/u, "").normalize("NFC");
  if (!p || p.startsWith("/") || /^[A-Za-z]:/.test(p) || /^\/\//.test(p) || /[\0-\x1f]/.test(p) || p.split("/").some((x) => !x || x === "." || x === "..")) throw new Error("offline DSH package path is unsafe.");
  return validateArchiveMemberPath(p);
};
const run = (cwd, args) => {
  const result = spawnSync("git", ["-C", cwd, ...args], { encoding: null, maxBuffer: 256 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`git ${args[0]} failed: ${result.stderr?.toString("utf8") ?? ""}`);
  return result.stdout;
};
const field = (header, start, length) => { const raw = header.subarray(start, start + length); const end = raw.indexOf(0); return new TextDecoder("utf8", { fatal: true }).decode(end < 0 ? raw : raw.subarray(0, end)); };
const relative = (root, entry) => path.join(root, ...safe(entry).split("/"));
async function materializedPaths(root, prefix = "") {
  const entries = await readdir(path.join(root, ...prefix.split("/").filter(Boolean)), { withFileTypes: true });
  const paths = [];
  for (const entry of entries) {
    if (!prefix && entry.name === ".dsh-offline-materialization.json") continue;
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) throw new Error("validated-dereference materialization contains a symbolic link.");
    if (entry.isDirectory()) paths.push({ relativePath, type: "directory" }, ...(await materializedPaths(root, relativePath)));
    else if (entry.isFile()) paths.push({ relativePath, type: "file", sha256: hash(await readFile(relative(root, relativePath))) });
    else throw new Error("offline DSH materialization contains a prohibited entry.");
  }
  return paths.sort((left, right) => Buffer.compare(Buffer.from(left.relativePath), Buffer.from(right.relativePath)));
}
async function checkoutPaths(root, prefix = "") {
  const entries = await readdir(path.join(root, ...prefix.split("/").filter(Boolean)), { withFileTypes: true });
  const paths = [];
  for (const entry of entries) {
    if (!prefix && entry.name === ".git") continue;
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) paths.push({ relativePath, type: "symlink", linkTarget: await readlink(relative(root, relativePath)) });
    else if (entry.isDirectory()) paths.push({ relativePath, type: "directory" }, ...(await checkoutPaths(root, relativePath)));
    else if (entry.isFile()) { const bytes = await readFile(relative(root, relativePath)); paths.push({ relativePath, type: "file", size: bytes.length, sha256: hash(bytes) }); }
    else throw new Error("offline DSH Git checkout contains a prohibited entry.");
  }
  return paths.sort((left, right) => Buffer.compare(Buffer.from(left.relativePath), Buffer.from(right.relativePath)));
}

export async function readOfflineDshArchive(archive) {
  const bytes = await readFile(archive); const entries = [];
  for (let offset = 0; offset + 512 <= bytes.length;) {
    const h = bytes.subarray(offset, offset + 512); if (h.every((x) => x === 0)) break;
    const sizeText = field(h, 124, 12).trim(); if (!/^[0-7]*$/.test(sizeText)) throw new Error("offline DSH archive size is invalid.");
    const size = Number.parseInt(sizeText || "0", 8); const type = String.fromCharCode(h[156] || 48);
    const name = field(h, 0, 100), prefix = field(h, 345, 155), rawPath = prefix ? `${prefix}/${name}` : name;
    if (!Number.isSafeInteger(size) || size < 0 || !["0", "5", "2", "g"].includes(type)) throw new Error("offline DSH archive entry type is prohibited.");
    const body = offset + 512, next = body + Math.ceil(size / 512) * 512; if (next > bytes.length) throw new Error("offline DSH archive is truncated.");
    if (type === "g") { if (/(?:^|\n)\d+\s+(?:path|linkpath)=/u.test(new TextDecoder("utf8", { fatal: true }).decode(bytes.subarray(body, body + size)))) throw new Error("offline DSH archive PAX path override is prohibited."); }
    else { const relativePath = safe(rawPath); entries.push(type === "2" ? { relativePath, type: "symlink", linkTarget: field(h, 157, 100) } : type === "5" ? { relativePath, type: "directory" } : { relativePath, type: "file", size, sha256: hash(bytes.subarray(body, body + size)), body: bytes.subarray(body, body + size) }); }
    offset = next;
  }
  const seen = new Set(); for (const entry of entries) { const key = entry.relativePath.toLocaleLowerCase("en-US"); if (seen.has(key)) throw new Error("offline DSH archive has duplicate or case-colliding entries."); seen.add(key); }
  return entries;
}
function resolveLink(entries, entry) {
  const byPath = new Map(entries.map((x) => [x.relativePath, x])); const walk = (current, chain = new Set()) => {
    if (chain.has(current.relativePath)) throw new Error("offline DSH symlink cycle.");
    if (current.type !== "symlink") return current;
    const target = String(current.linkTarget ?? "");
    if (target.includes("\\")) throw new Error("offline DSH symlink target has ambiguous separators.");
    if (!target || target.startsWith("/") || /^[A-Za-z]:/.test(target) || /^\/\//.test(target) || /[\0-\x1f]/.test(target)) throw new Error("offline DSH symlink target is unsafe.");
    const joined = path.posix.normalize(path.posix.join(path.posix.dirname(current.relativePath), target));
    if (joined === "." || joined.startsWith("../") || path.posix.isAbsolute(joined)) throw new Error("offline DSH symlink escapes package root.");
    const next = byPath.get(joined); if (!next) throw new Error("offline DSH symlink is dangling.");
    return walk(next, new Set([...chain, current.relativePath]));
  };
  return walk(entry);
}
export function canonicalizeRelativeSymlinkTargetForComparison(linkPath, rawTarget, { platformObservation = false } = {}) {
  const link = safe(linkPath);
  const target = String(rawTarget ?? "");
  if (!target || /[\0-\x1f]/.test(target) || target.startsWith("/") || target.startsWith("\\") || target.startsWith("//") || /^[A-Za-z]:/.test(target)) throw new Error("offline DSH symlink target is unsafe.");
  if (!platformObservation && target.includes("\\")) throw new Error("offline DSH archive symlink target has ambiguous separators.");
  const parts = (platformObservation ? target.replaceAll("\\", "/") : target).split("/");
  if (parts.some((part) => !part || part === ".")) throw new Error("offline DSH symlink target has ambiguous segments.");
  const resolved = link.split("/").slice(0, -1);
  for (const part of parts) {
    if (part === "..") {
      if (!resolved.length) throw new Error("offline DSH symlink escapes package root.");
      resolved.pop();
    } else resolved.push(part);
  }
  if (!resolved.length) throw new Error("offline DSH symlink resolves to package root.");
  return resolved.join("/");
}
function assertCheckoutSemanticReconciliation(expectedPaths, actualPaths) {
  if (expectedPaths.length !== actualPaths.length) throw new Error("offline DSH Git checkout member count does not match package source authority.");
  for (let index = 0; index < expectedPaths.length; index += 1) {
    const expected = expectedPaths[index], actual = actualPaths[index];
    if (!actual || expected.relativePath !== actual.relativePath || expected.type !== actual.type) throw new Error(`offline DSH Git checkout does not match package source authority at member ${index}.`);
    if (expected.type === "symlink") {
      const authoritative = canonicalizeRelativeSymlinkTargetForComparison(expected.relativePath, expected.linkTarget);
      const observed = canonicalizeRelativeSymlinkTargetForComparison(actual.relativePath, actual.linkTarget, { platformObservation: true });
      if (authoritative !== observed) throw new Error(`offline DSH Git checkout symlink semantic identity does not match package source authority at member ${index}.`);
    } else if (canonicalJson(actual) !== canonicalJson(expected)) throw new Error(`offline DSH Git checkout does not match package source authority at member ${index}.`);
  }
}
function manifestFor(entries) { return entries.map(({ body, ...entry }) => entry).sort((a, b) => Buffer.compare(Buffer.from(a.relativePath), Buffer.from(b.relativePath))); }
function packageIdentity(verified) {
  return { archiveSha256: verified.archiveSha256, bundleSha256: verified.bundleSha256, bundleSize: verified.bundleSize, manifestSha256: verified.manifestSha256, sourceCommit: verified.provenance.resolvedCommit, sourceFingerprint: verified.provenance.sourceFingerprint, sourceMemberCount: verified.manifest.sourceMemberCount, sourceTree: verified.provenance.sourceTree, sourceVersion: verified.provenance.sourceVersion };
}
async function assertFreshOutput(outputDir) {
  try {
    const stat = await lstat(outputDir);
    if (!stat.isDirectory() || stat.isSymbolicLink() || (await readdir(outputDir)).length !== 0) throw new Error("offline DSH materialization target must be a new empty directory.");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    await mkdir(outputDir, { recursive: true });
    const stat = await lstat(outputDir);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("offline DSH materialization target is unsafe.");
  }
}
async function validateGitAuthority(bundlePath, provenance, expected) {
  if (typeof bundlePath !== "string" || !bundlePath) throw new Error("offline DSH package Git authority bundle is required.");
  const authority = provenance.gitAuthority;
  if (!authority || typeof authority !== "object" || Array.isArray(authority) || Object.keys(authority).sort().join(",") !== ["bundleRelativePath", "bundleSha256", "bundleSize", "requiredCommit"].join(",") || authority.bundleRelativePath !== "dsh-source.bundle" || !/^[a-f0-9]{64}$/.test(authority.bundleSha256) || !Number.isSafeInteger(authority.bundleSize) || authority.bundleSize < 1 || authority.requiredCommit !== expected.sourceCommit || authority.requiredCommit !== provenance.resolvedCommit) throw new Error("offline DSH package Git authority is invalid.");
  const bytes = await readFile(bundlePath);
  if (bytes.length !== authority.bundleSize || hash(bytes) !== authority.bundleSha256) throw new Error("offline DSH package Git authority identity is invalid.");
  const temporaryRepo = await mkdtemp(path.join(os.tmpdir(), "ued-dsh-git-authority-"));
  try {
    run(temporaryRepo, ["init", "--bare", "-q"]);
    run(temporaryRepo, ["bundle", "verify", path.resolve(bundlePath)]);
    const heads = run(temporaryRepo, ["bundle", "list-heads", path.resolve(bundlePath)]).toString("utf8").trim().split("\n");
    if (!heads.includes(`${authority.requiredCommit} ${provenance.tag}`)) throw new Error("offline DSH package Git authority ref is invalid.");
    run(temporaryRepo, ["bundle", "unbundle", path.resolve(bundlePath)]);
    run(temporaryRepo, ["cat-file", "-e", `${authority.requiredCommit}^{commit}`]);
    if (run(temporaryRepo, ["rev-parse", `${authority.requiredCommit}^{tree}`]).toString("utf8").trim() !== provenance.sourceTree) throw new Error("offline DSH package Git authority tree is invalid.");
  } finally {
    await rm(temporaryRepo, { recursive: true, force: true });
  }
  return { bundleSha256: authority.bundleSha256, bundleSize: authority.bundleSize };
}

export async function validateOfflineDshPackage({ archivePath, manifestPath, provenancePath, bundlePath, expected }) {
  const [archiveBytes, manifestBytes, provenanceBytes] = await Promise.all([readFile(archivePath), readFile(manifestPath), readFile(provenancePath)]);
  const manifest = JSON.parse(manifestBytes), provenance = JSON.parse(provenanceBytes);
  const keys = ["acquisitionType", "archiveSha256", "gitAuthority", "manifestSha256", "repository", "resolvedCommit", "sourceFingerprint", "sourceMemberCount", "sourceTree", "sourceVersion", "tag"];
  if (Object.keys(provenance).sort().join(",") !== keys.sort().join(",") || manifest.schemaVersion !== offlineDshPackageSchemaVersion || provenance.acquisitionType !== "offline-dsh-package" || provenance.repository !== expected.sourceRepository || provenance.tag !== expected.sourceRef || provenance.resolvedCommit !== expected.sourceCommit || provenance.sourceTree !== expected.sourceTree || provenance.sourceVersion !== (expected.sourceVersion ?? expected.version) || provenance.sourceFingerprint !== (expected.sourceFingerprint ?? expected.fingerprint) || provenance.archiveSha256 !== hash(archiveBytes) || provenance.manifestSha256 !== hash(manifestBytes)) throw new Error("offline DSH package provenance is invalid.");
  const gitAuthority = await validateGitAuthority(bundlePath, provenance, expected);
  const entries = await readOfflineDshArchive(archivePath); const canonical = manifestFor(entries);
  if (JSON.stringify(manifest.entries) !== JSON.stringify(canonical) || manifest.sourceMemberCount !== canonical.length || provenance.sourceMemberCount !== canonical.length) throw new Error("offline DSH manifest does not match archive.");
  for (const entry of entries.filter((x) => x.type === "symlink")) { const final = resolveLink(entries, entry); if (!["file", "directory"].includes(final.type)) throw new Error("offline DSH symlink resolves to a prohibited entry."); }
  const verified = { entries, manifest, provenance, archiveSha256: hash(archiveBytes), manifestSha256: hash(manifestBytes), ...gitAuthority };
  return { ...verified, ...packageIdentity(verified) };
}
export async function generateOfflineDshPackage({ sourceDir, outputDir, expected }) {
  const canonicalSource = await realpath(sourceDir); const identity = await validateDshSourceIdentity(canonicalSource, expected, { readOnly: true }); await mkdir(outputDir, { recursive: true });
  const archivePath = path.join(outputDir, "dsh-source.tar"), manifestPath = path.join(outputDir, "dsh-source.manifest.json"), provenancePath = path.join(outputDir, "dsh-source.provenance.json"), bundlePath = path.join(outputDir, "dsh-source.bundle");
  await writeFile(archivePath, run(canonicalSource, ["archive", "--format=tar", "HEAD"]));
  run(canonicalSource, ["bundle", "create", bundlePath, expected.sourceRef]);
  const entries = await readOfflineDshArchive(archivePath); for (const entry of entries.filter((x) => x.type === "symlink")) resolveLink(entries, entry);
  const manifest = { schemaVersion: offlineDshPackageSchemaVersion, entries: manifestFor(entries), sourceMemberCount: entries.length };
  const manifestBytes = Buffer.from(JSON.stringify(manifest) + "\n"); await writeFile(manifestPath, manifestBytes);
  const bundle = await readFile(bundlePath);
  const provenance = { acquisitionType: "offline-dsh-package", archiveSha256: hash(await readFile(archivePath)), gitAuthority: { bundleRelativePath: "dsh-source.bundle", bundleSha256: hash(bundle), bundleSize: bundle.length, requiredCommit: identity.commit }, manifestSha256: hash(manifestBytes), repository: expected.sourceRepository, resolvedCommit: identity.commit, sourceFingerprint: identity.fingerprint, sourceMemberCount: entries.length, sourceTree: identity.tree, sourceVersion: identity.version, tag: expected.sourceRef };
  await writeFile(provenancePath, `${JSON.stringify(provenance)}\n`); const verified = await validateOfflineDshPackage({ archivePath, manifestPath, provenancePath, bundlePath, expected });
  return { archivePath, manifestPath, provenancePath, bundlePath, identity, ...verified, ...packageIdentity(verified) };
}
export async function materializeOfflineDshPackage({ archivePath, manifestPath, provenancePath, bundlePath, expected, outputDir, mode = "validated-dereference" }) {
  if (!["native", "validated-dereference"].includes(mode)) throw new Error("offline DSH materialization mode is invalid.");
  const verified = await validateOfflineDshPackage({ archivePath, manifestPath, provenancePath, bundlePath, expected }); await assertFreshOutput(outputDir);
  const files = new Map(verified.entries.filter((x) => x.type === "file").map((x) => [x.relativePath, x]));
  for (const entry of verified.entries.filter((x) => x.type === "directory")) await mkdir(relative(outputDir, entry.relativePath), { recursive: true });
  for (const entry of verified.entries.filter((x) => x.type === "file")) { const target = relative(outputDir, entry.relativePath); await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, entry.body); }
  const materialized = [];
  for (const entry of verified.entries.filter((x) => x.type === "symlink")) { const target = relative(outputDir, entry.relativePath); await mkdir(path.dirname(target), { recursive: true }); const final = resolveLink(verified.entries, entry); if (mode === "native") await symlink(entry.linkTarget, target); else if (final.type === "file") await writeFile(target, files.get(final.relativePath).body); else { await mkdir(target, { recursive: true }); for (const [filePath, file] of files) if (filePath.startsWith(`${final.relativePath}/`)) { const copy = relative(target, filePath.slice(final.relativePath.length + 1)); await mkdir(path.dirname(copy), { recursive: true }); await writeFile(copy, file.body); } } materialized.push({ relativePath: entry.relativePath, originalEntryType: "symlink", originalLinkTarget: entry.linkTarget, materializationMode: mode, resolvedTarget: final.relativePath, resolvedType: final.type, resolvedSha256: final.sha256 ?? null }); }
  const record = { materializationMode: mode, package: packageIdentity(verified), symlinks: materialized };
  await writeFile(path.join(outputDir, ".dsh-offline-materialization.json"), `${canonicalJson(record)}\n`);
  const materializedIdentity = await validateOfflineDshMaterialization({ packageResult: verified, outputDir });
  return { ...verified, materializationMode: mode, materializedSymlinks: materialized, materializedIdentity };
}
export async function validateOfflineDshMaterialization({ packageResult, outputDir }) {
  const verified = packageResult.entries && packageResult.manifest && packageResult.provenance ? packageResult : await validateOfflineDshPackage(packageResult);
  const record = JSON.parse(await readFile(path.join(outputDir, ".dsh-offline-materialization.json"), "utf8"));
  if (record?.materializationMode !== "validated-dereference" || canonicalJson(record.package) !== canonicalJson(packageIdentity(verified))) throw new Error("offline DSH materialization record is invalid.");
  const symlinks = new Map(record.symlinks.map((entry) => [entry.relativePath, entry]));
  const files = verified.entries.filter((entry) => entry.type === "file");
  for (const entry of verified.entries) {
    const stat = await lstat(relative(outputDir, entry.relativePath));
    if (stat.isSymbolicLink()) throw new Error("validated-dereference materialization contains a symbolic link.");
    if (entry.type === "file" && (!stat.isFile() || stat.size !== entry.size || hash(await readFile(relative(outputDir, entry.relativePath))) !== entry.sha256)) throw new Error("offline DSH materialized file identity is invalid.");
    if (entry.type === "directory" && !stat.isDirectory()) throw new Error("offline DSH materialized directory is invalid.");
    if (entry.type === "symlink") {
      const final = resolveLink(verified.entries, entry); const actual = symlinks.get(entry.relativePath);
      const expected = { relativePath: entry.relativePath, originalEntryType: "symlink", originalLinkTarget: entry.linkTarget, materializationMode: "validated-dereference", resolvedTarget: final.relativePath, resolvedType: final.type, resolvedSha256: final.sha256 ?? null };
      if (!actual || canonicalJson(actual) !== canonicalJson(expected)) throw new Error("offline DSH original symlink identity is invalid.");
      if (final.type === "file" && (!stat.isFile() || stat.size !== final.size || hash(await readFile(relative(outputDir, entry.relativePath))) !== final.sha256)) throw new Error("offline DSH dereferenced symlink file is invalid.");
      if (final.type === "directory") {
        if (!stat.isDirectory()) throw new Error("offline DSH dereferenced symlink directory is invalid.");
        for (const file of files.filter((candidate) => candidate.relativePath.startsWith(`${final.relativePath}/`))) {
          const copied = relative(relative(outputDir, entry.relativePath), file.relativePath.slice(final.relativePath.length + 1));
          if (hash(await readFile(copied)) !== file.sha256) throw new Error("offline DSH dereferenced symlink directory identity is invalid.");
        }
      }
    }
  }
  const expectedPaths = new Map();
  for (const entry of verified.entries.filter((entry) => entry.type !== "symlink")) expectedPaths.set(entry.relativePath, entry.type === "file" ? { relativePath: entry.relativePath, type: "file", sha256: entry.sha256 } : { relativePath: entry.relativePath, type: "directory" });
  for (const entry of verified.entries.filter((entry) => entry.type === "symlink")) {
    const final = resolveLink(verified.entries, entry);
    if (final.type === "file") expectedPaths.set(entry.relativePath, { relativePath: entry.relativePath, type: "file", sha256: final.sha256 });
    else {
      expectedPaths.set(entry.relativePath, { relativePath: entry.relativePath, type: "directory" });
      for (const directory of verified.entries.filter((candidate) => candidate.type === "directory" && candidate.relativePath.startsWith(`${final.relativePath}/`))) {
        const relativeDirectory = directory.relativePath.slice(final.relativePath.length + 1);
        expectedPaths.set(`${entry.relativePath}/${relativeDirectory}`, { relativePath: `${entry.relativePath}/${relativeDirectory}`, type: "directory" });
      }
      for (const file of files.filter((candidate) => candidate.relativePath.startsWith(`${final.relativePath}/`))) expectedPaths.set(`${entry.relativePath}/${file.relativePath.slice(final.relativePath.length + 1)}`, { relativePath: `${entry.relativePath}/${file.relativePath.slice(final.relativePath.length + 1)}`, type: "file", sha256: file.sha256 });
    }
  }
  const actualPaths = await materializedPaths(outputDir);
  if (canonicalJson(actualPaths) !== canonicalJson([...expectedPaths.values()].sort((left, right) => Buffer.compare(Buffer.from(left.relativePath), Buffer.from(right.relativePath))))) throw new Error("offline DSH materialized membership does not match the package.");
  return { materializationMode: record.materializationMode, materializedRootIdentity: hash(Buffer.from(canonicalJson(record), "utf8")) };
}
export async function materializeOfflineDshGitCheckout({ packageResult, outputDir, expected }) {
  const verified = packageResult.entries && packageResult.manifest && packageResult.provenance ? packageResult : await validateOfflineDshPackage(packageResult);
  if (!packageResult.bundlePath) throw new Error("offline DSH Git checkout requires a verified bundle path.");
  await assertFreshOutput(outputDir);
  run(outputDir, ["init", "-q"]);
  run(outputDir, ["config", "core.autocrlf", "false"]);
  run(outputDir, ["config", "core.symlinks", "true"]);
  run(outputDir, ["bundle", "unbundle", path.resolve(packageResult.bundlePath)]);
  run(outputDir, ["checkout", "--detach", "-q", verified.sourceCommit]);
  return validateOfflineDshGitCheckout({ packageResult: verified, outputDir, expected });
}
export async function validateOfflineDshGitCheckout({ packageResult, outputDir, expected }) {
  const verified = packageResult.entries && packageResult.manifest && packageResult.provenance ? packageResult : await validateOfflineDshPackage(packageResult);
  const identity = await validateDshSourceIdentity(outputDir, expected, { readOnly: true });
  const expectedPaths = manifestFor(verified.entries);
  const actualPaths = await checkoutPaths(outputDir);
  assertCheckoutSemanticReconciliation(expectedPaths, actualPaths);
  return { checkoutRootIdentity: hash(Buffer.from(canonicalJson({ identity, package: packageIdentity(verified) }), "utf8")), identity };
}
export async function createOfflineDshRunBinding({ packageResult, targetRunId, materializedRootIdentity, outputPath }) {
  if (!/^[A-Za-z0-9-]+$/.test(targetRunId)) throw new Error("offline DSH target run ID is invalid.");
  const binding = { materializedRootIdentity, packageArchiveSha256: packageResult.archiveSha256, packageManifestSha256: packageResult.manifestSha256, sourceCommit: packageResult.sourceCommit ?? packageResult.provenance?.resolvedCommit, targetRunId };
  if (!/^[a-f0-9]{64}$/.test(materializedRootIdentity) || !/^[a-f0-9]{40}$/.test(binding.sourceCommit)) throw new Error("offline DSH run binding identity is invalid.");
  const bytes = Buffer.from(`${canonicalJson(binding)}\n`); await writeFile(outputPath, bytes); await writeFile(`${outputPath}.sha256`, `${hash(bytes)}  ${path.basename(outputPath)}\n`); return { ...binding, bindingSha256: hash(bytes) };
}
export async function validateOfflineDshRunBinding({ bindingPath, packageResult, targetRunId, materializedRootIdentity }) {
  const bytes = await readFile(bindingPath); const digest = hash(bytes); const sidecar = await readFile(`${bindingPath}.sha256`, "utf8");
  if (sidecar !== `${digest}  ${path.basename(bindingPath)}\n`) throw new Error("offline DSH run binding sidecar is invalid.");
  const actual = JSON.parse(bytes); const expected = { materializedRootIdentity, packageArchiveSha256: packageResult.archiveSha256, packageManifestSha256: packageResult.manifestSha256, sourceCommit: packageResult.sourceCommit ?? packageResult.provenance?.resolvedCommit, targetRunId };
  if (canonicalJson(actual) !== canonicalJson(expected)) throw new Error("offline DSH run binding is invalid.");
  return { ...actual, bindingSha256: digest };
}
export async function createOfflineDshProvenanceEvidence({ packageResult, materialization, runBinding, expected, outputPath }) {
  const { dshProvenanceContractVersion, serializeDshProvenanceEvidence } = await import("./dsh-source-validator.mjs");
  const identity = packageResult.identity ?? { commit: packageResult.sourceCommit, tree: packageResult.sourceTree, version: packageResult.sourceVersion, fingerprint: packageResult.sourceFingerprint };
  const evidence = { provenanceContractVersion: dshProvenanceContractVersion, method: "offline-package", upstreamCanonicalUrl: expected.sourceRepository, sourceRef: expected.sourceRef, sourceCommit: identity.commit, sourceTree: identity.tree, sourceVersion: identity.version, sourceFingerprint: identity.fingerprint, stagedSource: { commit: identity.commit, tree: identity.tree, version: identity.version, fingerprint: identity.fingerprint }, verification: { archiveSha256: packageResult.archiveSha256, bundleSha256: packageResult.bundleSha256, bundleSize: packageResult.bundleSize, manifestSha256: packageResult.manifestSha256, materializationMode: materialization.materializationMode, packageSchemaVersion: offlineDshPackageSchemaVersion, requiredCommit: packageResult.sourceCommit, runBindingSha256: runBinding.bindingSha256, sourceMemberCount: packageResult.sourceMemberCount } };
  const bytes = Buffer.from(serializeDshProvenanceEvidence(evidence));
  await writeFile(outputPath, bytes); await writeFile(`${outputPath}.sha256`, `${hash(bytes)}  ${path.basename(outputPath)}\n`);
  return { evidence, evidencePath: outputPath, evidenceSha256: hash(bytes) };
}
