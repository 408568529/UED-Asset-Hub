import { canonicalJson, sha256 } from "./release-artifact-tree.mjs";
import { exact, hash, parseStrictJson } from "./release-json-contract.mjs";
import { assertFrozenSourceReceipt } from "./frozen-source-authority.mjs";
const same = (a, b, label) => { if (canonicalJson(a) !== canonicalJson(b)) throw new Error("Receipt projection mismatch: " + label); };
function creation(value) {
  exact(value, ["creatorRunId", "createdAt"], "original creation");
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(value.creatorRunId || "") || !Number.isFinite(Date.parse(value.createdAt)) || new Date(value.createdAt).toISOString() !== value.createdAt) throw new Error("Receipt original creation");
}
function record(bytes, version, kind, keys) {
  const value = parseStrictJson(bytes); exact(value, ["schemaVersion", "kind", ...keys], kind);
  if (value.schemaVersion !== version || value.kind !== kind || !Buffer.from(bytes).equals(Buffer.from(canonicalJson(value) + "\n"))) throw new Error("Receipt schema/raw serialization: " + kind);
  creation(value.artifactCreation); return value;
}
// These schemas describe new receipts. Historical receipts are immutable references, never upgraded in place.
export function assertReleaseReceiptProjections(authority, receiptBytes, archiveBytes) {
  for (const [key, bytes] of Object.entries(receiptBytes)) if (sha256(bytes) !== authority.receipts[key]) throw new Error("Receipt approved raw SHA: " + key);
  const source = record(receiptBytes.sourceCreationReceiptSha256, 1, "FrozenSourceAuthority", ["source", "baseTree", "archiveSize", "frozenSourceIdentity", "artifactCreation"]);
  const frozen = assertFrozenSourceReceipt(source, { manifestBytes: receiptBytes.sourceManifestSha256, archiveBytes, source: authority.source });
  const toolchain = record(receiptBytes.toolchainReceiptSha256, 3, "ToolchainReceipt", ["core", "originalAuthorityIdentity", "artifactCreation", "observations"]);
  same(toolchain.core, authority.toolchain, "ToolchainCore");
  if (toolchain.originalAuthorityIdentity !== "ec99131c76bbadfb40cb8429a0b88d59825156f5a33982526cca3b75d2dcdc3f") throw new Error("Toolchain historical receipt selection");
  exact(toolchain.observations, ["hostname", "nodeRoot"], "Toolchain observations");
  const environment = record(receiptBytes.environmentReceiptSha256, 2, "EnvironmentReceipt", ["profile", "source", "toolchainIdentity", "artifactCreation", "observations"]);
  same(environment.profile, authority.environment, "EnvironmentProfile"); same(environment.source, authority.source, "Environment source");
  if (environment.toolchainIdentity !== authority.toolchain.identity) throw new Error("Environment toolchain identity");
  exact(environment.observations, ["hostname", "osBuild", "workspace"], "Environment observations");
  for (const observations of [toolchain.observations, environment.observations]) if (Object.values(observations).some((value) => typeof value !== "string" || !value)) throw new Error("Receipt observation values");
  const dependency = record(receiptBytes.dependencyReceiptSha256, 1, "DependencyReceipt", ["core", "source", "toolchainIdentity", "postPruneGraphIdentity", "byteTree", "artifactCreation"]);
  same(dependency.core, authority.dependency, "DependencyCore"); same(dependency.source, authority.source, "Dependency source");
  if (dependency.toolchainIdentity !== authority.toolchain.identity) throw new Error("Dependency toolchain identity");
  hash(dependency.postPruneGraphIdentity, "post-prune graph");
  if (!Array.isArray(dependency.byteTree) || !dependency.byteTree.length) throw new Error("Dependency byte tree empty");
  for (let i = 0; i < dependency.byteTree.length; i++) {
    const file = dependency.byteTree[i]; exact(file, ["path", "size", "sha256"], "Dependency member"); hash(file.sha256, "Dependency byte SHA");
    if (typeof file.path !== "string" || !file.path || file.path.includes("\\") || file.path.startsWith("/") || file.path.split("/").some((part) => !part || part === "." || part === "..") || !Number.isSafeInteger(file.size) || file.size < 0 || (i && file.path <= dependency.byteTree[i - 1].path)) throw new Error("Dependency byte tree path/size/order");
  }
  if (sha256(Buffer.from(canonicalJson(dependency.byteTree))) !== authority.dependency.byteTreeIdentity) throw new Error("Dependency byte tree derivation");
  const dsh = assertDshAuthorityReceipt(authority.dsh, receiptBytes.dshBundleAuthoritySha256, receiptBytes.dshProvenanceSha256);
  return { source, frozen, toolchain, environment, dependency, dsh };
}
export function assertDshAuthorityReceipt(dsh, authorityBytes, provenanceBytes) {
  if (sha256(authorityBytes) !== dsh.bundleAuthoritySha256 || sha256(provenanceBytes) !== dsh.provenanceSha256) throw new Error("DSH immutable receipt selection");
  const authority = parseStrictJson(authorityBytes), provenance = parseStrictJson(provenanceBytes);
  exact(authority, ["schemaVersion", "authorityContract", "sourceAuthority", "bundle", "emptyEnvironmentMaterialization", "provenance", "negativeTests", "generation"], "DSH bundle authority");
  if (authority.schemaVersion !== 1 || authority.authorityContract !== "ued-dsh-self-contained-git-bundle-v1") throw new Error("DSH authority schema");
  exact(authority.sourceAuthority, ["repository", "ref", "version", "commit", "tree", "fingerprint"], "DSH source authority");
  for (const key of ["repository", "version", "commit", "tree", "fingerprint"]) if (authority.sourceAuthority[key] !== dsh[key]) throw new Error("DSH source authority projection " + key);
  exact(authority.bundle, ["filename", "format", "size", "sha256", "includedRefs", "declaredExternalPrerequisites", "reachableObjectClosure", "missingParentAvailable"], "DSH bundle");
  if (authority.bundle.sha256 !== dsh.bundleSha256 || authority.bundle.declaredExternalPrerequisites !== 0 || !Number.isSafeInteger(authority.bundle.size) || authority.bundle.size < 1) throw new Error("DSH self-contained bundle projection");
  const materialization = authority.emptyEnvironmentMaterialization;
  if (materialization.resultingCommit !== dsh.commit || materialization.resultingTree !== dsh.tree || materialization.sourceFingerprint !== dsh.fingerprint || materialization.cloneExit !== 0 || materialization.destinationWasAbsent !== true || materialization.workingTreeClean !== true || materialization.shallow !== "false") throw new Error("DSH historical empty materialization projection");
  if (authority.provenance.evidenceSha256 !== dsh.provenanceSha256 || provenance.method !== "bundle" || provenance.sourceCommit !== dsh.commit || provenance.sourceTree !== dsh.tree || provenance.sourceFingerprint !== dsh.fingerprint || provenance.sourceVersion !== dsh.version || provenance.upstreamCanonicalUrl !== dsh.repository || provenance.sourceRef !== authority.sourceAuthority.ref || provenance.verification.bundleSha256 !== dsh.bundleSha256) throw new Error("DSH original provenance projection");
  return { authority, provenance };
}
