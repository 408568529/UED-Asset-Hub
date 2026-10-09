import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createCredentialArtifactOwnershipRecord, credentialCleanupEvidencePath, credentialOwnershipRecordPath, validateCredentialArtifactOwnershipRecord, writeCredentialCleanupEvidenceAtomically, writeCredentialOwnershipRecordAtomically } from "./credential-artifact-ownership.mjs";

const root = await mkdtemp(path.join(os.tmpdir(), "ued-credential-ownership-"));
const sha = "a".repeat(64), runId = "g036b-20260924-a1b2c3d4", serviceIdentity = `UEDAssetHub-B4B-${runId}`;
const acl = { protected: true, ownerSid: "S-1-5-32-544", rules: [{ sid: "S-1-5-18", rights: 2032127, type: "Allow", inherited: false }] };
const fields = { provisioningId: "12345678-1234-4234-9234-123456789abc", runId, serviceIdentity, protectedBundleRelativePath: `credentials/${serviceIdentity}.credentials.dpapi`, protectedBundleSha256: sha, protectedBundleSize: 589, createdAt: "2026-09-24T00:00:00.000Z", lastWriteAt: "2026-09-24T00:00:00.000Z", dpapiHelperIdentity: { componentName: "dpapi-helper", relativePath: "native/windows-dpapi-credential-helper/bin/ued-windows-dpapi-credential-helper.exe", sha256: "b".repeat(64), size: 123 }, candidateDigest: "c".repeat(64), nativeSetBindingIdentity: { nativeBuildId: "nb2-1111111111111111-2222222222222222-3333333333333333", nativeSetDigest: "d".repeat(64), aggregateManifestSha256: "e".repeat(64), sourceCommit: "1".repeat(40), sourceArchiveSha256: "f".repeat(64) }, aclIdentity: { directory: acl, file: acl }, providerCredentialPresent: false };

try {
  const record = createCredentialArtifactOwnershipRecord(fields);
  const ownershipPath = credentialOwnershipRecordPath(root);
  await writeCredentialOwnershipRecordAtomically(ownershipPath, record);
  assert.deepEqual(JSON.parse(await readFile(ownershipPath, "utf8")), record);
  assert.throws(() => validateCredentialArtifactOwnershipRecord({ ...record, unexpected: "field" }));
  assert.throws(() => validateCredentialArtifactOwnershipRecord(record, { runId: "another-run" }));
  await assert.rejects(() => writeCredentialOwnershipRecordAtomically(ownershipPath, record), /already exists/u);
  const cleanupPath = credentialCleanupEvidencePath(root);
  const cleanup = { schemaVersion: 1, runId, provisioningId: record.provisioningId, serviceIdentity, protectedBundleSha256: sha, protectedBundleSize: 589, deletedAt: "2026-09-24T01:00:00.000Z", result: "OPAQUE_DELETE_VERIFIED" };
  await writeCredentialCleanupEvidenceAtomically(cleanupPath, cleanup);
  assert.deepEqual(JSON.parse(await readFile(cleanupPath, "utf8")), cleanup);
  assert.throws(() => validateCredentialArtifactOwnershipRecord({ ...record, capability: "must-not-exist" }));
  console.log(JSON.stringify({ result: "PASS", ownershipRecordAtomic: true, cleanupEvidenceAtomic: true, secretContentFields: 0, runBindingFailClosed: true }));
} finally { await rm(root, { recursive: true, force: true }); }
