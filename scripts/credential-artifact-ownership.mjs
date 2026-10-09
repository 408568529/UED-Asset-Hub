import { randomUUID, createHash } from "node:crypto";
import { lstat, mkdir, open, readFile, rename } from "node:fs/promises";
import path from "node:path";
import { canonicalJson } from "./release-artifact-tree.mjs";
import { b4bWindowsServiceName } from "./windows-service-identity.mjs";

const hashPattern = /^[a-f0-9]{64}$/u;
const exactKeys = (value, keys) => value && typeof value === "object" && !Array.isArray(value) && canonicalJson(Object.keys(value).sort()) === canonicalJson([...keys].sort());

function fail(message) { throw new Error(`Credential artifact ownership record is invalid: ${message}`); }

export function createCredentialArtifactOwnershipRecord(fields) {
  const record = { schemaVersion: 1, ...fields };
  return validateCredentialArtifactOwnershipRecord(record);
}

export function validateCredentialArtifactOwnershipRecord(record, expected = {}) {
  const keys = ["schemaVersion", "provisioningId", "runId", "serviceIdentity", "protectedBundleRelativePath", "protectedBundleSha256", "protectedBundleSize", "createdAt", "lastWriteAt", "dpapiHelperIdentity", "candidateDigest", "nativeSetBindingIdentity", "aclIdentity", "providerCredentialPresent"];
  if (!exactKeys(record, keys) || record.schemaVersion !== 1 || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(record.provisioningId || "") || typeof record.runId !== "string" || !record.runId || typeof record.serviceIdentity !== "string" || record.serviceIdentity !== b4bWindowsServiceName(record.runId) || record.protectedBundleRelativePath !== `credentials/${record.serviceIdentity}.credentials.dpapi` || !hashPattern.test(record.protectedBundleSha256 || "") || !Number.isSafeInteger(record.protectedBundleSize) || record.protectedBundleSize < 1 || !Number.isFinite(Date.parse(record.createdAt)) || !Number.isFinite(Date.parse(record.lastWriteAt)) || !hashPattern.test(record.candidateDigest || "") || record.providerCredentialPresent !== false) fail("record shape or protected artifact identity");
  if (!exactKeys(record.dpapiHelperIdentity, ["componentName", "relativePath", "sha256", "size"]) || record.dpapiHelperIdentity.componentName !== "dpapi-helper" || record.dpapiHelperIdentity.relativePath !== "native/windows-dpapi-credential-helper/bin/ued-windows-dpapi-credential-helper.exe" || !hashPattern.test(record.dpapiHelperIdentity.sha256 || "") || !Number.isSafeInteger(record.dpapiHelperIdentity.size) || record.dpapiHelperIdentity.size < 1) fail("DPAPI helper identity");
  if (!exactKeys(record.nativeSetBindingIdentity, ["nativeBuildId", "nativeSetDigest", "aggregateManifestSha256", "sourceCommit", "sourceArchiveSha256"]) || !/^(?:nb1-[a-f0-9]{12}-[a-f0-9]{32}|nb2-[a-f0-9]{16}(?:-[a-f0-9]{16}){2}|nb3-[a-f0-9]{64})$/u.test(record.nativeSetBindingIdentity.nativeBuildId || "") || !hashPattern.test(record.nativeSetBindingIdentity.nativeSetDigest || "") || !hashPattern.test(record.nativeSetBindingIdentity.aggregateManifestSha256 || "") || !/^[a-f0-9]{40}$/u.test(record.nativeSetBindingIdentity.sourceCommit || "") || !hashPattern.test(record.nativeSetBindingIdentity.sourceArchiveSha256 || "")) fail("Native Set binding identity");
  const validAcl = (acl) => exactKeys(acl, ["protected", "ownerSid", "rules"]) && acl.protected === true && typeof acl.ownerSid === "string" && /^S-1-/u.test(acl.ownerSid) && Array.isArray(acl.rules) && acl.rules.length > 0;
  if (!exactKeys(record.aclIdentity, ["directory", "file"]) || !validAcl(record.aclIdentity.directory) || !validAcl(record.aclIdentity.file)) fail("ACL identity/readback summary");
  if (expected.runId !== undefined && record.runId !== expected.runId || expected.serviceIdentity !== undefined && record.serviceIdentity !== expected.serviceIdentity || expected.candidateDigest !== undefined && record.candidateDigest !== expected.candidateDigest) fail("run/source binding mismatch");
  return record;
}

export function credentialOwnershipRecordPath(runRoot) { return path.join(runRoot, "agent-runtime", "evidence", "credential-artifact-ownership.json"); }
export function credentialCleanupEvidencePath(runRoot) { return path.join(runRoot, "agent-runtime", "evidence", "credential-artifact-cleanup.json"); }

export async function writeCredentialOwnershipRecordAtomically(filePath, record) {
  validateCredentialArtifactOwnershipRecord(record);
  const directory = path.dirname(filePath);
  await mkdir(directory, { recursive: true });
  const directoryStat = await lstat(directory);
  if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) fail("evidence directory is unsafe");
  try { await lstat(filePath); fail("ownership record already exists"); } catch (error) { if (error.code !== "ENOENT") throw error; }
  const temporary = `${filePath}.${randomUUID()}.tmp`;
  const handle = await open(temporary, "wx", 0o600);
  try { await handle.writeFile(`${canonicalJson(record)}\n`, "utf8"); await handle.sync(); }
  finally { await handle.close(); }
  try { await rename(temporary, filePath); }
  catch (error) { const { rm } = await import("node:fs/promises"); await rm(temporary, { force: true }); throw error; }
  const expected = `${canonicalJson(record)}\n`, persisted = await readFile(filePath, "utf8");
  if (persisted !== expected) fail("ownership record readback mismatch");
  return { path: filePath, sha256: createHash("sha256").update(persisted, "utf8").digest("hex") };
}

export async function writeCredentialCleanupEvidenceAtomically(filePath, evidence) {
  if (!exactKeys(evidence, ["schemaVersion", "runId", "provisioningId", "serviceIdentity", "protectedBundleSha256", "protectedBundleSize", "deletedAt", "result"]) || evidence.schemaVersion !== 1 || !evidence.runId || !evidence.provisioningId || !evidence.serviceIdentity || !hashPattern.test(evidence.protectedBundleSha256 || "") || !Number.isSafeInteger(evidence.protectedBundleSize) || !Number.isFinite(Date.parse(evidence.deletedAt)) || evidence.result !== "OPAQUE_DELETE_VERIFIED") fail("cleanup evidence shape");
  const directory = path.dirname(filePath);
  await mkdir(directory, { recursive: true });
  const detail = await lstat(directory);
  if (!detail.isDirectory() || detail.isSymbolicLink()) fail("cleanup evidence directory is unsafe");
  try { await lstat(filePath); fail("cleanup evidence already exists"); } catch (error) { if (error.code !== "ENOENT") throw error; }
  const temporary = `${filePath}.${randomUUID()}.tmp`, handle = await open(temporary, "wx", 0o600);
  try { await handle.writeFile(`${canonicalJson(evidence)}\n`, "utf8"); await handle.sync(); }
  finally { await handle.close(); }
  try { await rename(temporary, filePath); }
  catch (error) { const { rm } = await import("node:fs/promises"); await rm(temporary, { force: true }); throw error; }
  return { path: filePath, sha256: createHash("sha256").update(canonicalJson(evidence)).digest("hex") };
}
