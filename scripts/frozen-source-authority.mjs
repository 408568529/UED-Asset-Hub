import { canonicalJson, sha256 } from "./release-artifact-tree.mjs";
import { validateArchiveMemberPath as normalizeArtifactPath } from "./archive-member-contract.mjs";
import { exact, hash, identity, parseStrictJson } from "./release-json-contract.mjs";
const basicKeys = ["schemaVersion", "sourceClassification", "productionEligible", "sourceCommit", "sourceArchiveSha256", "workingTreeManifestSha256", "trackedDiffSha256", "untrackedInventorySha256", "creationRunId", "createdAt", "sourceRootIdentity", "files", "exclusions"];
const extendedKeys = ["approvedChangeClassification", "archiveFormat", "archiveMetadataPolicy", "baseTree", "candidateDependencyContractRepair", "changeClassification", "classificationSummary", "excludedIgnoredPaths", "frozenSourceIdentity", "frozenSourceIdentityDerivation", "nativeSetIdentityContractRevision", "sourceArchiveSize", "toolchainContractRevision"];
const commit = (value) => { if (!/^[a-f0-9]{40}$/u.test(value || "")) throw new Error("Frozen source commit/tree"); };
const paths = (value) => { if (!Array.isArray(value) || value.some((s, i) => normalizeArtifactPath(s) !== s || (i && value[i - 1] >= s))) throw new Error("Frozen source sorted paths"); };
function archiveInventory(bytes, policy = null) {
  if (bytes.length % 512) throw new Error("Source tar block alignment");
  const files = []; const names = new Set(); let ended = false;
  const field = (header, start, length) => new TextDecoder("utf-8", { fatal: true }).decode(header.subarray(start, start + length)).replace(/\0.*$/su, "");
  const octal = (header, start, length) => { const text = field(header, start, length).trim(); if (!/^[0-7]+$/u.test(text)) throw new Error("Source tar numeric field"); return parseInt(text, 8); };
  for (let offset = 0; offset < bytes.length;) {
    const header = bytes.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) { if (bytes.subarray(offset).some((byte) => byte !== 0)) throw new Error("Source tar trailing bytes"); ended = true; break; }
    const size = octal(header, 124, 12), body = offset + 512;
    const sum = [...header].reduce((n, byte, index) => n + (index >= 148 && index < 156 ? 32 : byte), 0);
    if (sum !== octal(header, 148, 8) || body + size > bytes.length || field(header, 257, 6) !== "ustar") throw new Error("Source tar checksum/format/truncation");
    const prefix = field(header, 345, 155); let name = (prefix ? prefix + "/" : "") + field(header, 0, 100);
    const type = String.fromCharCode(header[156] || 48);
    if (type === "5") name = name.replace(/\/$/u, "");
    normalizeArtifactPath(name);
    if (names.has(name) || !["0", "5"].includes(type)) throw new Error("Source tar duplicate/member type"); names.add(name);
    if (policy && (octal(header, 108, 8) !== policy.uid || octal(header, 116, 8) !== policy.gid || octal(header, 136, 12) !== policy.mtimeEpochSeconds || field(header, 265, 32) !== policy.uname || field(header, 297, 32) !== policy.gname || ![0o644, 0o755].includes(octal(header, 100, 8)))) throw new Error("Source tar metadata policy");
    if (type === "0") files.push({ relativePath: name, size, sha256: sha256(bytes.subarray(body, body + size)) });
    offset = body + Math.ceil(size / 512) * 512;
  }
  if (!ended || !files.length) throw new Error("Source tar missing end/empty inventory");
  return files.sort((a, b) => Buffer.compare(Buffer.from(a.relativePath), Buffer.from(b.relativePath)));
}
export function validateFrozenSourceManifest(manifestBytes, archiveBytes) {
  const manifest = parseStrictJson(manifestBytes); const extended = manifest.frozenSourceIdentity !== undefined;
  exact(manifest, extended ? [...basicKeys, ...extendedKeys] : basicKeys, "Source manifest");
  if (manifest.schemaVersion !== 1 || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(manifest.creationRunId || "") || !Number.isFinite(Date.parse(manifest.createdAt))) throw new Error("Source schema/creation");
  commit(manifest.sourceCommit);
  const eligible = { COMMITTED_CLEAN_SOURCE: true, SNAPSHOT_WITH_UNCOMMITTED_CHANGES: false, R3_TEST_ONLY_NOT_RELEASE_PROVENANCE: false }[manifest.sourceClassification];
  if (eligible === undefined || eligible !== manifest.productionEligible) throw new Error("Source classification/eligibility");
  for (const key of ["sourceArchiveSha256", "workingTreeManifestSha256", "trackedDiffSha256", "untrackedInventorySha256", "sourceRootIdentity"]) hash(manifest[key], key);
  if (manifest.sourceArchiveSha256 !== sha256(archiveBytes)) throw new Error("Source archive SHA");
  if (!Array.isArray(manifest.files) || !manifest.files.length || !Array.isArray(manifest.exclusions)) throw new Error("Source files/exclusions");
  let prior = "";
  for (const file of manifest.files) {
    exact(file, ["relativePath", "fileType", "size", "sha256", "classification", "includedReason"], "Source file"); hash(file.sha256, "source file SHA");
    if (normalizeArtifactPath(file.relativePath) !== file.relativePath || file.relativePath <= prior || file.fileType !== "file" || !Number.isSafeInteger(file.size) || file.size < 0 || !["tracked", "untracked"].includes(file.classification) || file.includedReason !== "release-relevant-worktree") throw new Error("Source file metadata"); prior = file.relativePath;
  }
  const worktree = manifest.files.map(({ relativePath, size, sha256, classification }) => ({ relativePath, size, sha256, classification }));
  const untracked = manifest.files.filter((file) => file.classification === "untracked").map(({ relativePath, size, sha256 }) => ({ relativePath, size, sha256 }));
  if (manifest.workingTreeManifestSha256 !== identity(worktree) || manifest.untrackedInventorySha256 !== identity(untracked)) throw new Error("Source inventory derivation");
  if (eligible && (untracked.length || manifest.trackedDiffSha256 !== sha256(Buffer.alloc(0)))) throw new Error("Source clean classification");
  prior = "";
  for (const item of manifest.exclusions) { exact(item, ["relativePath", "reason"], "Source exclusion"); if (item.relativePath <= prior || normalizeArtifactPath(item.relativePath) !== item.relativePath || item.reason !== "policy-excluded") throw new Error("Source exclusion identity"); prior = item.relativePath; }
  if (extended) {
    commit(manifest.baseTree);
    if (manifest.archiveFormat !== "ustar" || manifest.sourceArchiveSize !== archiveBytes.length || typeof manifest.approvedChangeClassification !== "string" || !manifest.approvedChangeClassification) throw new Error("Source freeze extension");
    exact(manifest.archiveMetadataPolicy, ["fileModePolicy", "uid", "gid", "uname", "gname", "mtimeEpochSeconds"], "Source archive policy");
    if (canonicalJson(manifest.archiveMetadataPolicy) !== canonicalJson({ fileModePolicy: "preserve executable bit; otherwise normalize to 0644", uid: 0, gid: 0, uname: "root", gname: "root", mtimeEpochSeconds: 0 })) throw new Error("Source archive policy values");
    if (!Array.isArray(manifest.changeClassification) || !Array.isArray(manifest.excludedIgnoredPaths)) throw new Error("Source change classification");
    const included = [], excluded = []; prior = "";
    for (const item of manifest.changeClassification) {
      const allowed = ["relativePath", "changeType", "disposition", "approvedChangeClassification", "additionalApprovedChangeClassification", "currentRepairClassification", "reason"];
      if (!item || Object.keys(item).some((key) => !allowed.includes(key)) || Object.values(item).some((value) => typeof value !== "string" || !value) || normalizeArtifactPath(item.relativePath) !== item.relativePath || item.relativePath <= prior) throw new Error("Source classification keys/order/types"); prior = item.relativePath;
      if (item.disposition === "INCLUDE" && ["tracked-modified", "untracked-source"].includes(item.changeType) && item.approvedChangeClassification && manifest.files.some((file) => file.relativePath === item.relativePath && file.classification === (item.changeType === "tracked-modified" ? "tracked" : "untracked"))) included.push(item);
      else if (item.disposition === "EXCLUDE" && item.changeType === "untracked-evidence" && item.reason && !manifest.files.some((file) => file.relativePath === item.relativePath)) excluded.push(item);
      else throw new Error("Source UNKNOWN or invalid disposition");
    }
    prior = "";
    for (const item of manifest.excludedIgnoredPaths) { exact(item, ["relativePath", "reason"], "Source ignored exclusion"); const name = item.relativePath.replace(/\/$/u, ""); if (typeof item.reason !== "string" || !item.reason || normalizeArtifactPath(name) !== name || item.relativePath <= prior) throw new Error("Source ignored exclusion"); prior = item.relativePath; }
    const summary = { include: included.length, includeTrackedModified: included.filter((item) => item.changeType === "tracked-modified").length, includeUntrackedSource: included.filter((item) => item.changeType === "untracked-source").length, exclude: excluded.length + manifest.excludedIgnoredPaths.length, excludeEvidence: excluded.length, excludeIgnored: manifest.excludedIgnoredPaths.length, unknown: 0 };
    if (canonicalJson(summary) !== canonicalJson(manifest.classificationSummary) || canonicalJson(excluded.map((item) => item.relativePath)) !== canonicalJson(manifest.exclusions.map((item) => item.relativePath))) throw new Error("Source classification summary derivation");
    const frozen = { baseTree: manifest.baseTree, sourceCommit: manifest.sourceCommit, workingTreeManifestSha256: manifest.workingTreeManifestSha256, sourceArchiveSha256: manifest.sourceArchiveSha256, sourceArchiveSize: manifest.sourceArchiveSize };
    if (manifest.frozenSourceIdentity !== identity(frozen) || manifest.frozenSourceIdentityDerivation !== "SHA-256 of canonical JSON {baseTree,sourceCommit,workingTreeManifestSha256,sourceArchiveSha256,sourceArchiveSize}") throw new Error("Source frozen identity derivation");
    exact(manifest.candidateDependencyContractRepair, ["addedPaths", "decision", "historicalFrozenSourceIdentity", "modifiedPaths"], "Source dependency revision");
    paths(manifest.candidateDependencyContractRepair.addedPaths); paths(manifest.candidateDependencyContractRepair.modifiedPaths); hash(manifest.candidateDependencyContractRepair.historicalFrozenSourceIdentity, "Source historical reference");
    if (manifest.candidateDependencyContractRepair.decision !== "A_INCLUDE_NESTED_NPM_SHIMS") throw new Error("Source dependency revision policy");
    exact(manifest.toolchainContractRevision, ["addedPaths", "changedPaths", "classification", "historicalOnlyPaths"], "Source toolchain revision");
    for (const key of ["addedPaths", "changedPaths", "historicalOnlyPaths"]) paths(manifest.toolchainContractRevision[key]);
    if (manifest.toolchainContractRevision.classification !== "TOOLCHAIN_CONTRACT_REVISION") throw new Error("Source toolchain revision classification");
    exact(manifest.nativeSetIdentityContractRevision, ["schemaVersion", "addedPaths", "modifiedPaths", "historicalSchemas", "identityFields"], "Source native revision");
    const revision = manifest.nativeSetIdentityContractRevision;
    if (revision.schemaVersion !== 3 || canonicalJson(revision.historicalSchemas) !== "[1,2]" || canonicalJson(revision.identityFields) !== canonicalJson(["sourceCommit", "sourceArchiveSha256", "nativeSourceIdentity", "toolchainIdentity", "configuration"])) throw new Error("Source native revision schema");
    paths(revision.addedPaths); paths(revision.modifiedPaths);
    for (const name of [...manifest.candidateDependencyContractRepair.addedPaths, ...manifest.candidateDependencyContractRepair.modifiedPaths, ...manifest.toolchainContractRevision.addedPaths, ...manifest.toolchainContractRevision.changedPaths, ...revision.addedPaths, ...revision.modifiedPaths]) if (!manifest.files.some((file) => file.relativePath === name)) throw new Error("Source revision references missing included path");
  }
  const inventory = archiveInventory(archiveBytes, extended ? manifest.archiveMetadataPolicy : null);
  if (canonicalJson(inventory) !== canonicalJson(manifest.files.map(({ relativePath, size, sha256 }) => ({ relativePath, size, sha256 })))) throw new Error("Source archive inventory mismatch");
  const lock = manifest.files.find((file) => file.relativePath === "package-lock.json"); if (!lock) throw new Error("Source lock missing");
  return { manifest, projection: { sourceCommit: manifest.sourceCommit, sourceTreeSha256: manifest.workingTreeManifestSha256, sourceArchiveSha256: manifest.sourceArchiveSha256, sourceManifestSha256: sha256(manifestBytes), sourceClassification: manifest.sourceClassification, productionEligible: manifest.productionEligible, lockfileSha256: lock.sha256 } };
}
export function assertFrozenSourceReceipt(receipt, { manifestBytes, archiveBytes, source }) {
  exact(receipt, ["schemaVersion", "kind", "source", "baseTree", "archiveSize", "frozenSourceIdentity", "artifactCreation"], "FrozenSourceAuthority receipt");
  const actual = validateFrozenSourceManifest(manifestBytes, archiveBytes);
  if (!actual.manifest.frozenSourceIdentity) throw new Error("Live source receipt requires the complete extended freeze manifest");
  if (receipt.schemaVersion !== 1 || receipt.kind !== "FrozenSourceAuthority" || canonicalJson(receipt.source) !== canonicalJson(actual.projection) || canonicalJson(receipt.source) !== canonicalJson(source) || receipt.archiveSize !== archiveBytes.length || receipt.baseTree !== (actual.manifest.baseTree ?? receipt.baseTree)) throw new Error("Frozen source receipt projection");
  commit(receipt.baseTree); hash(receipt.frozenSourceIdentity, "frozenSourceIdentity");
  const expectedFrozen = identity({ baseTree: receipt.baseTree, sourceCommit: source.sourceCommit, workingTreeManifestSha256: source.sourceTreeSha256, sourceArchiveSha256: source.sourceArchiveSha256, sourceArchiveSize: archiveBytes.length });
  if (receipt.frozenSourceIdentity !== expectedFrozen) throw new Error("Frozen source receipt identity");
  exact(receipt.artifactCreation, ["creatorRunId", "createdAt"], "Source creation receipt");
  if (receipt.artifactCreation.creatorRunId !== actual.manifest.creationRunId || receipt.artifactCreation.createdAt !== actual.manifest.createdAt) throw new Error("Source creator/time receipt mismatch");
  return actual;
}
